// SPDX-License-Identifier: SUL-1.0

/**
 * Candidate-bound Antigravity implementation dispatch.
 *
 * This module deliberately does not create human consent.  The caller must
 * supply an already-produced, session-bound consent record from the attended
 * authority path.  It performs the last admission check, then delegates to
 * the existing runner-neutral role preflight and AGY process boundary.
 */
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

import { invokeAgy } from "./antigravity-execution-host.mjs";
import { ROLE_DISPATCH_PREFLIGHT_SCHEMA, preflightRoleDispatch } from "./role-dispatch-preflight.mjs";

export const AGY_SESSION_DISPATCH_SCHEMA = "pipeline.agy-session-dispatch-receipt.v1";
export const AGY_SESSION_CONSENT_SCHEMA = "pipeline.agy-session-consent.v1";
export const AGY_SESSION_DISPATCH_CODES = Object.freeze({
  CONSENT_REQUIRED: "AGY-SESSION-CONSENT-REQUIRED",
  CONSENT_INVALID: "AGY-SESSION-CONSENT-INVALID",
  SESSION_MISMATCH: "AGY-SESSION-MISMATCH",
  ROLE_FORBIDDEN: "AGY-SESSION-ROLE-FORBIDDEN",
  MODEL_MISMATCH: "AGY-SESSION-MODEL-MISMATCH",
  INPUT_MISMATCH: "AGY-SESSION-INPUT-MISMATCH",
  RESULT_INVALID: "AGY-SESSION-RESULT-INVALID",
  RESULT_COLLISION: "AGY-SESSION-RESULT-COLLISION",
  AUTHORITY_UNAVAILABLE: "AGY-SESSION-AUTHORITY-UNAVAILABLE",
  PREFLIGHT_FAILED: "AGY-SESSION-PREFLIGHT-FAILED",
});

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const IMPLEMENTATION_ROLES = new Set(["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"]);

const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value), "utf8").digest("hex");
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const rejected = (code, field, extra = {}) => ({
  schema: AGY_SESSION_DISPATCH_SCHEMA,
  status: "rejected",
  code,
  field,
  modelCalls: 0,
  launcherCalls: 0,
  ...extra,
});

function validSessionIdentity(identity) {
  return exact(identity, ["id", "source", "observed"])
    && SESSION_ID.test(identity.id ?? "")
    && identity.source === "runtime"
    && identity.observed === true;
}

function validateConsent(consent, { sessionId, model, role, scope, nowEpochMs }) {
  if (consent === undefined || consent === null) return { ok: false, code: AGY_SESSION_DISPATCH_CODES.CONSENT_REQUIRED };
  if (!exact(consent, ["schema", "status", "decisionId", "sessionId", "runner", "provider", "model", "role", "scope", "subjectSha256", "approvedAtMs", "expiresAtMs"]) || consent.schema !== AGY_SESSION_CONSENT_SCHEMA
    || consent.status !== "approved" || !SESSION_ID.test(consent.decisionId ?? "") || consent.sessionId !== sessionId
    || consent.runner !== "antigravity" || consent.provider !== "google" || consent.model !== model || consent.role !== role
    || consent.scope !== scope || !SHA256.test(consent.subjectSha256 ?? "")
    || !Number.isSafeInteger(consent.approvedAtMs) || !Number.isSafeInteger(consent.expiresAtMs)
    || consent.expiresAtMs <= consent.approvedAtMs || nowEpochMs >= consent.expiresAtMs) {
    return { ok: false, code: AGY_SESSION_DISPATCH_CODES.CONSENT_INVALID };
  }
  return { ok: true };
}

function safeResultPath(resultRoot, resultPath) {
  if (typeof resultPath !== "string" || resultPath.length === 0 || resultPath.includes("\\")
    || resultPath.startsWith("/") || resultPath.split("/").some((part) => !part || part === "." || part === "..")) return null;
  try {
    const rootLexical = resolve(resultRoot);
    const rootStat = lstatSync(rootLexical);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return null;
    const root = realpathSync(rootLexical);
    const target = resolve(root, resultPath);
    const rel = relative(root, target);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) return null;
    const parent = dirname(target);
    const parentStat = lstatSync(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || realpathSync(parent) !== parent) return null;
    try { lstatSync(target); return null; } catch (error) { if (error?.code !== "ENOENT") return null; }
  } catch (error) {
    return null;
  }
  return { root: resolve(resultRoot), target: resolve(resultRoot, resultPath), relative: resultPath };
}

function writeExclusiveResult(resultRoot, resultPath, value) {
  const location = safeResultPath(resultRoot, resultPath);
  if (location === null) return { ok: false, code: AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION };
  try {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    writeFileSync(location.target, bytes, { flag: "wx", mode: 0o600 });
    return { ok: true, path: location.relative, bytes: bytes.length, sha256: digest(bytes) };
  } catch {
    return { ok: false, code: AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION };
  }
}

/**
 * Admit and execute one implementation-only AGY dispatch. `consent` is an
 * input, never minted here; tests and callers can prove it came from the
 * attended human authority mechanism without this wrapper inventing a second
 * approval protocol.
 */
export async function dispatchAgySession({
  root,
  resultRoot = root,
  packet,
  resultPath,
  session,
  consent,
  requestedModel,
  effort = "high",
  scope,
  inputSha256,
  agyPath,
  timeoutMs = 300_000,
  env = process.env,
  signal,
  nowEpochMs = Date.now(),
  verifyAuthority,
} = {}) {
  if (!validSessionIdentity(session)) return rejected(AGY_SESSION_DISPATCH_CODES.SESSION_MISMATCH, "session");
  if (!IMPLEMENTATION_ROLES.has(packet?.role)) return rejected(AGY_SESSION_DISPATCH_CODES.ROLE_FORBIDDEN, "packet.role");
  if (typeof requestedModel !== "string" || requestedModel.trim() === "") return rejected(AGY_SESSION_DISPATCH_CODES.MODEL_MISMATCH, "requestedModel");
  if (typeof scope !== "string" || scope.trim() === "" || !SHA256.test(inputSha256 ?? "")) return rejected(AGY_SESSION_DISPATCH_CODES.INPUT_MISMATCH, "inputSha256");
  const consentCheck = validateConsent(consent, { sessionId: session.id, model: requestedModel, role: packet.role, scope, nowEpochMs });
  if (!consentCheck.ok) return rejected(consentCheck.code, "consent");
  if (typeof verifyAuthority !== "function") return rejected(AGY_SESSION_DISPATCH_CODES.AUTHORITY_UNAVAILABLE, "authority");
  let authorityOk = false;
  try { authorityOk = verifyAuthority({ consent: structuredClone(consent), session: structuredClone(session), scope, requestedModel, role: packet.role }) === true; } catch { authorityOk = false; }
  if (!authorityOk) return rejected(AGY_SESSION_DISPATCH_CODES.AUTHORITY_UNAVAILABLE, "authority");
  if (packet.transport !== "antigravity") return rejected(AGY_SESSION_DISPATCH_CODES.PREFLIGHT_FAILED, "packet.transport");

  const prepared = preflightRoleDispatch({ root, resultRoot, packet });
  if (prepared.status !== "prepared") return rejected(AGY_SESSION_DISPATCH_CODES.PREFLIGHT_FAILED, prepared.field ?? "packet", { preflight: prepared });
  if (prepared.candidate.commit !== packet.candidate.commit || prepared.candidate.tree !== packet.candidate.tree) {
    return rejected(AGY_SESSION_DISPATCH_CODES.INPUT_MISMATCH, "packet.candidate");
  }
  const resultLocation = safeResultPath(resultRoot, resultPath);
  if (resultLocation === null) return rejected(AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION, "resultPath");

  const invoked = await invokeAgy({ root, resultRoot, packet: prepared.packet, agyPath, model: requestedModel, effort, timeoutMs, env, signal });
  const receipt = {
    schema: AGY_SESSION_DISPATCH_SCHEMA,
    status: invoked.ok === true ? "succeeded" : "unavailable",
    code: invoked.ok === true ? "AGY-SESSION-COMPLETED" : invoked.code,
    dispatchId: packet.dispatchId,
    candidate: prepared.candidate,
    session: { id: session.id, source: session.source },
    requested: { provider: "google", model: requestedModel, effort, role: packet.role, scope, inputSha256 },
    observed: { model: invoked.observedModel ?? null, provider: null, effectiveSandbox: "unknown" },
    consent: { decisionId: consent.decisionId, subjectSha256: consent.subjectSha256 },
    launcherCalls: invoked.launcherCalls ?? 0,
    modelCalls: invoked.modelCalls ?? 0,
    result: null,
  };
  if (invoked.ok !== true) return receipt;
  const published = writeExclusiveResult(resultRoot, resultPath, { schema: "pipeline.agy-session-dispatch-result.v1", dispatchId: packet.dispatchId, candidate: prepared.candidate, sessionId: session.id, requestedModel, observedModel: invoked.observedModel ?? null, payload: invoked.payload });
  if (!published.ok) return { ...receipt, status: "rejected", code: published.code, launcherCalls: invoked.launcherCalls ?? 0, modelCalls: invoked.modelCalls ?? 0 };
  return { ...receipt, result: published };
}

export const agySessionDispatchInternals = Object.freeze({ digest, validateConsent, safeResultPath, writeExclusiveResult });
