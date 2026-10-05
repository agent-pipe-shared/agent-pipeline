// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { deriveV3BaselinePolicies, verifyV3BaselineAuthority } from "./model-role-v3-baseline.mjs";
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { devNull } from "node:os";

const cases = [];
function test(name, run) { cases.push({ id: `MVB${String(cases.length + 1).padStart(2, "0")}`, name, run }); }
const source = registeredFunctionalTaskRoutes();
function observed(runner) {
  return source.configuredRoutes.filter((route) => route.runner === runner).map((route) => ({
    runner, role: route.role, effort: route.effort, ok: true,
    assurance: runner === "claude" ? "host-observed-single-call-not-provider-attested"
      : "installed-host-observed",
    availableModelIds: [route.selector.value, "unapproved-new-model"],
  }));
}

test("a qualified Codex V3 baseline selects only exact incumbent IDs", () => {
  const result = deriveV3BaselinePolicies({ routeSource: source, runner: "codex",
    observations: observed("codex") });
  assert.equal(result.ok, true);
  assert.equal(result.approvedPolicies.length,
    source.configuredRoutes.filter((route) => route.runner === "codex").length);
  assert.ok(result.approvedPolicies.every((entry) => entry.policy.approved.every((model) =>
    model.modelId !== "unapproved-new-model")));
});

test("a floating Claude alias never becomes an approved exact model", () => {
  assert.equal(deriveV3BaselinePolicies({ routeSource: source, runner: "claude",
    observations: observed("claude") }).code,
  "MODEL-ROLE-V3-BASELINE-ALIAS-NEEDS-EXACT-APPROVAL");
});

test("missing incumbent effort availability fails before a session receipt exists", () => {
  const observations = observed("codex");
  observations[0].availableModelIds = ["unapproved-new-model"];
  assert.equal(deriveV3BaselinePolicies({ routeSource: source, runner: "codex",
    observations }).code, "MODEL-ROLE-V3-BASELINE-COMPATIBILITY-UNAVAILABLE");
});

test("a stored V3 baseline is rederived from the current governed source", () => {
  const authority = { mode: "v3-baseline", routeSource: source,
    observations: observed("codex") };
  assert.equal(verifyV3BaselineAuthority({ authority, runner: "codex" }).ok, true);
  const changed = structuredClone(authority);
  changed.routeSource.configuredRoutes.find((route) => route.runner === "codex").selector.value = "new-model";
  assert.equal(verifyV3BaselineAuthority({ authority: changed, runner: "codex" }).code,
    "MODEL-ROLE-V3-BASELINE-SOURCE-DRIFT");
});

assert.equal(cases.length, 4);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
