#!/usr/bin/env node
import {
  ROUTING_AUTHORITY,
  projectAgentFrontmatter,
  projectClaudeManifestRouting,
  projectDirectRoutingDefaults,
  projectHostDuty,
  projectManifestRouting,
  projectPreset,
  projectRunnerAssignment,
  projectRunnerRoutes,
  resolveRunnerAlias,
  routingProvenance,
  validateDirectRoute,
  validateDirectRouting,
} from "../lib/routing-projection.mjs";
import {
  checkCodexPartialMappingContract,
  checkCodexNormalCriticDuty,
  checkRepository,
  directManifestProjectionMatches,
  hasCurrentProvenance,
  manifestProjectionMatches,
  runnerRouteProjectionMatches,
} from "./check-routing-projections.mjs";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const max = projectPreset("max", "claude");
check("RP01 authority is provider-neutral", !JSON.stringify(ROUTING_AUTHORITY).match(/opus|sonnet|gpt-5\.6-sol/));
check("RP02 Claude design mapping unchanged", max.worktypes.design.design_phase.model === "opus");
check("RP03 Claude implement mapping unchanged", max.models.implement.model === "sonnet");
check("RP04 mechanic effort is low", max.models.mechanic.effort === "low");
check("RP05 implementor effort is medium", max.models.implement.effort === "medium");
check("RP06 deep effort is xhigh", max.models.deep.effort === "xhigh");
check("RP07 critic effort is max", max.models.review.effort === "max");

const routing1 = projectManifestRouting(max.worktypes, max.models);
const routing2 = projectManifestRouting(max.worktypes, max.models);
check("RP08 manifest projection is byte-deterministic", JSON.stringify(routing1) === JSON.stringify(routing2));
check("RP09 all profile phase routes are projected", Object.keys(routing1).filter((key) => key.startsWith("elephant_")).length === 6);
check("RP09a all configured advisor routes are projected without invented effort", routing1.advisor_feature.effort === "not-applicable" && routing1.advisor_mini.effort === "not-applicable");
check("RP09b Claude manifest alias remains sonnet-5", routing1.goldfish.model === "sonnet-5" && routing1.critic.model === "sonnet-5");
check("RP10 all fixed agent routes are projected", Object.keys(projectAgentFrontmatter()).length === 5);

for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
  const value = projectRunnerAssignment("codex", { model: "fable", effort });
  check(`RP11 Codex Fable keeps ${effort}`, value.model === "gpt-5.6-sol" && value.effort === effort);
}
let unsupported = false;
try {
  resolveRunnerAlias("codex", "opus", "high");
} catch {
  unsupported = true;
}
check("RP12 unsupported Codex identity fails closed", unsupported);
let unsupportedEffort = false;
try {
  projectRunnerAssignment("codex", { model: "fable", effort: "turbo" });
} catch {
  unsupportedEffort = true;
}
check("RP12b unsupported effort fails closed", unsupportedEffort);
check("RP13 partial Codex alias mapping remains narrow", checkCodexPartialMappingContract().ok);
const codexNormalCritic = projectHostDuty("criticNormal", "codex");
check("RP13a Codex normal Critic duty is host-native Sol/xhigh", codexNormalCritic.model === "gpt-5.6-sol" && codexNormalCritic.effort === "xhigh" && codexNormalCritic.dispatch === "host-native");
check("RP13b Codex normal Critic duty contract passes", checkCodexNormalCriticDuty().ok);
let unknownHostDuty = false;
try {
  projectHostDuty("unknown", "codex");
} catch {
  unknownHostDuty = true;
}
check("RP13c unknown host duty fails closed", unknownHostDuty);
check("RP14 committed projections match authority", checkRepository().ok);
check("RP15 light is ceremony-only", ROUTING_AUTHORITY.dispatchProfiles.light.ceremonyOnly === true);
check(
  "RP16 light routes exclude deep",
  !ROUTING_AUTHORITY.dispatchProfiles.light.allowedRoutes.includes("deep"),
);
const missingRoute = structuredClone(routing1);
delete missingRoute.goldfish_deep;
check("RP17 missing manifest route is detected", !manifestProjectionMatches(missingRoute, max.worktypes, max.models));
const extraRoute = structuredClone(routing1);
extraRoute.conflict = { model: "sonnet-5", effort: "high" };
check("RP18 extra manifest route is detected", !manifestProjectionMatches(extraRoute, max.worktypes, max.models));
check("RP19 stale provenance is detected", !hasCurrentProvenance(`# ${routingProvenance().replace(/.$/, "0")}`));
const customRouting = projectManifestRouting(
  { custom: { design_phase: { model: "my-model", effort: "high" }, execution_phase: { model: "my-model", effort: "medium" }, advisor: "off" } },
  { implement: { model: "my-model", effort: "medium" }, mechanic: { model: "my-model", effort: "low" }, deep: { model: "my-model", effort: "xhigh" }, review: { model: "my-reviewer", effort: "max" } },
);
check("RP20 custom models pass through without invented aliases", customRouting.goldfish.model === "my-model" && customRouting.critic.model === "my-reviewer");
check("RP21 pro preset remains projectable", projectPreset("pro", "claude").models.implement.model === "sonnet");
const designAdvisor = structuredClone(max.worktypes);
designAdvisor.design.advisor = "opus";
check("RP22 valid custom design advisor is projected", projectManifestRouting(designAdvisor, max.models).advisor_design.effort === "not-applicable");

const direct = projectDirectRoutingDefaults();
check("RP23 direct v1 defaults validate as the sole source", validateDirectRouting(direct).ok);
check("RP24 direct Claude projection preserves the legacy modelRouting shape", directManifestProjectionMatches(projectClaudeManifestRouting(direct), direct));
const runnerRoutes = projectRunnerRoutes(direct);
check("RP25 all direct routes project deterministically", runnerRouteProjectionMatches(runnerRoutes, direct));
check("RP26 Codex design and Critic request observed Sol/xhigh", runnerRoutes.duty_codex_design.selector.value === "gpt-5.6-sol" && runnerRoutes.duty_codex_design.effort === "xhigh" && runnerRoutes.duty_codex_independent_critic.selector.value === "gpt-5.6-sol");
check("RP27 Codex implementation remains unresolved Terra alias", runnerRoutes.duty_codex_implementation.selector.kind === "alias" && runnerRoutes.duty_codex_implementation.selector.value === "terra" && runnerRoutes.duty_codex_implementation.resolutionStatus === "unresolved-alias");
check("RP28 unobserved concrete Codex IDs fail closed", !validateDirectRoute({ ...direct.duties.codex_implementation, selector: { kind: "model-id", value: "invented-id" } }).ok);
const directWithAdvisorOff = structuredClone(direct);
directWithAdvisorOff.worktypes.feature.advisor = "off";
check("RP29 any advisory route may be deliberately disabled", validateDirectRouting(directWithAdvisorOff).ok);
const directWithWrongRunner = structuredClone(direct);
directWithWrongRunner.worktypes.design.design_phase.runner = "codex";
check("RP30 cross-runner worktype substitution fails closed before P5", !validateDirectRouting(directWithWrongRunner).ok);

// This is the fixed Claude projection from Shared candidate 654ebaf. It is
// intentionally a test fixture, never a second editable routing authority:
// v1 must keep this compatibility projection semantically identical.
const CLAUDE_654EBAF_MODEL_ROUTING = Object.freeze({
  elephant_design_design: { model: "opus", effort: "high" },
  elephant_design_execution: { model: "opus", effort: "high" },
  elephant_feature_design: { model: "opus", effort: "high" },
  elephant_feature_execution: { model: "sonnet-5", effort: "high" },
  advisor_feature: { model: "opus", effort: "not-applicable" },
  elephant_mini_design: { model: "sonnet-5", effort: "high" },
  elephant_mini_execution: { model: "sonnet-5", effort: "high" },
  advisor_mini: { model: "opus", effort: "not-applicable" },
  goldfish: { model: "sonnet-5", effort: "medium" },
  goldfish_mechanic: { model: "sonnet-5", effort: "low" },
  goldfish_deep: { model: "sonnet-5", effort: "xhigh" },
  critic: { model: "sonnet-5", effort: "max" },
});
check("RP31 direct v1 Claude projection is semantically identical to Shared 654ebaf", JSON.stringify(projectClaudeManifestRouting(direct)) === JSON.stringify(CLAUDE_654EBAF_MODEL_ROUTING));

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
