#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Claude PreToolUse adapter for a dispatch-bound Advisor prohibition.
 *
 * The shared policy binds the exact canonical MP-26 line at dispatch time to
 * Claude's parent tool-use id and child role. This hook denies only when the
 * current Claude child resolves back to that binding. An orchestrator, a child
 * without the binding, or another runner's unmeasured payload remains outside
 * this rule. Existing advisory demand, consent, candidate, route and evidence
 * gates remain separate and mandatory; an allow here is never advisory
 * authorization.
 *
 * The attempted Advisor question is deliberately neither read nor logged.
 * A denial writes one content-free private record below the git common dir
 * before returning exit 2, so no model effect can start first.
 */
import { readFileSync } from "node:fs";

import {
  ADVISOR_PROHIBITION_DENIAL_CODE,
  ADVISOR_PROHIBITION_LINE,
  persistAdvisorProhibitionAudit,
  resolvePendingAdvisorProhibitionBinding,
} from "../lib/advisor-prohibition-binding.mjs";
import { classifyDispatchBudgetCaller } from "../lib/dispatch-budget-core.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { resolveGitCommonDir, resolveParentDispatchToolUseId } from "./guard-dispatch-budget.mjs";

function verdict(exitCode, stderr = "") {
  return { exitCode, stderr };
}

function claudeChildIdentity(input) {
  const object = input !== null && typeof input === "object";
  const agentIdPresent = object && Object.hasOwn(input, "agent_id");
  const agentTypePresent = object && Object.hasOwn(input, "agent_type");
  return classifyDispatchBudgetCaller({
    agentIdPresent,
    agentId: agentIdPresent ? input.agent_id : undefined,
    agentTypePresent,
    agentType: agentTypePresent ? input.agent_type : undefined,
  });
}

export function evaluateAdvisorProhibitionGuard(input, options = {}) {
  if (String(input?.tool_name ?? "").toLowerCase() !== "advisor") return verdict(0);
  const identity = claudeChildIdentity(input);
  if (identity.kind !== "subagent") return verdict(0);
  const rootDir = options.rootDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const commonDir = (options.resolveGitCommonDirFn ?? resolveGitCommonDir)(rootDir, options);
  if (commonDir === null) return verdict(0);
  const parent = (options.resolveParentDispatchToolUseIdFn ?? resolveParentDispatchToolUseId)(input, identity, options);
  if (parent.status !== "prepared") return verdict(0);
  const resolved = (options.resolvePendingAdvisorProhibitionBindingFn ?? resolvePendingAdvisorProhibitionBinding)({
    commonDir,
    toolUseId: parent.toolUseId,
    agentType: identity.agentType,
  }, options);
  if (resolved.status !== "bound" || resolved.binding.disposition !== "prohibited") return verdict(0);
  const audit = (options.persistAdvisorProhibitionAuditFn ?? persistAdvisorProhibitionAudit)({
    commonDir,
    agentId: identity.agentId,
    agentType: identity.agentType,
    parentToolUseId: parent.toolUseId,
    callToolUseId: input?.tool_use_id ?? input?.toolUseId,
    promptSha256: resolved.binding.promptSha256,
    occurredAt: (options.nowFn ?? (() => new Date().toISOString()))(),
  }, options);
  if (audit.status !== "recorded") {
    return verdict(2, `BLOCKED (guard-advisor-prohibition, plugin pipeline-core): ${audit.code}: the bound Advisor prohibition applies, but its private denial audit could not be persisted.\n`);
  }
  return verdict(
    2,
    `BLOCKED (guard-advisor-prohibition, plugin pipeline-core): ${ADVISOR_PROHIBITION_DENIAL_CODE}: this exact child dispatch is bound to “${ADVISOR_PROHIBITION_LINE}” (MP-26). The denied attempt was recorded privately without its question.\n`,
  );
}

if (isDirectInvocation(import.meta.url)) {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); }
  catch { process.exit(0); }
  const result = evaluateAdvisorProhibitionGuard(input);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
