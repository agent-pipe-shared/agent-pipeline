// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.antigravity-native-goldfish-dispatch (AC-108, candidate 20 finding G20-8 B and G20-22).
// An Antigravity-hosted Elephant dispatches goldfish-implementor / -mechanic / -deep through the host's native `invoke_subagent` like a
// Claude Elephant does through the Agent tool: no per-dispatch PO consent, the child's hook calls bound to the parent through the
// host-written descriptor, the child's RESOLVED model checked, one code-writing child alive at a time.
//
// Every payload below replays the shape MEASURED on a real Antigravity host (specs/sprint-alfred-epic/evidence/held-patches/
// w252-agy-native-subagent-measurement.md): flat invoke_subagent args (no Subagents array), args that may be JSON-string-encoded, the
// eight-key hook payload, no parent field, and the descriptor <brain>/<parentId>/.system_generated/subagents/<childId>.json.
// No model is called and no agy process is started.
//
// Before the change: the guard refused every native goldfish call without a signed consent (AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE),
// had no module reading the descriptor, no resolved-model check and no code-writer serialization, and did not decode a quoted Model.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { normalizeAntigravityToolInput } from "../../hooks/antigravity-pretool-guard.mjs";
import { registeredFunctionalTaskRoutes } from "../model-role-route-source.mjs";

const libDir = dirname(dirname(fileURLToPath(import.meta.url)));
const adapter = join(libDir, "..", "hooks", "antigravity-pretool-guard.mjs");
const loadModule = () => import("../agy-native-goldfish.mjs");

const PARENT = "11111111-aaaa-4aaa-8aaa-000000000001";
const CHILD = "22222222-bbbb-4bbb-8bbb-000000000002";
const OTHER_CHILD = "33333333-cccc-4ccc-8ccc-000000000003";

// A real git invocation: the worktree facts (M4b) are read from git state, so the fixtures use real repositories and real worktrees.
const git = (cwd, ...args) => {
  const res = spawnSync("git", ["-c", "user.email=t@example.invalid", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", timeout: 30_000 });
  assert.equal(res.status, 0, `git ${args.join(" ")}: ${res.stderr}`);
  return res.stdout.trim();
};

function brainFixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "agy-native-goldfish-")));
  const brain = join(base, "brain");
  const workspace = join(base, "workspace");
  mkdirSync(join(brain, PARENT, ".system_generated", "subagents"), { recursive: true });
  mkdirSync(join(brain, CHILD), { recursive: true });
  mkdirSync(join(workspace, ".agent-pipeline"), { recursive: true });
  mkdirSync(join(workspace, ".claude"), { recursive: true });
  writeFileSync(join(workspace, ".claude", "pipeline.json"), JSON.stringify({ project: "test", verify: "node verify.mjs" }));
  writeFileSync(join(workspace, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-10-02T00:00:00.000Z",
  }));
  // The workspace is a git repository with one commit (M4b: a branch worktree starts at the committed HEAD).
  git(workspace, "init", "-q");
  git(workspace, "add", ".claude/pipeline.json");
  git(workspace, "commit", "-q", "-m", "init");
  return { base, brain, workspace };
}

// M4b item 1: the host makes a REAL git worktree below <home>/.gemini/antigravity-cli/worktrees/<parentId>/ on a new branch of the same name.
function worktreeFixture(fx, name = "subagent-Goldfish-goldfish-implementor-1a2b3c") {
  const home = join(fx.base, "home");
  mkdirSync(join(home, ".gemini", "antigravity-cli", "worktrees", PARENT), { recursive: true });
  const path = join(home, ".gemini", "antigravity-cli", "worktrees", PARENT, name);
  git(fx.workspace, "worktree", "add", "-q", "-b", name, path);
  return { path: realpathSync(path), branch: name, home };
}

// M4b item 5: a child's hook payload names its worktree FIRST and the parent repository second.
const childPayload = (fx, wt, toolCall, conversationId = CHILD) => ({
  ...payload(fx, { conversationId, lastUserInput: "", modelName: selectedModel("implement"), toolCall }),
  workspacePaths: [wt.path, fx.workspace],
});

function descriptor(fx, childId, typeName, state = "SUBAGENT_STATE_ALIVE", parent = PARENT) {
  mkdirSync(join(fx.brain, parent, ".system_generated", "subagents"), { recursive: true });
  writeFileSync(join(fx.brain, parent, ".system_generated", "subagents", `${childId}.json`), JSON.stringify({
    conversationId: childId,
    subagentDescriptor: { typeName, role: "Goldfish" },
    state,
    spawnStepIndex: 7,
    workspaceUris: [`file://${fx.workspace}`],
  }));
}

// The eight measured keys and nothing else.
function payload(fx, { conversationId, toolCall, modelName = "parent-model", lastUserInput = "do it" }) {
  return {
    artifactDirectoryPath: join(fx.brain, conversationId),
    conversationId,
    lastUserInput,
    modelName,
    stepIdx: 12,
    toolCall,
    transcriptPath: join(fx.brain, conversationId, "transcript.jsonl"),
    workspacePaths: [fx.workspace],
  };
}

// Flat args; Model is the JSON-STRING-encoded value the greenfield transcript shows ("flash" with its quotes).
const flatCall = (TypeName, extra = {}) => ({
  name: "invoke_subagent",
  args: { TypeName, Role: "Goldfish", Prompt: "briefing text", Model: JSON.stringify("flash"), ...extra },
});

const selectedModel = (duty) => {
  const routes = registeredFunctionalTaskRoutes();
  const route = routes.taskRoutes.find((entry) => entry.runner === "antigravity" && entry.taskRoute === `duty.${duty}`);
  return route.selector?.value ?? route.cell.selector.value;
};

function runAdapter(fx, input) {
  return spawnSync(process.execPath, [adapter], {
    cwd: fx.workspace,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fx.workspace },
    encoding: "utf8",
    input: JSON.stringify(input),
    timeout: 20_000,
  });
}

test("a flat invoke_subagent call with a quoted Model is read as the alias and the goldfish call needs no consent", async () => {
  const fx = brainFixture();
  try {
    // M4b restatement: a code-writing child is dispatched with Workspace "branch" (the measured isolation); the case is otherwise unchanged.
    const call = flatCall("pipeline-core:goldfish-implementor", { Workspace: JSON.stringify("branch") });
    const normalized = normalizeAntigravityToolInput({ toolCall: call });
    assert.equal(normalized.nativeCallShape, "flat");
    assert.equal(normalized.nativeSubagents[0].Model, "flash", "one level of JSON string encoding is decoded");
    assert.equal(normalized.nativeSubagents[0].Workspace, "branch", "a quoted Workspace is decoded the same way");
    const { evaluateNativeGoldfishParentCall } = await loadModule();
    const verdict = evaluateNativeGoldfishParentCall(payload(fx, { conversationId: PARENT, toolCall: call }), normalized.nativeSubagents);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    // The adapter must no longer name a missing signed consent as the cause of a refusal.
    const res = runAdapter(fx, payload(fx, { conversationId: PARENT, toolCall: call }));
    assert.doesNotMatch(`${res.stdout}${res.stderr}`, /AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE|AGY-NATIVE-SCOPE-NOT-GRANTED/u);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("a child hook call is bound to its parent through the host-written descriptor and attributed with the same TypeName", async () => {
  const fx = brainFixture();
  try {
    descriptor(fx, CHILD, "goldfish-implementor");
    const { bindNativeChild, evaluateNativeChildCall } = await loadModule();
    const childInput = payload(fx, {
      conversationId: CHILD, lastUserInput: "", modelName: selectedModel("implement"),
      toolCall: { name: "view_file", args: { Path: join(fx.workspace, "x.txt") } },
    });
    const bound = bindNativeChild(childInput);
    assert.equal(bound.status, "child");
    assert.equal(bound.parentConversationId, PARENT);
    assert.equal(bound.typeName, "goldfish-implementor");
    assert.equal(bound.typeName, flatCall("goldfish-implementor").args.TypeName);
    const verdict = evaluateNativeChildCall(childInput);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    assert.equal(verdict.attributed.parentConversationId, PARENT);
    // The parent session itself is not a child, and a session no parent names is not one either.
    assert.equal(bindNativeChild(payload(fx, { conversationId: PARENT, toolCall: { name: "view_file", args: {} } })).status, "not-a-child");
    // Two parents naming one child is ambiguous and refused, never guessed.
    mkdirSync(join(fx.brain, "44444444-dddd-4ddd-8ddd-000000000004"), { recursive: true });
    descriptor(fx, CHILD, "goldfish-implementor", "SUBAGENT_STATE_ALIVE", "44444444-dddd-4ddd-8ddd-000000000004");
    assert.equal(bindNativeChild(childInput).status, "ambiguous");
    assert.equal(evaluateNativeChildCall(childInput).ok, false);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// G20-43 restatement (QG-04, restated in place; every other assertion of this file is kept). MEASURED on Antigravity (M4c/M10): the
// subagent Model alias does not select a model -- `flash` and `pro` both resolved to gemini-3.8-flash-tiered, and a child launched without a
// Model inherits the session's model. A native child whose resolved modelName differs from the registry cell was therefore refused on the
// happy path with a repair only the PO could run. PO decision 2026-11-07: record instead of refuse. The former case pinned the denial
// (AGY-NATIVE-CHILD-MODEL-MISMATCH, exit 2); it now pins that the mismatch is ADMITTED, RECORDED next to the expected cell, and NOTICED once.
test("G20-43: a child whose resolved modelName differs from the selected model is admitted, recorded next to the expected cell and noticed, never refused", async () => {
  const fx = brainFixture();
  try {
    descriptor(fx, CHILD, "goldfish-implementor");
    writeFileSync(join(fx.workspace, "x.txt"), "x\n");
    const { evaluateNativeChildCall } = await loadModule();
    const childCall = { name: "view_file", args: { AbsolutePath: join(fx.workspace, "x.txt") } };
    const wrong = payload(fx, { conversationId: CHILD, lastUserInput: "", modelName: "some-other-model", toolCall: childCall });
    const verdict = evaluateNativeChildCall(wrong);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    assert.equal(verdict.attributed.parentConversationId, PARENT, "binding is unchanged");
    assert.equal(verdict.modelCheck.status, "mismatch");
    assert.equal(verdict.modelCheck.resolved, "some-other-model");
    assert.deepEqual(verdict.modelCheck.expected, { duty: "implement", value: selectedModel("implement") });
    assert.ok(verdict.notice.includes("some-other-model") && verdict.notice.includes(selectedModel("implement")), verdict.notice);
    assert.equal(verdict.notice.includes("\n"), false, "one notice line");
    // The adapter admits the child's call and prints the one notice line; no MODEL-MISMATCH denial any more.
    const res = runAdapter(fx, wrong);
    assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
    assert.doesNotMatch(res.stdout, /AGY-NATIVE-CHILD-MODEL-MISMATCH/u);
    const notices = res.stderr.split("\n").filter((line) => line.includes("agy-native-child-model-mismatch"));
    assert.equal(notices.length, 1, res.stderr);
    assert.ok(notices[0].includes("some-other-model") && notices[0].includes(selectedModel("implement")), notices[0]);
    assert.match(notices[0], /notice only, this refuses nothing/u, "the line must not read as the cause of a refusal next to it");
    // The expected model resolves: recorded as a match, no notice.
    const right = payload(fx, { conversationId: CHILD, lastUserInput: "", modelName: selectedModel("implement"), toolCall: childCall });
    const matched = evaluateNativeChildCall(right);
    assert.equal(matched.ok, true);
    assert.equal(matched.modelCheck.status, "match");
    assert.equal(matched.notice, undefined);
    assert.doesNotMatch(runAdapter(fx, right).stderr, /agy-native-child-model-mismatch/u);
    // C23: the host's alias of the configured family is recorded as a tier match, without a notice on every child call; another family still gets it.
    const family = (expected, resolved) => expected.replace(/flash.*|pro.*/u, "") + resolved;
    const tierName = selectedModel("implement").includes("pro") ? "pro" : "flash";
    const sameFamily = payload(fx, { conversationId: CHILD, lastUserInput: "", modelName: family(selectedModel("implement"), `${tierName}-agent`), toolCall: childCall });
    const tiered = evaluateNativeChildCall(sameFamily);
    assert.equal(tiered.modelCheck.status, "tier-match", JSON.stringify(tiered.modelCheck));
    assert.equal(tiered.notice, undefined);
    assert.doesNotMatch(runAdapter(fx, sameFamily).stderr, /agy-native-child-model-mismatch/u);
    // Every other check still governs: an ambiguous binding is still refused whatever the model.
    mkdirSync(join(fx.brain, "44444444-dddd-4ddd-8ddd-000000000004"), { recursive: true });
    descriptor(fx, CHILD, "goldfish-implementor", "SUBAGENT_STATE_ALIVE", "44444444-dddd-4ddd-8ddd-000000000004");
    assert.equal(evaluateNativeChildCall(wrong).ok, false);
    assert.equal(evaluateNativeChildCall(wrong).code, "AGY-NATIVE-CHILD-BINDING-AMBIGUOUS");
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// G20-43 routing (PO 2026-11-07): the Critic inherits the session model (no Model parameter); implementor = flash medium, deep = flash high,
// mechanic = flash low. The Model alias exists only for the three Goldfish roles and is always `flash`.
test("G20-43: the registry routes implementor flash-medium, deep flash-high, mechanic flash-low and the Critic to the session model", async () => {
  const route = (duty) => registeredFunctionalTaskRoutes().taskRoutes.find((entry) => entry.runner === "antigravity" && entry.taskRoute === `duty.${duty}`);
  const cell = (duty) => ({ selector: route(duty).selector ?? route(duty).cell.selector, effort: route(duty).effort ?? route(duty).cell.effort });
  assert.deepEqual([cell("implement").selector.value, cell("implement").effort], ["gemini-3.8-flash-medium", "medium"]);
  assert.deepEqual([cell("deep").selector.value, cell("deep").effort], ["gemini-3.8-flash-high", "high"]);
  assert.deepEqual([cell("mechanic").selector.value, cell("mechanic").effort], ["gemini-3.8-flash-low", "low"]);
  for (const duty of ["implement", "deep", "mechanic"]) assert.equal(route(duty).nativeTier, "flash", duty);
  for (const duty of ["critic_normal", "critic_high_risk"]) {
    assert.equal(cell(duty).selector.value, "inherit", duty);
    assert.equal(route(duty).nativeTier, "inherit", duty);
  }
});

// M4b restatement of the former serialization case ("a second code-writing child while one is alive is refused ..."). Measured instead
// (scratch/agy-m4b-findings.md): Workspace "branch" in a git workspace gives every code writer its own worktree and branch, two writers run in
// parallel without conflict, and a finished child's descriptor STAYS SUBAGENT_STATE_ALIVE -- so counting ALIVE writers would refuse every
// later writer for good. The one-per-call and the ALIVE refusals are therefore gone; what is left is the isolation requirement.
test("M4b: code-writing children run isolated with Workspace branch, in parallel, and a finished (still ALIVE) child never blocks the next one", async () => {
  const fx = brainFixture();
  try {
    const { evaluateNativeGoldfishParentCall } = await loadModule();
    const parentCall = (TypeName, extra) => ({ conversationId: PARENT, toolCall: flatCall(TypeName, extra) });
    const entry = (TypeName, extra = {}) => ({ TypeName, Role: "Goldfish", Prompt: "p", Model: "flash", ...extra });
    descriptor(fx, CHILD, "goldfish-implementor"); // ALIVE although it finished (M4b item 6)
    const branch = (TypeName) => entry(TypeName, { Workspace: "branch" });
    const next = evaluateNativeGoldfishParentCall(payload(fx, parentCall("goldfish-mechanic")), [branch("goldfish-mechanic")]);
    assert.equal(next.ok, true, JSON.stringify(next));
    // A read-only role may run beside them.
    assert.equal(evaluateNativeGoldfishParentCall(payload(fx, parentCall("critic")), [entry("critic", { Model: "pro" })]).ok, true);
    // Two code writers in one call are admitted (parallel, separate worktrees).
    const both = evaluateNativeGoldfishParentCall(payload(fx, parentCall("goldfish-mechanic")), [branch("goldfish-mechanic"), branch("goldfish-implementor")]);
    assert.equal(both.ok, true, JSON.stringify(both));
    // A code writer without the isolation, or with the shared tree, is refused with the exact repair.
    for (const extra of [{}, { Workspace: "inherit" }, { Workspace: "share" }]) {
      const refused = evaluateNativeGoldfishParentCall(payload(fx, parentCall("goldfish-mechanic")), [entry("goldfish-mechanic", extra)]);
      assert.equal(refused.ok, false, JSON.stringify(extra));
      assert.equal(refused.code, "AGY-NATIVE-WORKSPACE-NOT-ISOLATED");
      assert.match(refused.reason, /Workspace: "branch"/u);
    }
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// M4b item 2: the worktree starts at the committed HEAD, so changes of the parent that are not committed are invisible to the child.
test("M4b: a parent tree with uncommitted tracked changes is refused before dispatch with the commit-first repair; untracked files do not block", async () => {
  const fx = brainFixture();
  try {
    const { evaluateNativeGoldfishParentCall } = await loadModule();
    const call = (extra) => payload(fx, { conversationId: PARENT, toolCall: flatCall("goldfish-mechanic", extra) });
    const writer = [{ TypeName: "goldfish-mechanic", Role: "Goldfish", Prompt: "p", Model: "flash", Workspace: "branch" }];
    writeFileSync(join(fx.workspace, "untracked.txt"), "new\n");
    assert.equal(evaluateNativeGoldfishParentCall(call({ Workspace: "branch" }), writer).ok, true, "an untracked file is not a tracked change");
    writeFileSync(join(fx.workspace, ".claude", "pipeline.json"), JSON.stringify({ project: "changed" }));
    const dirty = evaluateNativeGoldfishParentCall(call({ Workspace: "branch" }), writer);
    assert.equal(dirty.ok, false);
    assert.equal(dirty.code, "AGY-NATIVE-WORKTREE-UNCOMMITTED");
    assert.match(dirty.reason, /commit first/iu);
    assert.ok(dirty.reason.includes(".claude/pipeline.json"), dirty.reason);
    // Committing the change is the repair, and it works.
    git(fx.workspace, "add", ".claude/pipeline.json");
    git(fx.workspace, "commit", "-q", "-m", "change");
    assert.equal(evaluateNativeGoldfishParentCall(call({ Workspace: "branch" }), writer).ok, true);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// M4b item 5: the worktree of a child is FIRST in workspacePaths; the registered-worktree check decides whose governance applies.
test("M4b: a child's worktree is resolved to its parent repository only when it is a registered worktree of exactly that repository", async () => {
  const fx = brainFixture();
  try {
    const { resolveNativeChildGovernance } = await loadModule();
    const wt = worktreeFixture(fx);
    const governed = resolveNativeChildGovernance(childPayload(fx, wt, { name: "view_file", args: {} }));
    assert.equal(governed.status, "governed", JSON.stringify(governed));
    assert.equal(governed.repoRoot, fx.workspace);
    assert.equal(governed.worktreeRoot, wt.path);
    // The second entry is optional: the git common dir alone names the repository.
    assert.equal(resolveNativeChildGovernance({ workspacePaths: [wt.path] }).repoRoot, fx.workspace);
    // The parent session and a plain directory are not worktrees.
    assert.equal(resolveNativeChildGovernance({ workspacePaths: [fx.workspace] }).status, "not-worktree");
    assert.equal(resolveNativeChildGovernance({ workspacePaths: [join(fx.base, "brain")] }).status, "not-worktree");
    assert.equal(resolveNativeChildGovernance({}).status, "not-worktree");
    // A worktree of ANOTHER repository must not borrow this repository's governance, nor may a payload pair it with this repository.
    const other = join(fx.base, "other");
    mkdirSync(other, { recursive: true });
    git(other, "init", "-q");
    writeFileSync(join(other, "a.txt"), "a\n");
    git(other, "add", "a.txt");
    git(other, "commit", "-q", "-m", "init");
    const foreignPath = join(fx.base, "foreign-wt");
    git(other, "worktree", "add", "-q", "-b", "subagent-foreign", foreignPath);
    const foreign = resolveNativeChildGovernance({ workspacePaths: [realpathSync(foreignPath), fx.workspace] });
    assert.equal(foreign.status, "unregistered", JSON.stringify(foreign));
    // A registered worktree paired with a repository it does not belong to is refused too.
    const mismatch = resolveNativeChildGovernance({ workspacePaths: [wt.path, other] });
    assert.equal(mismatch.status, "unregistered", JSON.stringify(mismatch));
    // A directory whose .git file merely POINTS at this repository's worktree area, without being registered there, is refused.
    const forged = join(fx.base, "forged");
    mkdirSync(forged, { recursive: true });
    mkdirSync(join(fx.workspace, ".git", "worktrees", "forged"), { recursive: true });
    writeFileSync(join(forged, ".git"), `gitdir: ${join(fx.workspace, ".git", "worktrees", "forged")}\n`);
    const forgedVerdict = resolveNativeChildGovernance({ workspacePaths: [forged, fx.workspace] });
    assert.equal(forgedVerdict.status, "unregistered", JSON.stringify(forgedVerdict));
    // ... even when it also forges the back-link to a registered worktree's admin directory it does not own.
    writeFileSync(join(fx.workspace, ".git", "worktrees", "forged", "gitdir"), join(wt.path, ".git"));
    assert.equal(resolveNativeChildGovernance({ workspacePaths: [forged, fx.workspace] }).status, "unregistered");
    // A .git file that is not a worktree pointer (a submodule) is simply not a worktree.
    const submodule = join(fx.base, "submodule");
    mkdirSync(submodule, { recursive: true });
    writeFileSync(join(submodule, ".git"), "gitdir: ../.git/modules/sub\n");
    assert.equal(resolveNativeChildGovernance({ workspacePaths: [submodule] }).status, "not-worktree");
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("M4b: a governed child's writes and shell are confined to its own worktree and are judged at the same relative path in the parent repository", async () => {
  const fx = brainFixture();
  try {
    const { resolveNativeChildGovernance, nativeChildWriteRefusal, projectNativeChildInput } = await loadModule();
    const wt = worktreeFixture(fx);
    const governed = resolveNativeChildGovernance(childPayload(fx, wt, { name: "view_file", args: {} }));
    assert.equal(governed.status, "governed");
    const refusal = (args) => nativeChildWriteRefusal(governed, args);
    assert.equal(refusal({ filePath: join(wt.path, "src", "a.mjs") }), null);
    assert.equal(refusal({ filePath: "src/a.mjs" }), null, "a relative path resolves inside the worktree");
    assert.equal(refusal({ filePath: join(wt.path, "src", "a.mjs"), cwd: wt.path }), null);
    for (const outside of [join(fx.workspace, "src", "a.mjs"), join(wt.path, "..", "x.mjs"), "../x.mjs", join(fx.base, "elsewhere.txt")]) {
      assert.match(refusal({ filePath: outside }) ?? "", /AGY-NATIVE-CHILD-WRITE-OUTSIDE-WORKTREE/u, outside);
    }
    assert.match(refusal({ cwd: fx.workspace }) ?? "", /AGY-NATIVE-CHILD-WRITE-OUTSIDE-WORKTREE/u);
    // The refusal names the repair.
    assert.match(refusal({ filePath: join(fx.workspace, "a.mjs") }), /Repair:/u);
    // The projection puts every worktree path onto the parent repository, so one governance judges both with the same relative path.
    const input = childPayload(fx, wt, { name: "write_to_file", args: { TargetFile: join(wt.path, "src", "a.mjs"), CodeContent: "x" } });
    const projected = projectNativeChildInput(input, governed);
    assert.deepEqual(projected.workspacePaths, [fx.workspace, wt.path]);
    assert.equal(projected.toolCall.args.TargetFile, join(fx.workspace, "src", "a.mjs"));
    const shell = projectNativeChildInput(childPayload(fx, wt, { name: "run_command", args: { CommandLine: "git status", Cwd: wt.path } }), governed);
    assert.equal(shell.toolCall.args.Cwd, fx.workspace);
    assert.equal(input.toolCall.args.TargetFile, join(wt.path, "src", "a.mjs"), "the original payload is not mutated");
    // C23: the projection keeps the directory the command really runs in beside the mapped input.
    assert.equal(shell.nativeChildCwd, wt.path);
    mkdirSync(join(wt.path, "src"), { recursive: true });
    assert.equal(projectNativeChildInput(childPayload(fx, wt, { name: "run_command", args: { CommandLine: "git status", Cwd: join(wt.path, "src") } }), governed).nativeChildCwd, join(wt.path, "src"));
    assert.equal(projectNativeChildInput(childPayload(fx, wt, { name: "run_command", args: { CommandLine: "git status", Cwd: "src" } }), governed).nativeChildCwd, join(wt.path, "src"), "a relative directory resolves in the worktree");
    assert.equal(projectNativeChildInput(childPayload(fx, wt, { name: "run_command", args: { CommandLine: "git status" } }), governed).nativeChildCwd, wt.path, "no directory means the worktree");
    assert.equal(projectNativeChildInput(childPayload(fx, wt, { name: "run_command", args: { CommandLine: "git status", Cwd: fx.workspace } }), governed).nativeChildCwd, wt.path, "a directory outside the worktree is never carried");
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// C23 (Antigravity greenfield A): all six Goldfish of a run were refused GIT-03-UNREADABLE-MESSAGE-FILE on a message file in their own worktree.
test("C23: a child's commit reads a relative message file from its own worktree through the whole adapter chain", () => {
  const fx = brainFixture();
  try {
    const wt = worktreeFixture(fx);
    descriptor(fx, CHILD, "goldfish-implementor");
    mkdirSync(join(wt.path, "scratch", "commit-msg"), { recursive: true });
    writeFileSync(join(wt.path, "scratch", "commit-msg", "own.txt"), "feat(x): a thing\n\nWhy it matters.\n\nAI-Assisted: true\nDispatch: C23-A (goldfish)\n");
    const commit = (CommandLine, Cwd) => runAdapter(fx, childPayload(fx, wt, { name: "run_command", args: { CommandLine, Cwd } }));
    // This fixture's session is not ready, so the lifecycle guard answers first and only names the other guards that denied as well.
    const gitDenied = /Additional active guard denials:[^\n]*guard-git\.mjs/u;
    const own = commit("git commit -F scratch/commit-msg/own.txt", wt.path);
    assert.doesNotMatch(`${own.stdout}${own.stderr}`, gitDenied, `${own.stdout}${own.stderr}`);
    // The file really is looked up by that directory: a name that exists nowhere stays refused.
    const missing = commit("git commit -F scratch/commit-msg/absent.txt", wt.path);
    assert.equal(missing.status, 2, `${missing.stdout}${missing.stderr}`);
    assert.match(`${missing.stdout}${missing.stderr}`, gitDenied);
    // A host-supplied value on a call that is not a governed child is not carried: the parent's lookup stays in the project.
    const parent = runAdapter(fx, { ...payload(fx, { conversationId: PARENT, toolCall: { name: "run_command", args: { CommandLine: "git commit -F scratch/commit-msg/own.txt", Cwd: fx.workspace } } }), nativeChildCwd: wt.path });
    assert.match(`${parent.stdout}${parent.stderr}`, gitDenied, `${parent.stdout}${parent.stderr}`);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// Before this change a child in a branch worktree was ALLOWED EVERYTHING (measured with the old adapter: even `git push origin main`),
// because the worktree is outside the project and carries no governance marker of its own.
test("M4b: the adapter governs a child's call in its worktree with the parent repository's governance, and refuses a write into the parent tree", () => {
  const fx = brainFixture();
  try {
    const wt = worktreeFixture(fx);
    descriptor(fx, CHILD, "goldfish-implementor");
    const shell = (CommandLine, Cwd) => ({ name: "run_command", args: { CommandLine, Cwd } });
    // Governed like the parent: the push guard answers for the child exactly as it answers for the parent session.
    const parentPush = runAdapter(fx, payload(fx, { conversationId: PARENT, toolCall: shell("git push origin main", fx.workspace) }));
    assert.equal(parentPush.status, 2, `${parentPush.stdout}${parentPush.stderr}`);
    const childPush = runAdapter(fx, childPayload(fx, wt, shell("git push origin main", wt.path)));
    assert.equal(childPush.status, 2, `the child's push must be governed: ${childPush.stdout}${childPush.stderr}`);
    // A write into the parent tree from the child is refused by name, never judged as an ordinary project write.
    const intoParent = runAdapter(fx, childPayload(fx, wt, { name: "write_to_file", args: { TargetFile: join(fx.workspace, "a.txt"), CodeContent: "x" } }));
    assert.equal(intoParent.status, 2, `${intoParent.stdout}${intoParent.stderr}`);
    assert.match(intoParent.stdout, /AGY-NATIVE-CHILD-WRITE-OUTSIDE-WORKTREE/u);
    // A write inside its own worktree is no longer a brain write (M4b item 2).
    const inside = runAdapter(fx, childPayload(fx, wt, { name: "write_to_file", args: { TargetFile: join(wt.path, "a.txt"), CodeContent: "x" } }));
    assert.doesNotMatch(inside.stdout, /AGY-NATIVE-BRAIN-WRITE|AGY-NATIVE-CHILD-WRITE-OUTSIDE-WORKTREE/u, inside.stdout);
    // A governed child reads what it writes: a file that exists only in its worktree is readable and listable (not judged as a missing project file).
    writeFileSync(join(wt.path, "own.txt"), "mine\n");
    for (const toolCall of [{ name: "view_file", args: { AbsolutePath: join(wt.path, "own.txt") } }, { name: "list_dir", args: { DirectoryPath: wt.path } }]) {
      const read = runAdapter(fx, childPayload(fx, wt, toolCall));
      assert.equal(read.status, 0, `${toolCall.name}: ${read.stdout}${read.stderr}`);
    }
    // A worktree-shaped directory that is not registered with the parent repository is refused, not waved through ungoverned.
    const forged = join(fx.base, "forged");
    mkdirSync(forged, { recursive: true });
    mkdirSync(join(fx.workspace, ".git", "worktrees", "forged"), { recursive: true });
    writeFileSync(join(forged, ".git"), `gitdir: ${join(fx.workspace, ".git", "worktrees", "forged")}\n`);
    const unregistered = runAdapter(fx, { ...childPayload(fx, wt, shell("git push origin main", forged)), workspacePaths: [forged, fx.workspace] });
    assert.equal(unregistered.status, 2, `${unregistered.stdout}${unregistered.stderr}`);
    assert.match(unregistered.stdout, /AGY-NATIVE-WORKTREE-UNREGISTERED/u);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("an agent write under the Antigravity brain or config directory is refused", async () => {
  const fx = brainFixture();
  try {
    const { nativeBrainWriteRefusal } = await loadModule();
    const descriptorPath = join(fx.brain, PARENT, ".system_generated", "subagents", `${OTHER_CHILD}.json`);
    assert.match(nativeBrainWriteRefusal({ filePath: descriptorPath, command: "" }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u);
    assert.match(nativeBrainWriteRefusal({ filePath: "/home/u/.gemini/antigravity-cli/brain/x/y.json", command: "" }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u);
    assert.equal(nativeBrainWriteRefusal({ filePath: join(fx.workspace, "src", "a.mjs"), command: "" }), null);
    // M4b item 2: only the host-owned parts are protected. A child's own worktree lives below <home>/.gemini/antigravity-cli/worktrees/ and is
    // writable; brain/, config/ and .system_generated/ stay refused, also when a path climbs out of worktrees/ or a Windows spelling is used.
    const cli = "/home/u/.gemini/antigravity-cli";
    assert.equal(nativeBrainWriteRefusal({ filePath: `${cli}/worktrees/${PARENT}/subagent-x/src/a.mjs`, command: "" }), null);
    assert.equal(nativeBrainWriteRefusal({ filePath: "C:\\Users\\u\\.gemini\\antigravity-cli\\worktrees\\p\\subagent-x\\a.mjs", command: "" }), null);
    assert.equal(nativeBrainWriteRefusal({ filePath: null, command: `git -C ${cli}/worktrees/${PARENT}/subagent-x commit -q` }), null);
    for (const filePath of [`${cli}/brain/${PARENT}/x.json`, `${cli}/worktrees/../brain/${PARENT}/x.json`, "/home/u/.gemini/config/c.json",
      `${cli}/worktrees/${PARENT}/subagent-x/.system_generated/subagents/y.json`, "C:\\Users\\u\\.gemini\\antigravity-cli\\brain\\p\\x.json"]) {
      assert.match(nativeBrainWriteRefusal({ filePath, command: "" }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u, filePath);
    }
    assert.match(nativeBrainWriteRefusal({ filePath: null, command: `echo {} > ${cli}/worktrees/../brain/x.json` }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u);
    assert.match(nativeBrainWriteRefusal({ filePath: null, command: `echo {} > ${descriptorPath}` }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u);
    assert.equal(nativeBrainWriteRefusal({ filePath: null, command: `cat ${descriptorPath}` }), null);
    // Candidate 29 (AGY run 3, R4): the Pipeline's read-only run timeline over the brain transcript is a read; any write form stays refused.
    const transcript = `${cli}/brain/${PARENT}/.system_generated/logs/transcript.jsonl`;
    const ledger = "/plugins/pipeline-core/scripts/usage-ledger.mjs";
    assert.equal(nativeBrainWriteRefusal({ filePath: null, command: `node ${ledger} --timeline ${transcript} --json` }), null);
    assert.equal(nativeBrainWriteRefusal({ filePath: null, command: `node ${ledger} --timeline ${transcript}` }), null);
    for (const command of [`node ${ledger} --timeline ${transcript} > ${transcript}`, `node ${ledger} --timeline ${transcript}; rm ${transcript}`,
      `node ${ledger} ${cli}/brain`, `node /tmp/other.mjs --timeline ${transcript}`, `node ${ledger} --timeline ${transcript} --row`]) {
      assert.match(nativeBrainWriteRefusal({ filePath: null, command }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u, command);
    }
    // C32: the close's cost row over the same transcript only prints; the same command with any other operator, script, flag or a second path stays refused.
    for (const command of [`node ${ledger} --row --antigravity-transcript ${transcript}`, `node ${ledger} --row "S1/B2" --antigravity-transcript ${transcript}`,
      `node ${ledger} --row S1-B2 --antigravity-transcript ${transcript} --model gemini-4-argon-medium`]) {
      assert.equal(nativeBrainWriteRefusal({ filePath: null, command }), null, command);
    }
    for (const command of [`node ${ledger} --row --antigravity-transcript ${transcript} > ${transcript}`, `node ${ledger} --row "x" --antigravity-transcript ${transcript}; rm ${transcript}`,
      `node /tmp/other.mjs --row --antigravity-transcript ${transcript}`, `node ${ledger} --row --antigravity-transcript ${transcript} --out ${transcript}`,
      `node ${ledger} --row --antigravity-transcript ${transcript} ${cli}/brain`, `node ${ledger} --antigravity-transcript ${transcript} --row`]) {
      assert.match(nativeBrainWriteRefusal({ filePath: null, command }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u, command);
    }
    const res = runAdapter(fx, payload(fx, {
      conversationId: PARENT, toolCall: { name: "write_to_file", args: { TargetFile: descriptorPath, CodeContent: "{}" } },
    }));
    assert.equal(res.status, 2, `${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /AGY-NATIVE-BRAIN-WRITE/u);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// M4b item 3: nothing is merged, copied or patched back automatically; the child's commit sits on its branch in the shared object database.
// The Elephant's sanctioned take-over is scripts/agy-native-integrate.mjs: plan (read-only), then apply with the plan's digest, which lands the
// branch's NET change uncommitted in the working tree. The existing host-commit recovery (goldfish-host-commit-recover.mjs) then makes the
// ordinary dispatch-trailer commit, so the commit route is unchanged and nothing mutating needs a command the guard cannot admit.
function childWork(fx, wt, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(wt.path, name)), { recursive: true });
    writeFileSync(join(wt.path, name), text);
    git(wt.path, "add", name);
  }
  git(wt.path, "commit", "-q", "-m", "child work");
}

test("M4b: the Elephant takes over a finished child's branch with plan then apply; the net change lands uncommitted and the host-commit recovery commits it", async () => {
  const fx = brainFixture();
  try {
    const integrate = await import("../../scripts/agy-native-integrate.mjs");
    const recover = await import("../../scripts/goldfish-host-commit-recover.mjs");
    const wt = worktreeFixture(fx);
    childWork(fx, wt, { "src/a.mjs": "export const a = 1;\n" });
    const head = git(fx.workspace, "rev-parse", "HEAD");
    const options = { root: fx.workspace, branch: wt.branch, allowed: ["src/a.mjs"], expect: null };
    const planned = integrate.plan(options);
    assert.equal(planned.status, "ready", JSON.stringify(planned));
    assert.deepEqual(planned.paths, ["src/a.mjs"]);
    assert.match(planned.planSha256, /^[a-f0-9]{64}$/u);
    assert.equal(existsSync(join(fx.workspace, "src", "a.mjs")), false, "plan is read-only");
    // A wrong digest, or a refused plan, applies nothing and leaves no state.
    const wrong = integrate.apply({ ...options, expect: "0".repeat(64) });
    assert.equal(wrong.status, "refused");
    assert.equal(wrong.code, "AGYI-PLAN-DIGEST-MISMATCH");
    assert.equal(existsSync(join(fx.workspace, "src", "a.mjs")), false);
    const applied = integrate.apply({ ...options, expect: planned.planSha256 });
    assert.equal(applied.status, "applied", JSON.stringify(applied));
    assert.equal(readFileSync(join(fx.workspace, "src", "a.mjs"), "utf8"), "export const a = 1;\n");
    assert.equal(git(fx.workspace, "rev-parse", "HEAD"), head, "apply commits nothing");
    assert.equal(git(fx.workspace, "diff", "--cached", "--name-only"), "", "apply stages nothing");
    assert.match(applied.next, /goldfish-host-commit-recover\.mjs plan/u);
    // The recovery route sees exactly that result.
    const recovered = recover.plan({ verb: "plan", root: fx.workspace, dispatchId: "C20-G208B-AGY-ISOLATION", allowed: ["src/a.mjs"], paths: [], expect: null, briefing: null, handback: null });
    assert.equal(recovered.status, "ready", JSON.stringify(recovered));
    assert.deepEqual(recovered.paths, ["src/a.mjs"]);
    // The take-over leaves a record of what the branch delivered; the commit route compares the tree with it.
    const commonDir = join(fx.workspace, ".git");
    assert.equal(integrate.integratedResultCovers({ root: fx.workspace, commonDir, paths: ["src/a.mjs"] }), true);
    writeFileSync(join(fx.workspace, "src", "a.mjs"), "export const a = 2;\n");
    assert.equal(integrate.integratedResultCovers({ root: fx.workspace, commonDir, paths: ["src/a.mjs"] }), false, "changed after the take-over");
    assert.equal(integrate.integratedResultCovers({ root: fx.workspace, commonDir, paths: ["src/other.mjs"] }), false, "a path the branch never delivered");
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("M4b: the take-over refuses with a typed repair and leaves no state: unknown branch, no scope, paths outside the scope, dirty target, moved HEAD", async () => {
  const fx = brainFixture();
  try {
    const integrate = await import("../../scripts/agy-native-integrate.mjs");
    const wt = worktreeFixture(fx);
    childWork(fx, wt, { "src/a.mjs": "export const a = 1;\n", "docs/b.md": "b\n" });
    const base = { root: fx.workspace, branch: wt.branch, allowed: ["src/a.mjs", "docs/b.md"], expect: null };
    const code = (options) => integrate.plan({ ...base, ...options }).refusals?.[0]?.code;
    assert.equal(code({ branch: "main" }), "AGYI-BRANCH");
    assert.equal(code({ branch: "subagent-does-not-exist" }), "AGYI-BRANCH-UNKNOWN");
    assert.equal(code({ allowed: [] }), "AGYI-ALLOWED-REQUIRED");
    assert.equal(code({ allowed: ["src/a.mjs"] }), "AGYI-PATH-OUTSIDE-ALLOWED");
    const refused = integrate.plan({ ...base, allowed: ["src/a.mjs"] });
    assert.ok(refused.refusals[0].next.length > 0, "every refusal names the repair");
    // A target path the Elephant changed itself would be mixed with the child's result: refused.
    mkdirSync(join(fx.workspace, "docs"), { recursive: true });
    writeFileSync(join(fx.workspace, "docs", "b.md"), "mine\n");
    assert.equal(code({}), "AGYI-PATH-DIRTY");
    rmSync(join(fx.workspace, "docs"), { recursive: true, force: true });
    assert.equal(code({}), undefined, "the plan is ready once the target is clean again");
    // The parent moved on and changed a path the child also changed: the change no longer applies; nothing is written.
    mkdirSync(join(fx.workspace, "src"), { recursive: true });
    writeFileSync(join(fx.workspace, "src", "a.mjs"), "export const a = 0;\n");
    git(fx.workspace, "add", "src/a.mjs");
    git(fx.workspace, "commit", "-q", "-m", "parent edits the same file");
    const conflict = integrate.plan(base);
    assert.equal(conflict.status, "refused");
    assert.equal(conflict.refusals[0].code, "AGYI-APPLY-CONFLICT");
    assert.equal(readFileSync(join(fx.workspace, "src", "a.mjs"), "utf8"), "export const a = 0;\n");
    assert.equal(git(fx.workspace, "status", "--porcelain"), "?? .agent-pipeline/", "refused plan left nothing behind");
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// C28C: five of six Antigravity take-overs were followed by the recovery route's plan and apply for exactly the paths the take-over wrote. `apply` can now do
// both in one call when it is given the briefed dispatch id; the recovery route's own checks run unchanged and its refusal never undoes the applied change.
test("C28C: apply with a dispatch id lands the dispatch-trailer commit of exactly the applied paths in the same call", async () => {
  const fx = brainFixture();
  try {
    const integrate = await import("../../scripts/agy-native-integrate.mjs");
    const wt = worktreeFixture(fx);
    childWork(fx, wt, { "src/a.mjs": "export const a = 1;\n" });
    const options = { root: fx.workspace, branch: wt.branch, allowed: ["src/a.mjs"], expect: null };
    const planned = integrate.plan(options);
    const head = git(fx.workspace, "rev-parse", "HEAD");
    // The fixture repository has no identity of its own and the test HOME has none either.
    git(fx.workspace, "config", "user.name", "Fixture");
    git(fx.workspace, "config", "user.email", "fixture@example.invalid");
    const applied = integrate.apply({ ...options, expect: planned.planSha256, commitDispatchId: "C28C-AGY-COMMIT" });
    assert.equal(applied.status, "applied", JSON.stringify(applied));
    assert.equal(applied.commit.status, "committed", JSON.stringify(applied.commit));
    assert.notEqual(git(fx.workspace, "rev-parse", "HEAD"), head, "HEAD moved by exactly one commit");
    assert.equal(git(fx.workspace, "rev-list", "--count", `${head}..HEAD`), "1");
    assert.match(git(fx.workspace, "log", "-1", "--format=%B"), /Dispatch: C28C-AGY-COMMIT \(goldfish\)/u);
    assert.equal(git(fx.workspace, "show", "--name-only", "--format=", "HEAD"), "src/a.mjs", "only the applied path is committed");
    // C30d: without --briefing and --handback no dispatch record is written, and the text says so instead of claiming nothing is left to do.
    assert.match(applied.next, /no dispatch record is written/u);
    assert.match(applied.next, /--briefing and --handback/u);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("C28C: a refused commit step keeps the applied change and names the manual route; parse rules for the new flag", async () => {
  const fx = brainFixture();
  try {
    const integrate = await import("../../scripts/agy-native-integrate.mjs");
    const wt = worktreeFixture(fx);
    childWork(fx, wt, { "src/a.mjs": "export const a = 1;\n" });
    const options = { root: fx.workspace, branch: wt.branch, allowed: ["src/a.mjs"], expect: null };
    const planned = integrate.plan(options);
    const head = git(fx.workspace, "rev-parse", "HEAD");
    // An id the recovery route does not accept (the command line refuses it earlier, a direct call does not): the commit step refuses, the take-over itself stays applied.
    const applied = integrate.apply({ ...options, expect: planned.planSha256, commitDispatchId: "x".repeat(100) });
    assert.equal(applied.status, "applied", JSON.stringify(applied));
    assert.equal(applied.commit.status, "refused", JSON.stringify(applied.commit));
    assert.equal(git(fx.workspace, "rev-parse", "HEAD"), head, "nothing committed");
    assert.equal(readFileSync(join(fx.workspace, "src", "a.mjs"), "utf8"), "export const a = 1;\n", "the applied change stays");
    assert.match(applied.next, /goldfish-host-commit-recover\.mjs plan/u);
    const parsed = (...args) => integrate.parseArgs(args);
    const common = ["--root", "/r", "--branch", "subagent-x", "--allowed-path", "a"];
    assert.equal(parsed("apply", ...common, "--expect-sha256", "a".repeat(64), "--commit-dispatch-id", "C28C-X").commitDispatchId, "C28C-X");
    assert.match(parsed("plan", ...common, "--commit-dispatch-id", "C28C-X").error, /belongs to apply/u);
    assert.match(parsed("apply", ...common, "--commit-dispatch-id", "C28C-X", "--commit-dispatch-id", "C28C-Y").error, /repeated/u);
    assert.match(parsed("apply", ...common, "--commit-dispatch-id", "bad id").error, /unexpected/u);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// C29 R5 (AGY run 3, Toil P3; ADR-0099): the Elephant harvested branch commits by hand and the Critic noted the orchestrator commit. When the child's
// branch was cut from the current HEAD and every commit carries the briefed Dispatch trailer, apply --keep-authorship lands those commits unchanged.
function childCommit(wt, files, trailers) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(wt.path, name)), { recursive: true });
    writeFileSync(join(wt.path, name), text);
    git(wt.path, "add", name);
  }
  git(wt.path, "-c", "user.name=Child Goldfish", "-c", "user.email=child@example.invalid", "commit", "-q", "-m", "feat: child work", ...(trailers ? ["-m", trailers] : []));
}

test("C29 R5: apply --keep-authorship lands the child's own commits unchanged when the branch was cut from HEAD and every commit carries the briefed Dispatch trailer", async () => {
  const fx = brainFixture();
  try {
    const integrate = await import("../../scripts/agy-native-integrate.mjs");
    const wt = worktreeFixture(fx);
    childCommit(wt, { "src/a.mjs": "export const a = 1;\n" }, "AI-Assisted: true\nDispatch: C29-R5 (goldfish)");
    childCommit(wt, { "src/a.mjs": "export const a = 2;\n" }, "AI-Assisted: true\nDispatch: C29-R5 (goldfish)");
    const tip = git(fx.workspace, "rev-parse", `refs/heads/${wt.branch}`);
    const options = { root: fx.workspace, branch: wt.branch, allowed: ["src/a.mjs"], expect: null };
    const planned = integrate.plan(options);
    assert.equal(planned.status, "ready", JSON.stringify(planned));
    assert.equal(planned.fastForward.eligible, true, JSON.stringify(planned.fastForward));
    assert.equal(planned.fastForward.dispatchId, "C29-R5");
    assert.equal(planned.fastForward.commits.length, 2);
    assert.match(planned.fastForward.next, /--keep-authorship C29-R5/u);
    // The briefed id must be the one the commits carry; a mismatch lands nothing.
    const mismatch = integrate.apply({ ...options, expect: planned.planSha256, keepAuthorship: "OTHER-ID" });
    assert.equal(mismatch.code, "AGYI-FAST-FORWARD-DISPATCH-MISMATCH", JSON.stringify(mismatch));
    assert.equal(existsSync(join(fx.workspace, "src", "a.mjs")), false, "a refused harvest lands nothing");
    const landed = integrate.apply({ ...options, expect: planned.planSha256, keepAuthorship: "C29-R5" });
    assert.equal(landed.status, "landed", JSON.stringify(landed));
    assert.equal(landed.code, "AGYI-LANDED-WITH-AUTHORSHIP");
    assert.equal(git(fx.workspace, "rev-parse", "HEAD"), tip, "HEAD is the child's tip itself: no new commit, nothing rewritten");
    assert.equal(git(fx.workspace, "log", "-1", "--format=%an <%ae>"), "Child Goldfish <child@example.invalid>", "the child's authorship stays");
    assert.equal(readFileSync(join(fx.workspace, "src", "a.mjs"), "utf8"), "export const a = 2;\n");
    assert.equal(git(fx.workspace, "status", "--porcelain", "--", "src"), "", "nothing left uncommitted");
    assert.deepEqual(landed.landed.commits, planned.fastForward.commits);
    assert.match(landed.next, /--attested-request/u);
    assert.match(landed.next, new RegExp(planned.fastForward.commits[1], "u"), "the record step names exactly the landed commits");
    assert.equal(integrate.integratedResultCovers({ root: fx.workspace, commonDir: join(fx.workspace, ".git"), paths: ["src/a.mjs"] }), true, "the take-over record is written as on the patch route");
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("C29 R5: no harvest with authorship for a commit without the trailer or a moved HEAD; the patch route stays ready; parse rules", async () => {
  const fx = brainFixture();
  try {
    const integrate = await import("../../scripts/agy-native-integrate.mjs");
    const wt = worktreeFixture(fx);
    childCommit(wt, { "src/a.mjs": "export const a = 1;\n" }, "AI-Assisted: true\nDispatch: C29-R5 (goldfish)");
    childCommit(wt, { "src/a.mjs": "export const a = 2;\n" }, null);
    const options = { root: fx.workspace, branch: wt.branch, allowed: ["src/a.mjs"], expect: null };
    const head = git(fx.workspace, "rev-parse", "HEAD");
    const untrailed = integrate.plan(options);
    assert.equal(untrailed.status, "ready", JSON.stringify(untrailed));
    assert.equal(untrailed.fastForward.eligible, false);
    assert.match(untrailed.fastForward.reason, /exactly one "Dispatch: <id> \(goldfish\)" trailer/u);
    const refused = integrate.apply({ ...options, expect: untrailed.planSha256, keepAuthorship: "C29-R5" });
    assert.equal(refused.code, "AGYI-FAST-FORWARD-UNAVAILABLE", JSON.stringify(refused));
    assert.match(refused.refusals[0].next, /patch route/u);
    assert.equal(git(fx.workspace, "rev-parse", "HEAD"), head, "nothing landed");
    // The parent moved on in an unrelated path: the change still applies as a patch, but the commits cannot land unchanged.
    git(fx.workspace, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "--allow-empty", "-m", "parent moves on");
    const wt2 = worktreeFixture(fx, "subagent-second-r5");
    git(fx.workspace, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "--allow-empty", "-m", "parent moves on again");
    childCommit(wt2, { "src/b.mjs": "export const b = 1;\n" }, "AI-Assisted: true\nDispatch: C29-R5B (goldfish)");
    const moved = integrate.plan({ ...options, branch: wt2.branch, allowed: ["src/b.mjs"] });
    assert.equal(moved.status, "ready", JSON.stringify(moved));
    assert.equal(moved.fastForward.eligible, false);
    assert.match(moved.fastForward.reason, /HEAD moved on/u);
    // A commit that touched an outside path, undone by a later commit: the net diff is in scope, the history is not, so it cannot land unchanged.
    const wt3 = worktreeFixture(fx, "subagent-third-r5");
    childCommit(wt3, { "src/c.mjs": "export const c = 1;\n", "docs/outside.md": "x\n" }, "AI-Assisted: true\nDispatch: C29-R5C (goldfish)");
    git(wt3.path, "rm", "-q", "docs/outside.md");
    git(wt3.path, "-c", "user.name=Child Goldfish", "-c", "user.email=child@example.invalid", "commit", "-q", "-m", "fix: drop the stray file", "-m", "AI-Assisted: true\nDispatch: C29-R5C (goldfish)");
    const undone = integrate.plan({ ...options, branch: wt3.branch, allowed: ["src/c.mjs"] });
    assert.equal(undone.status, "ready", JSON.stringify(undone));
    assert.deepEqual(undone.paths, ["src/c.mjs"], "the net diff is in scope");
    assert.equal(undone.fastForward.eligible, false);
    assert.match(undone.fastForward.reason, /outside the briefed scope \(docs\/outside\.md\)/u);
    const parsed = (...args) => integrate.parseArgs(args);
    const common = ["--root", "/r", "--branch", "subagent-x", "--allowed-path", "a"];
    assert.equal(parsed("apply", ...common, "--expect-sha256", "a".repeat(64), "--keep-authorship", "C29-R5").keepAuthorship, "C29-R5");
    assert.match(parsed("plan", ...common, "--keep-authorship", "C29-R5").error, /belongs to apply/u);
    assert.match(parsed("apply", ...common, "--keep-authorship", "C29-R5", "--commit-dispatch-id", "C29-R5").error, /exclude each other/u);
    assert.match(parsed("apply", ...common, "--keep-authorship", "bad id").error, /unexpected/u);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// C30d (Antigravity greenfield, first parallel run): the second of two parallel slices cannot fast-forward (a sibling moved HEAD) and cost six hand-made calls. The plan now names the
// one-call route for every branch, and apply forwards the briefing and hand-back files to the recovery route, which writes the typed attested record in the same command.
test("C30d: the plan names the one-call route; --briefing and --handback travel to the recovery route; parse rules", async () => {
  const fx = brainFixture();
  try {
    const integrate = await import("../../scripts/agy-native-integrate.mjs");
    const wt = worktreeFixture(fx);
    childCommit(wt, { "src/a.mjs": "export const a = 1;\n" }, "AI-Assisted: true\nDispatch: C30D-ONE (goldfish)");
    git(fx.workspace, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "--allow-empty", "-m", "a sibling slice landed first");
    const options = { root: fx.workspace, branch: wt.branch, allowed: ["src/a.mjs"], expect: null };
    const planned = integrate.plan(options);
    assert.equal(planned.status, "ready", JSON.stringify(planned));
    assert.equal(planned.fastForward.eligible, false, "a moved HEAD cannot fast-forward");
    assert.match(planned.next, / --commit-dispatch-id <the briefed dispatch id> --briefing <the generated briefing file> --handback <the file holding the child's hand-back text>$/u);
    assert.doesNotMatch(planned.applyOnly, /--commit-dispatch-id|--briefing/u, "the plain take-over stays available");
    // The files reach the recovery route: an unreadable briefing refuses the commit step there (without the flags the same call commits), and the take-over stays applied.
    const head = git(fx.workspace, "rev-parse", "HEAD");
    const refused = integrate.apply({ ...options, expect: planned.planSha256, commitDispatchId: "C30D-ONE", briefing: "scratch/no-such-briefing.md", handback: "scratch/no-such-handback.txt" });
    assert.equal(refused.status, "applied", JSON.stringify(refused));
    assert.equal(refused.commit.status, "refused", JSON.stringify(refused.commit));
    assert.equal(refused.commit.code, "GHCR-INPUT-UNREADABLE", JSON.stringify(refused.commit));
    assert.equal(git(fx.workspace, "rev-parse", "HEAD"), head, "nothing committed");
    const parsed = (...args) => integrate.parseArgs(args);
    const common = ["--root", "/r", "--branch", "subagent-x", "--allowed-path", "a", "--expect-sha256", "a".repeat(64)];
    const ok = parsed("apply", ...common, "--commit-dispatch-id", "C30D-ONE", "--briefing", "scratch/b.md", "--handback", "scratch/h.txt");
    assert.equal(ok.briefing, "scratch/b.md"); assert.equal(ok.handback, "scratch/h.txt");
    assert.match(parsed("apply", ...common, "--commit-dispatch-id", "C30D-ONE", "--briefing", "scratch/b.md").error, /come together/u);
    assert.match(parsed("apply", ...common, "--briefing", "scratch/b.md", "--handback", "scratch/h.txt").error, /belong to --commit-dispatch-id/u);
    assert.match(parsed("apply", ...common, "--keep-authorship", "C30D-ONE", "--briefing", "scratch/b.md", "--handback", "scratch/h.txt").error, /belong to --commit-dispatch-id/u);
    assert.match(parsed("apply", ...common, "--commit-dispatch-id", "C30D-ONE", "--briefing", "a", "--briefing", "b", "--handback", "c").error, /unexpected or repeated/u);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("M4b: the guard admits the take-over command as an exact argv shape, nothing looser", async () => {
  const { isSanctionedLifecycleCommand } = await import("../guard/command-catalogue.mjs");
  const root = realpathSync(resolve(libDir, "..", "..", ".."));
  const entry = resolve(root, "plugins/pipeline-core/scripts/agy-native-integrate.mjs");
  const admitted = (args) => isSanctionedLifecycleCommand(`node '${entry}' ${args}`, root);
  const branch = "subagent-Goldfish-goldfish-implementor-1a2b3c";
  assert.equal(admitted(`plan --root '${root}' --branch ${branch} --allowed-path a/b.txt`), true);
  assert.equal(admitted(`plan --root '${root}' --branch ${branch} --allowed-path a/b.txt --allowed-path c.md`), true);
  assert.equal(admitted(`apply --root '${root}' --branch ${branch} --allowed-path a/b.txt --expect-sha256 ${"a".repeat(64)}`), true);
  // C28C: apply (never plan) may carry one dispatch id for the commit step.
  assert.equal(admitted(`apply --root '${root}' --branch ${branch} --allowed-path a/b.txt --expect-sha256 ${"a".repeat(64)} --commit-dispatch-id C28C-AGY-COMMIT`), true);
  // C29 R5: or one --keep-authorship id instead, never both, never on plan.
  assert.equal(admitted(`apply --root '${root}' --branch ${branch} --allowed-path a/b.txt --expect-sha256 ${"a".repeat(64)} --keep-authorship C29-R5`), true);
  // C30d: the one-call route: the commit flag plus the briefing and hand-back files together, repository-relative under scratch/, evidence/ or specs/, never with --keep-authorship or on plan.
  const oneCall = `apply --root '${root}' --branch ${branch} --allowed-path a/b.txt --expect-sha256 ${"a".repeat(64)} --commit-dispatch-id C30D-ONE`;
  assert.equal(admitted(`${oneCall} --briefing scratch/c.briefing.md --handback scratch/handback-C30D-ONE.txt`), true);
  for (const args of [
    `${oneCall} --briefing scratch/c.briefing.md`, `${oneCall} --handback scratch/h.txt`, `${oneCall} --briefing scratch/b.md --handback ../h.txt`,
    `${oneCall} --briefing /etc/passwd --handback scratch/h.txt`, `${oneCall} --briefing src/app.mjs --handback scratch/h.txt`,
    `${oneCall} --briefing scratch/b.md --briefing scratch/c.md --handback scratch/h.txt`,
    `apply --root '${root}' --branch ${branch} --allowed-path a/b.txt --expect-sha256 ${"a".repeat(64)} --keep-authorship C29-R5 --briefing scratch/b.md --handback scratch/h.txt`,
    `plan --root '${root}' --branch ${branch} --allowed-path a --briefing scratch/b.md --handback scratch/h.txt`,
    `apply --root '${root}' --branch ${branch} --allowed-path a --expect-sha256 ${"a".repeat(64)} --briefing scratch/b.md --handback scratch/h.txt`,
  ]) assert.equal(admitted(args), false, args);
  for (const args of [
    `plan --root '${root}' --branch ${branch} --allowed-path a --keep-authorship C29-R5`,
    `apply --root '${root}' --branch ${branch} --allowed-path a --expect-sha256 ${"a".repeat(64)} --keep-authorship C29-R5 --commit-dispatch-id C29-R5`,
    `apply --root '${root}' --branch ${branch} --allowed-path a --expect-sha256 ${"a".repeat(64)} --keep-authorship 'bad id'`,
    `apply --root '${root}' --branch ${branch} --allowed-path a --keep-authorship C29-R5`,
  ]) assert.equal(admitted(args), false, args);
  for (const args of [
    `plan --root '${root}' --branch ${branch} --allowed-path a --commit-dispatch-id C28C-X`,
    `apply --root '${root}' --branch ${branch} --allowed-path a --expect-sha256 ${"a".repeat(64)} --commit-dispatch-id C28C-X --commit-dispatch-id C28C-Y`,
    `apply --root '${root}' --branch ${branch} --allowed-path a --expect-sha256 ${"a".repeat(64)} --commit-dispatch-id 'bad id'`,
    `apply --root '${root}' --branch ${branch} --allowed-path a --commit-dispatch-id C28C-X`,
    "", "plan", `plan --root '${root}'`, `plan --root '${root}/x' --branch ${branch} --allowed-path a`, `plan --root '${root}' --branch main --allowed-path a`,
    `plan --root '${root}' --branch ${branch}`, `plan --root '${root}' --branch ${branch} --allowed-path ../x`,
    `apply --root '${root}' --branch ${branch} --allowed-path a`, `plan --root '${root}' --branch ${branch} --allowed-path a --expect-sha256 ${"a".repeat(64)}`,
    `plan --root '${root}' --branch ${branch} --branch ${branch} --allowed-path a`, `plan --root '${root}' --branch ${branch} --allowed-path a --force`,
  ]) assert.equal(admitted(args), false, args);
});

// C31-B6 / L15: the notice named no repair. A real mismatch (an unknown family) now says what to do for both ways it can happen.
test("C31-B6: the child model notice names both repairs; a tier match still earns no notice", async () => {
  const fx = brainFixture();
  try {
    descriptor(fx, CHILD, "goldfish-implementor");
    writeFileSync(join(fx.workspace, "x.txt"), "x\n");
    const { evaluateNativeChildCall } = await loadModule();
    const childCall = { name: "view_file", args: { AbsolutePath: join(fx.workspace, "x.txt") } };
    const odd = evaluateNativeChildCall(payload(fx, { conversationId: CHILD, lastUserInput: "", modelName: "gemini-4-hydrogen-tiered-high", toolCall: childCall }));
    assert.equal(odd.modelCheck.status, "mismatch");
    assert.ok(odd.notice.includes('Model: "flash"'), odd.notice);
    assert.match(odd.notice, /inherit/u);
    assert.match(odd.notice, /modelCheck/u);
    assert.equal(odd.notice.includes("\n"), false, "one notice line");
    const tierName = selectedModel("implement").includes("pro") ? "pro" : "flash";
    const same = evaluateNativeChildCall(payload(fx, { conversationId: CHILD, lastUserInput: "", modelName: selectedModel("implement").replace(/flash.*|pro.*/u, "") + `${tierName}-agent`, toolCall: childCall }));
    assert.equal(same.modelCheck.status, "tier-match");
    assert.equal(same.notice, undefined);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

// C31-B6: the design-review reference names, per runner, only commands that exist (design-review-receipt.mjs has `export-report` and `create`
// and no other subcommand; `finalize` is a Goldfish Final Return step, never a design-review step).
test("C31-B6: the design-course reference gives a per-runner table of the step before design-review-receipt create, naming only existing commands", () => {
  const refs = join(libDir, "..", "skills", "pipeline-start", "references");
  const course = readFileSync(join(refs, "design-course.md"), "utf8");
  const agy = readFileSync(join(refs, "antigravity-native-dispatch.md"), "utf8");
  const receipt = readFileSync(join(libDir, "..", "scripts", "design-review-receipt.mjs"), "utf8");
  assert.match(receipt, /command === "export-report"/u);
  assert.match(receipt, /command !== "create"\) return refuse\("DRC-USAGE", `expected the subcommand/u);
  const table = course.split("\n").map((line) => line.trimStart()).filter((line) => /^\|/u.test(line) && /Claude|Codex|Antigravity/u.test(line));
  assert.equal(table.length >= 3, true, "one table row per runner");
  for (const runner of ["Claude", "Codex", "Antigravity"]) assert.ok(table.some((line) => line.startsWith(`| ${runner} `)), runner);
  assert.ok(table.find((line) => line.startsWith("| Claude ")).includes("export-report"));
  assert.ok(table.find((line) => line.startsWith("| Antigravity ")).includes("no `export-report`"));
  for (const text of [course, agy]) assert.doesNotMatch(text, /finalize[^\n]{0,40}before[^\n]{0,40}create/iu);
  assert.match(agy, /design-course\.md/u, "the Antigravity reference points at the table");
});
