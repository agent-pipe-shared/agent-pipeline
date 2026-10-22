#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.stale-plan-invalidation-reopens-the-authority-edit-lock, acceptance bullet 2,
 * second half (PO decisions D31, D137 under AC-115; the Spec amendment route, D141, is out of scope).
 *
 * When a bound PRD/Spec working file differs from the approved digest recorded in State AND the
 * committed bytes (HEAD) equal that digest, `pipeline-state.mjs inspect` names the exact
 * `authority-restore.mjs restore --root <root>` command as the first repair, before `reopen-design`.
 * When the committed bytes do not match, or the working bytes already equal the approved digest, the
 * command is NOT named (no misleading repair). Driven through the real `inspect` CLI against a fixture
 * project that owns its own git root.
 *
 * The decision lives in lib/authority-restore.mjs (`restoreAdvice`); this pin only observes the output.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, statePath as resolveStatePath } from "../../scripts/pipeline-state.mjs";
import { createWindowsOwnedAuthorityDirectory } from "../windows-owned-authority-backend.mjs";
import { mkdtempTestScratch } from "../test-tmpdir.mjs";

const NOW = "2026-10-22T12:00:00.000Z";
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../../scripts/pipeline-state.mjs", import.meta.url));
const RESTORE_RE = /authority-restore\.mjs restore --root /gu;
const PRD_PATH = "specs/widget/prd.md";
const SPEC_PATH = "specs/widget/spec.md";
const PRD = "# PRD\nApproved requirements.\n";
const SPEC = "# Spec\nApproved design.\n";
const roots = [];
const ORIGINAL_CEILING = process.env.GIT_CEILING_DIRECTORIES;
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
  if (ORIGINAL_CEILING === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = ORIGINAL_CEILING;
});

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

/** An implementing feature whose approved PRD/Spec bytes are committed and bound by digest in State. */
function fixture(name) {
  const root = mkdtempTestScratch(`restore-advice-pin-${name}-`);
  roots.push(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  process.env.GIT_CEILING_DIRECTORIES = dirname(root);
  const git = (...args) => {
    const result = spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", ...args], {
      cwd: root, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(root) },
    });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "-q", "-b", "main");
  git("commit", "-q", "--allow-empty", "-m", "init");
  if (process.platform === "win32") createWindowsOwnedAuthorityDirectory({ path: join(root, ".git", "agent-pipeline") });
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", PRD_PATH], { dir: root, now: () => NOW }), 0);
  mkdirSync(join(root, "specs/widget"), { recursive: true });
  writeFileSync(join(root, PRD_PATH), PRD);
  writeFileSync(join(root, SPEC_PATH), SPEC);
  git("add", "specs");
  git("commit", "-q", "-m", "approved documents");
  const statePathValue = resolveStatePath(root);
  const state = JSON.parse(readFileSync(statePathValue, "utf8"));
  state.activeFeature.phase = "implementation";
  state.planApproved = true;
  state.planSubmission = {
    schema: "pipeline.plan-submission.v1", featureId: "widget", planPath: PRD_PATH, planSha256: sha256Hex(PRD),
    specPath: SPEC_PATH, specSha256: sha256Hex(SPEC), profile: "mini", profileSha256: sha256Hex("profile"),
    submittedBy: "coordinator", submittedAt: "2026-10-22T10:00:00.000Z",
  };
  state.planApproval = { approvedAt: "2026-10-22T11:00:00.000Z" };
  state.continuity = {
    schema: "pipeline.continuity.v0", featureId: "widget", revision: 1,
    authority: { prd: { path: PRD_PATH, sha256: sha256Hex(PRD) }, spec: { path: SPEC_PATH, sha256: sha256Hex(SPEC) } },
  };
  writeFileSync(statePathValue, JSON.stringify(state, null, 2) + "\n");
  return { root, git, prd: join(root, PRD_PATH), spec: join(root, SPEC_PATH) };
}

function inspect(root) {
  const result = spawnSync(process.execPath, [PIPELINE_STATE_SCRIPT, "inspect"], {
    cwd: root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root, GIT_CEILING_DIRECTORIES: dirname(root) },
  });
  assert.equal(result.status, 0, result.stderr);
  return { stdout: result.stdout, payload: JSON.parse(result.stdout) };
}

function assertNamedFirst({ stdout, payload }) {
  assert.equal(payload.lifecycle.code, "PLAN-LIFECYCLE-DIGEST-DRIFT");
  assert.equal(stdout.match(RESTORE_RE)?.length, 1, "the restore command is named exactly once in the whole output");
  const text = payload.nextActionText;
  assert.ok(text.search(RESTORE_RE) !== -1, "named in the prose next action");
  assert.ok(text.search(RESTORE_RE) < text.indexOf("reopen-design"), "the restore comes before reopen-design");
}

function assertNotNamed({ stdout, payload }) {
  assert.equal(stdout.match(RESTORE_RE), null, "the restore command is not named");
  assert.doesNotMatch(payload.nextActionText, /authority-restore/u);
}

test("1: Spec edited in the working tree, HEAD holds the approved bytes -> restore named once, before reopen-design", () => {
  const f = fixture("spec-edited");
  writeFileSync(f.spec, "# Spec\nEdited design.\n");
  const out = inspect(f.root);
  assertNamedFirst(out);
  assert.ok(out.payload.nextActionText.includes(SPEC_PATH), "names the edited document");
  assert.equal(out.payload.nextAction.applyAction?.argv?.[1] ?? out.payload.nextAction.argv?.[1], "reopen-design", "the structural reopen-design action is still offered");
});

test("2: Spec edited AND committed (HEAD differs from the approved digest) -> restore not named", () => {
  const f = fixture("spec-committed");
  writeFileSync(f.spec, "# Spec\nEdited design.\n");
  f.git("add", "specs");
  f.git("commit", "-q", "-m", "edited spec was committed");
  const out = inspect(f.root);
  assert.equal(out.payload.lifecycle.code, "PLAN-LIFECYCLE-DIGEST-DRIFT");
  assertNotNamed(out);
  assert.match(out.payload.nextActionText, /reopen-design/u, "the existing reopen-design guidance is unchanged");
});

test("3: working bytes equal the approved digest -> restore not named", () => {
  const f = fixture("unedited");
  const out = inspect(f.root);
  assert.notEqual(out.payload.lifecycle.code, "PLAN-LIFECYCLE-DIGEST-DRIFT");
  assertNotNamed(out);
});

test("4: PRD edited, HEAD holds the approved bytes -> restore named once, before reopen-design", () => {
  const f = fixture("prd-edited");
  writeFileSync(f.prd, "# PRD\nEdited requirements.\n");
  const out = inspect(f.root);
  assertNamedFirst(out);
  assert.ok(out.payload.nextActionText.includes(PRD_PATH), "names the edited document");
});
