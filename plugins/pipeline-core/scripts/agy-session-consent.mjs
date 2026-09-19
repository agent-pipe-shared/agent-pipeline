#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Private session-consent storage. It never signs and never turns preference
 * or installation into consent; signature/chat decisions arrive as an
 * already-recorded external decision and are verified before storage. */
import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLiveSession, validateConsentRecord } from "../lib/agy-session-authority.mjs";
import { loadSessionDescriptor } from "../lib/worktree-lifecycle.mjs";

const usage = "Usage: agy-session-consent.mjs <inspect|record|revoke> --root <repo> --session-id <id> [--descriptor-sha256 <sha>] [--record <external-json>]";
function values(argv) {
  const out = { command: argv[0] };
  for (let i = 1; i < argv.length; i += 2) { const key = argv[i]; const value = argv[i + 1]; if (!key?.startsWith("--") || !value || Object.hasOwn(out, key)) throw new Error(usage); out[key.slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase())] = value; }
  if (!out.root || !out.sessionId || !out.command || !["inspect", "record", "revoke"].includes(out.command)) throw new Error(usage);
  return out;
}
function pathFor(root, sessionId) { const descriptor = loadSessionDescriptor(root, sessionId); return join(descriptor.repo.commonDir, "agent-pipeline", "run", "agy-session-consent", `${sessionId}.json`); }
export async function runConsentCommand(argv, deps = {}) {
  const args = values(argv); const descriptor = loadSessionDescriptor(args.root, args.sessionId, { expectedDescriptorSha256: args.descriptorSha256 }); const path = join(descriptor.repo.commonDir, "agent-pipeline", "run", "agy-session-consent", `${args.sessionId}.json`);
  if (args.command === "inspect") return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { status: "missing", sessionId: args.sessionId, descriptorSha256: descriptor.descriptorSha256 };
  if (args.command === "revoke") { if (existsSync(path)) unlinkSync(path); return { status: "revoked", sessionId: args.sessionId, descriptorSha256: descriptor.descriptorSha256 }; }
  if (!args.record) throw new Error(usage);
  const record = JSON.parse(readFileSync(resolve(args.record), "utf8"));
  const live = loadLiveSession(args.root, args.sessionId, descriptor.descriptorSha256);
  if (!live.ok) throw new Error(live.code);
  const checked = validateConsentRecord(record, { root: args.root, session: live.session, policy: deps.policy });
  if (!checked.ok) throw new Error(checked.code);
  mkdirSync(join(descriptor.repo.commonDir, "agent-pipeline", "run", "agy-session-consent"), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(record)}\n`, { flag: "wx", mode: 0o600 });
  return { status: "recorded", sessionId: args.sessionId, descriptorSha256: descriptor.descriptorSha256, mode: checked.mode };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runConsentCommand(process.argv.slice(2)))}\n`); } catch (error) { process.stderr.write(`AGY-CONSENT-FAILED: ${error.message}\n`); process.exitCode = 2; }
}
