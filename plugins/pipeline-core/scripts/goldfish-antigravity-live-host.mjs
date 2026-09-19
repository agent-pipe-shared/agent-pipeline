#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Explicit live AGY implementation host.  This is intentionally separate from
 * the E3 fixture host: it discovers the already-installed local CLI, while the
 * session-dispatch library owns consent, candidate binding and result safety.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverAgyPath } from "../lib/antigravity-execution-host.mjs";
import { dispatchAgySession } from "../lib/agy-session-dispatch.mjs";
import { digest, loadLiveSession, loadStoredConsent, validateConsentRecord, validateDispatchBinding } from "../lib/agy-session-authority.mjs";

export const LIVE_REQUEST_SCHEMA = "pipeline.agy-session-live-request.v1";

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function readRequest(path) {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(absolute) !== absolute || stat.size > 2 * 1024 * 1024) throw new Error("request is not a bounded physical file");
  return JSON.parse(readFileSync(absolute, "utf8"));
}

export async function runGoldfishAntigravityLiveHost(request, dependencies = {}) {
  const keys = ["schema", "root", "resultRoot", "resultPath", "packet", "sessionId", "descriptorSha256", "consent", "requestedModel", "effort", "scope", "inputSha256", "timeoutMs"];
  if (!exact(request, keys) || request.schema !== LIVE_REQUEST_SCHEMA) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-LIVE-REQUEST-SHAPE", modelCalls: 0, launcherCalls: 0 };
  const agyPath = dependencies.agyPath ?? discoverAgyPath(dependencies.env ?? process.env);
  if (!agyPath) return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: "AGY-NOT-INSTALLED", modelCalls: 0, launcherCalls: 0 };
  if (request.consent === null) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-SESSION-CONSENT-REQUIRED", modelCalls: 0, launcherCalls: 0 };
  if (request.consent !== "stored") return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-SESSION-CONSENT-SUPPLIED", modelCalls: 0, launcherCalls: 0 };
  let live;
  try { live = loadLiveSession(request.root, request.sessionId, request.descriptorSha256); } catch { return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: "AGY-SESSION-OWNER-UNAVAILABLE", modelCalls: 0, launcherCalls: 0 }; }
  if (!live.ok) return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: live.code, modelCalls: 0, launcherCalls: 0 };
  let stored;
  try { stored = loadStoredConsent(request.root, request.sessionId, request.descriptorSha256); } catch { return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: "AGY-SESSION-CONSENT-UNAVAILABLE", modelCalls: 0, launcherCalls: 0 }; }
  if (!stored.record) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-SESSION-CONSENT-REQUIRED", modelCalls: 0, launcherCalls: 0 };
  const authority = validateConsentRecord(stored.record, { root: request.root, repository: stored.descriptor.repo, session: live.session, nowEpochMs: dependencies.nowEpochMs ?? Date.now() });
  if (!authority.ok) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: authority.code, modelCalls: 0, launcherCalls: 0 };
  const binding = validateDispatchBinding(stored.record, { requestedModel: request.requestedModel, role: request.packet.role, scope: request.scope, requiredPaths: request.packet.requiredPaths ?? [], nowEpochMs: dependencies.nowEpochMs ?? Date.now() });
  if (!binding.ok) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: binding.code, modelCalls: 0, launcherCalls: 0 };
  const dispatchConsent = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: stored.record.decisionId, sessionId: live.session.id, runner: "antigravity", provider: "google", model: stored.record.model, role: request.packet.role, scope: request.scope, subjectSha256: digest(request.scope), approvedAtMs: stored.record.approvedAtMs ?? 0, expiresAtMs: stored.record.expiresAtMs };
  return dispatchAgySession({ ...request, session: { id: live.session.id, source: "runtime", observed: true }, consent: dispatchConsent, verifyAuthority: () => true, agyPath, env: dependencies.env ?? process.env, nowEpochMs: dependencies.nowEpochMs ?? Date.now(), signal: dependencies.signal });
}

export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== "--request" || typeof argv[1] !== "string" || argv[1].trim() === "") throw new Error("usage: goldfish-antigravity-live-host.mjs --request <sealed-request.json>");
  return argv[1];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runGoldfishAntigravityLiveHost(readRequest(parseArgs(process.argv.slice(2))));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "succeeded" ? 0 : 1;
  } catch {
    process.stderr.write("goldfish-antigravity-live-host: request refused\n");
    process.exitCode = 64;
  }
}
