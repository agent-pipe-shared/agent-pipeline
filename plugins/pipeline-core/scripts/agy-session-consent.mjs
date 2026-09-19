#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Private session-consent storage. It never signs and never turns preference
 * or installation into consent; signature/chat decisions arrive as an
 * already-recorded external decision and are verified before storage. */
import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSignatureIntent, consentStoragePath, digest, loadLiveSession, validateConsentRecord } from "../lib/agy-session-authority.mjs";
import { loadSessionDescriptor } from "../lib/worktree-lifecycle.mjs";

const usage = "Usage: agy-session-consent.mjs <prepare|inspect|record|revoke> --root <repo> --session-id <id> [--descriptor-sha256 <sha>] [--record <external-json>]";
function values(argv) {
  const out = { command: argv[0] };
  const allowed = new Set(["root", "sessionId", "descriptorSha256", "record", "subject", "featureId", "planSha256", "specSha256", "candidate"]);
  for (let i = 1; i < argv.length; i += 2) { const key = argv[i]; const value = argv[i + 1]; const normalized = key?.startsWith("--") ? key.slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase()) : ""; if (!allowed.has(normalized) || !value || Object.hasOwn(out, normalized)) throw new Error(usage); out[normalized] = value; }
  if (!out.root || !out.sessionId || !out.command || !["prepare", "inspect", "record", "revoke"].includes(out.command)) throw new Error(usage);
  return out;
}
export async function runConsentCommand(argv, deps = {}) {
  const args = values(argv); const descriptor = loadSessionDescriptor(args.root, args.sessionId, { expectedDescriptorSha256: args.descriptorSha256 }); const path = consentStoragePath(args.root, args.sessionId);
  if (args.command === "prepare") {
    if (!args.subject || !args.featureId || !args.planSha256 || !args.specSha256 || !args.candidate) throw new Error(usage);
    const subject = JSON.parse(readFileSync(resolve(args.subject), "utf8"));
    const candidate = JSON.parse(readFileSync(resolve(args.candidate), "utf8"));
    const subjectSha256 = digest(subject);
    const intent = buildSignatureIntent({ featureId: args.featureId, planSha256: args.planSha256, specSha256: args.specSha256, candidate, subjectSha256 });
    return { schema: "pipeline.agy-session-consent-preparation.v1", sessionId: descriptor.sessionId, descriptorSha256: descriptor.descriptorSha256, subject, subjectSha256, intent, status: "awaiting-human-signature" };
  }
  if (args.command === "inspect") return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { status: "missing", sessionId: args.sessionId, descriptorSha256: descriptor.descriptorSha256 };
  if (args.command === "revoke") { if (existsSync(path)) unlinkSync(path); return { status: "revoked", sessionId: args.sessionId, descriptorSha256: descriptor.descriptorSha256 }; }
  if (!args.record) throw new Error(usage);
  const record = JSON.parse(readFileSync(resolve(args.record), "utf8"));
  const live = loadLiveSession(args.root, args.sessionId, descriptor.descriptorSha256);
  if (!live.ok) throw new Error(live.code);
  const checked = validateConsentRecord(record, { root: args.root, repository: descriptor.repo, session: live.session, policy: deps.policy });
  if (!checked.ok) throw new Error(checked.code);
  mkdirSync(join(descriptor.repo.commonDir, "agent-pipeline", "run", "agy-session-consent"), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(record)}\n`, { flag: "wx", mode: 0o600 });
  return { status: "recorded", sessionId: args.sessionId, descriptorSha256: descriptor.descriptorSha256, mode: checked.mode };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runConsentCommand(process.argv.slice(2)))}\n`); } catch (error) { process.stderr.write(`AGY-CONSENT-FAILED: ${error.message}\n`); process.exitCode = 2; }
}
