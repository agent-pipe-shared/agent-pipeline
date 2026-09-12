// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  HOST_ADVISOR_POLICY,
  parseHostAdvisorRouteArgs,
  resolveHostAdvisorRoute,
  ROUTES,
  selectHostAdvisorRoute,
  selectHostAdvisorRouteForHost,
  isWslHostObservation,
  USAGE,
} from "./codex-host-advisor-route.mjs";

const NON_WSL = Object.freeze({ platform: "linux", release: "6.8.0-generic", wslDistroName: null });
const routeFor = (input) => selectHostAdvisorRouteForHost(input, NON_WSL);

test("Codex epic/feature default and approved route directly to host consult outside WSL", () => {
  for (const profile of ["epic", "feature"]) for (const consent of ["default", "approved"]) {
    assert.equal(routeFor({ runner: "codex", profile, consent }), ROUTES.HOST);
  }
});
test("declined and mini are disabled", () => {
  assert.equal(routeFor({ runner: "codex", profile: "epic", consent: "declined" }), ROUTES.NO_CONSENT);
  assert.equal(routeFor({ runner: "codex", profile: "mini", consent: "default" }), ROUTES.PROFILE);
  assert.equal(routeFor({ runner: "codex", profile: "mini", consent: "approved" }), ROUTES.PROFILE);
});
test("malformed and non-Codex input fails closed without platform inspection", () => {
  for (const value of [null, {}, { runner: "claude", profile: "epic", consent: "default" }, { runner: "codex", profile: "x", consent: "default" }, { runner: "codex", profile: "epic", consent: "x" }, { runner: "codex", profile: "epic", consent: "default", platform: "wsl" }]) assert.throws(() => routeFor(value));
});
test("WSL is typed unavailable before native Advisor selection", () => {
  for (const observation of [
    { platform: "linux", release: "5.15.153.1-microsoft-standard-WSL2", wslDistroName: null },
    { platform: "linux", release: "6.8.0-generic", wslDistroName: "Ubuntu" },
  ]) {
    assert.equal(isWslHostObservation(observation), true);
    const resolved = {
      route: selectHostAdvisorRouteForHost({ runner: "codex", profile: "epic", consent: "default" }, observation),
      policy: null,
    };
    assert.deepEqual(resolved, { route: ROUTES.WSL_UNAVAILABLE, policy: null });
  }
  assert.equal(isWslHostObservation(NON_WSL), false);
  assert.equal(isWslHostObservation({ platform: "win32", release: "10.0.26100", wslDistroName: "Ubuntu" }), false);
  const wsl = { platform: "linux", release: "5.15.153.1-microsoft-standard-WSL2", wslDistroName: "Ubuntu" };
  for (const malformed of [null, {}, { runner: "claude", profile: "epic", consent: "default" }]) {
    assert.throws(() => selectHostAdvisorRouteForHost(malformed, wsl), { code: "invalid-route-input" });
  }
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
test("host route carries model-free bounds with one attempt", () => {
  const route = routeFor({
    runner: "codex",
    profile: "epic",
    consent: "approved",
  });
  const resolved = { route, policy: route === ROUTES.HOST ? HOST_ADVISOR_POLICY : null };
  assert.deepEqual(Object.keys(resolved).sort(), ["policy", "route"]);
  assert.equal(resolved.route, ROUTES.HOST);
  assert.equal(resolved.policy, HOST_ADVISOR_POLICY);
  assert.deepEqual(Object.keys(resolved.policy).sort(), ["exhausted", "maxAttempts", "schema", "timeoutMs", "workspaceGuard"]);
  assert.equal(resolved.policy.maxAttempts, 1);
  assert.equal(resolved.policy.timeoutMs, 180_000);
  assert.equal(resolved.policy.workspaceGuard, "sha256-before-between-after");
  assert.equal(resolved.policy.exhausted, "continue-advisory-unavailable");
  for (const input of [
    { runner: "codex", profile: "mini", consent: "default" },
    { runner: "codex", profile: "feature", consent: "declined" },
  ]) assert.equal(routeFor(input) === ROUTES.HOST ? HOST_ADVISOR_POLICY : null, null);
});
