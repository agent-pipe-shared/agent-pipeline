// SPDX-License-Identifier: SUL-1.0
// Candidate 31 (R4, B1): the repeated grammar listing is trimmed on Antigravity (its adapter payload carries
// antigravity_conversation_id and no session_id) and across the four codes that print the listing, so a context
// window pays for the listing once. The first refusal in a scope stays full; a store failure fails open to full.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { denialFirstOccurrences, isFirstDenialThisScope } from "./denial-telemetry.mjs";
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

// C31c (cloud review of candidate 31): the shared listing class picks the grammar listing only; the human-override text keeps the base rule of its own code.
test("C31c one call answers both: the listing follows the shared class, the override text follows whether it was printed", () => withFixture(({ root, commonDir, stateDir }) => {
  const deps = { ...orchestrator, resolveGitCommonDirFn: () => commonDir };
  const offered = { overrideOffered: true };
  const input = { session_id: "two-answers-1" };
  // A read-spelling refusal prints the listing and offers no override.
  assert.deepEqual(denialFirstOccurrences(input, root, "GUARD-READ-COMMAND-UNSUPPORTED", deps), { listing: true, own: true });
  // The redirect refusal gets the short listing and the full override text, which it then records as printed.
  assert.deepEqual(denialFirstOccurrences(input, root, "GUARD-REDIRECT-UNAPPROVED", deps, offered), { listing: false, own: true });
  // Any later refusal that offers the override gets the short form, whatever its code (the C31-B1 trim of the repeat text stays).
  assert.deepEqual(denialFirstOccurrences(input, root, "GUARD-REDIRECT-UNAPPROVED", deps, offered), { listing: false, own: false });
  assert.deepEqual(denialFirstOccurrences(input, root, "GUARD-OPERATOR-UNAPPROVED", deps, offered), { listing: false, own: false });
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", deps), false, "the boolean wrapper is the listing answer");
  assert.deepEqual(JSON.parse(readFileSync(join(stateDir, "two-answers-1.json"), "utf8")).seenClasses,
    ["GUARD-READ-COMMAND-UNSUPPORTED", "GUARD-REDIRECT-UNAPPROVED", "GUARD-OPERATOR-UNAPPROVED", "GUARD-PARSE-UNSUPPORTED"]);
  assert.deepEqual(denialFirstOccurrences({ session_id: "" }, root, "GUARD-PARSE-UNSUPPORTED", deps, offered), { listing: true, own: true }, "no scope: full, nothing stored");
}));

test("C31c a refusal that offered no override never counts as having shown it", () => withFixture(({ root, commonDir }) => {
  const deps = { ...orchestrator, resolveGitCommonDirFn: () => commonDir };
  const input = { session_id: "two-answers-2" };
  // A typed retry action instead of an override: the class is recorded, the override text is not.
  assert.deepEqual(denialFirstOccurrences(input, root, "GUARD-PARSE-UNSUPPORTED", deps, { overrideOffered: false }), { listing: true, own: true });
  assert.deepEqual(denialFirstOccurrences(input, root, "GUARD-OPERATOR-UNAPPROVED", deps, { overrideOffered: true }), { listing: false, own: true }, "the full override text is still owed");
  assert.deepEqual(denialFirstOccurrences(input, root, "GUARD-REDIRECT-UNAPPROVED", deps, { overrideOffered: true }), { listing: false, own: false });
}));

test("C31c rendered: a read-spelling refusal first leaves the full signing instructions to the next mutation refusal", () => withFixture(({ deps }) => {
  const planned = { ...deps, recordHumanGuardDenialFn: () => ({ status: "planned", requestSha256: "a".repeat(64) }) };
  const read = evaluateLifecycleReadyGuard(claude(READ_SPELLING, "rendered-4"), planned);
  assert.match(read.stderr, /GUARD-READ-COMMAND-UNSUPPORTED/u);
  assert.doesNotMatch(read.stderr, /Human override/u, "a read spelling offers no override");
  const redirect = evaluateLifecycleReadyGuard(claude(REDIRECT, "rendered-4"), planned);
  assert.match(redirect.stderr, /GUARD-REDIRECT-UNAPPROVED/u);
  assert.doesNotMatch(redirect.stderr, FULL, "the listing was printed by the read refusal");
  assert.match(redirect.stderr, /Human override available for this exact/u, "the ceremony text was never printed in this scope, so it is full");
  const again = evaluateLifecycleReadyGuard(claude(REDIRECT, "rendered-4"), planned);
  assert.match(again.stderr, /Human override remains available for this exact/u, "the repeat of the same code is short, as before");
}));

test("C31c Antigravity: the listing is presumed gone after the window, counted from the last FULL listing and not from the last write", () => withFixture(({ root, commonDir, stateDir }) => {
  const minute = 60 * 1000;
  let nowMs = 1_000_000_000_000;
  const deps = { ...orchestrator, resolveGitCommonDirFn: () => commonDir, nowMsFn: () => nowMs };
  const input = agy("x");
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", deps), true);
  nowMs += 10 * minute;
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", deps), false, "inside the window: short");
  // A new class recorded later rewrites the state file but is not a full listing: the clock stays at the first one.
  assert.deepEqual(denialFirstOccurrences(input, root, "GUARD-OPERATOR-UNAPPROVED", deps), { listing: false, own: true });
  assert.equal(JSON.parse(readFileSync(join(stateDir, `${CONVERSATION}.json`), "utf8")).listingAtMs, 1_000_000_000_000);
  nowMs += 21 * minute; // 31 minutes after the full listing, 21 after the last write
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", deps), true, "past the window: full again");
  nowMs += minute;
  assert.equal(isFirstDenialThisScope(input, root, "GUARD-PARSE-UNSUPPORTED", deps), false, "and the new window starts there");
}));

test("C31c Antigravity: a store from before the clock existed or a clock from the future fails open to full once; a session scope never expires", () => withFixture(({ root, commonDir, stateDir }) => {
  let nowMs = 2_000_000_000_000;
  const deps = { ...orchestrator, resolveGitCommonDirFn: () => commonDir, nowMsFn: () => nowMs };
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, `${CONVERSATION}.json`), `${JSON.stringify({ schema: "pipeline.guard-denial-classes-seen.v1", seenClasses: ["GUARD-PARSE-UNSUPPORTED"] })}\n`);
  assert.equal(isFirstDenialThisScope(agy("x"), root, "GUARD-PARSE-UNSUPPORTED", deps), true, "unknown age of the earlier listing: full once");
  assert.equal(isFirstDenialThisScope(agy("x"), root, "GUARD-PARSE-UNSUPPORTED", deps), false, "then it is trimmed again");
  nowMs -= 5 * 60 * 1000; // the clock went back: a listing time in the future is not trusted
  assert.equal(isFirstDenialThisScope(agy("x"), root, "GUARD-PARSE-UNSUPPORTED", deps), true);
  // The session-keyed scope (Claude, Codex) has its own reset at compaction and no clock.
  nowMs = 2_000_000_000_000;
  assert.equal(isFirstDenialThisScope({ session_id: "session-clock-1" }, root, "GUARD-PARSE-UNSUPPORTED", deps), true);
  nowMs += 24 * 60 * 60 * 1000;
  assert.equal(isFirstDenialThisScope({ session_id: "session-clock-1" }, root, "GUARD-PARSE-UNSUPPORTED", deps), false);
  assert.equal("listingAtMs" in JSON.parse(readFileSync(join(stateDir, "session-clock-1.json"), "utf8")), false, "the session store keeps its shape");
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
