#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Human-terminal helper for the PO proof flow.
 *
 * It is intentionally for a terminal operated by the approving human. The
 * encrypted private key stays outside the checkout and OpenSSL reads its
 * passphrase from that terminal. No password, passphrase, recovery code or
 * private key is accepted as an argument, environment value, stdin payload,
 * repository file, or pipeline state.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { approvalRequestFromExternalJson, run as runApprovalRequest } from "./po-approval-request.mjs";
import { verifyThreatModelApprovalRequest } from "../lib/threat-model-approval-request.mjs";

const USAGE = "Usage: po-human-approval.mjs setup --directory <external-dir> [--key-reference <id>] | prepare --repo-root <repo> --directory <external-dir> | approve --directory <external-dir> | verify --repo-root <repo> --directory <external-dir>";
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const SHA = /^[a-f0-9]{64}$/u;
const text = (value) => typeof value === "string" && value.trim() !== "";

function outside(repoRoot, path) {
  const root = resolve(repoRoot); const target = resolve(path); const rel = relative(root, target);
  return rel === "" ? false : rel === ".." || rel.startsWith("../") || isAbsolute(rel);
}
function fail(message) { throw new Error(message); }
function json(path) { return JSON.parse(readFileSync(path, "utf8")); }
function publicKeyPolicy(publicKey, keyReference) { return { keyReference, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") }; }

export function parseHumanArgs(argv) {
  const [command, ...tokens] = argv; const values = { command, keyReference: "local-po-key" }; const supplied = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index]; const value = tokens[index + 1];
    if (!key?.startsWith("--") || typeof value !== "string" || value.startsWith("--")) return { error: USAGE };
    const normalized = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!new Set(["directory", "repoRoot", "keyReference"]).has(normalized) || supplied.has(normalized)) return { error: USAGE };
    supplied.add(normalized); values[normalized] = value; index += 1;
  }
  if (!new Set(["setup", "prepare", "approve", "verify"]).has(command) || !text(values.directory) || !isAbsolute(values.directory)
    || ((command === "prepare" || command === "verify") && (!text(values.repoRoot) || !isAbsolute(values.repoRoot)))) return { error: USAGE };
  return values;
}

function command(executable, args, dependencies) {
  const result = (dependencies.spawn ?? spawnSync)(executable, args, { stdio: "inherit", shell: false });
  if (result?.status !== 0) fail(`${executable} failed; the human terminal must complete the local prompt`);
}

export function runHumanApproval(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseHumanArgs(argv); if (args.error) fail(args.error);
  const directory = resolve(args.directory); const repository = args.repoRoot === undefined ? null : resolve(args.repoRoot);
  if (repository !== null && !outside(repository, directory)) fail("approval directory must be outside the repository");
  const paths = { request: `${directory}/request.json`, privateKey: `${directory}/po-private.pem`, publicKey: `${directory}/po-public.pem`, authority: `${directory}/trust-policy.json`, proof: `${directory}/proof.json`, signature: `${directory}/signature.bin`, intent: `${directory}/intent.txt` };
  const write = dependencies.writeFile ?? writeFileSync; const read = dependencies.readFile ?? readFileSync; const exists = dependencies.exists ?? existsSync;
  if (args.command === "setup") {
    if (exists(paths.privateKey) || exists(paths.publicKey) || exists(paths.authority)) fail("PO authority already exists; refusing to overwrite it");
    mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
    command("openssl", ["genpkey", "-algorithm", "ED25519", "-aes-256-cbc", "-out", paths.privateKey], dependencies);
    command("openssl", ["pkey", "-in", paths.privateKey, "-pubout", "-out", paths.publicKey], dependencies);
    const authority = publicKeyPolicy(read(paths.publicKey, "utf8"), args.keyReference); write(paths.authority, `${JSON.stringify(authority, null, 2)}\n`, { mode: 0o600 }); chmodSync(paths.privateKey, 0o600);
    return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority };
  }
  if (args.command === "prepare") {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
    const result = runApprovalRequest(["prepare", "--repo-root", repository, "--feature-id", "cyb-4", "--plan", "specs/2026-07-24-sprint-cyborg-epic/prd_cyborg-epic.md", "--spec", "specs/2026-07-24-sprint-cyborg-epic/spec.md", "--model", "specs/cyb-4/threat-model.json"]);
    write(paths.request, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    return { ok: true, code: "PO-HUMAN-REQUEST-READY", candidate: result.value.candidate, intentSha256: result.value.approvalIntent.sha256 };
  }
  if (!exists(paths.request) || !exists(paths.publicKey) || !exists(paths.authority)) fail("run setup and prepare before approving");
  const request = approvalRequestFromExternalJson(json(paths.request));
  const intentSha256 = request?.approvalIntent?.sha256;
  if (!SHA.test(intentSha256 ?? "")) fail("request has no valid approval intent");
  if (args.command === "approve") {
    if (!exists(paths.privateKey)) fail("private key is unavailable");
    write(paths.intent, intentSha256, { mode: 0o600 });
    try { command("openssl", ["pkeyutl", "-sign", "-rawin", "-inkey", paths.privateKey, "-in", paths.intent, "-out", paths.signature], dependencies); }
    finally { rmSync(paths.intent, { force: true }); }
    try {
      const authority = json(paths.authority); const publicKey = read(paths.publicKey, "utf8");
      if (!own(authority, ["keyReference", "publicKeySha256"]) || !text(authority.keyReference) || authority.publicKeySha256 !== publicKeyPolicy(publicKey, authority.keyReference).publicKeySha256) fail("external trust policy does not match the local public key");
      const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256, keyReference: authority.keyReference, publicKey, signatureBase64: Buffer.from(read(paths.signature)).toString("base64") };
      write(paths.proof, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
    } finally { rmSync(paths.signature, { force: true }); }
    return { ok: true, code: "PO-HUMAN-PROOF-READY", intentSha256 };
  }
  if (!exists(paths.proof)) fail("run approve before verify");
  const verified = verifyThreatModelApprovalRequest({ request, trustPolicy: json(paths.authority), proof: json(paths.proof) });
  return { ok: true, value: verified };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(runHumanApproval(), null, 2)}\n`); } catch (error) { process.stderr.write(`PO-HUMAN-APPROVAL-FAILED: ${error.message}\n`); process.exitCode = 2; }
}
