#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Attended-recovery CLI, slice S7: the VERIFY-ONLY verb (Spec RV-8). It decides,
// from operator-selected inputs alone, whether a detached human Ed25519
// authorization for a recovery package is genuine, anchored, bound to this
// repository and bound to the supplied artifact bytes. It has no write path: it
// never creates, changes or removes a file, never refreshes the git index, and
// never starts a journal step (so `hooks.beforeStep` is never invoked).
//
// Standalone by construction (design note Q1): `node:` built-ins only. Nothing is
// imported from the plugin or from a sibling harness file, because this tool is
// the route taken when those may be broken. The proof recipe (`canonical`, the
// intent shape, the Ed25519 check) is therefore inlined below, reproducing
// `canonical`, `createPoApprovalIntent` and `verifyPoApprovalProof` of
// plugins/pipeline-core/lib/po-approval-proof.mjs; the S7 test pins that this
// file builds and verifies signatures exactly as that source does.
//
// The only process this file spawns is one read-only git call:
// `git rev-list --max-parents=0 HEAD` (with `--format=%T` so the root commit's
// tree comes back in the same call).
//
// Check order, first failure wins: repository -> anchor -> signature -> artifact.
//   ATR-REPOSITORY-MISMATCH  the root commit/tree is not the one the package and
//                            the signed intent name
//   ATR-ANCHOR-MISMATCH      the presented signer key is not the operator anchor
//   ATR-SIGNATURE-INVALID    the signature, the intent or the signed package
//                            binding does not hold
//   ATR-ARTIFACT-MISMATCH    the artifact bytes differ from the signed digest
// Beyond those four (named by the design note), three typed refusals cover input
// that never reaches a check: ATR-VERB-UNSUPPORTED (any verb but `verify`),
// ATR-ARGUMENTS-INVALID (flags) and ATR-INPUT-INVALID (unreadable or malformed
// authorization/anchor). A refusal is a returned result, never a throw.
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RESULT_SCHEMA = "pipeline.attended-recovery-result.v1";
const PACKAGE_SCHEMA = "pipeline.attended-recovery-package.v1";
const AUTHORIZATION_SCHEMA = "pipeline.attended-recovery-authorization.v1";
const INTENT_SCHEMA = "pipeline.po-approval-intent.v1";
const PROOF_SCHEMA = "pipeline.po-approval-proof.v1";
const INTENT_KIND = "attended-recovery";
const INTENT_DECISION = "approve";
const FLAGS = ["--repo", "--artifact", "--anchor", "--authorization"];
const INTENT_KEYS = ["schema", "kind", "featureId", "planSha256", "specSha256", "candidate", "policyRevision", "subjectSha256", "decision"];
const PROOF_KEYS = ["schema", "intentSha256", "keyReference", "publicKey", "signatureBase64"];
// Variables that would silently redirect git to a different repository than --repo.
const GIT_REDIRECT = /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|REPLACE_REF_BASE|GRAFT_FILE|SHALLOW_FILE)$/u;

const matches = (pattern, value) => typeof value === "string" && pattern.test(value);
const isSha = (value) => matches(/^[a-f0-9]{64}$/u, value);
const isOid = (value) => matches(/^[a-f0-9]{40,64}$/u, value);
const isId = (value) => matches(/^[a-z][a-z0-9-]{0,63}$/u, value);
const isText = (value) => typeof value === "string" && value.trim() !== "";
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasExactly = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);

class Refusal extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const outcome = (status, code) => ({ schema: RESULT_SCHEMA, status, code, prerequisite: null, mutated: false });

function parseFlags(tokens) {
  const flags = Object.create(null);
  for (let index = 0; index < tokens.length; index += 2) {
    const name = tokens[index];
    const value = tokens[index + 1];
    if (!FLAGS.includes(name) || Object.hasOwn(flags, name) || !isText(value) || value.startsWith("--")) throw new Refusal("ATR-ARGUMENTS-INVALID");
    flags[name] = value;
  }
  if (!FLAGS.every((name) => Object.hasOwn(flags, name))) throw new Refusal("ATR-ARGUMENTS-INVALID");
  return flags;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/u, ""));
  } catch {
    throw new Refusal("ATR-INPUT-INVALID");
  }
}

// Repository identity (design note Q2 A): the root commit OID, with its tree.
// Fail closed when the identity is not exactly one root (none, several, or git failing).
function rootIdentity(repo) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  for (const key of Object.keys(env)) if (GIT_REDIRECT.test(key)) delete env[key];
  let output;
  try {
    output = execFileSync("git", ["-c", "color.ui=false", "--no-replace-objects", "rev-list", "--max-parents=0", "--format=%T", "HEAD"], {
      cwd: repo,
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      windowsHide: true,
    });
  } catch {
    throw new Refusal("ATR-REPOSITORY-MISMATCH");
  }
  const lines = output.split(/\r?\n/u).filter((line) => line !== "");
  const header = lines.length === 2 ? /^commit ([a-f0-9]{40,64})$/u.exec(lines[0]) : null;
  if (header === null || !isOid(lines[1])) throw new Refusal("ATR-REPOSITORY-MISMATCH");
  return { commit: header[1], tree: lines[1] };
}

// The intent has the exact `createPoApprovalIntent` shape; its candidate names the root commit and tree.
function intentIsWellFormed(intent) {
  return (
    hasExactly(intent, INTENT_KEYS) &&
    intent.schema === INTENT_SCHEMA &&
    isId(intent.kind) &&
    isId(intent.featureId) &&
    isSha(intent.planSha256) &&
    isSha(intent.specSha256) &&
    hasExactly(intent.candidate, ["commit", "tree"]) &&
    isOid(intent.candidate.commit) &&
    isOid(intent.candidate.tree) &&
    intent.candidate.commit !== intent.candidate.tree &&
    isId(intent.policyRevision) &&
    isSha(intent.subjectSha256) &&
    isId(intent.decision)
  );
}

// Ed25519 over the UTF-8 hex intent sha256 (`verifyPoApprovalProof`'s recipe).
function signatureHolds(intentSha256, proof) {
  if (!hasExactly(proof, PROOF_KEYS) || proof.schema !== PROOF_SCHEMA || !isText(proof.publicKey) || !isText(proof.signatureBase64)) return false;
  try {
    if (createPublicKey(proof.publicKey).asymmetricKeyType !== "ed25519") return false;
    const signature = Buffer.from(proof.signatureBase64, "base64");
    return signature.length > 0 && verify(null, Buffer.from(intentSha256, "utf8"), proof.publicKey, signature);
  } catch {
    return false;
  }
}

function verifyOnly(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || typeof argv[0] !== "string") throw new Refusal("ATR-ARGUMENTS-INVALID");
  if (argv[0] !== "verify") throw new Refusal("ATR-VERB-UNSUPPORTED");
  const flags = parseFlags(argv.slice(1));

  const authorization = readJson(flags["--authorization"]);
  const anchor = readJson(flags["--anchor"]);
  if (
    !hasExactly(authorization, ["schema", "package", "intent", "proof"]) ||
    authorization.schema !== AUTHORIZATION_SCHEMA ||
    !isRecord(authorization.package) ||
    authorization.package.schema !== PACKAGE_SCHEMA ||
    !isRecord(authorization.intent) ||
    !isRecord(authorization.proof) ||
    !(hasExactly(anchor, ["keyReference", "publicKeySha256"]) || hasExactly(anchor, ["keyReference", "publicKeySha256", "humanName"])) ||
    !isText(anchor.keyReference) ||
    !isSha(anchor.publicKeySha256)
  ) {
    throw new Refusal("ATR-INPUT-INVALID");
  }
  const { package: recoveryPackage, intent, proof } = authorization;

  // 1. repository
  const identity = rootIdentity(flags["--repo"]);
  const named = recoveryPackage.repository;
  const candidate = intent.candidate;
  if (
    !isRecord(named) ||
    named.rootCommit !== identity.commit ||
    named.rootTree !== identity.tree ||
    !isRecord(candidate) ||
    candidate.commit !== identity.commit ||
    candidate.tree !== identity.tree
  ) {
    throw new Refusal("ATR-REPOSITORY-MISMATCH");
  }

  // 2. anchor: trust comes only from the operator-selected anchor file, never from the repository.
  if (!isText(proof.keyReference) || proof.keyReference !== anchor.keyReference || !isText(proof.publicKey) || sha256(proof.publicKey) !== anchor.publicKeySha256) {
    throw new Refusal("ATR-ANCHOR-MISMATCH");
  }

  // 3. signature: a valid Ed25519 proof over this attended-recovery intent, which binds this package.
  if (
    !intentIsWellFormed(intent) ||
    intent.kind !== INTENT_KIND ||
    intent.decision !== INTENT_DECISION ||
    sha256(canonical(intent)) !== proof.intentSha256 ||
    !signatureHolds(proof.intentSha256, proof) ||
    intent.subjectSha256 !== sha256(canonical(recoveryPackage))
  ) {
    throw new Refusal("ATR-SIGNATURE-INVALID");
  }

  // 4. artifact: the raw bytes of the operator-selected file are the signed ones.
  let artifactBytes;
  try {
    artifactBytes = readFileSync(flags["--artifact"]);
  } catch {
    throw new Refusal("ATR-ARTIFACT-MISMATCH");
  }
  if (!isSha(recoveryPackage.artifactSha256) || sha256(artifactBytes) !== recoveryPackage.artifactSha256) throw new Refusal("ATR-ARTIFACT-MISMATCH");

  return outcome("verified", null);
}

// `io.hooks.beforeStep` is the crash-injection seam of the later write slice. Verify
// starts no journal step, so it is deliberately never read, let alone invoked.
export async function run(argv, io = {}) {
  void io;
  try {
    return verifyOnly(argv);
  } catch (error) {
    return outcome("refused", error instanceof Refusal ? error.code : "ATR-INPUT-INVALID");
  }
}

async function main() {
  const result = await run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "verified" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
