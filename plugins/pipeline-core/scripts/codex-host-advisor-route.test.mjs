// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  HOST_ADVISOR_POLICY,
  parseHostAdvisorRouteArgs,
  resolveHostAdvisorRoute,
  ROUTES,
  selectHostAdvisorRoute,
  USAGE,
} from "./codex-host-advisor-route.mjs";

test("Codex epic/feature default and approved route directly to host consult", () => {
  for (const profile of ["epic", "feature"]) for (const consent of ["default", "approved"]) {
    assert.equal(selectHostAdvisorRoute({ runner: "codex", profile, consent }), ROUTES.HOST);
  }
});
test("declined and mini are disabled", () => {
  assert.equal(selectHostAdvisorRoute({ runner: "codex", profile: "epic", consent: "declined" }), ROUTES.NO_CONSENT);
  assert.equal(selectHostAdvisorRoute({ runner: "codex", profile: "mini", consent: "default" }), ROUTES.PROFILE);
  assert.equal(selectHostAdvisorRoute({ runner: "codex", profile: "mini", consent: "approved" }), ROUTES.PROFILE);
});
test("malformed and non-Codex input fails closed without platform inspection", () => {
  for (const value of [null, {}, { runner: "claude", profile: "epic", consent: "default" }, { runner: "codex", profile: "x", consent: "default" }, { runner: "codex", profile: "epic", consent: "x" }, { runner: "codex", profile: "epic", consent: "default", platform: "wsl" }]) assert.throws(() => selectHostAdvisorRoute(value));
});
test("the productive CLI accepts exactly one explicit route tuple", () => {
  assert.deepEqual(parseHostAdvisorRouteArgs([
    "--runner", "codex",
    "--profile", "feature",
    "--consent", "default",
  ]), {
    runner: "codex",
    profile: "feature",
    consent: "default",
  });
  assert.deepEqual(parseHostAdvisorRouteArgs([
    "--consent", "approved",
    "--runner", "codex",
    "--profile", "epic",
  ]), {
    consent: "approved",
    runner: "codex",
    profile: "epic",
  });
  for (const argv of [
    [],
    ["--help"],
    ["--runner", "codex", "--profile", "epic"],
    ["--root", "/repo", "--profile", "epic", "--consent", "default"],
    ["--runner", "codex", "--runner", "codex", "--consent", "default"],
  ]) assert.throws(() => parseHostAdvisorRouteArgs(argv), { message: USAGE });
});
test("host route carries one bounded primary and one smaller fail-open fallback", () => {
  const resolved = resolveHostAdvisorRoute({
    runner: "codex",
    profile: "epic",
    consent: "approved",
  });
  assert.deepEqual(Object.keys(resolved).sort(), ["policy", "route"]);
  assert.equal(resolved.route, ROUTES.HOST);
  assert.equal(resolved.policy, HOST_ADVISOR_POLICY);
  assert.equal(resolved.policy.maxAttempts, 2);
  assert.deepEqual(resolved.policy.primary, {
    agentName: "consult-advisor",
    model: "gpt-5.6-sol",
    effort: "max",
    timeoutMs: 180_000,
  });
  assert.deepEqual(resolved.policy.fallback, {
    agentName: "consult-advisor-fast",
    model: "gpt-5.6-terra",
    effort: "high",
    timeoutMs: 90_000,
    forkTurns: "none",
  });
  assert.equal(resolved.policy.workspaceGuard, "sha256-before-between-after");
  assert.equal(resolved.policy.exhausted, "continue-advisory-unavailable");
  for (const input of [
    { runner: "codex", profile: "mini", consent: "default" },
    { runner: "codex", profile: "feature", consent: "declined" },
  ]) assert.equal(resolveHostAdvisorRoute(input).policy, null);
});
