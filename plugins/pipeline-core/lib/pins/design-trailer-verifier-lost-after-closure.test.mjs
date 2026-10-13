// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.design-trailer-verifier-lost-after-closure (ALF-C-P1-14, AC-156).
 *
 * Original acceptance (backlog/items/2026-10-04-design-trailer-verifier-lost-after-closure.md):
 *   A. The trailer grammar is fixed in one place; the `design (elephant)` form is either admitted
 *      and verified, or removed from every printed example and generator.
 *   B. A merge-survival check compares code needles of closed items against HEAD and fails when a
 *      needle disappears.
 *   (The "identify the dropping merge" point is a one-off forensic act, not a code property.)
 *
 * Decision pinned here (PO T12, as for the sibling trailer item): NO design-trailer verifier
 * remains. The single direct-Elephant form is `stage-0 (elephant)`. This pin proves the removal
 * is complete and the stage-0 route stays admitted. Nothing is mocked: the real policy module,
 * the real source tree and the real done_when predicate evaluator are exercised.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { commitMessageFindings, finishedCommitMessageFindings } from "../commit-message-policy.mjs";
import { evaluateDoneWhen, parseDoneWhen } from "../../scripts/check-backlog-done-predicate.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
// Built by concatenation so this file never contains the needles it hunts for.
const LOST_SYMBOL = ["ELEPHANT", "DESIGN", "ID"].join("_");
const REJECTED_FORM = ["design", "(elephant)"].join(" ");

const msg = (dispatch) => `feat(x): change\n\nBody.\n\nAI-Assisted: true\nDispatch: ${dispatch}`;
const codes = (message) =>
  finishedCommitMessageFindings(message, { requireMarker: true, requireDispatch: true }).findings.map((f) => f.code);

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(?:mjs|js|json|md|ps1|sh)$/u.test(entry.name) && !/\.test\.mjs$/u.test(entry.name)) out.push(full);
  }
  return out;
}

test("AC-A1: the stage-0 Elephant route stays admitted (finished message)", () => {
  assert.deepEqual(codes(msg("stage-0 (elephant)")), []);
});

test("AC-A2: the design (elephant) form is rejected as a malformed Dispatch binding", () => {
  assert.deepEqual(codes(msg(REJECTED_FORM)), ["GIT-03-DISPATCH-MALFORMED"]);
});

test("AC-A3: the same verdicts hold through the --trailer commit lane", () => {
  const run = (value) => commitMessageFindings(
    `git commit -m "fix(y): tidy up" --trailer "AI-Assisted: true" --trailer "Dispatch: ${value}"`,
    { readFile: () => { throw new Error("no file expected"); }, requireMarker: true, requireDispatch: true },
  );
  const ok = run("stage-0 (elephant)");
  assert.equal(ok.inspected, true);
  assert.deepEqual(ok.findings, []);
  const bad = run(REJECTED_FORM);
  assert.deepEqual(bad.findings.map((f) => f.code), ["GIT-03-DISPATCH-MALFORMED"]);
});

test("AC-A4: no non-test source, generator or printed template emits or requires the lost form", () => {
  const roots = ["plugins/pipeline-core", "harness", "templates", "roles", "guardrails", "policies"].map((p) => join(ROOT, p));
  const offenders = [];
  let scanned = 0;
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      scanned += 1;
      const text = readFileSync(file, "utf8");
      if (text.includes(LOST_SYMBOL) || text.includes(REJECTED_FORM)) offenders.push(file.slice(ROOT.length + 1));
    }
  }
  assert.ok(scanned > 100, `scan must cover the real tree (scanned ${scanned})`);
  assert.deepEqual(offenders, []);
});

test("AC-A5: the printed agent obligations document the single stage-0 form and no separate design form", () => {
  const text = readFileSync(join(ROOT, "templates/prompts/agent-obligations.md"), "utf8");
  assert.ok(text.includes("Dispatch: stage-0 (elephant)"));
  assert.ok(text.includes("There is no separate design-phase trailer form."));
});

test("AC-B1: the done_when `contains` predicate is the merge-survival needle check and fails when a needle disappears", () => {
  const scratch = join(ROOT, "scratch");
  mkdirSync(scratch, { recursive: true });
  const fixtureRoot = mkdtempSync(join(scratch, "design-trailer-survival-"));
  try {
    mkdirSync(join(fixtureRoot, "lib"), { recursive: true });
    const target = join(fixtureRoot, "lib", "verifier.mjs");
    const parsed = parseDoneWhen("contains lib/verifier.mjs export const NEEDLE_SYMBOL");
    assert.equal(parsed.malformed, undefined);
    writeFileSync(target, "export const NEEDLE_SYMBOL = 1;\n");
    assert.equal(evaluateDoneWhen(parsed, { root: fixtureRoot }).satisfied, true);
    // A merge/import drops the needle: the same predicate must now fail.
    writeFileSync(target, "export const OTHER = 1;\n");
    assert.equal(evaluateDoneWhen(parsed, { root: fixtureRoot }).satisfied, false);
    // File vanishing entirely also fails.
    rmSync(target);
    assert.equal(evaluateDoneWhen(parsed, { root: fixtureRoot }).satisfied, false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
