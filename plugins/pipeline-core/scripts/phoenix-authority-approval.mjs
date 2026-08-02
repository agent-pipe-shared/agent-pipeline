#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Human-terminal helper for a signed Phoenix §7 authority revision. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createAuthorityRevisionIntent, verifyAuthorityRevisionProof, AUTHORITY_REVISION_PROOF_SCHEMA } from "../lib/authority-revision-proof.mjs";

const usage = "Usage: phoenix-authority-approval.mjs prepare|approve|verify --repo-root <repo> --directory <external-dir> --proposal <repo-file>";
const outside = (root, target) => { const rel = relative(resolve(root), resolve(target)); return rel === ".." || rel.startsWith("../") || isAbsolute(rel); };
function args(argv) { const [command, ...rest] = argv; const out = { command }; for (let i = 0; i < rest.length; i += 2) { if (!rest[i]?.startsWith("--") || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error(usage); out[rest[i].slice(2).replace(/-([a-z])/gu, (_, x) => x.toUpperCase())] = rest[i + 1]; } if (!new Set(["prepare", "approve", "verify"]).has(command) || !isAbsolute(out.repoRoot ?? "") || !isAbsolute(out.directory ?? "") || !out.proposal) throw new Error(usage); return out; }
function read(path) { return JSON.parse(readFileSync(path, "utf8")); }
function run(argv = process.argv.slice(2)) {
  const value = args(argv); const repo = resolve(value.repoRoot); const dir = resolve(value.directory);
  if (!outside(repo, dir)) throw new Error("approval directory must be outside the repository");
  if (value.command === "prepare") {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const proposal = read(resolve(repo, value.proposal));
    const intent = createAuthorityRevisionIntent(proposal);
    const request = { schema: "pipeline.continuity-authority-revision-request.v1", intent };
    const path = join(dir, "phoenix-authority-revision-request.json");
    if (existsSync(path)) throw new Error("request already exists; refuse overwrite");
    writeFileSync(path, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    return { ok: true, code: "PHOENIX-AUTHORITY-REQUEST-READY", intentSha256: intent.sha256 };
  }
  const request = read(join(dir, "phoenix-authority-revision-request.json")); const proposal = read(resolve(repo, value.proposal)); const policy = read(join(dir, "trust-policy.json"));
  const recomputed = createAuthorityRevisionIntent(proposal);
  if (request?.intent?.sha256 !== recomputed.sha256 || JSON.stringify(request.intent.value) !== JSON.stringify(recomputed.value)) throw new Error("request does not bind the supplied proposal");
  if (value.command === "verify") {
    const proof = read(join(dir, "phoenix-authority-revision-proof.json"));
    const checked = verifyAuthorityRevisionProof({ intent: request?.intent, trustPolicy: policy, proof });
    if (!checked.verified) throw new Error(`proof rejected: ${checked.code}`);
    const { featureId, oldAuthority, nextAuthority, decision, candidate, evidence, expiresAt } = request.intent.value;
    return { ok: true, code: "PHOENIX-AUTHORITY-PROOF-VERIFIED", approval: { schema: "pipeline.continuity-authority-revision-approval.v1", featureId, phase: decision.scope.phase, oldAuthority, nextAuthority, decision, candidate, evidence, expiresAt }, proofSha256: checked.proofSha256 };
  }
  const intent = request?.intent; if (!intent?.sha256 || !policy?.keyReference) throw new Error("request or trust policy invalid");
  const text = join(dir, "phoenix-authority-revision-intent.txt"); const signature = join(dir, "phoenix-authority-revision-signature.bin");
  writeFileSync(text, intent.sha256, { mode: 0o600 });
  try { const result = spawnSync("openssl", ["pkeyutl", "-sign", "-rawin", "-inkey", join(dir, "po-private.pem"), "-in", text, "-out", signature], { stdio: "inherit", shell: false }); if (result.status !== 0) throw new Error("OpenSSL approval failed"); const publicKey = readFileSync(join(dir, "po-public.pem"), "utf8"); const proof = { schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: policy.keyReference, publicKey, signatureBase64: readFileSync(signature).toString("base64") }; writeFileSync(join(dir, "phoenix-authority-revision-proof.json"), `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 }); } finally { rmSync(text, { force: true }); rmSync(signature, { force: true }); }
  return { ok: true, code: "PHOENIX-AUTHORITY-PROOF-READY", intentSha256: intent.sha256 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(run(), null, 2)}\n`); } catch (error) { process.stderr.write(`PHOENIX-AUTHORITY-APPROVAL-FAILED: ${error.message}\n`); process.exitCode = 2; } }
export { run };
