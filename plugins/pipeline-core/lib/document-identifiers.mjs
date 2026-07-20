// SPDX-License-Identifier: Apache-2.0

/**
 * Canonical opaque IDs and private reservations for document-hook operations.
 *
 * A later command may accept an ID only after this module has recorded its
 * purpose in the repository-common private namespace.  The reservation has no
 * organisation/document coordinate and is immutable, so it proves issuance
 * without becoming an authority for any later request payload.
 */
import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import {
  PrivateBoundaryError,
  readPrivateFile,
  writePrivateFileNoReplaceAtomic,
} from "./private-boundary.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";

export const PRIVATE_ID_RESERVATION_SCHEMA = "pipeline.private-id-reservation.v1";

const PREFIXES = new Set(["dh", "da", "dha", "drq", "dhr", "lra"]);
const PURPOSES = new Set([
  "binding", "adapter", "activation", "abandonment", "rollback",
  "binding-input", "review-input", "rationale-input",
]);
const ID = /^(dh|da|dha|drq|dhr|lra)_([a-z2-7]{25}[aeimquy4])$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

export class DocumentIdentifierError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DocumentIdentifierError";
    this.code = code;
  }
}

function fail(code, message) { throw new DocumentIdentifierError(code, message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function canonicalIso(value) { return typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }

export function canonicalDocumentId(value, prefix = undefined) {
  if (typeof value !== "string") fail("DI-ID", "Document identifier must be a string.");
  const match = ID.exec(value);
  if (!match || (prefix !== undefined && match[1] !== prefix)) {
    fail("DI-ID", "Document identifier is not canonical for its expected prefix.");
  }
  return value;
}

/** Encode exactly 16 random bytes using the documented canonical Base32 form. */
export function encodeDocumentId(prefix, bytes) {
  if (!PREFIXES.has(prefix)) fail("DI-PREFIX", "Document identifier prefix is unsupported.");
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail("DI-ENTROPY", "Document identifier entropy must be bytes.");
  const source = Buffer.from(bytes);
  if (source.length !== 16) fail("DI-ENTROPY", "Document identifiers require exactly 16 random bytes.");
  let bits = 0;
  let count = 0;
  let body = "";
  for (const byte of source) {
    bits = (bits << 8) | byte;
    count += 8;
    while (count >= 5) {
      count -= 5;
      body += BASE32[(bits >>> count) & 31];
    }
  }
  if (count > 0) body += BASE32[(bits << (5 - count)) & 31];
  const value = `${prefix}_${body}`;
  canonicalDocumentId(value, prefix);
  return value;
}

function reservationBytes(value) {
  return `${JSON.stringify({
    schema: PRIVATE_ID_RESERVATION_SCHEMA,
    repoFingerprint: value.repoFingerprint,
    id: value.id,
    purpose: value.purpose,
    issuedAt: value.issuedAt,
  }, null, 2)}\n`;
}

function validateReservation(value, { id, purpose, repoFingerprint } = {}) {
  const keys = ["schema", "repoFingerprint", "id", "purpose", "issuedAt"];
  if (!isObject(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))
    || value.schema !== PRIVATE_ID_RESERVATION_SCHEMA || !SHA256.test(value.repoFingerprint ?? "")
    || !PURPOSES.has(value.purpose) || !canonicalIso(value.issuedAt)) {
    fail("DI-RESERVATION", "Private document ID reservation has an invalid closed shape.");
  }
  canonicalDocumentId(value.id);
  if (id !== undefined && value.id !== canonicalDocumentId(id)) fail("DI-RESERVATION", "Private document ID reservation does not match its exact ID.");
  if (purpose !== undefined && value.purpose !== purpose) fail("DI-PURPOSE", "Private document ID reservation has the wrong purpose.");
  if (repoFingerprint !== undefined && value.repoFingerprint !== repoFingerprint) fail("DI-REPOSITORY", "Private document ID reservation belongs to another repository.");
  return value;
}

export function resolveDocumentIdReservation(repoRoot, id, options = {}) {
  canonicalDocumentId(id);
  const repo = discoverRepository(repoRoot, options);
  const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
  const root = join(repo.commonDir, "agent-pipeline", "id-reservations", repoFingerprint);
  return { repo, repoFingerprint, id, root, path: join(root, `${id}.json`) };
}

export function readDocumentIdReservation(repoRoot, id, { purpose, ...options } = {}) {
  const target = resolveDocumentIdReservation(repoRoot, id, options);
  if (!existsSync(target.path)) fail("DI-MISSING", "Private document ID reservation is missing.");
  let value;
  let bytes;
  try {
    bytes = readPrivateFile(target.path, "private document ID reservation");
    value = JSON.parse(bytes);
  } catch (error) {
    if (error instanceof PrivateBoundaryError) fail("DI-BOUNDARY", error.message);
    fail("DI-RESERVATION", "Private document ID reservation is malformed.");
  }
  validateReservation(value, { id: target.id, purpose, repoFingerprint: target.repoFingerprint });
  if (reservationBytes(value) !== bytes) fail("DI-RESERVATION", "Private document ID reservation is not canonical.");
  return { ...target, reservation: value };
}

/** Issue one immutable reservation, retrying only a real name collision. */
export function issueDocumentId(repoRoot, { prefix, purpose, now = () => new Date(), randomBytes = cryptoRandomBytes, ...options } = {}) {
  if (!PREFIXES.has(prefix)) fail("DI-PREFIX", "Document identifier prefix is unsupported.");
  if (!PURPOSES.has(purpose)) fail("DI-PURPOSE", "Document identifier purpose is unsupported.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = encodeDocumentId(prefix, randomBytes(16));
    const target = resolveDocumentIdReservation(repoRoot, id, options);
    const issuedAt = now();
    const reservation = {
      schema: PRIVATE_ID_RESERVATION_SCHEMA,
      repoFingerprint: target.repoFingerprint,
      id,
      purpose,
      issuedAt: issuedAt instanceof Date ? issuedAt.toISOString() : issuedAt,
    };
    validateReservation(reservation, { id, purpose, repoFingerprint: target.repoFingerprint });
    try {
      const write = writePrivateFileNoReplaceAtomic(target.path, reservationBytes(reservation));
      if (write.created) return { ...target, reservation };
    } catch (error) {
      if (error instanceof PrivateBoundaryError) fail("DI-BOUNDARY", error.message);
      throw error;
    }
  }
  fail("DI-COLLISION", "Could not issue a unique private document ID after three attempts.");
}
