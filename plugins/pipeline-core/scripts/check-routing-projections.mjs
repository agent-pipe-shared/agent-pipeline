#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../lib/yaml-lite.mjs";
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

export function checkRepository(root = DEFAULT_ROOT) {
  const findings = [];
  const user = parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8"));
  if (user.schema !== "pipeline.user.v1") findings.push("pipeline.user.yaml v1 schema missing");
  const direct = validateDirectRouting(user.routing);
  if (!direct.ok) findings.push("pipeline.user.yaml direct routing invalid");

  const manifestText = readFileSync(join(root, ".claude", "pipeline.yaml"), "utf8");
  const manifest = parseYaml(manifestText);
  if (direct.ok && !directManifestProjectionMatches(manifest.modelRouting, user.routing)) findings.push(".claude/pipeline.yaml Claude modelRouting drift");
  if (direct.ok && !runnerRouteProjectionMatches(manifest.runnerRoutes, user.routing)) findings.push(".claude/pipeline.yaml runnerRoutes drift");
  if (!hasCurrentProvenance(manifestText, "claude") || !hasCurrentProvenance(manifestText, "codex")) findings.push(".claude/pipeline.yaml routing provenance drift");

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
  console.log("Direct v1 routing projections current; Claude compatibility is stable and Codex Terra remains an unresolved alias until a route receipt attests it.");
}
