#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** External-store helper for an explicitly non-authorizing remote acknowledgement. */
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { consumeRemoteProvisionalReceipt, createRemoteProvisionalReceipt } from "../lib/remote-provisional-receipt.mjs";

const USAGE = "Usage: remote-provisional-approval.mjs issue --repo-root <repo> --directory <external-dir> --candidate-commit <oid> --candidate-tree <oid> --scope-sha256 <sha256> --code <code> --expires-at <ISO-8601> | consume --repo-root <repo> --directory <external-dir> --candidate-commit <oid> --candidate-tree <oid> --scope-sha256 <sha256> --code <code>";

function outside(root, path) { const rel = relative(resolve(root), resolve(path)); return rel === ".." || rel.startsWith("../") || isAbsolute(rel); }
function parse(argv) {
  const [command, ...tokens] = argv; const value = { command };
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index]; const item = tokens[index + 1];
    if (!key?.startsWith("--") || typeof item !== "string" || Object.hasOwn(value, key.slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase()))) return { error: USAGE };
    value[key.slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase())] = item;
  }
  if (!new Set(["issue", "consume"]).has(command) || !isAbsolute(value.repoRoot ?? "") || !isAbsolute(value.directory ?? "")
    || !value.candidateCommit || !value.candidateTree || !value.scopeSha256 || !value.code || (command === "issue" && !value.expiresAt)) return { error: USAGE };
  return value;
}
function externalDirectory(repoRoot, directory, create) {
  if (!outside(repoRoot, directory)) throw new Error("provisional directory must be outside the repository");
  if (create) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("provisional directory is unsafe");
  return resolve(directory);
}
function receiptPath(directory) {
  const path = join(directory, "remote-provisional-receipt.json");
  if (existsSync(path)) { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("provisional receipt is unsafe"); }
  return path;
}
function store(path, value) {
  const temporary = join(dirname(path), `.${basename(path)}.new`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}
export function run(argv = process.argv.slice(2), dependencies = {}) {
  const args = parse(argv); if (args.error) throw new Error(args.error);
  const directory = externalDirectory(args.repoRoot, args.directory, args.command === "issue");
  const path = receiptPath(directory); const candidate = { commit: args.candidateCommit, tree: args.candidateTree };
  const now = dependencies.now?.() ?? new Date().toISOString();
  if (args.command === "issue") {
    if (existsSync(path)) throw new Error("a provisional receipt already exists; consume or remove it from the external app store");
    const receipt = createRemoteProvisionalReceipt({ candidate, scopeSha256: args.scopeSha256, code: args.code, expiresAt: args.expiresAt, now });
    store(path, receipt); return { ok: true, code: "REMOTE-PROVISIONAL-ISSUED", candidate, scopeSha256: args.scopeSha256, expiresAt: args.expiresAt };
  }
  if (!existsSync(path)) throw new Error("no provisional receipt is available");
  const result = consumeRemoteProvisionalReceipt({ receipt: JSON.parse(readFileSync(path, "utf8")), candidate, scopeSha256: args.scopeSha256, code: args.code, now });
  if (!result.ok) throw new Error(result.code);
  store(path, result.value); return { ok: true, code: "REMOTE-PROVISIONAL-CONSUMED", candidate, scopeSha256: args.scopeSha256, consumedAt: now };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(run(), null, 2)}\n`); } catch (error) { process.stderr.write(`REMOTE-PROVISIONAL-FAILED: ${error.message}\n`); process.exitCode = 2; }
}
