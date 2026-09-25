#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * The only supported productive Codex-to-Antigravity implementation entry.
 * Caller flags name bytes and a live session only.  Provider, model, effort,
 * role and scope are derived from the sealed packet and the core route policy.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadRunnerProfilesV3Registry } from "../lib/runner-profiles-v3.mjs";
import { digest, loadLiveSession, loadStoredConsent, validateConsentRecord, validateDispatchBinding } from "../lib/agy-session-authority.mjs";
import { preflightRoleDispatch } from "../lib/role-dispatch-preflight.mjs";
import { LIVE_REQUEST_SCHEMA, LIVE_REQUEST_SEAL, runGoldfishAntigravityLiveHost } from "./goldfish-antigravity-live-host.mjs";
import { finalizeAgyHostObservedReturn } from "./agy-host-observed-finalize.mjs";

export const ELEPHANT_AGY_IMPLEMENTATION_DISPATCH_SCHEMA = "pipeline.elephant-agy-implementation-dispatch-receipt.v1";
export const ELEPHANT_AGY_IMPLEMENTATION_REQUEST_SCHEMA = "pipeline.role-dispatch-request.v1";
const SHA = /^[a-f0-9]{64}$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const IMPLEMENTATION_ROLES = new Set(["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"]);
const APPROVED_IMPLEMENT_MODEL = "gemini-3.8-flash-medium";
const APPROVED_IMPLEMENT_EFFORT = "medium";
const canonical = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value), "utf8").digest("hex");

function physicalUnderRoot(root, path) {
  if (typeof path !== "string" || path.length === 0) return null;
  try {
    const realRoot = realpathSync(root);
    const absolute = resolve(path);
    const rel = relative(realRoot, absolute);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024 || realpathSync(absolute) !== absolute) return null;
    return { root: realRoot, absolute, relative: rel, bytes: readFileSync(absolute) };
  } catch { return null; }
}

function safeNewRelativePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240 && !value.includes("\\")
    && !value.startsWith("/") && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function routeAuthority(dependencies = {}) {
  const registry = dependencies.registry ?? loadRunnerProfilesV3Registry();
  const route = registry?.duties?.implement?.antigravity;
  if (!route || route.state !== "opt-in" || route.selector?.kind !== "model-id" || route.selector.value !== APPROVED_IMPLEMENT_MODEL || route.effort !== APPROVED_IMPLEMENT_EFFORT || route.unavailable !== "defer" || route.evidence !== "dispatch-receipt") return null;
  return { runner: "antigravity", provider: "google", requestedModel: route.selector.value, effort: route.effort, routePolicySha256: digest(route) };
}

/*
 * The default route is deliberately derived from the signed-in distribution,
 * but tests may inject a route reader.  Do not turn that seam into an
 * authority bypass: a changed provider, model, effort, or policy digest must
 * stop before the live host is even considered.
 */
function validRouteAuthority(route) {
  return route !== null && typeof route === "object"
    && route.runner === "antigravity"
    && route.provider === "google"
    && route.requestedModel === APPROVED_IMPLEMENT_MODEL
    && route.effort === APPROVED_IMPLEMENT_EFFORT
    && SHA.test(route.routePolicySha256 ?? "")
    && Object.keys(route).length === 5;
}

function empty(code, status = "rejected", extra = {}) {
  return {
    schema: ELEPHANT_AGY_IMPLEMENTATION_DISPATCH_SCHEMA,
    status,
    code,
    dispatchId: null,
    candidate: null,
    session: null,
    route: null,
    authority: null,
    binding: null,
    observed: { provider: "unknown", model: "unknown", identityEvidence: "unknown", effectiveSandbox: "unknown" },
    result: { path: null, sha256: null },
    record: null,
    recoveryCommit: null,
    launcherCalls: 0,
    modelCalls: 0,
    ...extra,
  };
}

function closedUndeliveredRecord(value, taskId) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "attemptId,authorship,sha256,target"
    && value.target === `evidence/dispatch-record-${taskId}.json`
    && SHA.test(value.sha256 ?? "")
    && SESSION_ID.test(value.attemptId ?? "")
    && value.authorship === "not-applicable"
    ? { target: value.target, sha256: value.sha256, attemptId: value.attemptId, authorship: value.authorship }
    : null;
}

function closedAuthoredRecord(value, taskId) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "authorship,commit,sha256,target"
    && value.target === `evidence/dispatch-record-${taskId}.json`
    && SHA.test(value.sha256 ?? "")
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.commit ?? "")
    && value.authorship === "host-observed-local" ? { ...value } : null;
}

function receipt({ packet, sessionId, descriptorSha256, route, record, scope, inputSha256, result, status, code }) {
  return {
    schema: ELEPHANT_AGY_IMPLEMENTATION_DISPATCH_SCHEMA,
    status,
    code,
    dispatchId: packet.dispatchId,
    candidate: packet.candidate,
    session: { id: sessionId, descriptorSha256 },
    route,
    authority: { consentSubjectSha256: record.subjectSha256, mode: record.mode, fallbackPolicy: record.subject.fallbackPolicy },
    binding: { role: packet.role, scopeSha256: digest(scope), inputSha256, requiredPathsSha256: digest(packet.requiredPaths) },
    observed: {
      provider: result?.observed?.provider ?? "unknown",
      model: result?.observed?.model ?? "unknown",
      identityEvidence: result?.modelCalls > 0 && result?.observed?.model === route.requestedModel
        ? "host-observed-model" : "unknown",
      effectiveSandbox: result?.observed?.effectiveSandbox ?? "unknown",
    },
    result: { path: result?.result?.path ?? null, sha256: result?.result?.sha256 ?? null },
    record: ["completed-undelivered", "interrupted-recorded"].includes(status) ? closedUndeliveredRecord(result?.record, packet.dispatchId)
      : status === "authored-commit-recorded" ? closedAuthoredRecord(result?.record, packet.dispatchId) : null,
    recoveryCommit: result?.recoveryCommit ?? null,
    launcherCalls: result?.launcherCalls ?? 0,
    modelCalls: result?.modelCalls ?? 0,
  };
}

/**
 * Test dependency injection is intentionally function-only.  The CLI offers
 * no authority/model/provider/role/scope/fallback switches.
 */
export async function dispatchElephantAgyImplementation({ root, dispatchRequestPath, resultPath, sessionId, descriptorSha256 } = {}, dependencies = {}) {
  if (typeof root !== "string" || !SESSION_ID.test(sessionId ?? "") || !SHA.test(descriptorSha256 ?? "") || !safeNewRelativePath(resultPath)) return empty("AGY-ELEPHANT-ARGS");
  const input = physicalUnderRoot(root, dispatchRequestPath);
  if (!input) return empty("AGY-ELEPHANT-REQUEST-PHYSICAL");
  let packet;
  try { packet = JSON.parse(input.bytes.toString("utf8")); } catch { return empty("AGY-ELEPHANT-REQUEST-JSON"); }
  if (packet?.schema !== ELEPHANT_AGY_IMPLEMENTATION_REQUEST_SCHEMA || packet.transport !== "antigravity" || !IMPLEMENTATION_ROLES.has(packet.role)) return empty("AGY-ELEPHANT-ROLE-FORBIDDEN");
  if (packet.resultDestination?.kind !== "return" || Object.keys(packet.resultDestination).length !== 1) return empty("AGY-ELEPHANT-RESULT-DESTINATION");
  const route = (dependencies.routeAuthority ?? routeAuthority)(dependencies);
  if (!route) return empty("AGY-ELEPHANT-ROUTE-UNAVAILABLE", "unavailable");
  if (!validRouteAuthority(route)) return empty("AGY-ELEPHANT-ROUTE-MISMATCH", "unavailable");
  const preflight = (dependencies.preflightRoleDispatch ?? preflightRoleDispatch)({ root: input.root, resultRoot: input.root, packet });
  if (preflight.status !== "prepared") return empty("AGY-ELEPHANT-PREFLIGHT-FAILED", "rejected", { preflight });
  const scope = {
    schema: "pipeline.agy-implementation-scope.v1",
    dispatchId: packet.dispatchId,
    candidate: preflight.candidate,
    role: packet.role,
    requiredPaths: packet.requiredPaths,
    requiredPathSha256: packet.requiredPathSha256,
    resultDestination: resultPath,
    routePolicySha256: route.routePolicySha256,
  };
  const inputSha256 = sha256(Buffer.concat([input.bytes, Buffer.from(`\n${JSON.stringify(scope)}\n`, "utf8")]));
  let live;
  try { live = (dependencies.loadLiveSession ?? loadLiveSession)(input.root, sessionId, descriptorSha256); } catch { return empty("AGY-SESSION-OWNER-UNAVAILABLE", "unavailable"); }
  if (!live?.ok) return empty(live?.code ?? "AGY-SESSION-OWNER-UNAVAILABLE", "unavailable");
  let stored;
  try { stored = (dependencies.loadStoredConsent ?? loadStoredConsent)(input.root, sessionId, descriptorSha256); } catch { return empty("AGY-SESSION-CONSENT-UNAVAILABLE", "unavailable"); }
  if (!stored?.record) return empty("AGY-SESSION-CONSENT-REQUIRED");
  const verified = (dependencies.validateConsentRecord ?? validateConsentRecord)(stored.record, { root: input.root, repository: stored.descriptor?.repo ?? live.descriptor?.repo, session: live.session, nowEpochMs: dependencies.nowEpochMs ?? Date.now(), policy: dependencies.policy });
  if (!verified.ok) return empty(verified.code);
  const binding = (dependencies.validateDispatchBinding ?? validateDispatchBinding)(stored.record, { requestedModel: route.requestedModel, role: packet.role, scope, requiredPaths: packet.requiredPaths, nowEpochMs: dependencies.nowEpochMs ?? Date.now() });
  if (!binding.ok) return empty(binding.code);
  const sealed = { schema: LIVE_REQUEST_SCHEMA, seal: LIVE_REQUEST_SEAL, root: input.root, resultRoot: input.root, resultPath, packet: preflight.packet, sessionId, descriptorSha256, consent: "stored", requestedModel: route.requestedModel, effort: route.effort, scope, inputSha256, routePolicySha256: route.routePolicySha256, timeoutMs: 300_000 };
  let launched;
  try { launched = await (dependencies.runLiveHost ?? runGoldfishAntigravityLiveHost)(sealed, dependencies); }
  catch {
    // The child may already have run or changed the checkout. Never turn an
    // unexpected host exception into a safe retry or expose its private text.
    return receipt({ packet: preflight.packet, sessionId, descriptorSha256, route, record: stored.record,
      scope, inputSha256, result: null, status: "recovery-required", code: "AGY-ELEPHANT-HOST-EXCEPTION" });
  }
  if (!launched || typeof launched !== "object" || Array.isArray(launched)) {
    return receipt({ packet: preflight.packet, sessionId, descriptorSha256, route, record: stored.record,
      scope, inputSha256, result: null, status: "recovery-required", code: "AGY-ELEPHANT-HOST-RESULT-INVALID" });
  }
  if (launched.modelCalls > 0 && ["unavailable", "rejected"].includes(launched.status)) {
    return receipt({ packet: preflight.packet, sessionId, descriptorSha256, route, record: stored.record,
      scope, inputSha256, result: launched, status: "recovery-required", code: "AGY-ELEPHANT-LAUNCHED-NONFINAL" });
  }
  const terminalModelClaim = ["final-pending-host-commit", "completed-undelivered"].includes(launched?.status);
  if (terminalModelClaim && (launched?.observed?.model !== route.requestedModel
    || !Number.isSafeInteger(launched.modelCalls) || launched.modelCalls < 1)) {
    return receipt({ packet: preflight.packet, sessionId, descriptorSha256, route, record: stored.record,
      scope, inputSha256, result: launched, status: "recovery-required", code: "AGY-ELEPHANT-HOST-MODEL-UNVERIFIED" });
  }
  // The real sealed host carries its internal admission only inside this
  // process. Test-injected hosts remain pending; they cannot mint an authored
  // publication through a supplied "success" object.
  let completed = launched;
  if (launched.status === "final-pending-host-commit" && !dependencies.runLiveHost) {
    const finalized = finalizeAgyHostObservedReturn({ sealed, launched });
    completed = { ...launched, ...finalized };
  }
  const status = completed.status === "authored-commit-recorded" ? "authored-commit-recorded" : completed.status === "final-pending-host-commit" ? "final-pending-host-commit" : completed.status === "completed-undelivered" ? "completed-undelivered" : completed.status === "interrupted-recorded" ? "interrupted-recorded" : completed.status === "recovery-required" ? "recovery-required" : completed.status === "unavailable" ? "unavailable" : "rejected";
  const recordMissing = ["completed-undelivered", "interrupted-recorded"].includes(status) && !closedUndeliveredRecord(completed.record, preflight.packet.dispatchId);
  const authoredMissing = status === "authored-commit-recorded" && !closedAuthoredRecord(completed.record, preflight.packet.dispatchId);
  return receipt({ packet: preflight.packet, sessionId, descriptorSha256, route, record: stored.record, scope, inputSha256, result: completed,
    status: recordMissing || authoredMissing ? "recovery-required" : status,
    code: recordMissing ? status === "completed-undelivered"
      ? "AGY-UNDELIVERED-RECORD-UNVERIFIED" : "AGY-INTERRUPTION-RECORD-UNVERIFIED"
      : authoredMissing ? "AGY-AUTHORED-RECORD-UNVERIFIED" : completed.code });
}

export const elephantAgyImplementationDispatchInternals = Object.freeze({
  physicalUnderRoot,
  safeNewRelativePath,
  routeAuthority,
  validRouteAuthority,
});

export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv[0] !== "dispatch" || argv.length !== 11) throw new Error("usage: elephant-agy-implementation-dispatch.mjs dispatch --root <repo> --request <physical-file-under-root> --result-path <new-relative-output> --session-id <id> --descriptor-sha256 <sha256>");
  const out = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1];
    const key = flag === "--root" ? "root" : flag === "--request" ? "dispatchRequestPath" : flag === "--result-path" ? "resultPath" : flag === "--session-id" ? "sessionId" : flag === "--descriptor-sha256" ? "descriptorSha256" : null;
    if (!key || typeof value !== "string" || value.length === 0 || Object.hasOwn(out, key)) throw new Error("usage: elephant-agy-implementation-dispatch.mjs dispatch --root <repo> --request <physical-file-under-root> --result-path <new-relative-output> --session-id <id> --descriptor-sha256 <sha256>");
    out[key] = value;
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A bare invocation bypasses the canonical selector's explicit no-fallback
  // receipt.  Keep this sealed worker import-only; the public entry is the
  // Elephant selector in elephant-implementation-dispatch.mjs.
  process.stderr.write("elephant-agy-implementation-dispatch: internal-only; use elephant-implementation-dispatch.mjs\n");
  process.exitCode = 64;
}
