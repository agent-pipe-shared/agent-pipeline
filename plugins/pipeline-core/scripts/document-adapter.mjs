#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Immutable private registration for a trusted document-renderer adapter.
 *
 * This vertical owns only opaque adapter-ID reservations and their exact
 * private records. Invocation, Policy binding, request staging and rendering
 * deliberately belong to later Hawkeye slices.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { issueDocumentId, readDocumentIdReservation } from "../lib/document-identifiers.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import {
  PrivateBoundaryError,
  assertPrivateRegularFile,
  readPrivateFile,
  writePrivateFileNoReplaceAtomic,
} from "../lib/private-boundary.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";

export const PRIVATE_DOCUMENT_ADAPTER_SCHEMA = "pipeline.private-document-adapter.v1";
export const DOCUMENT_RENDERER_STDIO_PROTOCOL = "pipeline.document-renderer-stdio.v1";

const ADAPTER_ID = /^da_[a-z2-7]{25}[aeimquy4]$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const KEYS = ["schema", "repoFingerprint", "adapterId", "executablePath", "executableSha256", "protocol", "registeredBy", "registeredAt"];

export class DocumentAdapterError extends Error {
  constructor(code, message) { super(message); this.name = "DocumentAdapterError"; this.code = code; }
}

function fail(code, message) { throw new DocumentAdapterError(code, message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value) { return isObject(value) && Object.keys(value).length === KEYS.length && KEYS.every((key) => Object.hasOwn(value, key)); }
function canonicalIso(value) { return typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function assertExecutable(path) {
  if (typeof path !== "string" || path.includes("\0") || !isAbsolute(path) || resolve(path) !== path) {
    fail("DA-EXECUTABLE", "adapter executable path must be canonical absolute");
  }
  let info;
  try { info = lstatSync(path); }
  catch { fail("DA-EXECUTABLE", "adapter executable is unavailable"); }
  // POSIX exposes an executable-bit mode; Windows has no such mode semantics (every
  // regular file reports the same synthetic mode regardless of real executability),
  // so the bit check applies only off win32. Single-link/regular/physical remain hard
  // on every platform.
  const posixNotExecutable = process.platform !== "win32" && (info.mode & 0o111) === 0;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || posixNotExecutable) {
    fail("DA-EXECUTABLE", "adapter executable must be an executable single-link regular file");
  }
  try {
    if (realpathSync(path) !== path) fail("DA-EXECUTABLE", "adapter executable must be physical");
  } catch (error) {
    if (error instanceof DocumentAdapterError) throw error;
    fail("DA-EXECUTABLE", "adapter executable is unavailable");
  }
  return path;
}

function executableSha256(path) {
  assertExecutable(path);
  try { return sha256(readFileSync(path)); }
  catch { fail("DA-EXECUTABLE", "adapter executable could not be hashed"); }
}

/** Validate one complete immutable record and fail if its trusted executable drifted. */
export function validatePrivateDocumentAdapter(adapter) {
  if (!exactKeys(adapter) || adapter.schema !== PRIVATE_DOCUMENT_ADAPTER_SCHEMA
    || !SHA256.test(adapter.repoFingerprint ?? "") || !ADAPTER_ID.test(adapter.adapterId ?? "")
    || typeof adapter.executablePath !== "string" || !SHA256.test(adapter.executableSha256 ?? "")
    || adapter.protocol !== DOCUMENT_RENDERER_STDIO_PROTOCOL || !ACTOR.test(adapter.registeredBy ?? "")
    || !canonicalIso(adapter.registeredAt)) {
    fail("DA-SCHEMA", "private document adapter has an invalid closed shape");
  }
  if (executableSha256(adapter.executablePath) !== adapter.executableSha256) {
    fail("DA-DIGEST", "adapter executable digest differs from its immutable registration");
  }
  return clone(adapter);
}

function canonicalAdapterBytes(adapter) {
  const validated = validatePrivateDocumentAdapter(adapter);
  return `${JSON.stringify(Object.fromEntries(KEYS.map((key) => [key, validated[key]])), null, 2)}\n`;
}

export function resolvePrivateDocumentAdapter(repoRoot, adapterId, options = {}) {
  if (typeof adapterId !== "string" || !ADAPTER_ID.test(adapterId)) fail("DA-ID", "adapter ID is not canonical");
  const repo = discoverRepository(repoRoot, options);
  const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
  const root = join(repo.commonDir, "agent-pipeline", "document-hooks", repoFingerprint, "adapters");
  return { repo, repoFingerprint, adapterId, root, path: join(root, `${adapterId}.json`) };
}

/** The sole issuance path for adapter identifiers. */
export function issueDocumentAdapterId(repoRoot, options = {}) {
  return issueDocumentId(repoRoot, { ...options, prefix: "da", purpose: "adapter" });
}

/** Exact-ID readback: no scan, fallback or synthesized record. */
export function readPrivateDocumentAdapter(repoRoot, adapterId, options = {}) {
  const target = resolvePrivateDocumentAdapter(repoRoot, adapterId, options);
  if (!existsSync(target.path)) fail("DA-MISSING", "private document adapter is missing");
  let bytes;
  let adapter;
  try {
    assertPrivateRegularFile(target.path, "private document adapter");
    bytes = readPrivateFile(target.path, "private document adapter");
    adapter = JSON.parse(bytes);
  } catch (error) {
    if (error instanceof PrivateBoundaryError) fail("DA-BOUNDARY", error.message);
    fail("DA-RECORD", "private document adapter is malformed");
  }
  validatePrivateDocumentAdapter(adapter);
  if (adapter.repoFingerprint !== target.repoFingerprint || adapter.adapterId !== target.adapterId || canonicalAdapterBytes(adapter) !== bytes) {
    fail("DA-RECORD", "private document adapter does not match its exact repository/ID target");
  }
  return { ...target, adapter: clone(adapter), sha256: sha256(bytes) };
}

function requireAdapterReservation(repoRoot, adapterId, options) {
  try { readDocumentIdReservation(repoRoot, adapterId, { ...options, purpose: "adapter" }); }
  catch (error) {
    if (["DI-MISSING", "DI-PURPOSE", "DI-REPOSITORY"].includes(error?.code)) {
      fail("DA-RESERVATION", "private document adapter ID was not issued for adapter registration");
    }
    throw error;
  }
}

function sameRegistration(existing, requested) {
  return existing.repoFingerprint === requested.repoFingerprint
    && existing.adapterId === requested.adapterId
    && existing.executablePath === requested.executablePath
    && existing.executableSha256 === requested.executableSha256
    && existing.protocol === requested.protocol
    && existing.registeredBy === requested.registeredBy;
}

/**
 * Register a trusted executable exactly once. Repeating the same registration
 * preserves the original timestamp and attribution; every meaningful drift
 * conflicts rather than replacing immutable private state.
 */
export function registerPrivateDocumentAdapter(repoRoot, {
  adapterId,
  executablePath,
  expectedSha256,
  registeredBy,
  now = () => new Date(),
  ...options
} = {}) {
  const target = resolvePrivateDocumentAdapter(repoRoot, adapterId, options);
  if (!SHA256.test(expectedSha256 ?? "")) fail("DA-DIGEST", "expected executable digest is not canonical SHA-256");
  if (!ACTOR.test(registeredBy ?? "")) fail("DA-ACTOR", "registering actor is not canonical");
  const actualSha256 = executableSha256(executablePath);
  if (actualSha256 !== expectedSha256) fail("DA-DIGEST", "adapter executable digest differs from the expected SHA-256");
  requireAdapterReservation(repoRoot, target.adapterId, options);
  const requested = {
    schema: PRIVATE_DOCUMENT_ADAPTER_SCHEMA,
    repoFingerprint: target.repoFingerprint,
    adapterId: target.adapterId,
    executablePath,
    executableSha256: actualSha256,
    protocol: DOCUMENT_RENDERER_STDIO_PROTOCOL,
    registeredBy,
  };
  if (existsSync(target.path)) {
    const existing = readPrivateDocumentAdapter(repoRoot, target.adapterId, options);
    if (!sameRegistration(existing.adapter, requested)) fail("DA-CONFLICT", "private document adapter is immutable and differs from this registration");
    return { ...existing, created: false };
  }
  const timestamp = now();
  const adapter = { ...requested, registeredAt: timestamp instanceof Date ? timestamp.toISOString() : timestamp };
  const bytes = canonicalAdapterBytes(adapter);
  try {
    const write = writePrivateFileNoReplaceAtomic(target.path, bytes);
    if (!write.created) return registerPrivateDocumentAdapter(repoRoot, { adapterId, executablePath, expectedSha256, registeredBy, now, ...options });
  } catch (error) {
    if (error instanceof PrivateBoundaryError) fail("DA-BOUNDARY", error.message);
    throw error;
  }
  return { ...readPrivateDocumentAdapter(repoRoot, target.adapterId, options), created: true };
}

function parseArgs(argv) {
  if (argv.length === 3 && argv[0] === "issue-id" && argv[1] === "--repo") return { command: "issue-id", repo: argv[2] };
  if (argv.length === 5 && argv[0] === "read" && argv[1] === "--repo" && argv[3] === "--adapter-id") return { command: "read", repo: argv[2], adapterId: argv[4] };
  if (argv.length === 11 && argv[0] === "register" && argv[1] === "--repo" && argv[3] === "--adapter-id"
    && argv[5] === "--executable" && argv[7] === "--expected-sha256" && argv[9] === "--by") {
    return { command: "register", repo: argv[2], adapterId: argv[4], executablePath: argv[6], expectedSha256: argv[8], registeredBy: argv[10] };
  }
  fail("DA-ARGUMENT", "Usage: document-adapter.mjs issue-id --repo <checkout> | read --repo <checkout> --adapter-id <da_id> | register --repo <checkout> --adapter-id <da_id> --executable <absolute-path> --expected-sha256 <sha256> --by <actor>");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.command === "issue-id") {
    const issued = issueDocumentAdapterId(args.repo);
    process.stdout.write(`${JSON.stringify({ schema: "pipeline.document-adapter-id.v1", adapterId: issued.id })}\n`);
    return 0;
  }
  if (args.command === "register") {
    const registered = registerPrivateDocumentAdapter(args.repo, args);
    process.stdout.write(`${JSON.stringify({ schema: "pipeline.document-adapter-registration.v1", adapterId: registered.adapter.adapterId, created: registered.created })}\n`);
    return 0;
  }
  const read = readPrivateDocumentAdapter(args.repo, args.adapterId);
  process.stdout.write(`${JSON.stringify(read.adapter)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); }
  catch (error) { process.stderr.write(`${error instanceof DocumentAdapterError ? error.code : "DA-ARGUMENT"}: ${error.message}\n`); process.exitCode = 2; }
}
