// SPDX-License-Identifier: SUL-1.0
/**
 * authority-restore.test.mjs -- D31 / AC-115 (PO decisions D31, D137): an approved Spec that is
 * edited gets (1) a pre-edit warning naming the consequence and the runnable alternatives and
 * (2) a typed, digest-checked self-revert that restores the exact approved bytes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createGovernanceScopeController } from "./governance-scope.mjs";
import { evaluateLifecycleReadyGuard } from "../hooks/guard-lifecycle-ready.mjs";
import { ProjectOnboardingReadyError } from "./project-onboarding-ready-gate.mjs";
import { isSanctionedLifecycleCommand } from "./guard/command-catalogue.mjs";
import { applyAuthorityRestore, main, planAuthorityRestore } from "../scripts/authority-restore.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/authority-restore.mjs", import.meta.url));
const sha = (text) => createHash("sha256").update(text).digest("hex");
const PRD = "# PRD\nApproved requirements.\n";
const SPEC = "# Spec\nApproved design.\n";
const EDITED = "# Spec\nEdited design.\n";
const readyStub = () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" });

function git(root, ...args) {
  const r = spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "k42-restore-")));
  git(root, "init", "-q");
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-guard-fixture" });
  assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).requiresEnforcement, true);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "specs", "feat"), { recursive: true });
  writeFileSync(join(root, "pipeline.user.yaml"), "marker\n");
  writeFileSync(join(root, "specs/feat/prd.md"), PRD);
  writeFileSync(join(root, "specs/feat/spec.md"), SPEC);
  writeFileSync(join(root, "notes.md"), "free notes\n");
  const state = {
    schema: "pipeline.state.v0",
    activeFeature: { id: "feat", planPath: "specs/feat/prd.md", phase: "implementation" },
    planApproved: true,
    planSubmission: { submittedAt: "2026-08-28T11:00:00.000Z" },
    planApproval: { approvedAt: "2026-08-28T12:00:00.000Z" },
    continuity: {
      schema: "pipeline.continuity.v0", featureId: "feat", revision: 1,
      authority: {
        prd: { path: "specs/feat/prd.md", sha256: sha(PRD) },
        spec: { path: "specs/feat/spec.md", sha256: sha(SPEC) },
      },
    },
  };
  writeFileSync(join(root, ".claude/pipeline-state.json"), JSON.stringify(state));
  git(root, "add", "specs", "notes.md");
  git(root, "commit", "-q", "-m", "approved documents");
  return { root, statePath: join(root, ".claude/pipeline-state.json"), specPath: join(root, "specs/feat/spec.md") };
}

const editCall = (file) => ({ tool_name: "Edit", tool_input: { file_path: file, old_string: "Approved", new_string: "Changed" } });
const guard = (root, call) => evaluateLifecycleReadyGuard(call, { projectDir: root, requireProjectOnboardingReadyFn: readyStub });

function quietly(fn) {
  const err = console.error;
  const log = console.log;
  const lines = [];
  console.error = (...a) => { lines.push(a.join(" ")); };
  console.log = (...a) => { lines.push(a.join(" ")); };
  try { return { result: fn(), lines }; } finally { console.error = err; console.log = log; }
}

test("an Edit of the bound approved Spec is refused with the consequence and the runnable alternatives", () => {
  const { root, specPath } = fixture();
  try {
    const verdict = guard(root, editCall(specPath));
    assert.equal(verdict.exitCode, 2);
    assert.match(verdict.stderr, /GUARD-LIFECYCLE-AUTHORITY-BOUND/);
    assert.match(verdict.stderr, /approval is invalidated/u, "names the consequence of an edit that gets through");
    assert.match(verdict.stderr, /design lock/u);
    assert.match(verdict.stderr, /reopen-design --by/u, "names the design route");
    assert.ok(verdict.stderr.includes(`${SCRIPT} restore --root ${root}`), "names the exact runnable self-revert command");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an Edit of an unbound file carries no authority warning", () => {
  const { root } = fixture();
  try {
    const verdict = guard(root, editCall(join(root, "notes.md")));
    assert.equal(verdict.exitCode, 0);
    assert.doesNotMatch(verdict.stderr ?? "", /approval is invalidated|authority-restore/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("restore writes the exact approved bytes back and leaves Pipeline State untouched", () => {
  const { root, statePath, specPath } = fixture();
  try {
    writeFileSync(specPath, EDITED);
    const stateBefore = readFileSync(statePath);
    const planned = planAuthorityRestore(root);
    assert.equal(planned.status, "restorable");
    const applied = applyAuthorityRestore(root);
    assert.equal(applied.status, "restored");
    assert.deepEqual(applied.written, ["specs/feat/spec.md"]);
    assert.equal(sha(readFileSync(specPath, "utf8")), sha(SPEC), "approved bytes are back");
    assert.deepEqual(readFileSync(statePath), stateBefore, "State is not written by a restore");
    const again = planAuthorityRestore(root);
    assert.equal(again.code, "AUTHORITY-RESTORE-NOTHING-EDITED", "the approval is valid again: working digest equals the approved one");
    assert.equal(guard(root, editCall(specPath)).exitCode, 2, "the lock still protects the restored document");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("restore refuses when the source bytes are not the approved ones: one repair, nothing written", () => {
  const { root, statePath, specPath } = fixture();
  try {
    writeFileSync(specPath, EDITED);
    git(root, "add", "specs");
    git(root, "commit", "-q", "-m", "edited spec was committed");
    writeFileSync(specPath, "# Spec\nFurther local edit.\n");
    const stateBefore = readFileSync(statePath);
    const working = readFileSync(specPath);
    const refused = applyAuthorityRestore(root);
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "AUTHORITY-RESTORE-SOURCE-MISMATCH");
    assert.match(refused.repair, /--commit <full sha>/u);
    assert.match(refused.repair, /reopen-design/u);
    assert.deepEqual(refused.written, []);
    assert.deepEqual(readFileSync(specPath), working, "working file untouched");
    assert.deepEqual(readFileSync(statePath), stateBefore, "State untouched");
    // The documented repair works: the older commit holds the approved bytes.
    const old = git(root, "rev-list", "--max-parents=0", "HEAD");
    assert.equal(applyAuthorityRestore(root, { commit: old }).status, "restored");
    assert.equal(readFileSync(specPath, "utf8"), SPEC);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("restore is refused when nothing was edited, and when the binding is released", () => {
  const { root, statePath } = fixture();
  try {
    const nothing = applyAuthorityRestore(root);
    assert.equal(nothing.code, "AUTHORITY-RESTORE-NOTHING-EDITED");
    assert.deepEqual(nothing.written, []);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.planInvalidation = { schema: "pipeline.plan-invalidation.v1", invalidatedAt: "2026-08-28T13:00:00.000Z" };
    writeFileSync(statePath, JSON.stringify(state));
    assert.equal(applyAuthorityRestore(root).code, "AUTHORITY-RESTORE-NOT-BOUND");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("restore refuses a State whose approval binding disagrees with the continuity digest", () => {
  const { root, statePath, specPath } = fixture();
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.planApproval.poGateAuthority = { planSha256: sha(PRD), specSha256: sha("other") };
    writeFileSync(statePath, JSON.stringify(state));
    writeFileSync(specPath, EDITED);
    assert.equal(applyAuthorityRestore(root).code, "AUTHORITY-RESTORE-STATE-INCONSISTENT");
    assert.equal(readFileSync(specPath, "utf8"), EDITED);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the CLI parser is closed: wrong root, unknown flag, duplicate flag and short commit are exit 2", () => {
  const { root, specPath } = fixture();
  try {
    writeFileSync(specPath, EDITED);
    for (const argv of [
      ["restore"], ["restore", "--root", join(root, "..")], ["restore", "--root", root, "--force", "1"],
      ["restore", "--root", root, "--root", root], ["restore", "--root", root, "--commit", "abc123"], ["bogus", "--root", root],
    ]) assert.equal(quietly(() => main(argv, root)).result, 2, JSON.stringify(argv));
    assert.equal(readFileSync(specPath, "utf8"), EDITED, "no refusal wrote anything");
    assert.equal(quietly(() => main(["restore", "--root", root], root)).result, 0);
    assert.equal(readFileSync(specPath, "utf8"), SPEC);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a session in partial readiness can still run the restore (and not an arbitrary node script)", () => {
  const { root } = fixture();
  try {
    const partial = () => { throw new ProjectOnboardingReadyError("PORG-NOT-READY", "partial", { intent: "session", lifecycleStatus: "partial" }); };
    const bash = (command) => evaluateLifecycleReadyGuard({ tool_name: "Bash", tool_input: { command } },
      { projectDir: root, requireProjectOnboardingReadyFn: partial });
    assert.equal(bash("git restore specs/feat/spec.md").exitCode, 2, "the generic route stays refused");
    const typed = bash(`node ${SCRIPT} restore --root ${root}`);
    assert.equal(typed.exitCode, 0, `the typed route is admitted: ${typed.stderr}`);
    assert.equal(bash(`node ${join(root, "evil.mjs")} restore --root ${root}`).exitCode, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the guard admits exactly the restore and inspect argv shapes", () => {
  const { root } = fixture();
  try {
    const ok = (tail) => isSanctionedLifecycleCommand(`node ${SCRIPT} ${tail}`, root);
    assert.equal(ok(`restore --root ${root}`), true);
    assert.equal(ok(`inspect --root ${root}`), true);
    assert.equal(ok(`restore --root ${root} --commit ${"a".repeat(40)}`), true);
    assert.equal(ok(`restore --root ${root} --commit abc123`), false);
    assert.equal(ok(`restore --root ${join(root, "x")}`), false);
    assert.equal(ok(`restore --root ${root} --force 1`), false);
    assert.equal(ok(`apply --root ${root}`), false);
    assert.equal(ok("restore"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
