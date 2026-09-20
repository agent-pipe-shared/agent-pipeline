#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Fixed native-Git adapter for the signed push-batch execution core. */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { readLocalRepositoryFingerprint } from "../lib/governance-event-store.mjs";
import { validateGovernanceExportOutbox } from "../lib/governance-export-outbox.mjs";
import { executePushBatch } from "../lib/push-batch-execution.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const usage = "Usage: push-batch-executor.mjs --repo-root <absolute-repository> --subject <external-json> --request <external-json> --trust-policy <external-json> --proof <external-json> --journal-root <external-directory> --outbox <external-json> --export-profile <external-json>";
const sha = (value) => createHash("sha256").update(value).digest("hex");
export function isOutsideRepository(root, target, paths = { relative, isAbsolute, sep }) {
  const remainder = paths.relative(root, target);
  const contained = remainder === "" || (remainder !== ".." && !remainder.startsWith(`..${paths.sep}`) && !paths.isAbsolute(remainder));
  return !contained;
}
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parse(argv) {
  if (argv.length !== 16) fail("PBE-ARGS", usage); const values = new Map();
  for (let index = 0; index < argv.length; index += 2) { if (!argv[index].startsWith("--") || values.has(argv[index]) || argv[index + 1] === undefined) fail("PBE-ARGS", usage); values.set(argv[index], argv[index + 1]); }
  const keys = ["--repo-root", "--subject", "--request", "--trust-policy", "--proof", "--journal-root", "--outbox", "--export-profile"];
  if (keys.some((key) => !values.has(key))) fail("PBE-ARGS", usage);
  return Object.fromEntries(keys.map((key) => [key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase()), values.get(key)]));
}
function jsonExternal(root, path, label) {
  if (!isAbsolute(path) || !isOutsideRepository(root, resolve(path))) fail("PBE-EXTERNAL", `${label} must be outside the repository`);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail("PBE-EXTERNAL", `${label} is unavailable or invalid JSON`); }
}
function git(root, args) { try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never", GIT_ASKPASS: "", SSH_ASKPASS: "" } }).trim(); } catch { fail("PBE-GIT", "required Git observation or operation failed"); } }
function remoteCommit(root, remote, ref) { const lines = git(root, ["ls-remote", "--refs", remote, ref]).split(/\r?\n/u).filter(Boolean); if (lines.length === 0) return null; if (lines.length !== 1) fail("PBE-REMOTE", "remote observation is ambiguous"); const [commit, observedRef, extra] = lines[0].split(/\s+/u); if (extra !== undefined || !OID.test(commit ?? "") || observedRef !== ref) fail("PBE-REMOTE", "remote observation is malformed"); return commit; }
function observe(root, subject, fingerprint) {
  const commit = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]); const tree = git(root, ["rev-parse", "--verify", "HEAD^{tree}"]);
  return { repositoryFingerprint: fingerprint, candidate: { commit, tree }, destinations: subject.destinations.map((member) => {
    const urls = git(root, ["remote", "get-url", "--push", "--all", member.remote]).split(/\r?\n/u).filter(Boolean);
    if (urls.length !== 1 || sha(urls[0]) !== member.endpointSha256) fail("PBE-REMOTE", "signed remote endpoint drifted");
    return { memberId: member.memberId, endpointSha256: member.endpointSha256, remoteCommit: remoteCommit(root, member.remote, member.destinationRef) };
  }) };
}
function atomicWrite(path, value) { const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" }); renameSync(temporary, path); }
export async function run(argv = process.argv.slice(2)) {
  const args = parse(argv); if (!isAbsolute(args.repoRoot)) fail("PBE-ROOT", "repository root must be absolute");
  const root = realpathSync(args.repoRoot); if (root !== resolve(args.repoRoot)) fail("PBE-ROOT", "repository root must be physical");
  if (!isAbsolute(args.journalRoot) || !isOutsideRepository(root, resolve(args.journalRoot)) || !isAbsolute(args.outbox) || !isOutsideRepository(root, resolve(args.outbox))) fail("PBE-EXTERNAL", "journal and outbox must be outside the repository");
  const subject = jsonExternal(root, args.subject, "subject"); const request = jsonExternal(root, args.request, "request"); const trustPolicy = jsonExternal(root, args.trustPolicy, "trust policy"); const proof = jsonExternal(root, args.proof, "proof"); const exportProfile = jsonExternal(root, args.exportProfile, "export profile");
  let outbox; try { outbox = validateGovernanceExportOutbox(jsonExternal(root, args.outbox, "outbox")); } catch { fail("PBE-OUTBOX", "outbox is invalid"); }
  mkdirSync(args.journalRoot, { recursive: true, mode: 0o700 }); const journalRoot = realpathSync(args.journalRoot); if (!isOutsideRepository(root, journalRoot)) fail("PBE-EXTERNAL", "journal root must remain external");
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root }); const observation = observe(root, subject, fingerprint);
  const result = await executePushBatch({ subject, request, trustPolicy, proof, now: new Date().toISOString(), observation, outbox, exportProfile, journal: async (record) => appendFileSync(join(journalRoot, `${record.batchId}.ndjson`), `${JSON.stringify(record)}\n`, { mode: 0o600 }) }, {
    push: async (member) => { try { git(root, ["push", "--porcelain", member.remote, `${member.sourceCommit}:${member.destinationRef}`]); return { pushed: true, remoteCommit: remoteCommit(root, member.remote, member.destinationRef) }; } catch { return { pushed: false, remoteCommit: null }; } },
    persistOutbox: async (next) => atomicWrite(args.outbox, next),
  });
  return result;
}
if (import.meta.url === `file://${process.argv[1]}`) { run().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => { process.stderr.write(`PUSH-BATCH-EXECUTOR-FAILED: ${error.code ?? "PBE"}: ${error.message}\n`); process.exitCode = 2; }); }
