// SPDX-License-Identifier: SUL-1.0

import { createHash, randomUUID } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ADVISOR_PROHIBITION_LINE = "Do not invoke or reuse the Advisor; consultation ownership remains with the Elephant";
export const ADVISOR_PROHIBITION_BINDING_SCHEMA = "pipeline.advisor-prohibition-binding.v1";
export const ADVISOR_PROHIBITION_AUDIT_SCHEMA = "pipeline.advisor-prohibition-audit.v1";
export const ADVISOR_PROHIBITION_DENIAL_CODE = "ADVISOR-DISPATCH-PROHIBITED";

const PENDING_SCHEMA = "pipeline.pending-advisor-prohibition-binding.v1";
const SHA256 = /^[a-f0-9]{64}$/u;

function digest(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function result(status, code, extra = {}) {
  return Object.freeze({ schema: ADVISOR_PROHIBITION_BINDING_SCHEMA, status, code, ...extra });
}

function normalizedRole(value) {
  if (typeof value !== "string") return null;
  const role = value.startsWith("pipeline-core:") ? value.slice("pipeline-core:".length) : value;
  return /^[a-z][a-z0-9-]*$/u.test(role) ? role : null;
}

/**
 * The prohibition is intentionally a closed token, not a semantic guess. A
 * near-match in prose cannot silently take away a useful tool.
 */
export function advisorProhibitionDisposition(prompt) {
  const lines = typeof prompt === "string" ? prompt.split(/\r?\n/u) : [];
  const matches = lines.filter((line) => {
    const value = line.trim().replace(/^[-*]\s+/u, "").replace(/\s*\(MP-26\)\s*$/u, "");
    return value === ADVISOR_PROHIBITION_LINE;
  });
  if (matches.length > 1) return result("rejected", "APB-PROHIBITION-AMBIGUOUS");
  return result("prepared", "APB-DISPOSITION", { disposition: matches.length === 1 ? "prohibited" : "unrestricted" });
}

/**
 * Build the role-indexed carrier Claude's child metadata can later resolve.
 * The host exposes parent tool-use id plus agent type, but not a prompt digest
 * or batch index. Therefore duplicate roles in a prohibition-bearing batch are
 * rejected instead of assigning one child's prohibition to its sibling.
 */
export function prepareAdvisorProhibitionBindings(dispatches) {
  if (!Array.isArray(dispatches) || dispatches.length === 0) return result("not-applicable", "APB-NO-DISPATCHES");
  const bindings = [];
  for (const dispatch of dispatches) {
    const agentType = normalizedRole(dispatch?.subagentType);
    if (agentType === null || typeof dispatch?.prompt !== "string") return result("rejected", "APB-DISPATCH-INVALID");
    const disposition = advisorProhibitionDisposition(dispatch.prompt);
    if (disposition.status === "rejected") return disposition;
    bindings.push({
      agentType,
      disposition: disposition.disposition,
      promptSha256: digest(dispatch.prompt),
    });
  }
  if (!bindings.some(({ disposition }) => disposition === "prohibited")) {
    return result("not-applicable", "APB-NO-PROHIBITION");
  }
  const roles = bindings.map(({ agentType }) => agentType);
  if (new Set(roles).size !== roles.length) return result("rejected", "APB-DISPATCH-IDENTITY-AMBIGUOUS");
  bindings.sort((a, b) => a.agentType.localeCompare(b.agentType));
  return result("prepared", "APB-PREPARED", { bindings: Object.freeze(bindings.map((row) => Object.freeze(row))) });
}

function pendingPath(commonDir, toolUseId) {
  if (typeof commonDir !== "string" || commonDir === "" || typeof toolUseId !== "string" || toolUseId.trim() === "") return null;
  return join(commonDir, "agent-pipeline", "advisor-prohibition", "pending", `${digest(toolUseId)}.json`);
}

function canonicalPendingRecord(toolUseId, bindings) {
  if (!Array.isArray(bindings) || bindings.length === 0) return null;
  const rows = [];
  for (const binding of bindings) {
    const agentType = normalizedRole(binding?.agentType);
    if (agentType === null || !["prohibited", "unrestricted"].includes(binding?.disposition)
      || !SHA256.test(binding?.promptSha256 ?? "")) return null;
    rows.push({ agentType, disposition: binding.disposition, promptSha256: binding.promptSha256 });
  }
  rows.sort((a, b) => a.agentType.localeCompare(b.agentType));
  if (new Set(rows.map(({ agentType }) => agentType)).size !== rows.length
    || !rows.some(({ disposition }) => disposition === "prohibited")) return null;
  return { schema: PENDING_SCHEMA, toolUseIdSha256: digest(toolUseId), bindings: rows };
}

export function persistPendingAdvisorProhibitionBindings({ commonDir, toolUseId, bindings } = {}, dependencies = {}) {
  const path = pendingPath(commonDir, toolUseId);
  const record = canonicalPendingRecord(toolUseId, bindings);
  if (path === null || record === null) return result("rejected", "APB-PENDING-INVALID");
  const bytes = `${JSON.stringify(record)}\n`;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
  const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
  const linkSyncFn = dependencies.linkSyncFn ?? linkSync;
  const unlinkSyncFn = dependencies.unlinkSyncFn ?? unlinkSync;
  const temporary = join(dirname(path), `.pending-${process.pid}-${randomUUID()}.json`);
  try {
    mkdirSyncFn(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSyncFn(temporary, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try { linkSyncFn(temporary, path); }
    catch (error) {
      if (error?.code !== "EEXIST") throw error;
      return readFileSyncFn(path, "utf8") === bytes
        ? result("prepared", "APB-PENDING-EXISTS", { path })
        : result("rejected", "APB-PENDING-CONFLICT");
    }
    return result("prepared", "APB-PENDING-WRITTEN", { path });
  } catch {
    return result("rejected", "APB-PENDING-WRITE");
  } finally {
    try { unlinkSyncFn(temporary); } catch { /* best effort */ }
  }
}

export function resolvePendingAdvisorProhibitionBinding({ commonDir, toolUseId, agentType } = {}, dependencies = {}) {
  const path = pendingPath(commonDir, toolUseId);
  const role = normalizedRole(agentType);
  if (path === null || role === null) return result("not-bound", "APB-BINDING-IDENTITY");
  let parsed;
  try { parsed = JSON.parse((dependencies.readFileSyncFn ?? readFileSync)(path, "utf8")); }
  catch { return result("not-bound", "APB-BINDING-MISSING"); }
  const canonical = canonicalPendingRecord(toolUseId, parsed?.bindings);
  if (canonical === null || JSON.stringify(canonical) !== JSON.stringify(parsed)) {
    return result("not-bound", "APB-BINDING-MALFORMED");
  }
  const binding = parsed.bindings.find((row) => row.agentType === role);
  return binding === undefined
    ? result("not-bound", "APB-BINDING-MISSING")
    : result("bound", "APB-BOUND", { binding: Object.freeze({ ...binding }) });
}

/** Write one private, content-free denial event. The attempted question is never inspected. */
export function persistAdvisorProhibitionAudit({ commonDir, agentId, agentType, parentToolUseId, callToolUseId, promptSha256, occurredAt } = {}, dependencies = {}) {
  if (typeof commonDir !== "string" || commonDir === "" || typeof agentId !== "string" || agentId.trim() === ""
    || normalizedRole(agentType) === null || typeof parentToolUseId !== "string" || parentToolUseId.trim() === ""
    || !SHA256.test(promptSha256 ?? "") || typeof occurredAt !== "string" || occurredAt === "") {
    return result("rejected", "APB-AUDIT-INVALID");
  }
  const record = {
    schema: ADVISOR_PROHIBITION_AUDIT_SCHEMA,
    decision: "denied",
    code: ADVISOR_PROHIBITION_DENIAL_CODE,
    agentIdSha256: digest(agentId),
    agentType: normalizedRole(agentType),
    parentToolUseIdSha256: digest(parentToolUseId),
    callToolUseIdSha256: typeof callToolUseId === "string" && callToolUseId !== "" ? digest(callToolUseId) : null,
    promptSha256,
    occurredAt,
  };
  const directory = join(commonDir, "agent-pipeline", "advisor-prohibition", "audit");
  const path = join(directory, `${digest(`${agentId}\0${parentToolUseId}\0${callToolUseId ?? ""}\0${occurredAt}\0${randomUUID()}`)}.json`);
  try {
    (dependencies.mkdirSyncFn ?? mkdirSync)(directory, { recursive: true, mode: 0o700 });
    (dependencies.writeFileSyncFn ?? writeFileSync)(path, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const readback = JSON.parse((dependencies.readFileSyncFn ?? readFileSync)(path, "utf8"));
    if (JSON.stringify(readback) !== JSON.stringify(record)) throw new Error("audit readback mismatch");
    return result("recorded", "APB-AUDIT-RECORDED", { path, record: Object.freeze(record) });
  } catch {
    return result("rejected", "APB-AUDIT-WRITE");
  }
}
