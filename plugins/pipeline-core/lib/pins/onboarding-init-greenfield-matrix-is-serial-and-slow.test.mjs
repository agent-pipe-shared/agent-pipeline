// SPDX-License-Identifier: SUL-1.0
/**
 * Pin for backlog item pipeline.onboarding-init-greenfield-matrix-is-serial-and-slow (AC-220).
 *
 * Acceptance:
 *  1. Every existing runner/key and first-anchor failure cell is still executed.
 *  2. A failure identifies its cell without waiting for unrelated cells.
 *  3. The selected path overlaps cells (lower wall time) without exceeding a bounded
 *     process pool.
 *
 * The suite under qualification is scripts/onboarding-init.test.mjs. Structure checks read
 * that source through pure predicates (so each predicate can be shown to fail against a
 * mutated in-memory mirror); behaviour checks spawn the REAL file with its documented
 * cell-selection env seam. No production code is touched and no fixture needs git.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SUITE_PATH = fileURLToPath(new URL("../../scripts/onboarding-init.test.mjs", import.meta.url));
const CELL_ENV = "PIPELINE_ONBOARDING_TEST_MATRIX_CELL";
const SUITE_SOURCE = readFileSync(SUITE_PATH, "utf8");

const EXPECTED_RUNNERS = ["claude", "codex", "antigravity"];
const EXPECTED_CELLS = {
  convergence: EXPECTED_RUNNERS.flatMap((r) => ["no-registered-key", "valid-registered-key"].map((m) => `${r}/${m}`)),
  approval: EXPECTED_RUNNERS.flatMap((r) => ["signature", "chat"].map((m) => `${r}/${m}`)),
  rollback: ["setup", "repository-pointer-readback", "machine-write", "machine-readback",
    "policy-write", "policy-readback", "existing-pem-policy-write"],
};

function bracketList(source, anchor) {
  const at = source.indexOf(anchor);
  if (at < 0) return null;
  const open = source.indexOf("[", at);
  const close = source.indexOf("]", open);
  return [...source.slice(open, close + 1).matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
}

function functionBody(source, name) {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) return "";
  const end = source.indexOf("\n}\n", at);
  return source.slice(at, end < 0 ? source.length : end);
}

/** Cells the suite declares, parsed from its own source (null when the table is missing). */
export function declaredCells(source) {
  const runners = bracketList(source, "const GREENFIELD_RUNNERS");
  const machines = [...source.slice(source.indexOf("const GREENFIELD_MACHINE_STATES"),
    source.indexOf("const MATRIX_CELL_ENV")).matchAll(/name: "([^"]+)"/gu)].map((m) => m[1]);
  const approvalModes = bracketList(source.slice(source.indexOf("const MATRIX_CASES")), "approval:");
  const rollback = bracketList(source.slice(source.indexOf("const MATRIX_CASES")), "rollback:");
  if (!runners || !approvalModes || !rollback || machines.length === 0) return null;
  return {
    convergence: runners.flatMap((r) => machines.map((m) => `${r}/${m}`)),
    approval: runners.flatMap((r) => approvalModes.map((m) => `${r}/${m}`)),
    rollback,
  };
}

/** Each declared group has a per-cell checker that filters on the single selected cell. */
export function cellCheckersAreSelective(source) {
  const conv = functionBody(source, "checkConvergenceCell");
  const appr = functionBody(source, "checkApprovalCell");
  const roll = functionBody(source, "checkRollbackCell");
  const rollNames = [...roll.matchAll(/\bname: "([^"]+)"/gu)].map((m) => m[1]);
  return /selectedCell !== `\$\{runner\}\/\$\{machine\.name\}`\) continue/u.test(conv)
    && /selectedCell !== `\$\{runner\}\/\$\{pushApproval\}`\) continue/u.test(appr)
    && /selectedCell/u.test(roll)
    && EXPECTED_CELLS.rollback.every((cell) => rollNames.includes(cell));
}

/** The parent walk runs every declared cell, via a pool bounded to two, naming the cell on failure. */
export function parentWalkIsBoundedNamedAndComplete(source) {
  const run = functionBody(source, "runMatrix");
  const cell = functionBody(source, "runMatrixCell");
  const bounded = /offset \+= 2\)/u.test(run) && /cells\.slice\(offset, offset \+ 2\)/u.test(run);
  const walksAll = /const cells = MATRIX_CASES\[group\]/u.test(run) && /Promise\.allSettled/u.test(run);
  const named = /\$\{group\}\/\$\{cell\}: node --test exited/u.test(cell);
  const isolated = /--test-name-pattern", "\^isolated onboarding matrix cell\$"/u.test(cell);
  return bounded && walksAll && named && isolated;
}

function runCell(group, cell) {
  const env = { ...process.env, [CELL_ENV]: `${group}:${cell}` };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ["--test", "--test-reporter=tap",
    "--test-name-pattern", "^isolated onboarding matrix cell$", SUITE_PATH],
  { encoding: "utf8", shell: false, env, timeout: 280000 });
}

test("AC1: the declared matrix is exactly the nineteen historical runner/key and first-anchor cells", () => {
  assert.deepEqual(declaredCells(SUITE_SOURCE), EXPECTED_CELLS);
  assert.equal(Object.values(EXPECTED_CELLS).flat().length, 19);
});

test("AC1: each group's checker is selective and every rollback failure boundary has a body", () => {
  assert.equal(cellCheckersAreSelective(SUITE_SOURCE), true);
});

test("AC1: the default test of each group walks every declared cell through the isolated child", () => {
  for (const group of Object.keys(EXPECTED_CELLS)) {
    assert.match(SUITE_SOURCE, new RegExp(`if \\(!MATRIX_CELL\\) await runMatrix\\("${group}"\\)`, "u"), group);
  }
  assert.equal(parentWalkIsBoundedNamedAndComplete(SUITE_SOURCE), true);
});

test("AC2: the real suite runs one selected cell alone and passes it", () => {
  const result = runCell("rollback", "setup");
  const out = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, out);
  assert.match(out, /# tests 1\b/u, "exactly one test body runs, not the unrelated cells");
  assert.match(out, /# pass 1\b/u);
});

test("AC2: an unknown or mistyped cell fails by naming itself, with no other cell executed", () => {
  const result = runCell("convergence", "claude/not-a-real-cell");
  const out = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(out, /unknown onboarding matrix cell: convergence:claude\/not-a-real-cell/u);
  assert.match(out, /# tests 1\b/u);
});

test("AC3: cell overlap uses a pool bounded at two, never unconditional variable concurrency", () => {
  assert.equal(parentWalkIsBoundedNamedAndComplete(SUITE_SOURCE), true);
  assert.equal(/Promise\.all(Settled)?\(cells\.map\(/u.test(functionBody(SUITE_SOURCE, "runMatrix")), false);
});

test("AC3 measured wall-time reduction: skipped, measurement hold", {
  skip: "typed host-limitation measurement-hold: retained duration/resource measurement needs the Linux/WSL "
    + "full-file run; owner Coordinator, due 2026-10-19 (PO decision K7)",
}, () => {});

test("RED: the predicates fail against mutated in-memory mirrors of the suite source", () => {
  const unbounded = SUITE_SOURCE.replace("cells.slice(offset, offset + 2)", "cells.slice(offset)")
    .replace("offset += 2", "offset += 100");
  assert.equal(parentWalkIsBoundedNamedAndComplete(unbounded), false, "an unbounded pool is rejected");
  const anonymous = SUITE_SOURCE.replace("${group}/${cell}: node --test exited", "node --test exited");
  assert.equal(parentWalkIsBoundedNamedAndComplete(anonymous), false, "a failure that drops its cell name is rejected");
  const droppedCell = SUITE_SOURCE.replace('"policy-readback", ', "");
  assert.notDeepEqual(declaredCells(droppedCell), EXPECTED_CELLS, "a silently dropped cell is rejected");
  const nonSelective = SUITE_SOURCE.replace("selectedCell !== `${runner}/${machine.name}`) continue", "false) continue");
  assert.equal(cellCheckersAreSelective(nonSelective), false, "a checker that runs every cell is rejected");
});
