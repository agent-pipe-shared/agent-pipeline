#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Regression pin: pipeline.installed-design-trailer-example-is-rejected-by-git-guard (ALF-C-P1-13, AC-205).
//
// Original acceptance (backlog item): (1) every printed commit example is accepted by the command
// guard and the commit-msg backstop; (2) the direct-design form is handled consistently -- PO decision
// 2026-10-16 #12 (superseding T12) admits exactly `Dispatch: design (elephant)` alongside
// `Dispatch: stage-0 (elephant)`; the pin asserts the guard lanes and the authorship verifier admit
// exactly those two Elephant forms and still refuse near-misses (other roles/ids); (3) verifier, generator
// and guard share one classification; (4) provenance debt is a disposition of history, not behavior,
// and is not testable here (named, not claimed).
//
// The real modules run (commit-message-policy.mjs, dispatch-authorship-verify.mjs); only the
// verifier's documented dependency seam (readCommitMessage/readChangedPaths) is driven. Fixtures
// live under the repository's scratch/ (the OS temp root is a protected read scope on this host).
// The "AC1 (real installed hooks)" cases additionally run the real hooks/guard-git.mjs process and a real
// `git commit` through the installed commit-msg hook in a throwaway enrolled repository (skipped, typed, when
// git is not on PATH). Not covered: the commit-msg hook of a Windows host.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { commitMessageFindings, finishedCommitMessageFindings } from "../commit-message-policy.mjs";
import { GIT_NULL_DEVICE } from "../git-null-device.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { applyInstall, planInstall } from "../../scripts/commit-msg-hook-install.mjs";
import { verifyCommit, VERDICT, ELEPHANT_STAGE0_MAX_PATHS } from "../../scripts/dispatch-authorship-verify.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const OBLIGATIONS = readFileSync(join(REPO_ROOT, "plugins/pipeline-core/templates/prompts/agent-obligations.md"), "utf8");
const GENERATOR = readFileSync(join(REPO_ROOT, "harness/scripts/generate-agent-obligations.mjs"), "utf8");

const SCRATCH_PARENT = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH_PARENT, { recursive: true });
const FIXTURES = mkdtempSync(join(SCRATCH_PARENT, "alf-c-p1-13-"));
after(() => rmSync(FIXTURES, { recursive: true, force: true }));

const messageWith = (dispatchValue) =>
  `docs: record the design package\n\nBody paragraph.\n\nAI-Assisted: true\nDispatch: ${dispatchValue}\n`;

let seq = 0;
const commandFor = (message) => {
  const file = join(FIXTURES, `msg-${seq += 1}.txt`);
  writeFileSync(file, message);
  return { cmd: `git commit -F ${JSON.stringify(file)} -- docs/x.md`, file };
};
const guardLane = (message) => {
  const { cmd } = commandFor(message);
  return commitMessageFindings(cmd, { readFile: (path) => readFileSync(path, "utf8"), requireMarker: true, requireDispatch: true });
};
const backstopLane = (message) => finishedCommitMessageFindings(message, { requireProvenanceWhenSignaled: true });
const codes = (result) => result.findings.map((finding) => finding.code);

const verify = (message, paths = ["docs/x.md"]) =>
  verifyCommit("abc1234", { readCommitMessage: () => message, readChangedPaths: () => paths });

// Concrete `Dispatch:` examples printed in the installed obligations, placeholders substituted.
const printedDispatchExamples = () => {
  const values = [...OBLIGATIONS.matchAll(/`Dispatch:\s*([^`]+)`/gu)].map((match) => match[1].trim());
  return values
    .filter((value) => /\((?:goldfish|critic|elephant)\)$/u.test(value))
    // `administrative (elephant)` is admitted only with independent evidence (not an unconditional example).
    .filter((value) => value !== "administrative (elephant)")
    .map((value) => value.replace(/<(?:TASK_ID|ID)>/gu, "ALF-C-P1-13"));
};

test("the installed obligations and generator print both the stage-0 and the admitted design (elephant) form", () => {
  assert.match(OBLIGATIONS, /`Dispatch: stage-0 \(elephant\)`/u);
  assert.match(OBLIGATIONS, /Dispatch:\s*design \(elephant\)/u);
  assert.match(GENERATOR, /Dispatch: stage-0 \(elephant\)/u);
  assert.match(GENERATOR, /Dispatch:\s*design \(elephant\)/u);
  assert.doesNotMatch(OBLIGATIONS, /There is no separate design-phase trailer form/u);
  assert.doesNotMatch(GENERATOR, /There is no separate design-phase trailer form/u);
});

test("AC1: the printed administrative (elephant) example is refused without independent evidence", () => {
  assert.match(OBLIGATIONS, /`Dispatch: administrative \(elephant\)`/u);
  const message = messageWith("administrative (elephant)");
  assert.ok(codes(guardLane(message)).includes("GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED"));
  assert.ok(codes(backstopLane(message)).includes("GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED"));
});

test("AC1: every concrete printed Dispatch example is accepted by the command guard and the backstop", () => {
  const examples = printedDispatchExamples();
  assert.ok(examples.includes("stage-0 (elephant)"), "stage-0 example is printed");
  assert.ok(examples.includes("ALF-C-P1-13 (goldfish)"), "goldfish example is printed");
  for (const value of examples) {
    const message = messageWith(value);
    const guard = guardLane(message);
    assert.equal(guard.inspected, true, value);
    assert.deepEqual(codes(guard), [], `command guard rejected printed example "${value}"`);
    assert.deepEqual(codes(backstopLane(message)), [], `commit-msg backstop rejected printed example "${value}"`);
  }
});

test("AC2: stage-0 (elephant) with AI-Assisted: true stays admitted, via -F, --trailer and the backstop", () => {
  assert.deepEqual(codes(guardLane(messageWith("stage-0 (elephant)"))), []);
  assert.deepEqual(codes(backstopLane(messageWith("stage-0 (elephant)"))), []);
  const viaTrailer = commitMessageFindings(
    'git commit -m "docs: record design" --trailer "AI-Assisted: true" --trailer "Dispatch: stage-0 (elephant)"',
    { readFile: () => { throw new Error("no file expected"); }, requireMarker: true, requireDispatch: true },
  );
  assert.equal(viaTrailer.inspected, true);
  assert.deepEqual(codes(viaTrailer), []);
});

test("AC2: Dispatch: design (elephant) is admitted by the command guard and the backstop (PO decision 2026-10-16 #12)", () => {
  const message = messageWith("design (elephant)");
  assert.deepEqual(codes(guardLane(message)), []);
  assert.deepEqual(codes(backstopLane(message)), []);
  const viaTrailer = commitMessageFindings(
    'git commit -m "docs: record design" --trailer "AI-Assisted: true" --trailer "Dispatch: design (elephant)"',
    { readFile: () => { throw new Error("no file expected"); }, requireMarker: true, requireDispatch: true },
  );
  assert.deepEqual(codes(viaTrailer), []);
});

test("AC2: near-miss design forms stay refused (only the exact elephant form is admitted)", () => {
  // Elephant-role near-misses are refused by the guard grammar itself.
  for (const value of ["Design (elephant)", "design  (elephant)", "design-x (elephant)"]) {
    assert.deepEqual(codes(backstopLane(messageWith(value))), ["GIT-03-DISPATCH-MALFORMED"], value);
  }
  // `design (goldfish)` is a well-formed goldfish task binding (id "design"), never an Elephant grant:
  // with no dispatch record the verifier cannot pass it.
  for (const value of ["design (goldfish)", "design (critic)", "Design (elephant)", "design-x (elephant)"]) {
    const outcome = verify(messageWith(value));
    assert.notEqual(outcome.verdict ?? outcome.status, VERDICT.pass, `${value}: ${JSON.stringify(outcome)}`);
  }
});

test("AC2: the design form gets no path-based admission beyond the stage-0 size bound", () => {
  const oversized = Array.from({ length: ELEPHANT_STAGE0_MAX_PATHS + 1 }, (_, index) => `docs/f${index}.md`);
  const outcome = verify(messageWith("design (elephant)"), oversized);
  assert.notEqual(outcome.verdict ?? outcome.status, VERDICT.pass, JSON.stringify(outcome));
  assert.match(JSON.stringify(outcome), /elephant-direct-oversized/u);
});

test("AC3: guard and verifier share one classification of the Elephant forms", () => {
  const stage0 = verify(messageWith("stage-0 (elephant)"));
  assert.equal(stage0.verdict ?? stage0.status, VERDICT.pass, JSON.stringify(stage0));
  const design = verify(messageWith("design (elephant)"));
  assert.equal(design.verdict ?? design.status, VERDICT.pass, JSON.stringify(design));
  const other = verify(messageWith("implementation (elephant)"));
  assert.equal(other.verdict ?? other.status, VERDICT.unverifiable, JSON.stringify(other));
  assert.match(JSON.stringify(other), /elephant-direct-nonstandard-id/u);
  // The guard admits exactly the forms the verifier passes, and refuses the one it will not bless.
  assert.deepEqual(codes(backstopLane(messageWith("stage-0 (elephant)"))), []);
  assert.deepEqual(codes(backstopLane(messageWith("design (elephant)"))), []);
  assert.deepEqual(codes(backstopLane(messageWith("implementation (elephant)"))), ["GIT-03-DISPATCH-MALFORMED"]);
});

test("AC3: stage-0 does not become a production-implementation grant (verifier size bound still applies)", () => {
  const oversized = Array.from({ length: ELEPHANT_STAGE0_MAX_PATHS + 1 }, (_, index) => `docs/f${index}.md`);
  const outcome = verify(messageWith("stage-0 (elephant)"), oversized);
  assert.notEqual(outcome.verdict ?? outcome.status, VERDICT.pass, JSON.stringify(outcome));
  assert.match(JSON.stringify(outcome), /elephant-direct-oversized/u);
});

test("AC3: documentation-only commits during implementation use the same grammar (no phase-specific trailer)", () => {
  // The grammar has no phase slot: a doc/evidence commit during implementation uses the identical
  // admitted forms, and the identical rejection of any other direct-Elephant id.
  for (const value of ["stage-0 (elephant)", "design (elephant)", "ALF-C-P1-13 (goldfish)"]) {
    assert.deepEqual(codes(backstopLane(`docs: add evidence\n\nBody.\n\nAI-Assisted: true\nDispatch: ${value}\n`)), [], value);
  }
  for (const value of ["implementation (elephant)", "stage-1 (elephant)"]) {
    assert.deepEqual(codes(backstopLane(messageWith(value))), ["GIT-03-DISPATCH-MALFORMED"], value);
  }
});

// ---- AC1 against the REAL installed hooks -------------------------------------------------------------
// A throwaway enrolled repository gets the real commit-msg hook installed by the plugin's own installer; every
// printed example is then (a) fed to the real hooks/guard-git.mjs process exactly as Claude Code feeds it (tool
// input JSON on stdin) and (b) committed through a real `git commit`, which runs the installed commit-msg hook.
const GUARD_GIT = join(REPO_ROOT, "plugins/pipeline-core/hooks/guard-git.mjs");
const PLUGIN_LIB_DIR = join(REPO_ROOT, "plugins/pipeline-core/lib");
const realGit = spawnSync("git", ["--version"], { encoding: "utf8" });
const realGitAvailable = !realGit.error && realGit.status === 0;

function realHookRepository() {
  const root = mkdtempSync(join(FIXTURES, "real-hooks-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, GIT_CONFIG_NOSYSTEM: "1" };
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout;
  };
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(root, "README.md"), "base\n");
  git(["add", "README.md"]);
  git(["commit", "-q", "-m", "chore: base\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)"]);
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-host-state") });
  const enrollment = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-design-trailer-fixture" });
  assert.equal(controller.applyDecision(enrollment, { activate: true, planSha256: enrollment.planSha256 }).state, "active");
  const planned = planInstall({ rootDir: root, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(planned.status, "ready");
  assert.equal(applyInstall({ rootDir: root, pluginLibDir: PLUGIN_LIB_DIR }).status, "installed");
  mkdirSync(join(root, "docs"), { recursive: true });
  return { root, env, git };
}

let commitSeq = 0;
/** Runs one dispatch value through the real command guard and then the real `git commit` (installed commit-msg hook). */
function realHooksVerdict(repo, dispatchValue) {
  commitSeq += 1;
  const messageFile = join(repo.root, `message-${commitSeq}.txt`);
  writeFileSync(messageFile, messageWith(dispatchValue));
  writeFileSync(join(repo.root, "docs", "x.md"), `revision ${commitSeq}\n`);
  repo.git(["add", "docs/x.md"]);
  const command = `git commit -F ${JSON.stringify(messageFile)} -- docs/x.md`;
  const { PIPELINE_GUARD_OVERRIDE: _dropInherited, ...baseEnv } = process.env;
  const guard = spawnSync(process.execPath, [GUARD_GIT], {
    input: JSON.stringify({ tool_input: { command } }), encoding: "utf8", cwd: repo.root,
    env: { ...baseEnv, CLAUDE_PROJECT_DIR: repo.root },
  });
  const commit = spawnSync("git", ["commit", "-F", messageFile, "--", "docs/x.md"], {
    cwd: repo.root, encoding: "utf8", env: repo.env, timeout: 60000,
  });
  return { guard, commit };
}

test("AC1 (real installed hooks): every printed Dispatch example passes the real command guard and the real commit-msg hook",
  { skip: realGitAvailable ? false : "git not on PATH", timeout: 240000 }, () => {
    const repo = realHookRepository();
    const examples = printedDispatchExamples();
    assert.ok(examples.includes("stage-0 (elephant)") && examples.includes("ALF-C-P1-13 (goldfish)"), "the printed set is not empty");
    for (const value of [...examples, "design (elephant)"]) {
      const { guard, commit } = realHooksVerdict(repo, value);
      assert.equal(guard.status, 0, `real command guard (guard-git.mjs) refused printed example "${value}": ${guard.stderr}`);
      assert.equal(commit.status, 0, `real commit-msg hook refused printed example "${value}": ${commit.stderr}`);
    }
  });

test("AC1 (real installed hooks): the same harness refuses a near-miss in both hooks, so the hooks are proven live",
  { skip: realGitAvailable ? false : "git not on PATH", timeout: 240000 }, () => {
    const repo = realHookRepository();
    const { guard, commit } = realHooksVerdict(repo, "implementation (elephant)");
    assert.equal(guard.status, 2, `the real command guard must block the near-miss: ${guard.stderr}`);
    assert.match(guard.stderr, /GIT-03-DISPATCH-MALFORMED/u);
    assert.notEqual(commit.status, 0, commit.stdout);
    assert.match(commit.stderr, /BLOCKED \(agent-pipeline commit-msg\)/u);
    assert.match(commit.stderr, /GIT-03-DISPATCH-MALFORMED/u);
  });

test("AC4 (host limitation, not claimed): provenance-debt disposition of existing stage-0-labelled history is a history/documentation decision with no executable surface", { skip: "host-limitation: not a behavior; reported as manual disposition, history is not rewritten" }, () => {});
