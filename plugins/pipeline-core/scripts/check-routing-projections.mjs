#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../lib/yaml-lite.mjs";
import { validatePipelineUserV2 } from "../lib/runner-profiles-v2.mjs";
import { planRuntimeProjectionV2, readRuntimeProjectionV2Baselines } from "../lib/runtime-projection-v2.mjs";
import { validatePipelineUserV3 } from "../lib/runner-profiles-v3.mjs";
import { planRuntimeProjectionV3, readRuntimeProjectionV3Baselines } from "../lib/runtime-projection-v3.mjs";
import {
  ROUTING_AUTHORITY,
  expectedProviderForRunner,
  projectClaudeManifestRouting,
  projectDirectRoutingDefaults,
  projectAgentFrontmatter,
  projectHostDuty,
  projectManifestRouting,
  projectRunnerAssignment,
  projectRunnerRoutes,
  resolveRunnerAlias,
  routingProvenance,
  validateDirectRouting,
} from "../lib/routing-projection.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = join(HERE, "..", "..", "..");

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function manifestProjectionMatches(actual, worktypes, models) {
  return same(actual, projectManifestRouting(worktypes, models));
}

export function directManifestProjectionMatches(actual, routing) {
  return same(actual, projectClaudeManifestRouting(routing));
}

export function runnerRouteProjectionMatches(actual, routing) {
  return same(actual, projectRunnerRoutes(routing));
}

export function hasCurrentProvenance(text, runner = "claude") {
  return text.includes(routingProvenance(runner));
}

function frontmatterValue(text, key) {
  const end = text.indexOf("\n---", 4);
  const head = end === -1 ? text : text.slice(0, end);
  const match = head.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  return match?.[1] ?? null;
}

/**
 * The v2 source is authoritative only through I2's frozen projection plan.
 * This check is read-only and rejects drift; it never falls back to the v1
 * compiler or treats a requested selector as effective-model evidence.
 */
export function checkV2RuntimeProjection(root, user) {
  const findings = [];
  const validation = validatePipelineUserV2(user, { source: "pipeline.user.yaml" });
  if (!validation.ok) {
    findings.push("pipeline.user.yaml v2 schema or registry validation failed");
    return findings;
  }
  let plan;
  try {
    plan = planRuntimeProjectionV2(user, {
      source: "pipeline.user.yaml",
      baselines: readRuntimeProjectionV2Baselines(root),
    });
  } catch (error) {
    findings.push(`pipeline.user.yaml v2 runtime baselines unreadable: ${error.message}`);
    return findings;
  }
  if (plan.status !== "ready") {
    findings.push(`pipeline.user.yaml v2 runtime projection is ${plan.status}`);
    return findings;
  }
  for (const target of plan.targets) {
    if (target.changed) findings.push(`${target.path} v2 owned projection drift`);
  }
  return findings;
}

/**
 * V3 projects only the declared runtime-owned bytes. In particular, Claude
 * receives advisor_epic/advisor_feature compatibility routes and Codex
 * advisory is projected as the complete V3-owned consult-advisor agent.
 */
export function checkV3RuntimeProjection(root, user) {
  const findings = [];
  const validation = validatePipelineUserV3(user, { source: "pipeline.user.yaml" });
  if (!validation.ok) {
    findings.push("pipeline.user.yaml V3 schema or registry validation failed");
    return findings;
  }
  let plan;
  try {
    plan = planRuntimeProjectionV3(user, {
      source: "pipeline.user.yaml",
      baselines: readRuntimeProjectionV3Baselines(root),
    });
  } catch (error) {
    findings.push(`pipeline.user.yaml V3 runtime baselines unreadable: ${error.message}`);
    return findings;
  }
  if (plan.status !== "ready") {
    findings.push(`pipeline.user.yaml V3 runtime projection is ${plan.status}`);
    return findings;
  }
  for (const target of plan.targets) {
    if (target.changed) findings.push(`${target.path} V3 owned projection drift`);
  }
  const claude = plan.targets.find((target) => target.path === ".claude/pipeline.yaml");
  const routeKeys = new Set((claude?.routes ?? []).map((route) => route.targetKey));
  if (!routeKeys.has("advisor_epic") || !routeKeys.has("advisor_feature") || routeKeys.has("advisor_mini")) {
    findings.push("V3 Claude advisory compatibility projection drift");
  }
  const advisor = plan.targets.find((target) => target.path === ".codex/agents/consult-advisor.toml");
  const expectedAdvisor = [
    'name = "consult-advisor"',
    'description = "Fresh independent read-only advisor; answer one supplied question with repository evidence only."',
    'model = "gpt-5.6-sol"',
    'model_reasoning_effort = "max"',
    'developer_instructions = "Use fresh context and answer exactly one supplied question. Read-only sandbox only: no chat, handover, memory, mutation, persistence, auto-apply, or gate decisions; no separate network tool or third-party export. Report evidence and insufficiency without claiming unobserved model identity or OS isolation."',
    'sandbox_mode = "read-only"',
    "",
  ].join("\n");
  if (!advisor || advisor.after.bytes !== expectedAdvisor || advisor.route?.cell?.dutyId !== "advisory") {
    findings.push("V3 Codex advisor custom-agent projection drift");
  }
  return findings;
}

export function checkRepository(root = DEFAULT_ROOT) {
  const findings = [];
  const user = parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8"));
  if (user.schema === "pipeline.user.v3") {
    findings.push(...checkV3RuntimeProjection(root, user));
  } else if (user.schema === "pipeline.user.v2") {
    findings.push(...checkV2RuntimeProjection(root, user));
  } else {
    if (user.schema !== "pipeline.user.v1") findings.push("pipeline.user.yaml v1 schema missing");
    const direct = validateDirectRouting(user.routing);
    if (!direct.ok) findings.push("pipeline.user.yaml direct routing invalid");

    const manifestText = readFileSync(join(root, ".claude", "pipeline.yaml"), "utf8");
    const manifest = parseYaml(manifestText);
    if (direct.ok && !directManifestProjectionMatches(manifest.modelRouting, user.routing)) findings.push(".claude/pipeline.yaml Claude modelRouting drift");
    if (direct.ok && !runnerRouteProjectionMatches(manifest.runnerRoutes, user.routing)) findings.push(".claude/pipeline.yaml runnerRoutes drift");
    if (!hasCurrentProvenance(manifestText, "claude") || !hasCurrentProvenance(manifestText, "codex")) findings.push(".claude/pipeline.yaml routing provenance drift");
  }

  for (const [path, assignment] of Object.entries(projectAgentFrontmatter())) {
    const text = readFileSync(join(root, path), "utf8");
    if (frontmatterValue(text, "model") !== assignment.model) findings.push(`${path} model drift`);
    if (frontmatterValue(text, "effort") !== assignment.effort) findings.push(`${path} effort drift`);
  }

  for (const [path, assignment] of Object.entries(ROUTING_AUTHORITY.dispatchBoundAgents)) {
    const text = readFileSync(join(root, path), "utf8");
    if (frontmatterValue(text, "model") !== assignment.model) findings.push(`${path} must stay dispatch-bound`);
    if (frontmatterValue(text, "effort") !== assignment.effort) findings.push(`${path} effort drift`);
  }

  if (ROUTING_AUTHORITY.dispatchProfiles?.light?.ceremonyOnly !== true) {
    findings.push("light dispatch must remain ceremony-only");
  }

  return { ok: findings.length === 0, findings };
}

export function checkCodexPartialMappingContract() {
  const efforts = ["low", "medium", "high", "xhigh", "max"];
  const findings = [];
  for (const effort of efforts) {
    const resolved = projectRunnerAssignment("codex", { model: "fable", effort });
    if (resolved.model !== "gpt-5.6-sol" || resolved.effort !== effort) {
      findings.push(`Codex Fable binding drift at effort ${effort}`);
    }
  }
  if (expectedProviderForRunner("codex") !== "openai") {
    findings.push("Codex provider binding drift");
  }
  if (expectedProviderForRunner("claude") !== "anthropic") {
    findings.push("Claude provider binding drift");
  }
  try {
    resolveRunnerAlias("codex", "unknown", "high");
    findings.push("Codex unknown alias did not fail closed");
  } catch {
    // Expected: the public projection must not invent an unsupported Codex identity.
  }
  return { ok: findings.length === 0, findings };
}

export function checkCodexNormalCriticDuty() {
  const findings = [];
  try {
    const route = projectHostDuty("criticNormal", "codex");
    if (route.model !== "gpt-5.6-sol") findings.push("Codex normal Critic model drift");
    if (route.effort !== "xhigh") findings.push("Codex normal Critic effort drift");
    if (route.dispatch !== "host-native") findings.push("Codex normal Critic must remain host-native");
  } catch (error) {
    findings.push(`Codex normal Critic duty unavailable: ${error.message}`);
  }
  return { ok: findings.length === 0, findings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const repository = checkRepository();
  const codex = checkCodexPartialMappingContract();
  const normalCritic = checkCodexNormalCriticDuty();
  const findings = [...repository.findings, ...codex.findings, ...normalCritic.findings];
  if (findings.length > 0) {
    for (const finding of findings) console.error(`FAIL ${finding}`);
    process.exit(2);
  }
  console.log("Routing projections current for the configured source version; requested selectors remain separate from effective-model evidence.");
}
