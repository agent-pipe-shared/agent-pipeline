// SPDX-License-Identifier: SUL-1.0
// Guard module "bootstrap-receipt" (layer 2), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveGitCommonDir, subagentIdentity } from "../../hooks/guard-dispatch-budget.mjs";
import { RUNTIME_AGENT_ID, RUNTIME_AGENT_TYPE, START_PREFLIGHT_SCRIPT } from "./constants.mjs";
import { verdict } from "./verdict.mjs";

/**
 * NVA-BOOTRECEIPT-1: the private, agent-write-refused tree a dispatched subagent's
 * sanctioned preflight run is recorded into. Never a tracked or agent-writable path --
 * writes under `.git/agent-pipeline/**` are already refused as pipeline-owned private
 * state (guard-testpath.mjs / the cross-repository-mutation checks in this same file),
 * so a subagent cannot forge its own receipt.
 */
function bootstrapReceiptDir(commonDir) {
  return join(commonDir, "agent-pipeline", "bootstrap-receipt");
}

// The live PreToolUse payload identifies dispatched callers with agent_id and
// agent_type while retaining the parent's transcript path. Keep the sibling
// budget resolver untouched: this local adapter changes only lifecycle receipt
// and denial-trim consumers, and delegates every legacy shape to it unchanged.
export function lifecycleSubagentIdentity(input, dependencies) {
  const legacy = (dependencies.subagentIdentityFn ?? subagentIdentity)(input, dependencies);
  // A present malformed transcript path remains fail-closed even when a
  // runtime key pair is also present; runtime keys must not mask that legacy
  // authority-bearing fault.
  if (legacy.kind === "invalid-identity") return legacy;
  const hasAgentId = Object.hasOwn(input ?? {}, "agent_id");
  const hasAgentType = Object.hasOwn(input ?? {}, "agent_type");
  if (!hasAgentId && !hasAgentType) return legacy;
  if (typeof input?.agent_id !== "string" || !RUNTIME_AGENT_ID.test(input.agent_id)
    || typeof input?.agent_type !== "string" || !RUNTIME_AGENT_TYPE.test(input.agent_type)) {
    return {
      kind: "unresolved",
      reason: "runtime-agent-identity-invalid",
    };
  }
  return { kind: "subagent", agentId: input.agent_id, agentType: input.agent_type };
}

function bootstrapReceiptPath(commonDir, agentId) {
  return join(bootstrapReceiptDir(commonDir), `${agentId}.json`);
}

function bootstrapObservationsPath(commonDir) {
  return join(bootstrapReceiptDir(commonDir), "observations.jsonl");
}

/**
 * NVA-BOOTRECEIPT-1: append-only, best-effort observability for this feature's own
 * decisions -- mirrors guard-dispatch-budget.mjs's recordUnresolved() (that module's own
 * lines 96-106/248-290, the fail-open-but-visible model this feature follows). A logging
 * failure must never change the verdict already decided; the catch here is deliberately
 * silent for exactly that reason.
 */
function recordBootstrapObservation(commonDir, record, dependencies) {
  try {
    const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
    const appendFileSyncFn = dependencies.appendFileSyncFn ?? appendFileSync;
    mkdirSyncFn(bootstrapReceiptDir(commonDir), { recursive: true, mode: 0o700 });
    appendFileSyncFn(bootstrapObservationsPath(commonDir), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // best-effort observability only -- never let a logging failure change the guard's verdict
  }
}

/**
 * NVA-BOOTRECEIPT-1: writes the one durable proof that a dispatched subagent's process
 * ran the sanctioned preflight command in this session -- and nothing stronger. This
 * proves the process ran for this agentId; it does NOT and cannot prove the agent read or
 * understood the preflight result (that obligation stays the agent's own, validated --
 * never executed on the agent's behalf -- per skills/pipeline-start/SKILL.md:20-27).
 * Fires only for a Bash call whose parsed command is EXACTLY the sanctioned preflight
 * invocation (isSanctionedStartPreflightInvocation, reusing isSanctionedLifecycleCommand's
 * own START_PREFLIGHT_SCRIPT recognition, never a looser match) from a resolved dispatched
 * subagent. A pure side effect: it never changes the verdict for the Bash call that
 * triggered it, which the unmodified logic elsewhere in this file already decides.
 * Fails open silently when no git common dir is resolvable (nowhere safe to persist or
 * record); fails open WITH an observation line for every other unresolvable branch.
 */
export function recordBootstrapPreflightReceipt(input, root, dependencies) {
  const identity = lifecycleSubagentIdentity(input, dependencies);
  if (identity.kind !== "subagent") return;
  const commonDir = (dependencies.resolveGitCommonDirFn ?? resolveGitCommonDir)(root, dependencies);
  if (commonDir === null) return; // nowhere safe to persist or record -- fail open, silently
  const nowFn = dependencies.nowFn ?? (() => new Date().toISOString());
  try {
    const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
    const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
    mkdirSyncFn(bootstrapReceiptDir(commonDir), { recursive: true, mode: 0o700 });
    const receipt = {
      schema: "pipeline.bootstrap-receipt.v1",
      agentId: identity.agentId,
      agentType: identity.agentType,
      observedAt: nowFn(),
    };
    writeFileSyncFn(bootstrapReceiptPath(commonDir, identity.agentId), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  } catch (error) {
    recordBootstrapObservation(commonDir, {
      agentId: identity.agentId,
      agentType: identity.agentType,
      decision: "fail-open-receipt-write-error",
      toolName: "Bash",
      error: String(error?.message ?? error),
      at: nowFn(),
    }, dependencies);
  }
}

function bootstrapReceiptMissingBlocked(identity, toolName) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-BOOTSTRAP-RECEIPT-MISSING: "
      + `This dispatched subagent (${identity.agentType}, agent ${identity.agentId}) has no recorded `
      + `bootstrap preflight run in this session, so its first ${toolName} is refused.\n`
      + `Run exactly: node "${START_PREFLIGHT_SCRIPT}"\n`
      + "Then retry the identical write once that command has completed.\n",
  );
}

/**
 * NVA-BOOTRECEIPT-1: denies a dispatched subagent's first Edit/Write/NotebookEdit while no
 * bootstrap-preflight receipt exists for its agentId. Returns `null` to allow (the caller
 * falls through to every other existing check, unchanged); returns a verdict(2, ...) only
 * for a resolved subagent with no readable receipt. Never reached for the orchestrator --
 * the caller filters `identity.kind === "orchestrator"` before this runs, so the
 * orchestrating session is never gated and never logged, whatever the receipt state.
 * Fails open -- allow, plus an observation line wherever a common dir is resolvable -- on
 * every branch this gate cannot resolve, exactly like guard-dispatch-budget.mjs's own
 * model: a guard that fails closed on its own confusion would halt every dispatch in the
 * repository.
 */
export function evaluateBootstrapReceiptGate(input, root, toolName, dependencies) {
  const identity = lifecycleSubagentIdentity(input, dependencies);
  if (identity.kind === "orchestrator") return null;
  const commonDir = (dependencies.resolveGitCommonDirFn ?? resolveGitCommonDir)(root, dependencies);
  if (commonDir === null) return null; // nowhere safe to persist or record -- fail open, silently
  const nowFn = dependencies.nowFn ?? (() => new Date().toISOString());
  if (identity.kind === "unresolved") {
    recordBootstrapObservation(commonDir, {
      ...identity, decision: "fail-open-unresolved-identity", toolName, at: nowFn(),
    }, dependencies);
    return null;
  }
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const receiptPath = bootstrapReceiptPath(commonDir, identity.agentId);
  let receiptExists;
  try {
    receiptExists = existsSyncFn(receiptPath);
  } catch (error) {
    recordBootstrapObservation(commonDir, {
      agentId: identity.agentId,
      agentType: identity.agentType,
      decision: "fail-open-error",
      toolName,
      error: String(error?.message ?? error),
      at: nowFn(),
    }, dependencies);
    return null;
  }
  if (receiptExists) {
    try {
      JSON.parse(readFileSyncFn(receiptPath, "utf8"));
    } catch (error) {
      recordBootstrapObservation(commonDir, {
        agentId: identity.agentId,
        agentType: identity.agentType,
        decision: "fail-open-unreadable-receipt",
        toolName,
        error: String(error?.message ?? error),
        at: nowFn(),
      }, dependencies);
      return null;
    }
    recordBootstrapObservation(commonDir, {
      agentId: identity.agentId, agentType: identity.agentType, decision: "allow-receipt-present", toolName, at: nowFn(),
    }, dependencies);
    return null;
  }
  recordBootstrapObservation(commonDir, {
    agentId: identity.agentId, agentType: identity.agentType, decision: "deny-no-receipt", toolName, at: nowFn(),
  }, dependencies);
  return bootstrapReceiptMissingBlocked(identity, toolName);
}
