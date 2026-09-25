#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Host-only preparation and exclusive publication of a PO-signed Critic export. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agyHostGitEnvironment } from "../lib/agy-host-commit-admission.mjs";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { canonical } from "../lib/po-approval-proof.mjs";
import { PORTABLE_CRITIC_EXPORT_PATH, PORTABLE_CRITIC_EXPORT_SCHEMA,
  portableCriticExportRequest, preparePortableCriticExport,
  validatePortableCriticExportRequest, verifyPortableCriticExport } from "../lib/portable-critic-export.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { physicalDirectory, publishExclusiveAgyExportArtifact,
  readPhysicalJson } from "./portable-agy-authorship-export.mjs";

const PACKET = /^[a-f0-9]{32}$/u;
const POLICY = "project/critical-human-proof.json";
const PLAN = "specs/sprint-alfred-epic/plans/sprint-alfred-execution-roadmap.md";
const SPEC = "specs/sprint-alfred-epic/spec.md";
const MAX_REQUEST = 128 * 1024;
const MAX_PROOF = 16 * 1024;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => ({ ok: false, code });

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 5
    || !["prepare", "check", "publish"].includes(argv[0])) return null;
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    if (!["--root", "--packet-id"].includes(argv[index])
      || Object.hasOwn(values, argv[index])) return null;
    values[argv[index]] = argv[index + 1];
  }
  if (!isAbsolute(values["--root"] ?? "") || !PACKET.test(values["--packet-id"] ?? "")) return null;
  return { action: argv[0], root: values["--root"], packetId: values["--packet-id"] };
}

function git(root, args, encoding = "utf8") {
  return execFileSync("git", ["-C", root, ...args], { encoding,
    timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...agyHostGitEnvironment(), GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1" },
    stdio: ["ignore", "pipe", "ignore"] });
}

function requestPath(root, packetId) {
  return join(root, "scratch", `portable-critic-export-request-${packetId}.json`);
}

function proofPath(root, packetId) {
  return join(root, "scratch", `portable-critic-export-proof-${packetId}.json`);
}

function canonicalBytes(value) { return Buffer.from(`${canonical(value)}\n`, "utf8"); }

/** Re-derive the review candidate and immutable plan/spec bytes from Git. */
export function currentPortableCriticExportSource(root) {
  try {
    if (typeof root !== "string" || !isAbsolute(root)
      || realpathSync(root) !== resolve(root) || lstatSync(root).isSymbolicLink()) return null;
    const repo = discoverRepository(root);
    if (repo.primaryRoot !== root || repo.start !== root) return null;
    const commit = git(root, ["rev-parse", "HEAD"]).trim();
    const tree = git(root, ["rev-parse", "HEAD^{tree}"]).trim();
    const dirty = git(root, ["status", "--porcelain=v1", "-z"], null);
    if (dirty.length !== 0) return null;
    const candidate = { commit, tree };
    const planSha256 = sha256(git(root, ["show", `${commit}:${PLAN}`], null));
    const specSha256 = sha256(git(root, ["show", `${commit}:${SPEC}`], null));
    const policy = parseStrictJson(git(root, ["show", `${commit}:${POLICY}`], null));
    if (policy?.schema !== "pipeline.critical-human-proof-policy.v3"
      || !Array.isArray(policy.trustAnchors) || policy.trustAnchors.length === 0) return null;
    return { repo, candidate, planSha256, specSha256, trustAnchors: policy.trustAnchors };
  } catch { return null; }
}

/** No caller-supplied verdict or subject is accepted on the productive CLI. */
export function runPortableCriticExport(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  if (!args) return fail("CRITIC-EXPORT-USAGE");
  const source = (dependencies.currentSource ?? currentPortableCriticExportSource)(args.root);
  if (!source) return fail("CRITIC-EXPORT-CANDIDATE-UNAVAILABLE");
  let prepared;
  try {
    prepared = (dependencies.prepare ?? preparePortableCriticExport)({
      gitCommonDir: source.repo.commonDir, criticPacketId: args.packetId,
      candidate: source.candidate, planSha256: source.planSha256,
      specSha256: source.specSha256,
    });
  } catch { return fail("CRITIC-EXPORT-CONSUMED-REVIEW-UNAVAILABLE"); }
  let request;
  try { request = portableCriticExportRequest(prepared); }
  catch { return fail("CRITIC-EXPORT-REQUEST-INVALID"); }
  const expectedBytes = canonicalBytes(request);
  const path = requestPath(args.root, args.packetId);
  if (args.action === "prepare") {
    try {
      physicalDirectory(args.root, "scratch", { create: true });
      try { publishExclusiveAgyExportArtifact(path, expectedBytes, 0o600); }
      catch (error) {
        if (error?.code !== "EEXIST" || !readPhysicalJson(path, MAX_REQUEST).bytes.equals(expectedBytes)) {
          return fail("CRITIC-EXPORT-REQUEST-DRIFT");
        }
      }
    } catch { return fail("CRITIC-EXPORT-REQUEST-WRITE"); }
    return { ok: true, code: "CRITIC-EXPORT-SIGNATURE-REQUEST-READY",
      requestPath: path, intentSha256: request.intentSha256,
      exportPath: PORTABLE_CRITIC_EXPORT_PATH };
  }
  let stored;
  try {
    physicalDirectory(args.root, "scratch");
    stored = readPhysicalJson(path, MAX_REQUEST);
    if (!stored.bytes.equals(canonicalBytes(stored.value))
      || !validatePortableCriticExportRequest(stored.value, source)
      || canonical(stored.value) !== canonical(request)) return fail("CRITIC-EXPORT-REQUEST-DRIFT");
  } catch { return fail("CRITIC-EXPORT-REQUEST-UNAVAILABLE"); }
  if (args.action === "check") return { ok: true, code: "CRITIC-EXPORT-CONSUMED-REVIEW-BOUND",
    requestPath: path, intentSha256: request.intentSha256 };
  let proof;
  try { proof = readPhysicalJson(proofPath(args.root, args.packetId), MAX_PROOF).value; }
  catch { return fail("CRITIC-EXPORT-PROOF-UNAVAILABLE"); }
  const exportRecord = { schema: PORTABLE_CRITIC_EXPORT_SCHEMA,
    subject: request.subject, approvalIntent: request.approvalIntent, proof };
  const checked = verifyPortableCriticExport({ exportRecord, candidate: source.candidate,
    receiptSha256: request.subject.producer.receiptSha256,
    planSha256: source.planSha256, specSha256: source.specSha256,
    trustAnchors: source.trustAnchors });
  if (!checked.ok) return fail("CRITIC-EXPORT-PROOF-INVALID");
  const target = join(args.root, PORTABLE_CRITIC_EXPORT_PATH);
  try {
    physicalDirectory(args.root, "specs/sprint-alfred-epic/evidence");
    publishExclusiveAgyExportArtifact(target, canonicalBytes(exportRecord), 0o644);
    const readback = readPhysicalJson(target, MAX_REQUEST);
    if (!readback.bytes.equals(canonicalBytes(exportRecord))) return fail("CRITIC-EXPORT-READBACK");
  } catch { return fail("CRITIC-EXPORT-PUBLICATION"); }
  return { ok: true, code: "CRITIC-EXPORT-PUBLISHED", exportPath: PORTABLE_CRITIC_EXPORT_PATH,
    sha256: sha256(canonicalBytes(exportRecord)), reviewedCommit: source.candidate.commit };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runPortableCriticExport();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
