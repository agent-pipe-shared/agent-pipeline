// SPDX-License-Identifier: SUL-1.0
// C22 (CGF-03, CGF-20, AC-108): criterion-bound cases for the assurance a Critic route will really deliver, stated BEFORE the dispatch. Written before the module existed.
// Source: Codex greenfield report CGF-03 ("independence and test-first assurance must not be upgraded in wording: the receipt says freshContext:false,
// historyInherited:true, caller-authored-fallback"; critical profile blocks or takes a deliberate exception up front) and CGF-20 ("a caller-authored Critic
// needs its own acknowledgement only late in close": avoidable late discovery).
import assert from "node:assert/strict";
import test from "node:test";
import { CRITIC_ROUTE_ASSURANCE_SCHEMA, criticRunnerFromEnv, describeCriticRouteAssurance } from "./critic-route-assurance.mjs";

const PACKET = "a".repeat(32);
const DEFAULT_ROUTE = { agentType: "default", sandboxed: false, protection: "instruction-only", reason: "no-receipt" };
const SANDBOXED = { agentType: "critic-high-risk", sandboxed: true };
const describe = (input) => describeCriticRouteAssurance({ packetId: PACKET, trigger: "T1", rigor: null, launchRoute: null, ...input });

test("a native Claude or Antigravity Critic is stated with the receipt vocabulary of a source-issued round, with the fallback as its floor", () => {
  for (const runner of ["claude", "antigravity"]) {
    const result = describe({ runner });
    assert.equal(result.schema, CRITIC_ROUTE_ASSURANCE_SCHEMA);
    assert.deepEqual(result.expected, { independence: "source-issued-origin", freshContext: true, historyInherited: false });
    assert.equal(result.floor.independence, "caller-authored-fallback", "a round whose stop issues no Source return is finalized as the fallback");
    assert.equal(result.profile.status, "meets");
    assert.equal(result.closeAcknowledgement.required, false);
  }
});

test("a Codex route that resolves to default is stated as caller-authored, history inherited, and below the critical profile, with its close acknowledgement named now", () => {
  const result = describe({ runner: "codex", launchRoute: DEFAULT_ROUTE });
  assert.deepEqual(result.expected, { independence: "caller-authored-fallback", freshContext: false, historyInherited: true });
  assert.equal(result.plannedRoute.agentType, "default");
  assert.equal(result.profile.name, "critical");
  assert.equal(result.profile.status, "below-required");
  assert.equal(result.closeAcknowledgement.required, true, "CGF-20: the late discovery is gone, the preflight says it before the dispatch");
  assert.ok(result.closeAcknowledgement.command.includes(`approve-critic-acknowledgement --by <name> --critic-packet ${PACKET}`), result.closeAcknowledgement.command);
  assert.equal(result.exception.route, "po-acknowledgement", "the existing exception route, never a refusal without a way out");
  assert.match(result.notice, /caller-authored-fallback/u);
  assert.match(result.notice, /instruction only/u);
});

test("a sandboxed Codex Critic meets the critical profile; an undecided Codex launch states the floor and both outcomes instead of the stronger one", () => {
  const sandboxed = describe({ runner: "codex", launchRoute: SANDBOXED });
  assert.equal(sandboxed.expected.independence, "source-issued-origin");
  assert.equal(sandboxed.profile.status, "meets");
  const undecided = describe({ runner: "codex" });
  assert.equal(undecided.expected, null, "no launch route is known yet, so no assurance is promised");
  assert.equal(undecided.floor.independence, "caller-authored-fallback");
  assert.equal(undecided.profile.status, "conditional");
  assert.equal(undecided.closeAcknowledgement.required, "conditional");
  assert.match(undecided.notice, /decided at launch/u);
  assert.ok(undecided.exception !== null);
});

test("the close acknowledgement follows the close rule: required for a caller-authored round at rigor 1 or more or in the critical profile, not at rigor 0 and low risk", () => {
  assert.equal(describe({ runner: "codex", launchRoute: DEFAULT_ROUTE, trigger: "T3", rigor: 0 }).closeAcknowledgement.required, false);
  assert.equal(describe({ runner: "codex", launchRoute: DEFAULT_ROUTE, trigger: "T3", rigor: 1 }).closeAcknowledgement.required, true);
  assert.equal(describe({ runner: "codex", launchRoute: DEFAULT_ROUTE, trigger: "T3", rigor: null }).closeAcknowledgement.required, "unknown");
  const standard = describe({ runner: "codex", launchRoute: DEFAULT_ROUTE, trigger: "T3", rigor: 1 });
  assert.equal(standard.profile.name, "standard");
  assert.equal(standard.profile.status, "not-critical");
  assert.equal(standard.exception, null);
});

test("wording is never upgraded: only a source-issued, fresh-context expectation may be called independent; an unknown runner promises nothing", () => {
  assert.equal(criticRunnerFromEnv({ CODEX_THREAD_ID: "x" }), "codex");
  assert.equal(criticRunnerFromEnv({ CODEX_SESSION_ID: "x" }), "codex");
  assert.equal(criticRunnerFromEnv({ ANTIGRAVITY_AGENT: "1" }), "antigravity");
  assert.equal(criticRunnerFromEnv({ CLAUDE_CODE_SESSION_ID: "x" }), "claude");
  assert.equal(criticRunnerFromEnv({}), "unknown");
  const unknown = describe({ runner: "unknown" });
  assert.equal(unknown.expected, null);
  for (const input of [{ runner: "unknown" }, { runner: "codex" }, { runner: "codex", launchRoute: DEFAULT_ROUTE }]) {
    const result = describe(input);
    assert.equal(/independent/iu.test(JSON.stringify(result)), false, `no stronger word for ${JSON.stringify(input)}`);
    assert.notEqual(result.expected?.independence, "source-issued-origin");
  }
  for (const input of [{ runner: "claude" }, { runner: "codex", launchRoute: SANDBOXED }]) {
    const result = describe(input);
    assert.deepEqual([result.expected.freshContext, result.expected.historyInherited], [true, false]);
  }
});

test("an unreadable or unexpected input never throws and never raises the assurance", () => {
  for (const input of [{ runner: 7 }, { runner: "codex", launchRoute: "default" }, { runner: "codex", launchRoute: { agentType: 3 } }, { runner: "claude", trigger: undefined }, { runner: "claude", packetId: "not a packet" }]) {
    const result = describeCriticRouteAssurance(input);
    assert.equal(result.schema, CRITIC_ROUTE_ASSURANCE_SCHEMA);
    assert.equal(result.floor.independence, "caller-authored-fallback");
  }
  assert.equal(describeCriticRouteAssurance({ runner: "codex", launchRoute: "default" }).expected, null);
  assert.equal(describeCriticRouteAssurance(undefined).expected, null);
});
