#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Immutable private document-binding storage and exact-ID readback.
 *
 * This deliberately excludes issuance, inbox requests, Policy/adapter proof,
 * lifecycle evaluation and rendering.  Callers may persist only a fully
 * validated already-constructed binding through the exported storage API;
 * direct CLI access is read-only and emits no private paths or HMAC material.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DOCUMENT_CLASS_IDS } from "../lib/document-hooks.mjs";
import { issueDocumentId, readDocumentIdReservation } from "../lib/document-identifiers.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import {
  PrivateBoundaryError,
  assertPrivateRegularFile,
  readPrivateFile,
  writePrivateFileNoReplaceAtomic,
} from "../lib/private-boundary.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { assessWindowsPrivatePath } from "../lib/windows-private-state.mjs";

export const PRIVATE_DOCUMENT_BINDING_SCHEMA = "pipeline.private-document-binding.v1";
const BINDING_ID = /^dh_[a-z2-7]{25}[aeimquy4]$/u;
const ADAPTER_ID = /^da_[a-z2-7]{25}[aeimquy4]$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const KEYS = ["schema", "repoFingerprint", "bindingId", "classId", "policySha256", "triggerPatterns", "adapterId", "privateRoot", "dataPath", "templatePath", "outputDirectory", "hmacKeyBase64", "createdBy", "createdAt"];

export class DocumentBindingError extends Error {
  constructor(code, message) { super(message); this.name = "DocumentBindingError"; this.code = code; }
}
function fail(code, message) { throw new DocumentBindingError(code, message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value) { return isObject(value) && Object.keys(value).length === KEYS.length && KEYS.every((key) => Object.hasOwn(value, key)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function canonicalIso(value) { return typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function contained(root, target) {
  const part = relative(root, target);
  return part !== "" && part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

/** Strict glob lexer used for binding storage; matching belongs to later HAW-C. */
export function validateTriggerPattern(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0 || pattern.normalize("NFC") !== pattern || Buffer.byteLength(pattern, "utf8") > 256
    || pattern.startsWith("/") || pattern.includes("\\") || pattern.includes("\0") || /[\[\]{}!()]/u.test(pattern)) {
    fail("DB-PATTERN", "trigger pattern is not a canonical restricted POSIX glob");
  }
  const segments = pattern.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || (segment.includes("**") && segment !== "**"))) {
    fail("DB-PATTERN", "trigger pattern contains an invalid segment");
  }
  return pattern;
}

function assertPrivateDirectory(path, label) {
  if (!isAbsolute(path) || resolve(path) !== path || path.includes("\0")) fail("DB-PATH", `${label} path is not canonical absolute`);
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o777) !== 0o700) || realpathSync(path) !== path) {
    fail("DB-BOUNDARY", `${label} must be a physical mode-0700 directory`);
  }
  if (process.platform === "win32" && assessWindowsPrivatePath(path).status !== "secure") fail("DB-BOUNDARY", `${label} Windows assurance is unavailable or insecure`);
  return path;
}
function assertPrivateFile(root, path, label) {
  if (!isAbsolute(path) || resolve(path) !== path || !contained(root, path)) fail("DB-PATH", `${label} must be below privateRoot`);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (process.platform !== "win32" && (info.mode & 0o777) !== 0o600) || realpathSync(path) !== path) {
    fail("DB-BOUNDARY", `${label} must be a physical mode-0600 single-link regular file`);
  }
  if (process.platform === "win32" && (assessWindowsPrivatePath(path).status !== "secure" || assessWindowsPrivatePath(dirname(path)).status !== "secure")) fail("DB-BOUNDARY", `${label} Windows assurance is unavailable or insecure`);
  return path;
}

function assertBindingOwnership(binding) {
  const root = assertPrivateDirectory(binding.privateRoot, "privateRoot");
  assertPrivateFile(root, binding.dataPath, "dataPath");
  assertPrivateFile(root, binding.templatePath, "templatePath");
  const output = assertPrivateDirectory(binding.outputDirectory, "outputDirectory");
  if (!contained(root, output)) fail("DB-PATH", "outputDirectory must be below privateRoot");
}

function validKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/u.test(value)) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length === 32 && bytes.toString("base64") === value;
}

/** Validate a complete immutable record, including private owner-only coordinates. */
export function validatePrivateDocumentBinding(binding, { checkOwnership = true } = {}) {
  if (!exactKeys(binding) || binding.schema !== PRIVATE_DOCUMENT_BINDING_SCHEMA
    || !SHA256.test(binding.repoFingerprint ?? "") || !BINDING_ID.test(binding.bindingId ?? "")
    || !DOCUMENT_CLASS_IDS.includes(binding.classId) || !SHA256.test(binding.policySha256 ?? "")
    || !Array.isArray(binding.triggerPatterns) || binding.triggerPatterns.length < 1 || binding.triggerPatterns.length > 128
    || new Set(binding.triggerPatterns).size !== binding.triggerPatterns.length || binding.triggerPatterns.some((pattern) => typeof pattern !== "string")
    || !ADAPTER_ID.test(binding.adapterId ?? "") || !validKey(binding.hmacKeyBase64)
    || !ACTOR.test(binding.createdBy ?? "") || !canonicalIso(binding.createdAt)) fail("DB-SCHEMA", "private document binding has an invalid closed shape");
  binding.triggerPatterns.forEach(validateTriggerPattern);
  if (checkOwnership) assertBindingOwnership(binding);
  return clone(binding);
}

function canonicalBindingBytes(binding) {
  const validated = validatePrivateDocumentBinding(binding);
  const ordered = Object.fromEntries(KEYS.map((key) => [key, validated[key]]));
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function resolvePrivateDocumentBinding(repoRoot, bindingId, options = {}) {
  if (typeof bindingId !== "string" || !BINDING_ID.test(bindingId)) fail("DB-ID", "binding ID is not canonical");
  const repo = discoverRepository(repoRoot, options);
  const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
  const root = join(repo.commonDir, "agent-pipeline", "document-hooks", repoFingerprint, bindingId);
  return { repo, repoFingerprint, bindingId, root, path: join(root, "binding.json") };
}

/** The only public issuance path for a binding identifier. */
export function issueDocumentBindingId(repoRoot, options = {}) {
  return issueDocumentId(repoRoot, { ...options, prefix: "dh", purpose: "binding" });
}

/** Exact-ID readback: no directory scan, glob, fallback or synthesized binding. */
export function readPrivateDocumentBinding(repoRoot, bindingId, options = {}) {
  const target = resolvePrivateDocumentBinding(repoRoot, bindingId, options);
  if (!existsSync(target.path)) fail("DB-MISSING", "private document binding is missing");
  let bytes;
  let binding;
  try {
    assertPrivateRegularFile(target.path, "private document binding");
    bytes = readPrivateFile(target.path, "private document binding");
    binding = JSON.parse(bytes);
  } catch (error) {
    if (error instanceof PrivateBoundaryError) fail("DB-BOUNDARY", error.message);
    fail("DB-RECORD", "private document binding is malformed");
  }
  validatePrivateDocumentBinding(binding);
  if (binding.repoFingerprint !== target.repoFingerprint || binding.bindingId !== target.bindingId || canonicalBindingBytes(binding) !== bytes) {
    fail("DB-BINDING", "private document binding does not match its exact repository/ID target");
  }
  return { ...target, binding: clone(binding), sha256: sha256(bytes) };
}

/** Store an immutable binding once; exact canonical byte replay is idempotent. */
export function storePrivateDocumentBinding(repoRoot, binding, options = {}) {
  const validated = validatePrivateDocumentBinding(binding);
  const target = resolvePrivateDocumentBinding(repoRoot, validated.bindingId, options);
  if (validated.repoFingerprint !== target.repoFingerprint) fail("DB-BINDING", "binding repository fingerprint does not match this repository");
  try {
    readDocumentIdReservation(repoRoot, validated.bindingId, { ...options, purpose: "binding" });
  } catch (error) {
    if (error?.code === "DI-MISSING" || error?.code === "DI-PURPOSE" || error?.code === "DI-REPOSITORY") {
      fail("DB-RESERVATION", "private document binding ID was not issued for binding creation");
    }
    throw error;
  }
  const bytes = canonicalBindingBytes(validated);
  if (existsSync(target.path)) {
    const existing = readPrivateDocumentBinding(repoRoot, validated.bindingId, options);
    const current = readFileSync(target.path, "utf8");
    if (Buffer.byteLength(current) !== Buffer.byteLength(bytes) || !timingSafeEqual(Buffer.from(current), Buffer.from(bytes))) {
      fail("DB-CONFLICT", "private document binding is immutable and differs from this request");
    }
    return { ...existing, created: false };
  }
  try {
    const write = writePrivateFileNoReplaceAtomic(target.path, bytes);
    if (!write.created) return storePrivateDocumentBinding(repoRoot, binding, options);
  } catch (error) {
    if (error instanceof PrivateBoundaryError) fail("DB-BOUNDARY", error.message);
    throw error;
  }
  return { ...readPrivateDocumentBinding(repoRoot, validated.bindingId, options), created: true };
}

function parseArgs(argv) {
  if (argv.length === 3 && argv[0] === "issue-id" && argv[1] === "--repo") return { command: "issue-id", repo: argv[2] };
  if (argv.length === 5 && argv[0] === "read" && argv[1] === "--repo" && argv[3] === "--binding-id") {
    return { command: "read", repo: argv[2], bindingId: argv[4] };
  }
  fail("DB-ARGUMENT", "Usage: document-binding.mjs issue-id --repo <checkout> | read --repo <checkout> --binding-id <dh_id>");
}

export function main(argv = process.argv.slice(2)) {
  const { command, repo, bindingId } = parseArgs(argv);
  if (command === "issue-id") {
    const issued = issueDocumentBindingId(repo);
    process.stdout.write(`${JSON.stringify({ schema: "pipeline.document-binding-id.v1", bindingId: issued.id })}\n`);
    return 0;
  }
  const read = readPrivateDocumentBinding(repo, bindingId);
  // Private coordinates and key material never cross this CLI boundary.
  process.stdout.write(`${JSON.stringify({ schema: "pipeline.document-binding-readback.v1", bindingId: read.binding.bindingId, classId: read.binding.classId, policySha256: read.binding.policySha256, createdAt: read.binding.createdAt })}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); }
  catch (error) { process.stderr.write(`${error instanceof DocumentBindingError ? error.code : "DB-ARGUMENT"}: ${error.message}\n`); process.exitCode = 2; }
}
