// SPDX-License-Identifier: SUL-1.0
/**
 * AC-164 (fresh bounded attempt): the sanctioned recover command lands an uncommitted Goldfish result as ONE
 * orchestrator commit whose message points at the stop failure. Fixtures build a throwaway git repository with a
 * pending state and a stop-failure record in the shapes the finalizer writes. Suite name for registration (an
 * Elephant step in a consolidated slice): goldfish-host-commit-recover.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { isSanctionedLifecycleCommand } from "../lib/guard/command-catalogue.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "goldfish-host-commit-recover.mjs");
const DISPATCH = "C18-1B-FIXTURE";
const STOP_FILE = "stop-failure-0123456789abcdef0123456789abcdef.json";

const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};

function fixture({ pending = true, stop = true, stopOver = {} } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghcr-")));
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "commit.gpgsign", "false");
  mkdirSync(join(root, "allowed"), { recursive: true });
  writeFileSync(join(root, "allowed", "x.txt"), "one\n");
  writeFileSync(join(root, "other.txt"), "one\n");
  git(root, "add", "--", "allowed/x.txt", "other.txt");
  git(root, "commit", "-q", "-m", "base");
  const head = git(root, "rev-parse", "HEAD");
  // The Goldfish result: one tracked path modified, one new, and an unrelated tracked file dirty.
  writeFileSync(join(root, "allowed", "x.txt"), "two\n");
  writeFileSync(join(root, "allowed", "new.txt"), "new\n");
  writeFileSync(join(root, "other.txt"), "dirty\n");
  const common = join(root, ".git", "agent-pipeline", "run");
  if (pending) {
    const dir = join(common, "native-goldfish-host-commit");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "pending-claude-aaaaaaaa.json"), `${JSON.stringify({
      schema: "pipeline.native-goldfish-host-state.v1", runner: "claude", sessionId: "s1", toolUseId: "toolu_1",
      binding: { dispatchId: DISPATCH, candidateCommit: head, allowedPaths: ["allowed/x.txt", "allowed/new.txt"] } }, null, 2)}\n`);
  }
  if (stop) {
    const dir = join(common, "native-goldfish-host-diagnostics");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, STOP_FILE), `${JSON.stringify({
      schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: DISPATCH, toolUseId: "toolu_1", status: "recovery-required",
      code: "NGHF-FIXTURE-CODE", stage: null, reason: null, commit: null, observedAt: "2026-11-02T10:00:00.000Z", ...stopOver })}\n`);
  }
  return { root, head };
}

const run = (root, verb, ...rest) => {
  const r = spawnSync(process.execPath, [script, verb, "--root", root, ...rest], { cwd: root, encoding: "utf8" });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* asserted by callers */ }
  return { status: r.status, json, stderr: r.stderr };
};
const commitCount = (root) => Number(git(root, "rev-list", "--count", "HEAD"));
const cleanup = (root) => rmSync(root, { recursive: true, force: true });

test("plan: ready with the exact paths, the stop-failure pointer and a zero-effect read", () => {
  const { root, head } = fixture();
  try {
    const { status, json } = run(root, "plan");
    assert.equal(status, 0);
    assert.equal(json.schema, "pipeline.goldfish-host-commit-recover-plan.v1");
    assert.equal(json.status, "ready");
    assert.equal(json.dispatchId, DISPATCH);
    assert.equal(json.candidateCommit, head);
    assert.deepEqual(json.paths, ["allowed/new.txt", "allowed/x.txt"]);
    assert.deepEqual(json.stopFailure, { file: STOP_FILE, code: "NGHF-FIXTURE-CODE" });
    assert.deepEqual(json.refusals, []);
    assert.ok(json.next.includes("apply") && json.next.includes("--expect-sha256"));
    assert.equal(git(root, "rev-parse", "HEAD"), head);
    assert.equal(existsSync(join(root, "scratch", "commit-msg", `${DISPATCH}.txt`)), false);
  } finally { cleanup(root); }
});

test("apply: exactly one commit, three trailers last, pointer to the stop failure, unrelated dirt untouched", () => {
  const { root, head } = fixture();
  try {
    const plan = run(root, "plan").json;
    const digest = plan.next[plan.next.indexOf("--expect-sha256") + 1];
    const applied = run(root, "apply", "--dispatch-id", DISPATCH, "--expect-sha256", digest);
    assert.equal(applied.status, 0, applied.stderr + JSON.stringify(applied.json));
    assert.equal(commitCount(root), 2);
    assert.equal(git(root, "rev-parse", "HEAD~1"), head);
    assert.deepEqual(git(root, "show", "--name-only", "--format=", "HEAD").split("\n").sort(), ["allowed/new.txt", "allowed/x.txt"]);
    assert.equal(git(root, "status", "--porcelain", "--", "other.txt"), "M other.txt");
    const message = git(root, "log", "-1", "--format=%B");
    const paragraphs = message.split(/\n\n+/u);
    assert.deepEqual(paragraphs.at(-1).split("\n"), ["AI-Assisted: true", `Dispatch: ${DISPATCH} (goldfish)`, "Commit-Act: orchestrator"]);
    assert.ok(message.includes(STOP_FILE) && message.includes("NGHF-FIXTURE-CODE"), message);
    assert.equal(readFileSync(join(root, "scratch", "commit-msg", `${DISPATCH}.txt`), "utf8").includes("Commit-Act: orchestrator"), true);
  } finally { cleanup(root); }
});

test("K-32: a framework route folder ([...slug], (group)) lands literally; a sibling a glob would match is not committed", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghcr-k32-")));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    git(root, "config", "commit.gpgsign", "false");
    writeFileSync(join(root, "README.md"), "base\n");
    git(root, "add", "--", "README.md");
    git(root, "commit", "-q", "-m", "base");
    const head = git(root, "rev-parse", "HEAD");
    const route = "src/app/(payload)/cms-api/[...slug]/route.ts";
    const sibling = "src/app/(payload)/cms-api/s/route.ts"; // `[...slug]` read as a glob matches the folder `s`
    for (const path of [route, sibling]) { mkdirSync(join(root, dirname(path)), { recursive: true }); writeFileSync(join(root, path), "export {};\n"); }
    const dir = join(root, ".git", "agent-pipeline", "run", "native-goldfish-host-commit");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "pending-claude-aaaaaaaa.json"), `${JSON.stringify({
      schema: "pipeline.native-goldfish-host-state.v1", runner: "claude", sessionId: "s1", toolUseId: "toolu_1",
      binding: { dispatchId: DISPATCH, candidateCommit: head, allowedPaths: [route] } }, null, 2)}\n`);
    const plan = run(root, "plan").json;
    assert.equal(plan?.status, "ready", JSON.stringify(plan));
    assert.deepEqual(plan.paths, [route]);
    const applied = run(root, "apply", "--dispatch-id", DISPATCH, "--expect-sha256", plan.next[plan.next.indexOf("--expect-sha256") + 1]);
    assert.equal(applied.status, 0, applied.stderr + JSON.stringify(applied.json));
    assert.deepEqual(git(root, "show", "--name-only", "--format=", "HEAD").split("\n"), [route], "exactly the bracket path, never the sibling");
    assert.equal(git(root, "status", "--porcelain", "--untracked-files=all", "--", "src/app/(payload)/cms-api/s"), `?? ${sibling}`);
  } finally { cleanup(root); }
});

test("K-33: after a whitespace refusal the plan names the flagged files and the .gitattributes route for generated files", () => {
  const { root } = fixture({ stopOver: { code: "NATIVE-HOST-COMMIT-DIFF-CHECK", detail: { reason: "staged-diff-whitespace", condition: "index-restored", paths: ["allowed/new.txt"] } } });
  try {
    const { status, json } = run(root, "plan");
    assert.equal(status, 0, JSON.stringify(json));
    assert.equal(json.status, "ready");
    assert.match(json.diffCheckNote, /in allowed\/new\.txt/u);
    assert.match(json.diffCheckNote, /-whitespace/u);
  } finally { cleanup(root); }
  const plain = fixture();
  try { assert.equal(run(plain.root, "plan").json.diffCheckNote, undefined, "no note for another stop code"); } finally { cleanup(plain.root); }
});

test("GHCR-CAUSE plan: the stop-failure pointer carries the recorded reason and stage, and the detail's own reason when the record has none", () => {
  const recorded = fixture({ stopOver: { stage: "pending-read", reason: "NGHS-PENDING-MISSING" } });
  try {
    assert.deepEqual(run(recorded.root, "plan").json.stopFailure, { file: STOP_FILE, code: "NGHF-FIXTURE-CODE", reason: "NGHS-PENDING-MISSING", stage: "pending-read" });
  } finally { cleanup(recorded.root); }
  const detailed = fixture({ stopOver: { reason: null, detail: { reason: "native-concurrent-unowned-head" } } });
  try {
    const found = run(detailed.root, "plan").json.stopFailure;
    assert.equal(found.reason, "native-concurrent-unowned-head");
    assert.equal(found.file, STOP_FILE);
  } finally { cleanup(detailed.root); }
  const bare = fixture();
  try {
    assert.deepEqual(Object.keys(run(bare.root, "plan").json.stopFailure).sort(), ["code", "file"], "a record without a cause adds no empty cause fields");
  } finally { cleanup(bare.root); }
});

test("GHCR-NO-NATIVE-RESULT: an Antigravity briefing lands only what a taken-over child branch delivered", () => {
  const { root, head } = fixture({ pending: false, stop: false });
  try {
    const briefing = (runner) => `<!-- pipeline-native-goldfish-host-commit: fixture\n${JSON.stringify({
      dispatchId: DISPATCH, runner, agentType: "goldfish-implementor", model: "fixture-model", effort: "medium", rulesetSha: "abc1234", candidateCommit: head,
      allowedPaths: ["allowed/x.txt"], criticDecision: { schema: "pipeline.critic-required-decision.v1" } })}\n-->\n`;
    mkdirSync(join(root, "scratch"), { recursive: true });
    writeFileSync(join(root, "scratch", "handback.txt"), "the Goldfish returned this\n");
    const planFor = (runner) => {
      writeFileSync(join(root, "scratch", "briefing.md"), briefing(runner));
      return run(root, "plan", "--briefing", "scratch/briefing.md", "--handback", "scratch/handback.txt").json;
    };
    assert.equal(planFor("claude").status, "ready", "the check is Antigravity only");
    const refused = planFor("antigravity");
    assert.equal(refused.code, "GHCR-NO-NATIVE-RESULT", JSON.stringify(refused));
    assert.match(refused.refusals[0].next, /agy-native-integrate\.mjs plan\|apply/u);

    const directory = join(root, ".git", "agent-pipeline", "run", "agy-native-integrated");
    mkdirSync(directory, { recursive: true });
    const tip = "a".repeat(40);
    writeFileSync(join(directory, `${tip}.json`), `${JSON.stringify({ schema: "pipeline.agy-native-integrated.v1", branch: "subagent-x", tip, base: head,
      blobs: { "allowed/x.txt": git(root, "hash-object", "--", "allowed/x.txt") } })}\n`);
    assert.equal(planFor("antigravity").status, "ready", "the tree holds exactly what the branch delivered");
    writeFileSync(join(root, "allowed", "x.txt"), "edited after the take-over\n");
    assert.equal(planFor("antigravity").code, "GHCR-NO-NATIVE-RESULT", "an edit after the take-over is not the child's result");
  } finally { cleanup(root); }
});

test("plan without a stop-failure record is ready with stopFailure null and says the stop left no diagnostic", () => {
  const { root } = fixture({ stop: false });
  try {
    const { json } = run(root, "plan");
    assert.equal(json.status, "ready");
    assert.equal(json.stopFailure, null);
    assert.match(json.stopFailureNote, /no diagnostic/u);
  } finally { cleanup(root); }
});

test("refusal: HEAD moved away from the pending candidate", () => {
  const { root, head } = fixture();
  try {
    // QG-04, C28-HOST-COMMIT-RECOVERY (PO decision 2026-11-10): HEAD that moved FORWARD from the candidate is now this command's own recovery route (RHC-1 in
    // orchestrator-commit-record.test.mjs). The intent of this case, a HEAD that is not the candidate and does not descend from it still refuses, is unchanged:
    // the move is now a rewrite of the candidate commit instead of a commit on top of it.
    writeFileSync(join(root, "elsewhere.txt"), "x\n");
    git(root, "add", "--", "elsewhere.txt");
    git(root, "commit", "-q", "--amend", "-m", "elsewhere");
    const moved = git(root, "rev-parse", "HEAD");
    const { status, json } = run(root, "plan");
    assert.equal(status, 2);
    assert.equal(json.status, "refused");
    assert.equal(json.code, "GHCR-HEAD-MOVED");
    assert.ok(json.refusals[0].next.length > 0);
    assert.notEqual(moved, head);
    const applied = run(root, "apply", "--expect-sha256", "0".repeat(64));
    assert.equal(applied.status, 2);
    assert.equal(commitCount(root), 1, "QG-04 restatement: the rewrite replaced the one commit (it used to add a second); the refused apply added none");
  } finally { cleanup(root); }
});

test("refusal: a staged path", () => {
  const { root } = fixture();
  try {
    git(root, "add", "--", "other.txt");
    const { status, json } = run(root, "plan");
    assert.equal(status, 2);
    assert.equal(json.code, "GHCR-STAGED");
    assert.equal(commitCount(root), 1);
  } finally { cleanup(root); }
});

test("refusal: a claimed path outside the briefed allowed paths", () => {
  const { root } = fixture();
  try {
    const { status, json } = run(root, "plan", "--path", "other.txt");
    assert.equal(status, 2);
    assert.equal(json.code, "GHCR-PATH-OUTSIDE-ALLOWED");
    assert.deepEqual(json.paths, []);
  } finally { cleanup(root); }
});

test("refusal: neither pending state nor explicit flags", () => {
  const { root } = fixture({ pending: false, stop: false });
  try {
    const { status, json } = run(root, "plan");
    assert.equal(status, 2);
    assert.equal(json.code, "GHCR-NO-SOURCE");
    assert.match(json.refusals[0].next, /--dispatch-id/u);
  } finally { cleanup(root); }
});

test("explicit flags with absolute and relative paths work with no pending state", () => {
  const { root, head } = fixture({ pending: false });
  try {
    const flags = ["--dispatch-id", DISPATCH, "--allowed-path", join(root, "allowed", "x.txt"), "--allowed-path", "allowed/new.txt",
      "--path", "allowed/x.txt", "--path", join(root, "allowed", "new.txt")];
    const plan = run(root, "plan", ...flags).json;
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    assert.deepEqual(plan.paths, ["allowed/new.txt", "allowed/x.txt"]);
    assert.deepEqual(plan.stopFailure, { file: STOP_FILE, code: "NGHF-FIXTURE-CODE" });
    const digest = plan.next[plan.next.indexOf("--expect-sha256") + 1];
    const applied = run(root, "apply", ...flags, "--expect-sha256", digest);
    assert.equal(applied.status, 0, applied.stderr + JSON.stringify(applied.json));
    assert.equal(git(root, "rev-parse", "HEAD~1"), head);
  } finally { cleanup(root); }
});

test("apply refuses a plan digest mismatch and a missing digest, committing nothing", () => {
  const { root } = fixture();
  try {
    const wrong = run(root, "apply", "--expect-sha256", "f".repeat(64));
    assert.equal(wrong.status, 2);
    assert.equal(wrong.json.code, "GHCR-PLAN-DIGEST-MISMATCH");
    const missing = run(root, "apply");
    assert.equal(missing.status, 2);
    assert.equal(missing.json.code, "GHCR-EXPECT-SHA256-REQUIRED");
    assert.equal(commitCount(root), 1);
  } finally { cleanup(root); }
});

test("guard admits the plain plan command and the exact apply shape, nothing looser", () => {
  const root = realpathSync(resolve(here, "..", "..", ".."));
  const entry = resolve(root, "plugins/pipeline-core/scripts/goldfish-host-commit-recover.mjs");
  const admitted = (args) => isSanctionedLifecycleCommand(`node '${entry}' ${args}`, root);
  assert.equal(admitted(`plan --root '${root}'`), true);
  assert.equal(admitted(`plan --root '${root}' --dispatch-id task-1 --allowed-path a/b.txt --path a/b.txt`), true);
  assert.equal(admitted(`apply --root '${root}' --expect-sha256 ${"a".repeat(64)}`), true);
  // The id form the command exists to serve: briefed dispatch ids are upper case, and plan's printed `next` always carries one.
  assert.equal(admitted(`plan --root '${root}' --dispatch-id C18-1B-HOST-COMMIT-RECOVER --allowed-path a/b.txt`), true);
  assert.equal(admitted(`apply --root '${root}' --dispatch-id C18-1B-HOST-COMMIT-RECOVER --path a/b.txt --expect-sha256 ${"a".repeat(64)}`), true);
  for (const args of [
    "", `plan`, `plan --root '${root}/x'`, `apply --root '${root}'`, `apply --root '${root}' --expect-sha256 nothex`,
    `plan --root '${root}' --expect-sha256 ${"a".repeat(64)}`, `plan --root '${root}' --path ../x`, `plan --root '${root}' --force`,
    `plan --root '${root}' --dispatch-id ../x`, `commit --root '${root}'`,
  ]) assert.equal(admitted(args), false, args);
});
