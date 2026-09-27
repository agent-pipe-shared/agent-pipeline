#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Exact, operator-attended configuration of #9 inherited ADR sources. */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync,
  realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { organizationArchitectureConfigIntentSha256,
  organizationArchitectureConfigSubject,
  ORGANIZATION_ARCHITECTURE_CONFIG_PATH,
  inspectConfiguredOrganizationArchitectureSources } from "../lib/organization-architecture-source-store.mjs";
import { canonical, verifyPoApprovalProof } from "../lib/po-approval-proof.mjs";

const DRAFT = "scratch/architecture-inherited-sources-draft.json";
const REQUEST = /^scratch\/architecture-inherited-sources-request-([a-f0-9]{12})\.json$/u;
const fail = (code) => ({ ok: false, code });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (value) => Buffer.from(`${canonical(value)}\n`, "utf8");

function physicalJson(path, maxBytes) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > maxBytes
    || realpathSync(path) !== path) throw new Error("unsafe-file");
  const raw = readFileSync(path);
  return { raw, value: parseStrictJson(raw) };
}

function physicalRoot(root) {
  try { return typeof root === "string" && isAbsolute(root) && realpathSync(root) === resolve(root)
    && lstatSync(root).isDirectory() ? root : null; }
  catch { return null; }
}

function physicalDirectory(path) {
  try { return lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink()
    && realpathSync(path) === path; }
  catch { return false; }
}

function readCurrent(root) {
  const path = join(root, ORGANIZATION_ARCHITECTURE_CONFIG_PATH);
  if (!existsSync(path)) return { path, sha256: null };
  const current = physicalJson(path, 128 * 1024);
  return { path, sha256: sha(current.raw) };
}

function trustAnchors(root) {
  const policy = physicalJson(join(root, "project/critical-human-proof.json"), 64 * 1024).value;
  if (policy?.schema !== "pipeline.critical-human-proof-policy.v3"
    || !Array.isArray(policy.trustAnchors) || policy.trustAnchors.length === 0) return null;
  return policy.trustAnchors;
}

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function requestRecord(root) {
  const draft = physicalJson(join(root, DRAFT), 128 * 1024).value;
  if (!exact(draft, ["schema", "sources"]) || draft.schema !== "pipeline.organization-architecture-config-draft.v1") return null;
  const current = readCurrent(root);
  const subject = organizationArchitectureConfigSubject({
    schema: "pipeline.organization-architecture-config.v1", sources: draft.sources,
    expectedPriorSha256: current.sha256,
  });
  if (!subject) return null;
  return { schema: "pipeline.organization-architecture-config-request.v1",
    subject, intentSha256: organizationArchitectureConfigIntentSha256(subject) };
}

function publishExclusive(path, value) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, value); fsyncSync(fd); }
  finally { closeSync(fd); }
}

export function runArchitectureInheritedSources(argv = process.argv.slice(2)) {
  if (!Array.isArray(argv) || !["prepare", "apply", "inspect"].includes(argv[0])
    || argv.length < 3 || argv[1] !== "--root") return fail("ORG-ARCH-CLI-ARGUMENTS");
  const root = physicalRoot(argv[2]);
  if (!root) return fail("ORG-ARCH-CLI-ROOT");
  if (!physicalDirectory(join(root, "project"))) return fail("ORG-ARCH-CLI-PROJECT-DIRECTORY");
  const command = argv[0];
  if (command === "inspect") {
    if (argv.length !== 3) return fail("ORG-ARCH-CLI-ARGUMENTS");
    const result = inspectConfiguredOrganizationArchitectureSources({ rootDir: root,
      now: new Date().toISOString() });
    return { ok: result.status !== "blocked", code: result.code, result };
  }
  if (command === "prepare") {
    if (argv.length !== 3) return fail("ORG-ARCH-CLI-ARGUMENTS");
    if (!physicalDirectory(join(root, "scratch"))) return fail("ORG-ARCH-CLI-SCRATCH-DIRECTORY");
    let request;
    try { request = requestRecord(root); }
    catch { return fail("ORG-ARCH-CLI-DRAFT-UNAVAILABLE"); }
    if (!request) return fail("ORG-ARCH-CLI-DRAFT-INVALID");
    const requestPath = `scratch/architecture-inherited-sources-request-${request.intentSha256.slice(0, 12)}.json`;
    const path = join(root, requestPath);
    try {
      const expected = bytes(request);
      if (existsSync(path)) {
        if (!physicalJson(path, 128 * 1024).raw.equals(expected)) return fail("ORG-ARCH-CLI-REQUEST-DRIFT");
      } else publishExclusive(path, expected);
    } catch { return fail("ORG-ARCH-CLI-REQUEST-WRITE"); }
    return { ok: true, code: "ORG-ARCH-CONFIG-SIGNATURE-REQUEST-READY",
      requestPath, intentSha256: request.intentSha256 };
  }
  if (argv.length !== 5 || argv[3] !== "--request" || !REQUEST.test(argv[4])) return fail("ORG-ARCH-CLI-ARGUMENTS");
  if (!physicalDirectory(join(root, "scratch"))) return fail("ORG-ARCH-CLI-SCRATCH-DIRECTORY");
  const requestPath = argv[4];
  let request;
  let proof;
  let current;
  let anchors;
  try {
    request = physicalJson(join(root, requestPath), 128 * 1024).value;
    proof = physicalJson(join(root, requestPath.replace("-request-", "-proof-")), 32 * 1024).value;
    current = readCurrent(root);
    anchors = trustAnchors(root);
  } catch { return fail("ORG-ARCH-CLI-INPUT-UNAVAILABLE"); }
  if (!exact(request, ["schema", "subject", "intentSha256"])
    || request.schema !== "pipeline.organization-architecture-config-request.v1"
    || organizationArchitectureConfigIntentSha256(request.subject) !== request.intentSha256
    || requestPath !== `scratch/architecture-inherited-sources-request-${request.intentSha256.slice(0, 12)}.json`
    || request.subject.expectedPriorSha256 !== current.sha256
    || !Array.isArray(anchors) || !anchors.some((anchor) => verifyPoApprovalProof({
      intent: { sha256: request.intentSha256 }, trustPolicy: anchor, proof,
    }).verified)) return fail("ORG-ARCH-CLI-AUTHORITY-OR-PREIMAGE");
  const config = { ...request.subject, proof };
  const expected = bytes(config);
  const lock = join(root, "project", ".architecture-inherited-sources.lock");
  let lockFd;
  let temp = null;
  try {
    lockFd = openSync(lock, "wx", 0o600);
    if (readCurrent(root).sha256 !== request.subject.expectedPriorSha256) return fail("ORG-ARCH-CLI-PREIMAGE-DRIFT");
    if (current.sha256 === null) publishExclusive(current.path, expected);
    else {
      temp = join(root, "project", `.architecture-inherited-sources-${request.intentSha256.slice(0, 12)}.tmp`);
      publishExclusive(temp, expected);
      if (readCurrent(root).sha256 !== current.sha256) return fail("ORG-ARCH-CLI-PREIMAGE-DRIFT");
      renameSync(temp, current.path);
      temp = null;
    }
    if (!physicalJson(current.path, 128 * 1024).raw.equals(expected)) return fail("ORG-ARCH-CLI-READBACK-MISMATCH");
    return { ok: true, code: "ORG-ARCH-CONFIG-ACTIVATED", configurationPath: ORGANIZATION_ARCHITECTURE_CONFIG_PATH,
      intentSha256: request.intentSha256, configurationSha256: sha(expected) };
  } catch { return fail("ORG-ARCH-CLI-ACTIVATION-FAILED"); }
  finally {
    if (temp) { try { unlinkSync(temp); } catch { /* leave typed failure */ } }
    if (lockFd !== undefined) { closeSync(lockFd); try { unlinkSync(lock); } catch { /* recovery required */ } }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runArchitectureInheritedSources();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 2;
}
