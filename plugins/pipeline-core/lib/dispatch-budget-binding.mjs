// SPDX-License-Identifier: SUL-1.0

import { createHash, randomUUID } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  CLOSING_ALLOWANCE,
  SAFETY_MARGIN,
  dispatchWorkingCap,
  effectiveDispatchBaseCap,
} from "./dispatch-budget-core.mjs";

export const DISPATCH_BUDGET_BINDING_SCHEMA = "pipeline.dispatch-budget-binding.v1";

const LABEL = /^\s*-\s*(?:\*\*)?Tool budget(?:\s*\([^\n)]*\))?\s*:\s*(?:\*\*)?\s*(.*)$/iu;
const VALUE = /^(?:≤|<=)?\s*([^\s]+)\s+tool uses\b/iu;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const PENDING_SCHEMA = "pipeline.pending-dispatch-budget-binding.v1";

function result(status, code, extra = {}) {
  return Object.freeze({ schema: DISPATCH_BUDGET_BINDING_SCHEMA, status, code, ...extra });
}

/**
 * Parse and bind the one first-class tool-budget metadata line of a dispatch.
 * Applicability is explicit so a caller cannot silently fabricate a cap for a
 * role whose template has not adopted this contract yet.
 */
export function bindDispatchBudget({ prompt, maxTurns, applicable } = {}) {
  if (applicable !== true) {
    return result("not-applicable", "DBB-NOT-APPLICABLE", { applicable: false });
  }
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= CLOSING_ALLOWANCE + SAFETY_MARGIN) {
    return result("rejected", "DBB-TIER-INCOMPATIBLE", { applicable: true });
  }
  const lines = typeof prompt === "string" ? prompt.split(/\r?\n/u) : [];
  const candidates = lines.map((line) => LABEL.exec(line)).filter((match) => match !== null);
  if (candidates.length === 0) {
    return result("rejected", "DBB-BASE-CAP-MISSING", { applicable: true });
  }
  if (candidates.length !== 1) {
    return result("rejected", "DBB-BASE-CAP-AMBIGUOUS", { applicable: true });
  }
  const value = VALUE.exec(candidates[0][1]);
  if (value === null || !DECIMAL.test(value[1])) {
    return result("rejected", "DBB-BASE-CAP-NONNUMERIC", { applicable: true });
  }
  let parsed;
  try { parsed = BigInt(value[1]); } catch { parsed = null; }
  if (parsed === null || parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    return result("rejected", "DBB-BASE-CAP-UNSAFE", { applicable: true });
  }
  const baseCalls = Number(parsed);
  const workingCap = dispatchWorkingCap(maxTurns);
  const effectiveCap = effectiveDispatchBaseCap(baseCalls, maxTurns);
  return result("prepared", "DBB-PREPARED", {
    applicable: true,
    baseCalls,
    maxTurns,
    workingCap,
    effectiveCap,
    tierLimited: effectiveCap < baseCalls,
  });
}

function normalizedRole(value) {
  if (typeof value !== "string") return null;
  const role = value.startsWith("pipeline-core:") ? value.slice("pipeline-core:".length) : value;
  return /^[a-z][a-z0-9-]*$/u.test(role) ? role : null;
}

function pendingPath(commonDir, toolUseId) {
  if (typeof commonDir !== "string" || commonDir === "" || typeof toolUseId !== "string" || toolUseId.trim() === "") return null;
  const key = createHash("sha256").update(toolUseId).digest("hex");
  return join(commonDir, "agent-pipeline", "dispatch-budget", "pending", `${key}.json`);
}

function canonicalPendingRecord(toolUseId, bindings) {
  if (!Array.isArray(bindings) || bindings.length === 0) return null;
  const rows = [];
  for (const binding of bindings) {
    const agentType = normalizedRole(binding?.agentType);
    const maxTurns = binding?.maxTurns;
    const baseCalls = binding?.baseCalls;
    const effectiveCap = effectiveDispatchBaseCap(baseCalls, maxTurns);
    if (agentType === null || effectiveCap === null || binding?.effectiveCap !== effectiveCap) return null;
    rows.push({ agentType, baseCalls, maxTurns, effectiveCap });
  }
  rows.sort((a, b) => a.agentType.localeCompare(b.agentType) || a.baseCalls - b.baseCalls || a.maxTurns - b.maxTurns);
  const deduplicated = rows.filter((row, index) => index === 0 || JSON.stringify(row) !== JSON.stringify(rows[index - 1]));
  for (let index = 1; index < deduplicated.length; index += 1) {
    if (deduplicated[index - 1].agentType === deduplicated[index].agentType) return null;
  }
  return {
    schema: PENDING_SCHEMA,
    toolUseIdSha256: createHash("sha256").update(toolUseId).digest("hex"),
    bindings: deduplicated,
  };
}

export function persistPendingDispatchBudgetBindings({ commonDir, toolUseId, bindings } = {}, dependencies = {}) {
  const path = pendingPath(commonDir, toolUseId);
  const record = typeof toolUseId === "string" ? canonicalPendingRecord(toolUseId, bindings) : null;
  if (path === null || record === null) return result("rejected", "DBB-PENDING-BINDING-INVALID");
  const serialized = `${JSON.stringify(record)}\n`;
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
  const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
  const linkSyncFn = dependencies.linkSyncFn ?? linkSync;
  const unlinkSyncFn = dependencies.unlinkSyncFn ?? unlinkSync;
  let temporary = null;
  try {
    if (existsSyncFn(path)) {
      return readFileSyncFn(path, "utf8") === serialized
        ? result("prepared", "DBB-PENDING-BINDING-EXISTS", { path })
        : result("rejected", "DBB-PENDING-BINDING-CONFLICT");
    }
    mkdirSyncFn(dirname(path), { recursive: true, mode: 0o700 });
    temporary = join(dirname(path), `.pending-${process.pid}-${randomUUID()}.json`);
    writeFileSyncFn(temporary, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try { linkSyncFn(temporary, path); }
    catch (error) {
      if (error?.code !== "EEXIST") throw error;
      return readFileSyncFn(path, "utf8") === serialized
        ? result("prepared", "DBB-PENDING-BINDING-EXISTS", { path })
        : result("rejected", "DBB-PENDING-BINDING-CONFLICT");
    }
    return result("prepared", "DBB-PENDING-BINDING-WRITTEN", { path });
  } catch {
    return result("rejected", "DBB-PENDING-BINDING-WRITE");
  } finally {
    if (temporary !== null) {
      try { unlinkSyncFn(temporary); } catch { /* best effort */ }
    }
  }
}

export function resolvePendingDispatchBudgetBinding({ commonDir, toolUseId, agentType } = {}, dependencies = {}) {
  const path = pendingPath(commonDir, toolUseId);
  const role = normalizedRole(agentType);
  if (path === null || role === null) return result("rejected", "DBB-PENDING-BINDING-IDENTITY");
  let parsed;
  try { parsed = JSON.parse((dependencies.readFileSyncFn ?? readFileSync)(path, "utf8")); }
  catch { return result("rejected", "DBB-PENDING-BINDING-MISSING"); }
  if (parsed?.schema !== PENDING_SCHEMA || parsed.toolUseIdSha256 !== createHash("sha256").update(toolUseId).digest("hex")) {
    return result("rejected", "DBB-PENDING-BINDING-MALFORMED");
  }
  const canonical = canonicalPendingRecord(toolUseId, parsed.bindings);
  if (canonical === null || JSON.stringify(canonical) !== JSON.stringify(parsed)) {
    return result("rejected", "DBB-PENDING-BINDING-MALFORMED");
  }
  const matches = parsed.bindings.filter((binding) => binding.agentType === role);
  if (matches.length !== 1) return result("rejected", matches.length === 0 ? "DBB-PENDING-BINDING-MISSING" : "DBB-PENDING-BINDING-CONFLICT");
  return result("prepared", "DBB-PENDING-BINDING-RESOLVED", { binding: Object.freeze({ ...matches[0] }) });
}

export function consumePendingDispatchBudgetBinding({ commonDir, toolUseId, agentType, binding } = {}, dependencies = {}) {
  const path = pendingPath(commonDir, toolUseId);
  const role = normalizedRole(agentType);
  if (path === null || role === null) return result("rejected", "DBB-PENDING-BINDING-IDENTITY");
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
  const linkSyncFn = dependencies.linkSyncFn ?? linkSync;
  const renameSyncFn = dependencies.renameSyncFn ?? renameSync;
  const unlinkSyncFn = dependencies.unlinkSyncFn ?? unlinkSync;
  const lock = `${path}.lock`;
  const temporary = `${path}.${process.pid}-${randomUUID()}.tmp`;
  let locked = false;
  try {
    writeFileSyncFn(temporary, "lock\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    try { linkSyncFn(temporary, lock); locked = true; }
    catch (error) {
      if (error?.code === "EEXIST") return result("rejected", "DBB-PENDING-BINDING-BUSY");
      throw error;
    }
    const parsed = JSON.parse(readFileSyncFn(path, "utf8"));
    const canonical = canonicalPendingRecord(toolUseId, parsed.bindings);
    const expected = canonicalPendingRecord(toolUseId, [{ agentType: role, ...binding }]);
    if (canonical === null || expected === null || JSON.stringify(canonical) !== JSON.stringify(parsed)) {
      return result("rejected", "DBB-PENDING-BINDING-MALFORMED");
    }
    const matches = parsed.bindings.filter((row) => row.agentType === role);
    if (matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(expected.bindings[0])) {
      return result("rejected", "DBB-PENDING-BINDING-CONFLICT");
    }
    const remaining = parsed.bindings.filter((row) => row.agentType !== role);
    if (remaining.length === 0) unlinkSyncFn(path);
    else {
      const replacement = canonicalPendingRecord(toolUseId, remaining);
      writeFileSyncFn(temporary, `${JSON.stringify(replacement)}\n`, { encoding: "utf8" });
      renameSyncFn(temporary, path);
    }
    return result("consumed", "DBB-PENDING-BINDING-CONSUMED");
  } catch {
    return result("rejected", existsSyncFn(path) ? "DBB-PENDING-BINDING-CONSUME" : "DBB-PENDING-BINDING-MISSING");
  } finally {
    if (locked) {
      try { unlinkSyncFn(lock); } catch { /* best effort */ }
    }
    try { unlinkSyncFn(temporary); } catch { /* best effort */ }
  }
}
