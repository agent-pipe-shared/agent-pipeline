// SPDX-License-Identifier: SUL-1.0
/**
 * AC-108 (fresh bounded attempt, E1 second half): the recover helper verifies a Goldfish result, commits it as the orchestrator
 * with the dispatch trailers and writes the typed orchestrator-attested dispatch record in the same step, so the close gate's
 * authorship check finds a record for exactly that commit and an unobserved authored-commit record stays refused.
 * Fixtures are throwaway git repositories; the helper runs as the CLI an operator would run.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { isSanctionedLifecycleCommand } from "../lib/guard/command-catalogue.mjs";
import { finishedCommitMessageFindings } from "../lib/commit-message-policy.mjs";
import { classifyCourseAuthorship } from "../lib/close-authorship-record.mjs";
import { validateDispatchRecord } from "../lib/dispatch-record.mjs";
import { nativeGoldfishHookMessage, readNativeGoldfishStopFailure } from "../hooks/native-goldfish-host.mjs";
import * as finalizerLib from "../lib/native-goldfish-host-finalizer.mjs";
import { writeNativeGoldfishStopOutcome } from "../lib/native-goldfish-stop-outcome.mjs";
import { writeDispatchRecordObject } from "./dispatch-record-write.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "goldfish-host-commit-recover.mjs");
const ID = "C19C-W170-FIXTURE";
const BRIEFING = `scratch/briefing-${ID}.md`;
const HANDBACK = `scratch/handback-${ID}.txt`;
const RECORD = `evidence/dispatch-record-${ID}.json`;
const ALLOWED = ["allowed/x.txt", "allowed/new.txt", "allowed/check.test.mjs"];
const REQUIRED = { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false, diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" };

const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};

function fixture({ check = true, handback = true, briefing = true, allowedExtra = [] } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ocr-")));
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "commit.gpgsign", "false");
  mkdirSync(join(root, "allowed"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  mkdirSync(join(root, "scratch"), { recursive: true });
  writeFileSync(join(root, "allowed", "x.txt"), "one\n");
  writeFileSync(join(root, "other.txt"), "one\n");
  git(root, "add", "--", "allowed/x.txt", "other.txt");
  git(root, "commit", "-q", "-m", "base");
  const head = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "allowed", "x.txt"), "two\n");
  writeFileSync(join(root, "allowed", "new.txt"), "new\n");
  if (check) writeFileSync(join(root, "allowed", "check.test.mjs"), "// check\n");
  const block = { schema: "pipeline.native-goldfish-host-briefing.v3", dispatchId: ID, candidateCommit: head, runner: "claude",
    role: "pipeline-core:goldfish-deep", agentType: "goldfish-deep", model: "sonnet", effort: "high", rulesetSha: "0.7.0+claude.20261104062201.95d3e81",
    allowedPaths: [...ALLOWED, ...allowedExtra], criticDecision: REQUIRED,
    itemDelivery: { schema: "pipeline.item-delivery-briefing.v1", sliceId: ID, itemId: "x.y", checks: [{ id: "c1", path: "allowed/check.test.mjs", dependencies: ["allowed/check.test.mjs"] }] } };
  if (briefing) writeFileSync(join(root, BRIEFING), `Goldfish task\n<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify(block)}\n-->\n`);
  if (handback) writeFileSync(join(root, HANDBACK), `{"outcome":"succeeded","report":"delivered ${ID}"}\n`);
  return { root, head };
}

const run = (root, verb, ...rest) => {
  const r = spawnSync(process.execPath, [script, verb, "--root", root, ...rest], { cwd: root, encoding: "utf8" });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* asserted by callers */ }
  return { status: r.status, json, stderr: r.stderr };
};
const flags = ["--briefing", BRIEFING, "--handback", HANDBACK];
const digestOf = (plan) => plan.next[plan.next.indexOf("--expect-sha256") + 1];
const commitCount = (root) => Number(git(root, "rev-list", "--count", "HEAD"));
const cleanup = (root) => rmSync(root, { recursive: true, force: true });

test("plan from the briefing: ready, reads the dispatch binding and the briefed check file, writes nothing, names the record route", () => {
  const { root, head } = fixture();
  try {
    const { status, json } = run(root, "plan", ...flags);
    assert.equal(status, 0, JSON.stringify(json));
    assert.equal(json.status, "ready");
    assert.equal(json.source, "briefing");
    assert.equal(json.dispatchId, ID);
    assert.deepEqual(json.paths, [...ALLOWED].sort());
    assert.deepEqual(json.checkFiles, [{ path: "allowed/check.test.mjs", exists: true }]);
    assert.deepEqual(json.record, { kind: "orchestrator-attested", hostObserved: false, target: RECORD });
    assert.ok(json.next.includes("--briefing") && json.next.includes("--handback") && json.next.includes("--expect-sha256"));
    assert.equal(git(root, "rev-parse", "HEAD"), head);
    assert.equal(existsSync(join(root, RECORD)), false);
  } finally { cleanup(root); }
});

test("apply: one commit with exactly the allowed trailers, and the typed record bound to exactly that commit", () => {
  const { root, head } = fixture();
  try {
    const plan = run(root, "plan", ...flags).json;
    const applied = run(root, "apply", "--dispatch-id", ID, ...flags, "--expect-sha256", digestOf(plan));
    assert.equal(applied.status, 0, applied.stderr + JSON.stringify(applied.json));
    assert.equal(applied.json.status, "committed");
    assert.equal(commitCount(root), 2);
    const commit = git(root, "rev-parse", "HEAD");
    assert.equal(git(root, "rev-parse", "HEAD~1"), head);
    assert.equal(applied.json.commit, commit);
    // Trailers: GIT-03 allows AI-Assisted, one Dispatch (goldfish) and the orchestrator act; the guard's own message policy judges them.
    const message = git(root, "log", "-1", "--format=%B");
    assert.deepEqual(message.split(/\n\n+/u).at(-1).split("\n"), ["AI-Assisted: true", `Dispatch: ${ID} (goldfish)`, "Commit-Act: orchestrator"]);
    const findings = finishedCommitMessageFindings(message, { requireMarker: true, requireDispatch: true, requireProvenanceWhenSignaled: true }).findings;
    assert.deepEqual(findings, [], JSON.stringify(findings));
    assert.doesNotMatch(message, /Co-Authored-By|Claude-Session|Generated with/u);
    // The record: terminal v4, orchestrator-attested, labelled as not host-observed, bound to the commit and the touched paths.
    const record = validateDispatchRecord(JSON.parse(readFileSync(join(root, RECORD), "utf8")));
    assert.equal(record.outcomeClassification.kind, "orchestrator-attested");
    assert.equal(record.attestation.assurance, "orchestrator-attested");
    assert.deepEqual(record.commits, [commit]);
    assert.equal(record.candidateCommit, commit);
    assert.deepEqual(record.report.changedFiles, [...ALLOWED].sort());
    assert.ok(record.criticRequired && !Object.hasOwn(record, "criticSkip"));
    assert.deepEqual(applied.json.record, { kind: "orchestrator-attested", hostObserved: false, target: RECORD, sha256: applied.json.record.sha256 });
    assert.match(applied.json.record.sha256, /^[a-f0-9]{64}$/u);
  } finally { cleanup(root); }
});

test("the close authorship check accepts the record for exactly its commit and nothing else", () => {
  const { root, head } = fixture();
  try {
    const plan = run(root, "plan", ...flags).json;
    assert.equal(run(root, "apply", ...flags, "--expect-sha256", digestOf(plan)).status, 0);
    const commit = git(root, "rev-parse", "HEAD");
    const slices = [{ id: ID, state: "integrated", tier: "goldfish" }];
    const noCommitEvidence = () => [];
    assert.deepEqual(classifyCourseAuthorship({ root, slices, candidateCommit: commit }, { commitIntegrated: noCommitEvidence }).dispatchRecord, [ID]);
    // A candidate that does not contain the recorded commit does not borrow the record: the slice is no longer covered by it.
    const before = classifyCourseAuthorship({ root, slices, candidateCommit: head }, { commitIntegrated: noCommitEvidence });
    assert.deepEqual(before.dispatchRecord, []);
    assert.deepEqual(before.unrecorded, [ID]);
  } finally { cleanup(root); }
});

test("an unobserved v4 authored-commit record is still refused by the writer", () => {
  const { root } = fixture();
  try {
    const plan = run(root, "plan", ...flags).json;
    assert.equal(run(root, "apply", ...flags, "--expect-sha256", digestOf(plan)).status, 0);
    const written = JSON.parse(readFileSync(join(root, RECORD), "utf8"));
    const { attestation, ...rest } = written;
    const forged = { ...rest, taskId: "C19C-W170-FORGED", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" } };
    assert.throws(() => writeDispatchRecordObject({ repoRoot: root, target: "evidence/dispatch-record-C19C-W170-FORGED.json", record: forged }),
      (error) => error.code === "record-host-observation");
    assert.equal(existsSync(join(root, "evidence/dispatch-record-C19C-W170-FORGED.json")), false);
  } finally { cleanup(root); }
});

test("refusal: a foreign staged file names the exact unstage command and commits nothing", () => {
  const { root } = fixture();
  try {
    writeFileSync(join(root, "other.txt"), "staged change\n");
    git(root, "add", "--", "other.txt");
    const { status, json } = run(root, "plan", ...flags);
    assert.equal(status, 2);
    assert.equal(json.code, "GHCR-STAGED");
    assert.match(json.refusals[0].next, /git restore --staged -- other\.txt/u);
    const applied = run(root, "apply", ...flags, "--expect-sha256", "a".repeat(64));
    assert.equal(applied.status, 2);
    assert.equal(commitCount(root), 1);
    assert.equal(existsSync(join(root, RECORD)), false);
  } finally { cleanup(root); }
});

test("refusal: HEAD moved after the plan bound it, no commit and no record", () => {
  const { root } = fixture();
  try {
    const plan = run(root, "plan", ...flags).json;
    writeFileSync(join(root, "elsewhere.txt"), "x\n");
    git(root, "add", "--", "elsewhere.txt");
    git(root, "commit", "-q", "-m", "elsewhere");
    const applied = run(root, "apply", ...flags, "--expect-sha256", digestOf(plan));
    assert.equal(applied.status, 2);
    assert.equal(applied.json.code, "GHCR-PLAN-DIGEST-MISMATCH");
    assert.match(applied.json.refusals[0].next, /goldfish-host-commit-recover\.mjs plan --root /u);
    assert.equal(commitCount(root), 2);
    assert.equal(existsSync(join(root, RECORD)), false);
  } finally { cleanup(root); }
});

test("refusal: the briefed check file is missing, the briefing has no hand-back, a change outside the allowed paths is only reported", () => {
  const missing = fixture({ check: false });
  try {
    const { status, json } = run(missing.root, "plan", ...flags);
    assert.equal(status, 2);
    assert.equal(json.code, "GHCR-CHECK-MISSING");
    assert.match(json.refusals[0].next, /allowed\/check\.test\.mjs/u);
  } finally { cleanup(missing.root); }
  const bare = fixture({ handback: false });
  try {
    const { status, json } = run(bare.root, "plan", "--briefing", BRIEFING);
    assert.equal(status, 2);
    assert.equal(json.code, "GHCR-HANDBACK-REQUIRED");
    assert.match(json.refusals[0].next, /--handback scratch\//u);
  } finally { cleanup(bare.root); }
  const dirty = fixture();
  try {
    writeFileSync(join(dirty.root, "other.txt"), "foreign dirt\n");
    const { status, json } = run(dirty.root, "plan", ...flags);
    assert.equal(status, 0, JSON.stringify(json));
    assert.deepEqual(json.outsideAllowed.includes("other.txt"), true);
    assert.equal(json.paths.includes("other.txt"), false);
  } finally { cleanup(dirty.root); }
});

test("a failed record write after the commit is reported as committed-record-failed with the exact command to repeat", () => {
  const { root } = fixture();
  try {
    const plan = run(root, "plan", ...flags).json;
    // The evidence directory vanishing after the plan makes the publication fail after the commit landed.
    rmSync(join(root, "evidence"), { recursive: true, force: true });
    writeFileSync(join(root, "evidence"), "not a directory\n");
    const applied = run(root, "apply", ...flags, "--expect-sha256", digestOf(plan));
    assert.equal(applied.status, 2);
    assert.equal(applied.json.status, "committed-record-failed");
    assert.equal(commitCount(root), 2);
    assert.match(applied.json.refusals[0].next, /dispatch-record-write\.mjs --repo-root .* --attested-request scratch\//u);
  } finally { cleanup(root); }
});

test("hook messages: pending-unavailable names the plan command with the dispatch id, a commit exception names the heal command", () => {
  const unavailable = nativeGoldfishHookMessage({ status: "recovery-required", code: "NGHF-PENDING-UNAVAILABLE", dispatchId: ID, reason: "async-launch" });
  assert.match(unavailable, new RegExp(`goldfish-host-commit-recover\\.mjs plan --root <root> --dispatch-id ${ID}`, "u"));
  assert.match(unavailable, /--briefing <briefing file> --handback <hand-back file>/u);
  assert.doesNotMatch(unavailable, /Interim route/u);
  // The finalizer's commit-exception result carries no dispatch id and keeps the slug reason inside its bounded detail
  // (`{ ...withDetail(fail("NGHF-COMMIT-EXCEPTION"), exceptionDetail(error)), commit: "unknown" }`).
  const live = { status: "recovery-required", code: "NGHF-COMMIT-EXCEPTION", commit: "unknown", record: null,
    detail: { errorName: "Error", errorCode: "NATIVE_MANAGED_FAULT", reason: "native-concurrent-unowned-head" } };
  const exception = nativeGoldfishHookMessage(live);
  assert.match(exception, /routine-repair\.mjs run heal --root <root> --reason/u);
  assert.match(exception, /goldfish-host-commit-recover\.mjs plan --root <root> --briefing <briefing file> --handback <hand-back file>/u);
  const plainException = nativeGoldfishHookMessage({ ...live, detail: { errorName: "Error" } });
  assert.match(plainException, /goldfish-host-commit-recover\.mjs plan --root <root>/u);
  assert.doesNotMatch(plainException, /routine-repair/u);
  // The persisted stop-failure record of that result has `reason: null` and the slug in `detail.reason`; it names the dispatch id.
  const notice = nativeGoldfishHookMessage(null, { stopFailure: { code: "NGHF-COMMIT-EXCEPTION", dispatchId: ID, observedAt: "2026-11-04T00:00:00.000Z", stage: null, reason: null,
    detail: { errorName: "Error", reason: "native-concurrent-unowned-head" } } });
  assert.match(notice, /routine-repair\.mjs run heal --root <root> --reason/u);
  assert.match(notice, new RegExp(`goldfish-host-commit-recover\\.mjs plan --root <root> --dispatch-id ${ID}`, "u"));
  // A stage failure keeps its top-level causeReason and is read the same way.
  assert.match(nativeGoldfishHookMessage({ status: "recovery-required", code: "NGHF-COMMIT-EXCEPTION", causeReason: "native-concurrent-unowned-head" }), /routine-repair\.mjs run heal/u);
});

test("guard admits the briefing and hand-back flags on the exact shapes and nothing looser", () => {
  const root = realpathSync(resolve(here, "..", "..", ".."));
  const entry = resolve(root, "plugins/pipeline-core/scripts/goldfish-host-commit-recover.mjs");
  const admitted = (args) => isSanctionedLifecycleCommand(`node '${entry}' ${args}`, root);
  assert.equal(admitted(`plan --root '${root}' --dispatch-id ${ID} --briefing scratch/b.md --handback scratch/h.txt`), true);
  assert.equal(admitted(`apply --root '${root}' --dispatch-id ${ID} --briefing scratch/b.md --handback scratch/h.txt --expect-sha256 ${"a".repeat(64)}`), true);
  for (const args of [
    `plan --root '${root}' --briefing ../b.md`, `plan --root '${root}' --briefing /abs/b.md`, `plan --root '${root}' --briefing scratch/b.md --briefing scratch/c.md`,
    `plan --root '${root}' --handback scratch/h.txt --handback scratch/i.txt`, `plan --root '${root}' --briefing`,
  ]) assert.equal(admitted(args), false, args);
});

// ---- C28-HOST-COMMIT-RECOVERY (AC-108, PO decision 2026-11-10 on the WSL greenfield report) ----
// The lost steps of a failed host commit are recovered by this one command, whatever the failure left on disk, and running it again changes nothing.
const stateDir = (root, ...rest) => join(root, ".git", "agent-pipeline", "run", ...rest);
function writePending(root, candidateCommit, allowed) {
  mkdirSync(stateDir(root, "native-goldfish-host-commit"), { recursive: true });
  writeFileSync(stateDir(root, "native-goldfish-host-commit", `pending-claude-${ID}.json`),
    JSON.stringify({ createdAtMs: Date.now(), runner: "claude", binding: { dispatchId: ID, candidateCommit, allowedPaths: allowed } }));
}
function commitByHand(root, paths) {
  writeFileSync(join(root, "scratch", "host-msg.txt"), `feat: deliver the briefed work\n\nAI-Assisted: true\nDispatch: ${ID} (goldfish)\n`);
  git(root, "add", "--", ...paths);
  git(root, "commit", "-q", "-F", "scratch/host-msg.txt", "--", ...paths);
  return git(root, "rev-parse", "HEAD");
}
const changedIn = (root, commit) => git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "--root", commit).split("\n").filter(Boolean).sort();

test("RHC-1 concurrent advance: the Elephant committed inside the dispatch's scope, the host commit failed; the recovery command lands the result on the advanced HEAD, names the advance, and a second run changes nothing", () => {
  const { root, head } = fixture({ briefing: false, handback: false, allowedExtra: ["allowed/e.txt"] });
  try {
    writePending(root, head, [...ALLOWED, "allowed/e.txt"]);
    writeFileSync(join(root, "allowed", "e.txt"), "elephant evidence\n");
    git(root, "add", "--", "allowed/e.txt");
    git(root, "commit", "-q", "-m", "docs: evidence written while the Goldfish ran", "--", "allowed/e.txt");
    const advanced = git(root, "rev-parse", "HEAD");
    const plan = run(root, "plan").json;
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    assert.deepEqual(plan.headAdvance, { from: head, to: advanced, touchesScope: true, scopePaths: ["allowed/e.txt"] });
    assert.deepEqual(plan.paths, [...ALLOWED].sort());
    const applied = run(root, "apply", "--dispatch-id", ID, ...plan.paths.flatMap((p) => ["--path", p]), "--expect-sha256", digestOf(plan));
    assert.equal(applied.status, 0, JSON.stringify(applied.json));
    assert.equal(applied.json.status, "committed");
    assert.deepEqual(changedIn(root, applied.json.commit), [...ALLOWED].sort(), "the Elephant's own file is not part of the Goldfish commit");
    assert.equal(git(root, "rev-parse", `${applied.json.commit}^`), advanced);
    const count = commitCount(root);
    const again = run(root, "apply", "--dispatch-id", ID, ...plan.paths.flatMap((p) => ["--path", p]), "--expect-sha256", digestOf(plan));
    assert.equal(again.status, 0, JSON.stringify(again.json));
    assert.equal(again.json.status, "already-recovered");
    assert.equal(again.json.commit, applied.json.commit);
    assert.equal(commitCount(root), count, "the second run made no commit");
  } finally { cleanup(root); }
});

test("RHC-2 critic-path-disposition: the Goldfish commit exists and nothing after it; the recovery command writes the lost record for exactly that commit, once", () => {
  const { root } = fixture();
  try {
    const commit = commitByHand(root, ALLOWED);
    const before = commitCount(root);
    const plan = run(root, "plan", ...flags);
    assert.equal(plan.status, 0, JSON.stringify(plan.json));
    assert.equal(plan.json.status, "ready", JSON.stringify(plan.json));
    assert.equal(plan.json.mode, "record-only");
    assert.equal(plan.json.commit, commit);
    assert.deepEqual(plan.json.paths, []);
    assert.equal(existsSync(join(root, RECORD)), false, "plan writes nothing");
    const applied = run(root, "apply", "--dispatch-id", ID, ...flags, "--expect-sha256", digestOf(plan.json));
    assert.equal(applied.status, 0, applied.stderr + JSON.stringify(applied.json));
    assert.equal(applied.json.status, "recorded");
    assert.equal(commitCount(root), before, "no second commit is made for a commit that exists");
    const record = validateDispatchRecord(JSON.parse(readFileSync(join(root, RECORD), "utf8")));
    assert.deepEqual(record.commits, [commit]);
    assert.equal(record.outcomeClassification.kind, "orchestrator-attested");
    const bytes = readFileSync(join(root, RECORD), "utf8");
    const again = run(root, "apply", "--dispatch-id", ID, ...flags, "--expect-sha256", digestOf(plan.json));
    assert.equal(again.status, 0, JSON.stringify(again.json));
    assert.equal(again.json.status, "already-recovered");
    assert.equal(readFileSync(join(root, RECORD), "utf8"), bytes, "the record is not rewritten");
    assert.equal(run(root, "plan", ...flags).json.status, "already-recovered");
  } finally { cleanup(root); }
});

test("RHC-3 the ordinary route is idempotent too: after the commit and the record, plan and apply say already-recovered and change nothing", () => {
  const { root } = fixture();
  try {
    const plan = run(root, "plan", ...flags).json;
    const applied = run(root, "apply", "--dispatch-id", ID, ...flags, "--expect-sha256", digestOf(plan));
    assert.equal(applied.json.status, "committed");
    const count = commitCount(root), bytes = readFileSync(join(root, RECORD), "utf8");
    const again = run(root, "apply", "--dispatch-id", ID, ...flags, "--expect-sha256", digestOf(plan));
    assert.equal(again.status, 0, JSON.stringify(again.json));
    assert.equal(again.json.status, "already-recovered");
    assert.equal(commitCount(root), count);
    assert.equal(readFileSync(join(root, RECORD), "utf8"), bytes);
  } finally { cleanup(root); }
});

test("RHC-4 every failed host commit names the recovery command with the real root and dispatch id, whatever its code", () => {
  const root = "/work/project";
  const codes = ["SDC-AUTHORITY-UNAVAILABLE", "NGHF-AUTHORITY-RECOVERY", "NGHF-COMMIT-EXCEPTION", "NGHF-COMMIT-FAILED", "NGHF-CRITIC-PATH-DISPOSITION", "NGHF-RECORD-INVALID",
    "NGHF-OBSERVATION-DRAFT-EXCEPTION", "NGHF-PRIVATE-OBSERVATION-EXCEPTION", "NGHF-V4-PUBLICATION-EXCEPTION", "NGHF-AUTHORITY-TERMINAL-RELEASE-EXCEPTION", "NGHF-CHECKS-PUBLICATION-EXCEPTION"];
  for (const code of codes) {
    const message = nativeGoldfishHookMessage({ status: "recovery-required", code, commit: null, record: null, stopDispatchId: ID }, { root });
    assert.match(message, new RegExp(`goldfish-host-commit-recover\\.mjs' plan --root '${root}' --dispatch-id ${ID} --briefing scratch/briefing-${ID}\\.md --handback scratch/handback-${ID}\\.txt`, "u"), `${code}: ${message}`);
    assert.match(message, /same command as apply/u, code);
  }
  // A failure after the commit landed says so: the recovery writes the record and commits nothing again.
  const landed = nativeGoldfishHookMessage({ status: "recovery-required", code: "NGHF-CRITIC-PATH-DISPOSITION", commit: "a".repeat(40), record: null, stopDispatchId: ID }, { root });
  assert.match(landed, /commit already exists/u);
  // A stop-failure record names it as well (the PostToolUse channel), for a dispatch it belongs to.
  const notice = nativeGoldfishHookMessage(null, { root, stopFailure: { code: "SDC-AUTHORITY-UNAVAILABLE", dispatchId: ID, observedAt: "2026-11-10T00:00:00.000Z", stage: "authority-terminal-prepare", reason: "native-concurrent-advance-touches-scope", detail: null } });
  assert.match(notice, new RegExp(`plan --root '${root}' --dispatch-id ${ID}`, "u"));
  assert.match(notice, /native-concurrent-advance-touches-scope/u);
});

test("RHC-5 a stop-failure hint belongs to its own dispatch: strict reads never fall back to another dispatch's record, and a later success or a recovery clears it", () => {
  const { root } = fixture();
  try {
    const commonDir = join(root, ".git");
    const dir = stateDir(root, "native-goldfish-host-diagnostics");
    mkdirSync(dir, { recursive: true });
    const record = (name, dispatchId, observedAt) => writeFileSync(join(dir, `stop-failure-${name}.json`), JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1",
      dispatchId, toolUseId: null, status: "recovery-required", code: "NGHF-COMMIT-EXCEPTION", stage: null, reason: null, commit: "unknown", observedAt }));
    record("aaaa", "OLD-DISPATCH", "2026-11-10T08:00:00.000Z");
    // The default reader (the recovery helper's) keeps its newest-record fallback.
    assert.equal(readNativeGoldfishStopFailure({ commonDir })?.dispatchId, "OLD-DISPATCH");
    assert.equal(readNativeGoldfishStopFailure({ commonDir, dispatchId: "UNRELATED" })?.dispatchId, "OLD-DISPATCH");
    // A strict read (the PostToolUse hint) is bound to the dispatch and shows nothing for any other one, or for none.
    assert.equal(readNativeGoldfishStopFailure({ commonDir, dispatchId: "UNRELATED", strict: true }), null);
    assert.equal(readNativeGoldfishStopFailure({ commonDir, dispatchId: null, strict: true }), null);
    assert.equal(readNativeGoldfishStopFailure({ commonDir, dispatchId: "OLD-DISPATCH", strict: true })?.dispatchId, "OLD-DISPATCH");
    record("bbbb", "NEWER", "2026-11-10T09:00:00.000Z");
    const own = readNativeGoldfishStopFailure({ commonDir, dispatchId: "OLD-DISPATCH", strict: true });
    assert.equal(own.dispatchId, "OLD-DISPATCH");
    assert.equal(own.others, undefined, "another dispatch's failure is never listed under this one");
    // The hint of a dispatch whose stop later ended with a recorded commit is stale.
    writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "OLD-DISPATCH", result: { status: "authored-commit-recorded", code: "NGHF-AUTHORED-RECORD-VERIFIED", commit: "a".repeat(40) }, message: "ok", now: () => new Date("2026-11-10T10:00:00.000Z") });
    assert.equal(readNativeGoldfishStopFailure({ commonDir, dispatchId: "OLD-DISPATCH", strict: true }), null);
    // A recovery clears the records of exactly its dispatch.
    assert.equal(finalizerLib.clearNativeGoldfishStopFailures({ commonDir, dispatchId: "NEWER" }), 1);
    assert.equal(readNativeGoldfishStopFailure({ commonDir, dispatchId: "NEWER", strict: true }), null);
    assert.equal(readNativeGoldfishStopFailure({ commonDir })?.dispatchId, "OLD-DISPATCH", "a record of another dispatch is left alone");
  } finally { cleanup(root); }
});

test("RHC-6 applying a recovery clears the stop-failure hint of its dispatch", () => {
  const { root } = fixture();
  try {
    const dir = stateDir(root, "native-goldfish-host-diagnostics");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "stop-failure-cccc.json");
    writeFileSync(file, JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: ID, toolUseId: null, status: "recovery-required", code: "SDC-AUTHORITY-UNAVAILABLE",
      stage: "authority-terminal-prepare", reason: "native-concurrent-advance-touches-scope", commit: null, observedAt: "2026-11-10T08:00:00.000Z" }));
    const plan = run(root, "plan", ...flags).json;
    assert.equal(plan.stopFailure?.code, "SDC-AUTHORITY-UNAVAILABLE");
    assert.equal(run(root, "apply", "--dispatch-id", ID, ...flags, "--expect-sha256", digestOf(plan)).json.status, "committed");
    assert.equal(existsSync(file), false, "the recovered dispatch's hint is gone");
  } finally { cleanup(root); }
});
