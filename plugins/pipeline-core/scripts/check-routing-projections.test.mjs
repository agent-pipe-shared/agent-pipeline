#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadRunnerProfilesV3Registry } from "../lib/runner-profiles-v3.mjs";
import { planRuntimeProjectionV3, readRuntimeProjectionV3Baselines } from "../lib/runtime-projection-v3.mjs";
import {
  ROUTING_AUTHORITY,
  expectedProviderForRunner,
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
  checkV3RuntimeProjection,
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
const canonicalNormalCritic = projectRunnerAssignment("codex", ROUTING_AUTHORITY.hostDuties.criticNormal);
check("RP13a Codex normal Critic duty preserves the canonical requested route and host-native dispatch", codexNormalCritic.model === canonicalNormalCritic.model && codexNormalCritic.effort === canonicalNormalCritic.effort && codexNormalCritic.dispatch === "host-native");
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
check("RP26 Codex design and Critic preserve the validator-approved canonical requests", JSON.stringify(runnerRoutes.duty_codex_design) === JSON.stringify(validateDirectRoute(direct.duties.codex_design).route) && JSON.stringify(runnerRoutes.duty_codex_independent_critic) === JSON.stringify(validateDirectRoute(direct.duties.codex_independent_critic).route));
check("RP27 Codex implementation preserves the validator-approved canonical request", JSON.stringify(runnerRoutes.duty_codex_implementation) === JSON.stringify(validateDirectRoute(direct.duties.codex_implementation).route));
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

const canonicalImplementation = direct.duties.codex_implementation;
check("RP32 P1 Codex implementation retains its validated direct request", canonicalImplementation.runner === "codex" && validateDirectRoute(canonicalImplementation).ok && JSON.stringify(runnerRoutes.duty_codex_implementation) === JSON.stringify(validateDirectRoute(canonicalImplementation).route));
check("RP33 P1 runner providers stay explicitly mapped", expectedProviderForRunner("codex") === "openai" && expectedProviderForRunner("claude") === "anthropic");
for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
  const assignment = projectRunnerAssignment("codex", { model: "fable", effort });
  check(`RP34 P1 Fable resolves to Sol at identity ${effort} effort`, assignment.model === "gpt-5.6-sol" && assignment.effort === effort);
}

const v3Registry = loadRunnerProfilesV3Registry();
const v3Intent = {
  schema: "pipeline.user.v3",
  language: { human_facing: "de", agent_facing: "en" },
  agent_runtime: "other",
  runners: { enabled: ["claude", "codex"], default: "codex" },
  routing: structuredClone({ profiles: v3Registry.profiles, duties: v3Registry.duties }),
  critic_export: structuredClone(v3Registry.criticExportPolicy),
  usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
  autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
  gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
};
const v3Root = mkdtempSync(join(tmpdir(), "routing-projection-v3-check-"));
try {
  const baselines = {
    ".claude/settings.json": "{}\n",
    ".claude/pipeline.json": "{\n  \"project\": \"fixture\"\n}\n",
    ".claude/pipeline.yaml": "language:\n  human_facing: en\nsentinel: keep\nmodelRouting:\n  stale: true\nrunnerRoutes:\n  worktype_mini_advisor:\n    runner: claude\nend: keep\n",
    ".codex/config.toml": "profile = \"keep\"\n",
    ".codex/agents/implementor.toml": "model = \"old\"\nmodel_reasoning_effort = \"low\"\n",
    ".codex/agents/critic.toml": "model = \"old\"\nmodel_reasoning_effort = \"low\"\n",
    ".codex/agents/consult-advisor.toml": "name = \"stale\"\n",
  };
  for (const [path, bytes] of Object.entries(baselines)) {
    const absolute = join(v3Root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, bytes);
  }
  const projection = planRuntimeProjectionV3(v3Intent, { baselines: readRuntimeProjectionV3Baselines(v3Root) });
  for (const target of projection.targets) writeFileSync(join(v3Root, target.path), target.after.bytes);
  const advisorTarget = projection.targets.find((target) => target.path === ".codex/agents/consult-advisor.toml");
  const configuredAdvisor = v3Intent.routing.duties.advisory.codex;
  check("RP35 V3 checker accepts the configured advisory selector and effort projection", checkV3RuntimeProjection(v3Root, v3Intent).length === 0 && advisorTarget?.after.bytes.includes(`model = ${JSON.stringify(configuredAdvisor.selector.value)}`) && advisorTarget.after.bytes.includes(`model_reasoning_effort = ${JSON.stringify(configuredAdvisor.effort)}`));
  const corruptedAdvisor = structuredClone(v3Intent);
  corruptedAdvisor.routing.duties.advisory.codex.selector.value = "gpt-5.6-terra";
  corruptedAdvisor.routing.duties.advisory.codex.effort = "high";
  check("RP35a V3 checker rejects advisory selector and effort corruption before projection", checkV3RuntimeProjection(v3Root, corruptedAdvisor).includes("pipeline.user.yaml V3 schema or registry validation failed"));
  writeFileSync(join(v3Root, ".codex", "agents", "consult-advisor.toml"), advisorTarget.after.bytes.replace(`model = ${JSON.stringify(configuredAdvisor.selector.value)}`, 'model = "tampered-model"'));
  check("RP35b V3 checker detects advisory bytes tampered on disk", checkV3RuntimeProjection(v3Root, v3Intent).includes(".codex/agents/consult-advisor.toml V3 owned projection drift"));
  writeFileSync(join(v3Root, ".codex", "agents", "consult-advisor.toml"), advisorTarget.after.bytes);
  writeFileSync(join(v3Root, ".claude", "pipeline.yaml"), baselines[".claude/pipeline.yaml"]);
  check("RP36 V3 checker detects advisory runtime drift", checkV3RuntimeProjection(v3Root, v3Intent).some((finding) => finding.includes("V3 owned projection drift")));
} finally {
  rmSync(v3Root, { recursive: true, force: true });
}

check("RP37 Antigravity runner provider is google", expectedProviderForRunner("antigravity") === "google");
check("RP38 Antigravity design and implement capabilities match Gemini models",
  projectRunnerAssignment("antigravity", { capability: "design", effort: "high" }).model === v3Registry.profiles.epic.design_phase.antigravity.selector.value
  && projectRunnerAssignment("antigravity", { capability: "implement", effort: "high" }).model === v3Registry.duties.implement.antigravity.selector.value
  && projectRunnerAssignment("antigravity", { capability: "mechanic", effort: "low" }).model === v3Registry.duties.mechanic.antigravity.selector.value
);
check("RP39 Antigravity aliases resolve accurately",
  projectRunnerAssignment("antigravity", { model: "flash-high", effort: "high" }).model === projectRunnerAssignment("antigravity", { capability: "implement", effort: "high" }).model
  && projectRunnerAssignment("antigravity", { model: "pro-high", effort: "high" }).model === projectRunnerAssignment("antigravity", { capability: "design", effort: "high" }).model
);
check("RP40 Antigravity direct routes validate against observed model-ids",
  validateDirectRoute({
    runner: "antigravity",
    selector: { kind: "model-id", value: "gemini-3.1-pro-high" },
    effort: "high",
    unavailability: "defer",
    evidenceRequirement: "dispatch-receipt",
  }).ok
);

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
