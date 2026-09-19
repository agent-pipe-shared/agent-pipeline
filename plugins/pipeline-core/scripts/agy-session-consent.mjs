#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Private session-consent storage. It never signs and never turns preference
 * or installation into consent; signature/chat decisions arrive as an
 * already-recorded external decision and are verified before storage. */
import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSignatureIntent, configuredConsentMode, consentStoragePath, digest, loadLiveSession, validateConsentRecord } from "../lib/agy-session-authority.mjs";
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
  const tombstone = `${path}.revoked`;
  const directory = join(descriptor.repo.commonDir, "agent-pipeline", "run", "agy-session-consent");
  for (const parent of [join(descriptor.repo.commonDir, "agent-pipeline"), join(descriptor.repo.commonDir, "agent-pipeline", "run")]) { if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error("AGY-CONSENT-STORAGE-UNSAFE"); }
  if (args.command === "prepare") {
    if (!args.subject || !args.featureId || !args.planSha256 || !args.specSha256 || !args.candidate) throw new Error(usage);
    const subject = JSON.parse(readFileSync(resolve(args.subject), "utf8"));
    const candidate = JSON.parse(readFileSync(resolve(args.candidate), "utf8"));
    if (digest(subject?.session) !== digest({ id: descriptor.sessionId, descriptorSha256: descriptor.descriptorSha256 }) || digest(subject?.repository) !== digest({ primaryRoot: descriptor.repo.primaryRoot, commonDir: descriptor.repo.commonDir })) throw new Error("AGY-CONSENT-SUBJECT-MISMATCH");
    const subjectSha256 = digest(subject);
    const mode = configuredConsentMode(args.root).mode;
    const intent = mode === "signature" ? buildSignatureIntent({ featureId: args.featureId, planSha256: args.planSha256, specSha256: args.specSha256, candidate, subjectSha256 }) : null;
    return { schema: "pipeline.agy-session-consent-preparation.v1", sessionId: descriptor.sessionId, descriptorSha256: descriptor.descriptorSha256, subject, subjectSha256, mode, ...(intent ? { intent } : {}), status: mode === "signature" ? "awaiting-human-signature" : "awaiting-human-chat-attribution" };
  }
  if (args.command === "inspect") return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { status: "missing", sessionId: args.sessionId, descriptorSha256: descriptor.descriptorSha256 };
  if (args.command === "revoke") { if (existsSync(path)) { const prior = JSON.parse(readFileSync(path, "utf8")); let history = []; if (existsSync(tombstone)) { try { history = JSON.parse(readFileSync(tombstone, "utf8")); } catch { throw new Error("AGY-CONSENT-STORAGE-MALFORMED"); } } if (!Array.isArray(history)) throw new Error("AGY-CONSENT-STORAGE-MALFORMED"); history.push({ decisionId: prior.decisionId, subjectSha256: prior.subjectSha256, revokedAtMs: Date.now() }); writeFileSync(tombstone, `${JSON.stringify(history)}\n`, { flag: "w", mode: 0o600 }); unlinkSync(path); } return { status: "revoked", sessionId: args.sessionId, descriptorSha256: descriptor.descriptorSha256 }; }
  if (!args.record) throw new Error(usage);
  const record = JSON.parse(readFileSync(resolve(args.record), "utf8"));
  const live = loadLiveSession(args.root, args.sessionId, descriptor.descriptorSha256);
  if (!live.ok) throw new Error(live.code);
  const checked = validateConsentRecord(record, { root: args.root, repository: descriptor.repo, session: live.session, policy: deps.policy });
  if (!checked.ok) throw new Error(checked.code);
  if (existsSync(tombstone)) { let history; try { history = JSON.parse(readFileSync(tombstone, "utf8")); } catch { throw new Error("AGY-CONSENT-STORAGE-MALFORMED"); } if (!Array.isArray(history)) throw new Error("AGY-CONSENT-STORAGE-MALFORMED"); if (history.some((prior) => prior?.decisionId === record.decisionId || prior?.subjectSha256 === record.subjectSha256)) throw new Error("AGY-CONSENT-REAUTH-REQUIRED"); }
  mkdirSync(directory, { recursive: true, mode: 0o700 }); if (lstatSync(directory).isSymbolicLink()) throw new Error("AGY-CONSENT-STORAGE-UNSAFE");
  writeFileSync(path, `${JSON.stringify(record)}\n`, { flag: "wx", mode: 0o600 });
  return { status: "recorded", sessionId: args.sessionId, descriptorSha256: descriptor.descriptorSha256, mode: checked.mode };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runConsentCommand(process.argv.slice(2)))}\n`); } catch (error) { process.stderr.write(`AGY-CONSENT-FAILED: ${error.message}\n`); process.exitCode = 2; }
}
