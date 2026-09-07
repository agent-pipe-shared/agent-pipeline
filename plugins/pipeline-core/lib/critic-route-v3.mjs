// SPDX-License-Identifier: SUL-1.0

/** Resolve the selected Codex high-risk Critic route from V3 project authority. */
import { execFileSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";

import { validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { parseYaml } from "./yaml-lite.mjs";

const DUTY_ID = "critic_high_risk";

function fail(message) { throw new Error(`V3 Critic route authority is invalid: ${message}`); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
}

/**
 * Reads one V3 duty cell only after the complete project authority validates
 * against the frozen registry. This is source/duty resolution only; callers
 * retain their duty-specific availability and transport rules.
 */
export function resolveV3DutyRoute({
  rootDir, dutyId, runner, candidateCommit = null,
  readCandidateSource = ({ rootDir: root, candidateCommit: commit }) => execFileSync("git", ["show", `${commit}:pipeline.user.yaml`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  parse = parseYaml, validate = validatePipelineUserV3,
} = {}) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)) fail("repository root is unavailable");
  if (typeof dutyId !== "string" || dutyId.length === 0 || typeof runner !== "string" || runner.length === 0) fail("duty lookup is invalid");
  if (candidateCommit !== null && !/^[a-f0-9]{40}$/.test(candidateCommit)) fail("candidate commit is invalid");
  let intent;
  let source;
  try {
    source = candidateCommit === null
      ? execFileSync("git", ["show", "HEAD:pipeline.user.yaml"], { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      : readCandidateSource({ rootDir, candidateCommit });
    intent = parse(source);
  }
  catch { fail("pipeline.user.yaml is unreadable"); }
  const sourceLabel = candidateCommit === null ? join(rootDir, "pipeline.user.yaml@HEAD") : `${candidateCommit}:pipeline.user.yaml`;
  const validated = validate(intent, { source: sourceLabel });
  if (!validated?.ok) fail("pipeline.user.yaml did not pass V3 validation");

  const cell = intent?.routing?.duties?.[dutyId]?.[runner];
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) fail("requested duty route is unavailable");
  exactKeys(cell.selector, ["kind", "value"], "requested duty selector");
  if (typeof cell.state !== "string" || cell.selector.kind !== "model-id" || typeof cell.selector.value !== "string" || cell.selector.value.length === 0
    || typeof cell.effort !== "string" || cell.effort.length === 0) fail("requested duty route is unavailable");
  return Object.freeze({ dutyId, runner, model: cell.selector.value, effort: cell.effort, state: cell.state, sourceSha256: sha256(source), candidateCommit });
}

/** Resolve the selected high-risk Codex Critic from the generic V3 duty source. */
export function resolveCriticHighRiskRoute(options = {}) {
  const route = resolveV3DutyRoute({ ...options, dutyId: DUTY_ID, runner: "codex" });
  if (route.state !== "default") fail("Codex high-risk Critic duty is unavailable");
  return Object.freeze({ dutyId: route.dutyId, runner: route.runner, model: route.model, effort: route.effort, sourceSha256: route.sourceSha256, candidateCommit: route.candidateCommit });
}

/** Validate an injected route without permitting an unbound route shape. */
export function validateCriticHighRiskRoute(route) {
  exactKeys(route, ["dutyId", "runner", "model", "effort", "sourceSha256", "candidateCommit"], "resolved Codex high-risk Critic route");
  if (route.dutyId !== DUTY_ID || route.runner !== "codex" || typeof route.model !== "string" || route.model.length === 0
    || typeof route.effort !== "string" || route.effort.length === 0 || !/^[a-f0-9]{64}$/.test(route.sourceSha256)
    || (route.candidateCommit !== null && !/^[a-f0-9]{40}$/.test(route.candidateCommit))) fail("resolved Codex high-risk Critic route is unavailable");
  return Object.freeze({ ...route });
}
