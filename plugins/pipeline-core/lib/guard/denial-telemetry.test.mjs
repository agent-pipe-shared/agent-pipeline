// SPDX-License-Identifier: SUL-1.0
// Candidate 31 (R4, B1): the repeated grammar listing is trimmed on Antigravity (its adapter payload carries
// antigravity_conversation_id and no session_id) and across the four codes that print the listing, so a context
// window pays for the listing once. The first refusal in a scope stays full; a store failure fails open to full.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { isFirstDenialThisScope } from "./denial-telemetry.mjs";
import { mkdtempTestScratch } from "../test-tmpdir.mjs";

const FULL = /The complete admitted grammar, with bounds and exact spellings:/u;
const SHORT = /already printed on an earlier grammar refusal in this context window/u;
const READ_SPELLING = "head -c 700 probe.txt"; // GUARD-READ-COMMAND-UNSUPPORTED
const PARSE = 'git commit -m "line one\n\nline two"'; // GUARD-PARSE-UNSUPPORTED
const OPERATOR = "rg -n lifecycle . | tee output.txt"; // GUARD-OPERATOR-UNAPPROVED
const REDIRECT = "echo hi > out.txt"; // GUARD-REDIRECT-UNAPPROVED
const READ_SCOPE = "cat ~/.ssh/id_rsa"; // GUARD-READ-SCOPE-OUTSIDE-ROOT (text only, nothing is read)
const CONVERSATION = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";

function governedRoot() {
  const path = mkdtempTestScratch("denial-telemetry-root-");
  mkdirSync(join(path, ".claude"), { recursive: true });
  mkdirSync(join(path, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(path, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
  return path;
}

async function withFixture(run) {
  const root = governedRoot();
  const commonDir = mkdtempTestScratch("denial-telemetry-common-");
  const deps = { projectDir: root, resolveGitCommonDirFn: () => commonDir };
  try {
    return await run({ root, commonDir, deps, stateDir: join(commonDir, "agent-pipeline", "guard-denial-classes") });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
  }
}

// The shape antigravityGuardPayload() produces: no session_id, the conversation id under its own key.
const agy = (command, conversationId = CONVERSATION, extra = {}) => ({
  tool_name: "Bash", tool_input: { command }, cwd: "/unused", tool_use_id: "tool-use-1",
  antigravity_conversation_id: conversationId, ...extra,
});
const claude = (command, session_id) => ({ tool_name: "Bash", tool_input: { command }, session_id });
const orchestrator = { subagentIdentityFn: () => ({ kind: "orchestrator" }) };

test("C31-B1 Antigravity: the first refusal of a conversation is true, the repeat is false", () => withFixture(({ root, commonDir, stateDir }) => {
  const deps = { ...orchestrator, resolveGitCommonDirFn: () => commonDir };
  assert.equal(isFirstDenialThisScope(agy("x"), root, "GUARD-PARSE-UNSUPPORTED", deps), true);
  assert.equal(isFirstDenialThisScope(agy("x"), root, "GUARD-PARSE-UNSUPPORTED", deps), false);
  assert.ok(existsSync(join(stateDir, `${CONVERSATION}.json`)), "the conversation id keys the one existing store");
  // A new conversation has no earlier text of its own: full again.
  assert.equal(isFirstDenialThisScope(agy("x", "another-conversation-1"), root, "GUARD-PARSE-UNSUPPORTED", deps), true);
}));

test("C31-B1 Antigravity: an unusable conversation id, a session id, or a native child never trims wrongly", () => withFixture(({ root, commonDir, stateDir }) => {
  const deps = { ...orchestrator, resolveGitCommonDirFn: () => commonDir };
  for (const bad of ["../escape", "agent-1", "", "a/b", "x".repeat(129), 7, null]) {
    assert.equal(isFirstDenialThisScope(agy("x", bad), root, "GUARD-PARSE-UNSUPPORTED", deps), true, `first for ${String(bad)}`);
    assert.equal(isFirstDenialThisScope(agy("x", bad), root, "GUARD-PARSE-UNSUPPORTED", deps), true, `again for ${String(bad)}: fail open to full`);
  }
  // A governed native child may share its parent's conversation id (not established): full every time, nothing stored.
  const child = agy("x", CONVERSATION, { native_child_cwd: "/unused/worktree" });
  assert.equal(isFirstDenialThisScope(child, root, "GUARD-PARSE-UNSUPPORTED", deps), true);
  assert.equal(isFirstDenialThisScope(child, root, "GUARD-PARSE-UNSUPPORTED", deps), true);
  assert.equal(existsSync(stateDir), false, "no key, no file");
  // A present session id stays the scope (Claude and Codex are unchanged).
  const both = { ...agy("x"), session_id: "plain-session-1" };
  assert.equal(isFirstDenialThisScope(both, root, "GUARD-PARSE-UNSUPPORTED", deps), true);
  assert.equal(isFirstDenialThisScope(both, root, "GUARD-PARSE-UNSUPPORTED", deps), false);
  assert.ok(existsSync(join(stateDir, "plain-session-1.json")));
  assert.equal(existsSync(join(stateDir, `${CONVERSATION}.json`)), false);
}));

test("C31-B1 shared key: once any of the four listing codes printed the listing, every other one is short", () => withFixture(({ root, commonDir, stateDir }) => {
  const deps = { ...orchestrator, resolveGitCommonDirFn: () => commonDir };
  const input = { session_id: "shared-key-1" };
  const codes = ["GUARD-PARSE-UNSUPPORTED", "GUARD-OPERATOR-UNAPPROVED", "GUARD-REDIRECT-UNAPPROVED", "GUARD-READ-COMMAND-UNSUPPORTED"];
  assert.equal(isFirstDenialThisScope(input, root, codes[0], deps), true);
  for (const code of codes.slice(1)) assert.equal(isFirstDenialThisScope(input, root, code, deps), false, code);
  for (const code of codes) assert.equal(isFirstDenialThisScope(input, root, code, deps), false, `${code} repeated`);
  // The stored value stays the raw codes, in order: no new key shape.
  assert.deepEqual(JSON.parse(readFileSync(join(stateDir, "shared-key-1.json"), "utf8")).seenClasses, codes);
}));

test("C31-B1 the read-scope and any other class never count as the listing having been printed", () => withFixture(({ root, commonDir }) => {
  const deps = { ...orchestrator, resolveGitCommonDirFn: () => commonDir };
  const input = { session_id: "shared-key-2" };
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-READ-SCOPE-OUTSIDE-ROOT", deps), true);
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", deps), true, "the listing was never printed");
  assert.equal(isFirstDenialThisScope(input, root, "SOME-OTHER-CLASS", deps), true, "a class outside the four keeps its own key");
  assert.equal(isFirstDenialThisScope(input, root, "SOME-OTHER-CLASS", deps), false);
}));

test("C31-B1 every failure of the store fails open to the full text", () => withFixture(({ root, commonDir }) => {
  const base = { ...orchestrator, resolveGitCommonDirFn: () => commonDir };
  const boom = () => { throw new Error("store unavailable"); };
  const input = agy("x");
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", { ...base, writeFileSyncFn: boom }), true);
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", { ...base, mkdirSyncFn: boom }), true);
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", { ...base, existsSyncFn: boom }), true);
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", { ...base, resolveGitCommonDirFn: () => null }), true);
}));

test("C31-B1 rendered: code A then code B in one scope renders B short and stays actionable", () => withFixture(({ deps }) => {
  const first = evaluateLifecycleReadyGuard(claude(PARSE, "rendered-1"), deps);
  assert.equal(first.exitCode, 2);
  assert.match(first.stderr, /GUARD-PARSE-UNSUPPORTED/u);
  assert.match(first.stderr, FULL, "the first refusal in a scope is full");
  const second = evaluateLifecycleReadyGuard(claude(OPERATOR, "rendered-1"), deps);
  assert.equal(second.exitCode, 2, "the trim never changes which refusal is raised");
  assert.match(second.stderr, /GUARD-OPERATOR-UNAPPROVED/u);
  assert.doesNotMatch(second.stderr, FULL);
  assert.match(second.stderr, SHORT);
  assert.match(second.stderr, /Rejected element: the operator "\|"\./u);
  assert.match(second.stderr, /"schema":"pipeline\.guard-retry-actions\.v1"/u);
  // Hard limit 4: the short form names a runnable admitted command, not only a pointer.
  assert.match(second.stderr, /for example "rg -n needle probe\.txt"/u);
  assert.ok(second.stderr.length + 2500 < first.stderr.length, `${second.stderr.length} vs ${first.stderr.length}`);
  const third = evaluateLifecycleReadyGuard(claude(REDIRECT, "rendered-1"), deps);
  assert.equal(third.exitCode, 2);
  assert.match(third.stderr, /GUARD-REDIRECT-UNAPPROVED/u);
  assert.doesNotMatch(third.stderr, FULL);
  const read = evaluateLifecycleReadyGuard(claude(READ_SPELLING, "rendered-1"), deps);
  assert.match(read.stderr, /GUARD-READ-COMMAND-UNSUPPORTED/u);
  assert.doesNotMatch(read.stderr, FULL);
  assert.match(read.stderr, SHORT);
  assert.match(read.stderr, /Re-spell it with the admitted grammar/u);
}));

test("C31-B1 rendered: the repeat override guidance keeps the request-bound command in the short form", () => withFixture(({ deps }) => {
  const planned = { ...deps, recordHumanGuardDenialFn: () => ({ status: "planned", requestSha256: "a".repeat(64) }) };
  const first = evaluateLifecycleReadyGuard(claude(PARSE, "rendered-3"), planned);
  assert.match(first.stderr, FULL);
  assert.match(first.stderr, /Human override available for this exact/u, "the first refusal carries the full ceremony text");
  const second = evaluateLifecycleReadyGuard(claude(OPERATOR, "rendered-3"), planned);
  assert.doesNotMatch(second.stderr, FULL);
  assert.match(second.stderr, /Human override remains available for this exact/u, "the repeat form replaces the ceremony text");
  // The command is rendered copy-safe over several lines; the plan verb and the request-bound flag stay in the short form.
  assert.match(second.stderr, /Step: plan\n/u);
  assert.match(second.stderr, /--request-sha256/u);
  assert.ok(second.stderr.length < first.stderr.length);
}));

test("C31-B1 rendered: an Antigravity-shaped input is trimmed on repeat, a new conversation starts full", () => withFixture(({ root, deps }) => {
  const payload = (command, conversationId) => agy(command, conversationId, { cwd: root });
  const first = evaluateLifecycleReadyGuard(payload(OPERATOR, CONVERSATION), deps);
  assert.equal(first.exitCode, 2);
  assert.match(first.stderr, FULL);
  const second = evaluateLifecycleReadyGuard(payload(OPERATOR, CONVERSATION), deps);
  assert.equal(second.exitCode, 2);
  assert.doesNotMatch(second.stderr, FULL);
  assert.match(second.stderr, SHORT);
  assert.ok(second.stderr.length < first.stderr.length);
  const differentCode = evaluateLifecycleReadyGuard(payload(PARSE, CONVERSATION), deps);
  assert.doesNotMatch(differentCode.stderr, FULL, "the four codes share one key on Antigravity too");
  const newConversation = evaluateLifecycleReadyGuard(payload(OPERATOR, "a-new-conversation-1"), deps);
  assert.match(newConversation.stderr, FULL);
  assert.equal(newConversation.stderr.length, first.stderr.length);
}));

test("C31-B1 rendered: a read-scope refusal first never hides the first full listing", () => withFixture(({ deps }) => {
  const scope = evaluateLifecycleReadyGuard(claude(READ_SCOPE, "rendered-2"), deps);
  assert.equal(scope.exitCode, 2);
  assert.match(scope.stderr, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  const grammar = evaluateLifecycleReadyGuard(claude(OPERATOR, "rendered-2"), deps);
  assert.match(grammar.stderr, /GUARD-OPERATOR-UNAPPROVED/u);
  assert.match(grammar.stderr, FULL);
  // The read-scope text is unchanged on repeat (its remedy is the repair).
  const again = evaluateLifecycleReadyGuard(claude(READ_SCOPE, "rendered-2"), deps);
  assert.equal(again.stderr, scope.stderr);
}));
