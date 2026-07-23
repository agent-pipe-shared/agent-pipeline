#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const configDir = join(here, "..", "config");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sorted(values) {
  return [...values].sort();
}

function sameMembers(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) && sameMembers(Object.keys(value), expected);
}

const registry = readJson(join(configDir, "runner-profiles-v2.json"));
const userSchema = readJson(join(here, "pipeline-user-v2.schema.json"));
const usageSchema = readJson(join(here, "runner-usage.schema.json"));
const bindingSchema = readJson(join(here, "usage-route-binding.schema.json"));

const RUNNERS = ["claude", "codex"];
const PROFILES = ["design", "feature", "mini"];
const PHASES = ["design_phase", "execution_phase", "advisory"];
const DUTIES = ["implement", "mechanic", "deep", "test_author", "critic_normal", "critic_high_risk", "readiness"];
const STATES = ["default", "opt-in", "off", "unavailable", "unknown"];
const METRICS = ["inputTokens", "outputTokens", "cachedInputTokens", "cacheCreationInputTokens", "cacheReadInputTokens", "reasoningOutputTokens", "billedCost", "estimatedCost"];
const SOURCES = ["claude-transcript-usage", "codex-turn-completed-usage", "workspace-analytics-export"];
const SCOPES = ["turn", "session", "workspace-account-aggregate"];
const P3B_OWNED_MODULES = [
  "../lib/runner-profile-migration-v2.mjs",
  "../lib/runner-profile-migration-v2.test.mjs",
  "../lib/runner-profiles-v2.mjs",
  "../lib/runner-profiles-v2.test.mjs",
  "../lib/runtime-projection-v2.mjs",
  "../lib/runtime-projection-v2.test.mjs",
  "plan-runtime-projection-v2.mjs",
  "runner-contracts.schema.test.mjs",
  "runner-profile-migration-v2.mjs",
  "validate-runner-profiles-v2.mjs",
];

function hasSpdxHeader(path) {
  const lines = readFileSync(join(here, path), "utf8").split(/\r?\n/u);
  return lines[lines[0] === "#!/usr/bin/env node" ? 1 : 0] === "// SPDX-License-Identifier: SUL-1.0";
}

const EXPECTED_PROFILES = {
  "design.design_phase": ["default|alias:opus|high|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-sol|xhigh|defer|dispatch-receipt|-"],
  "design.execution_phase": ["default|alias:opus|high|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-sol|xhigh|defer|dispatch-receipt|-"],
  "design.advisory": ["off|-|-|defer|-|profile-disabled", "unavailable|-|-|defer|-|no-approved-native-capability"],
  "feature.design_phase": ["default|alias:opus|high|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-sol|xhigh|defer|dispatch-receipt|-"],
  "feature.execution_phase": ["default|alias:sonnet|high|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-terra|xhigh|defer|dispatch-receipt|-"],
  "feature.advisory": ["opt-in|alias:opus|not-applicable|defer|dispatch-receipt|-", "unavailable|-|-|defer|-|no-approved-native-capability"],
  "mini.design_phase": ["default|alias:sonnet|high|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-terra|xhigh|defer|dispatch-receipt|-"],
  "mini.execution_phase": ["default|alias:sonnet|high|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-terra|xhigh|defer|dispatch-receipt|-"],
  "mini.advisory": ["opt-in|alias:opus|not-applicable|defer|dispatch-receipt|-", "unavailable|-|-|defer|-|no-approved-native-capability"],
};

const EXPECTED_DUTIES = {
  implement: ["default|alias:sonnet|medium|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-terra|xhigh|defer|dispatch-receipt|-"],
  mechanic: ["opt-in|alias:sonnet|low|defer|dispatch-receipt|-", "opt-in|model-id:gpt-5.6-terra|xhigh|defer|dispatch-receipt|-"],
  deep: ["opt-in|alias:sonnet|xhigh|defer|dispatch-receipt|-", "opt-in|model-id:gpt-5.6-terra|xhigh|defer|dispatch-receipt|-"],
  test_author: ["opt-in|alias:sonnet|xhigh|defer|dispatch-receipt|-", "opt-in|model-id:gpt-5.6-terra|xhigh|defer|dispatch-receipt|-"],
  critic_normal: ["default|alias:sonnet|max|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-terra|xhigh|defer|dispatch-receipt|-"],
  critic_high_risk: ["default|alias:fable|max|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-sol|max|defer|dispatch-receipt|-"],
  readiness: ["default|alias:fable|xhigh|defer|dispatch-receipt|-", "default|model-id:gpt-5.6-sol|xhigh|defer|dispatch-receipt|-"],
};

function signature(cell) {
  const selector = cell?.selector ? `${cell.selector.kind}:${cell.selector.value}` : "-";
  return [cell?.state ?? "-", selector, cell?.effort ?? "-", cell?.unavailable ?? "-", cell?.evidence ?? "-", cell?.reasonCode ?? "-"].join("|");
}

function validateRegistry(candidate) {
  const errors = [];
  const add = (ok, message) => { if (!ok) errors.push(message); };

  add(candidate.schema === "pipeline.runner-profiles.v2", "registry schema id");
  add(Array.isArray(candidate.runners) && JSON.stringify(candidate.runners) === JSON.stringify(RUNNERS), "runner registry");
  add(Array.isArray(candidate.phases) && JSON.stringify(candidate.phases) === JSON.stringify(PHASES), "phase registry");
  add(exactKeys(candidate, ["schema", "runners", "phases", "profiles", "duties"]), "registry root keys");
  add(exactKeys(candidate.profiles, PROFILES), "profile registry");
  add(exactKeys(candidate.duties, DUTIES), "duty registry");

  function validateCell(cell, runner, location, expected) {
    add(cell && typeof cell === "object" && !Array.isArray(cell), `${location}.${runner} object`);
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) return;
    add(STATES.includes(cell.state), `${location}.${runner} state`);
    add(cell.unavailable === "defer", `${location}.${runner} default defer`);

    const routed = ["default", "opt-in"].includes(cell.state);
    const routeless = ["off", "unavailable"].includes(cell.state);
    if (routed) {
      add(exactKeys(cell, ["state", "selector", "effort", "unavailable", "evidence"]), `${location}.${runner} routed keys`);
      add(cell.evidence === "dispatch-receipt", `${location}.${runner} evidence`);
      if (runner === "claude") {
        add(cell.selector?.kind === "alias" && ["fable", "opus", "sonnet"].includes(cell.selector?.value), `${location}.claude selector`);
        add(["low", "medium", "high", "xhigh", "max", "not-applicable"].includes(cell.effort), `${location}.claude effort`);
        add(location.endsWith(".advisory") ? cell.effort === "not-applicable" : cell.effort !== "not-applicable", `${location}.claude advisory effort boundary`);
      } else {
        const sol = cell.selector?.kind === "model-id" && cell.selector?.value === "gpt-5.6-sol";
        const terra = cell.selector?.kind === "model-id" && cell.selector?.value === "gpt-5.6-terra";
        add(sol || terra, `${location}.codex selector`);
        add(sol ? ["xhigh", "max"].includes(cell.effort) : cell.effort === "xhigh", `${location}.codex selector/effort pair`);
      }
    } else if (routeless) {
      add(exactKeys(cell, ["state", "unavailable", "reasonCode"]), `${location}.${runner} routeless keys`);
      const reason = cell.state === "off" ? "profile-disabled" : "no-approved-native-capability";
      add(cell.reasonCode === reason, `${location}.${runner} reason`);
    } else {
      add(false, `${location}.${runner} normative registry may not use unknown`);
    }
    add(signature(cell) === expected, `${location}.${runner} exact tuple`);
  }

  for (const profile of PROFILES) {
    add(exactKeys(candidate.profiles?.[profile], PHASES), `${profile} phases`);
    for (const phase of PHASES) {
      const pair = candidate.profiles?.[profile]?.[phase];
      add(exactKeys(pair, RUNNERS), `${profile}.${phase} runner cells`);
      const expected = EXPECTED_PROFILES[`${profile}.${phase}`];
      for (const [index, runner] of RUNNERS.entries()) validateCell(pair?.[runner], runner, `${profile}.${phase}`, expected[index]);
      add(pair?.codex?.state === "unavailable" || phase !== "advisory", `${profile}.advisory Codex unavailable`);
    }
  }

  for (const duty of DUTIES) {
    const pair = candidate.duties?.[duty];
    add(exactKeys(pair, RUNNERS), `${duty} runner cells`);
    for (const [index, runner] of RUNNERS.entries()) validateCell(pair?.[runner], runner, duty, EXPECTED_DUTIES[duty][index]);
  }

  add(!JSON.stringify(candidate).includes("effectiveModel"), "registry must not assert effective model identity");
  return errors;
}

function validateSchemas(user, usage, binding) {
  const errors = [];
  const add = (ok, message) => { if (!ok) errors.push(message); };

  add(user.$id === "pipeline.user.v2", "pipeline.user.v2 id");
  add(usage.$id === "pipeline.runner-usage.v1", "pipeline.runner-usage.v1 id");
  add(binding.$id === "pipeline.usage-route-binding.v1", "pipeline.usage-route-binding.v1 id");
  for (const [name, schema] of [["user", user], ["usage", usage], ["binding", binding]]) {
    add(schema.type === "object" && schema.additionalProperties === false, `${name} schema root closed`);
  }

  const top = ["schema", "setup", "identity", "platform", "release", "language", "agent_runtime", "runners", "routing", "usage", "autonomy", "gates"];
  const requiredTop = ["schema", "language", "agent_runtime", "runners", "routing", "usage", "autonomy", "gates"];
  add(exactKeys(user.properties, top), "user exact top-level keys");
  add(sameMembers(user.required ?? [], requiredTop), "user exact required top-level keys");
  add(user.properties?.schema?.const === user.$id, "user instance/schema id agreement");
  add(user.properties?.usage?.additionalProperties === false && exactKeys(user.properties.usage.properties, ["common_projection", "raw_persistence"]), "user no-sink usage block");
  add(user.properties?.usage?.properties?.common_projection?.const === usage.$id, "user usage schema reference");
  add(user.properties?.usage?.properties?.raw_persistence?.const === "none", "user raw persistence disabled");

  const profileSchema = user.properties?.routing?.properties?.profiles;
  const dutySchema = user.properties?.routing?.properties?.duties;
  add(exactKeys(profileSchema?.properties, PROFILES) && sameMembers(profileSchema?.required ?? [], PROFILES) && profileSchema?.additionalProperties === false, "schema profile registry");
  add(exactKeys(dutySchema?.properties, DUTIES) && sameMembers(dutySchema?.required ?? [], DUTIES) && dutySchema?.additionalProperties === false, "schema duty registry");
  add(exactKeys(user.$defs?.profile?.properties, PHASES) && sameMembers(user.$defs?.profile?.required ?? [], PHASES) && user.$defs?.profile?.additionalProperties === false, "schema phase registry");
  add(exactKeys(user.$defs?.runnerPair?.properties, RUNNERS) && sameMembers(user.$defs?.runnerPair?.required ?? [], RUNNERS) && user.$defs?.runnerPair?.additionalProperties === false, "schema runner cells");
  add(sameMembers(user.$defs?.claudeCell?.properties?.state?.enum ?? [], STATES), "schema state registry");
  add((user.$defs?.claudeCell?.oneOf ?? []).length === 6 && (user.$defs?.codexCell?.oneOf ?? []).length === 6, "schema conditional state shapes");
  add(user.$defs?.codexAdvisoryCell?.properties?.state?.const === "unavailable" && user.$defs?.codexAdvisoryCell?.additionalProperties === false, "schema forbids Codex Advisor substitution");
  add(user.$defs?.selectorCodex?.oneOf?.[0]?.properties?.value?.const === "gpt-5.6-sol" && user.$defs?.selectorCodex?.oneOf?.[1]?.properties?.value?.const === "gpt-5.6-terra", "schema Codex selector registry");

  add(usage.properties?.schema?.const === usage.$id, "usage instance/schema id agreement");
  add(exactKeys(usage.properties, ["schema", "runner", "source", "scope", "route", "raw", "common"]), "usage exact root keys/no durable sink");
  add(exactKeys(usage.properties?.common?.properties, METRICS) && sameMembers(usage.properties?.common?.required ?? [], METRICS) && usage.properties?.common?.additionalProperties === false, "usage metric registry");
  const sourceKinds = [usage.$defs?.claudeTurnSource?.properties?.kind?.const, usage.$defs?.codexTurnSource?.properties?.kind?.const, usage.$defs?.workspaceAggregateSource?.properties?.kind?.const];
  const scopeKinds = [usage.$defs?.turnScope?.properties?.kind?.const, usage.$defs?.sessionScope?.properties?.kind?.const, usage.$defs?.workspaceAggregateScope?.properties?.kind?.const];
  add(sameMembers(sourceKinds, SOURCES), "usage source registry");
  add(sameMembers(scopeKinds, SCOPES), "usage scope registry");
  add((usage.oneOf ?? []).length === 4, "usage exact source/scope pair registry");
  add(usage.$defs?.rawUsageObject?.type === "object" && usage.$defs?.rawUsageNode?.oneOf?.[0]?.type === "number" && usage.$defs?.rawUsageNode?.oneOf?.[1]?.type === "object", "raw numeric usage-subobject boundary");
  add(usage.$defs?.estimatedCell?.properties?.status?.const === "estimated" && usage.$defs?.billedMetric?.oneOf?.every((entry) => entry.$ref !== "#/$defs/estimatedCell"), "estimated and billed cost stay distinct");
  const statusDefs = ["observedCell", "estimatedCell", "unknownCell", "unavailableCell", "inapplicableCell"].map((key) => usage.$defs?.[key]?.properties?.status?.const);
  add(sameMembers(statusDefs, ["observed", "estimated", "unknown", "unavailable", "inapplicable"]), "usage status registry");

  add(binding.properties?.schema?.const === binding.$id, "binding instance/schema id agreement");
  add(exactKeys(binding.properties, ["schema", "dispatchId", "threadId", "turnId", "cell", "candidateCommit", "candidateTree", "usageEventSha256"]), "binding exact fields");
  add((binding.properties?.cell?.oneOf ?? []).length === 2, "binding duty/profile-phase union");
  add(exactKeys(binding.properties?.cell?.oneOf?.[0]?.properties, ["kind", "dutyId"]) && exactKeys(binding.properties?.cell?.oneOf?.[1]?.properties, ["kind", "profileId", "phaseId"]), "binding inseparable cell shapes");
  add(sameMembers(binding.properties?.cell?.oneOf?.[0]?.properties?.dutyId?.enum ?? [], DUTIES), "binding duty registry");
  add(sameMembers(binding.properties?.cell?.oneOf?.[1]?.properties?.profileId?.enum ?? [], PROFILES) && sameMembers(binding.properties?.cell?.oneOf?.[1]?.properties?.phaseId?.enum ?? [], PHASES), "binding profile-phase registry");
  add(usage.$defs?.boundCodexRoute?.properties?.binding?.$ref === "usage-route-binding.schema.json", "usage references binding facade");
  add(exactKeys(usage.$defs?.receiptReference?.properties, ["schema", "repoRelativePath", "sha256", "resultSha256", "routeEvidenceSha256"]), "receipt/result/route-evidence digests stay distinct");
  add(binding.properties?.usageEventSha256 && !binding.properties?.resultSha256 && !binding.properties?.routeEvidenceSha256, "usage-event digest does not mutate receipt semantics");
  return errors;
}

let passed = 0;
const failures = [];
function record(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

const committedRegistryErrors = validateRegistry(registry);
const committedSchemaErrors = validateSchemas(userSchema, usageSchema, bindingSchema);
record("committed registry is complete and exact", committedRegistryErrors.length === 0, committedRegistryErrors.join(", "));
record("committed schemas are closed and aligned", committedSchemaErrors.length === 0, committedSchemaErrors.join(", "));
const missingSpdxHeaders = P3B_OWNED_MODULES.filter((path) => !hasSpdxHeader(path));
record("P3B-owned modules carry exact SPDX headers", missingSpdxHeaders.length === 0, missingSpdxHeaders.join(", "));

{
  const value = clone(registry);
  delete value.profiles.design.design_phase.codex;
  record("missing runner cell is rejected", validateRegistry(value).length > 0);
}
{
  const value = clone(registry);
  value.duties.extra_duty = clone(value.duties.implement);
  record("extra duty cell is rejected", validateRegistry(value).length > 0);
}
{
  const value = clone(registry);
  value.profiles.feature.execution_phase.codex.selector = { kind: "alias", value: "terra" };
  record("prior alias:terra selector is rejected", validateRegistry(value).length > 0);
}
{
  const value = clone(registry);
  value.duties.critic_high_risk.codex.effort = "high";
  record("wrong Sol effort pair is rejected", validateRegistry(value).length > 0);
}
{
  const value = clone(registry);
  value.duties.implement.codex.effort = "max";
  record("wrong Terra effort pair is rejected", validateRegistry(value).length > 0);
}
{
  const value = clone(registry);
  value.profiles.feature.advisory.codex = clone(value.duties.critic_normal.codex);
  record("Codex Advisor substitution is rejected", validateRegistry(value).length > 0);
}
{
  const value = clone(registry);
  value.duties.implement.codex.effectiveModelId = "provider-model-guess";
  record("asserted Terra effective model is rejected", validateRegistry(value).length > 0);
}
{
  const value = clone(userSchema);
  value.additionalProperties = true;
  record("non-closed schema root is rejected", validateSchemas(value, usageSchema, bindingSchema).length > 0);
}
{
  const value = clone(usageSchema);
  delete value.properties.common.properties.cachedInputTokens;
  record("missing common metric is rejected", validateSchemas(userSchema, value, bindingSchema).length > 0);
}
{
  const source = clone(usageSchema);
  source.$defs.codexTurnSource.properties.kind.const = "codex-guessed-usage";
  const scope = clone(usageSchema);
  scope.$defs.sessionScope.properties.kind.const = "conversation";
  record("wrong source or scope registry is rejected", validateSchemas(userSchema, source, bindingSchema).length > 0 && validateSchemas(userSchema, scope, bindingSchema).length > 0);
}
{
  const value = clone(userSchema);
  value.$defs.claudeCell.properties.state.enum.pop();
  record("missing capability state is rejected", validateSchemas(value, usageSchema, bindingSchema).length > 0);
}
{
  const value = clone(bindingSchema);
  value.$id = "pipeline.usage-route-binding.v2";
  record("divergent schema id is rejected", validateSchemas(userSchema, usageSchema, value).length > 0);
}

const total = passed + failures.length;
console.log(`\n${passed}/${total} cases passed.`);
if (failures.length) {
  console.log("Failures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
process.exit(0);
