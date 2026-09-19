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

export const ELEPHANT_AGY_IMPLEMENTATION_DISPATCH_SCHEMA = "pipeline.elephant-agy-implementation-dispatch-receipt.v1";
export const ELEPHANT_AGY_IMPLEMENTATION_REQUEST_SCHEMA = "pipeline.role-dispatch-request.v1";
const SHA = /^[a-f0-9]{64}$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const IMPLEMENTATION_ROLES = new Set(["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"]);
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
  if (!route || route.state !== "opt-in" || route.selector?.kind !== "model-id" || route.selector.value !== "gemini-3.8-flash-high" || route.effort !== "high" || route.unavailable !== "defer" || route.evidence !== "dispatch-receipt") return null;
  return { runner: "antigravity", provider: "google", requestedModel: route.selector.value, effort: route.effort, routePolicySha256: digest(route) };
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
    launcherCalls: 0,
    modelCalls: 0,
    ...extra,
  };
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
      identityEvidence: result?.observed?.model && result.observed.model !== "unknown" ? "provider-readback" : "unknown",
      effectiveSandbox: result?.observed?.effectiveSandbox ?? "unknown",
    },
    result: { path: result?.result?.path ?? null, sha256: result?.result?.sha256 ?? null },
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
  const launched = await (dependencies.runLiveHost ?? runGoldfishAntigravityLiveHost)(sealed, dependencies);
  return receipt({ packet: preflight.packet, sessionId, descriptorSha256, route, record: stored.record, scope, inputSha256, result: launched, status: launched.status === "succeeded" ? "succeeded" : launched.status === "unavailable" ? "unavailable" : "rejected", code: launched.code });
}

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
  try {
    const result = await dispatchElephantAgyImplementation(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "succeeded" ? 0 : 2;
  } catch {
    process.stderr.write("elephant-agy-implementation-dispatch: request refused\n");
    process.exitCode = 64;
  }
}
