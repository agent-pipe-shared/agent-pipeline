// RV-2 (specs/sprint-alfred-epic/spec.md lines 1201-1203): CAS-conflict
// classification of a legacy session-cleanup receipt. classifyLegacyReceipt()
// is classify-only and read-only: it never creates, writes, renames or deletes
// anything. It lstat-checks the target before reading (ruling 26): a symlink or
// a non-regular entry is a typed unavailable result, and so is a file above the
// 1 MiB receipt bound, which is judged by size before any byte is parsed.
//
// RV-3 (spec lines 1204-1206): the detached human proof binds the legacy
// custody authorization. buildLegacyCustodyAuthorization() builds the signed
// package (receipt as sha256 + size or explicit absence, never bytes);
// verifyLegacyCustodyProof() checks a po-approval-proof envelope against an
// externally supplied anchor. The signed intent is a pure function of the
// package. Both functions are synchronous and touch no filesystem. Ruling 25
// adds sessionId, expiresAt and archiveDestination to the package: the builder
// validates the shape of every key, and the verifier re-checks that shape,
// then the proof, then expiry, in that order.
//
// RV-4 (spec lines 1207-1211): applyLegacyCustodyDisposition() is the ONLY
// function in this module that can mutate the filesystem, and only for a signed
// "archive" disposition (receipt moved under archiveRoot). Every other outcome
// - preserved, absence-bound, refused, unavailable - writes nothing.
//
// Every LOC- code this module produces is registered in
// lib/recovery-refusal-registry.mjs; the registry test scans this file for them.

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, posix, win32 } from "node:path";

import { canonical, createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";
import { CLEANUP_RECEIPT_SCHEMA } from "./worktree-lifecycle.mjs";

const CODES = Object.freeze({
  statusMismatch: "LOC-STATUS-MISMATCH",
  schemaMismatch: "LOC-SCHEMA-MISMATCH",
  digestMismatch: "LOC-DIGEST-MISMATCH",
  compareFlagFalse: "LOC-COMPARE-FLAG-FALSE",
  compareFlagMissing: "LOC-COMPARE-FLAG-MISSING",
  fieldMissing: "LOC-FIELD-MISSING",
  receiptAmbiguous: "LOC-RECEIPT-AMBIGUOUS",
  // Ruling 26: classification never reads a target it has not lstat-checked.
  targetUnsafe: "LOC-TARGET-UNSAFE",
  receiptOversize: "LOC-RECEIPT-OVERSIZE",
});

const COMPARE_FLAGS = Object.freeze(["statusMatches", "schemaMatches", "digestMatches"]);
const EXPECTED_STATUS = "complete";

// A receipt is a small sanitized JSON document; a larger file is not a receipt we
// are willing to read whole, classify, hash or copy.
const MAX_RECEIPT_BYTES = 1024 * 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/u;

function unavailable(code) {
  return { status: "unavailable", code, mutated: false };
}

// Receipt file name rule replicated from cleanupReceiptPath
// (worktree-lifecycle.mjs line 1209): `<sessionId>.json` inside the receipts
// directory. The function is not exported, so the rule is mirrored here.
function receiptFileName(sessionId) {
  return `${sessionId}.json`;
}

function candidateNames(receiptsDirectory, sessionId) {
  let names;
  try {
    names = readdirSync(receiptsDirectory);
  } catch {
    return [];
  }
  const exact = receiptFileName(sessionId);
  return names.filter((name) => name === exact || name.startsWith(`${sessionId}.`)).sort();
}

/**
 * Bounded read of one regular, non-symlinked file. The entry is lstat-checked
 * before it is opened, so a FIFO or a directory is never opened. An oversized
 * file is reported (`oversize`) without being read; every other failure is
 * `unsafe`.
 */
function readReceiptBytes(path) {
  try {
    const info = lstatSync(path);
    if (info.isSymbolicLink() || !info.isFile()) return { unsafe: true };
    if (info.size > MAX_RECEIPT_BYTES) return { unsafe: true, oversize: true };
    const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile()) return { unsafe: true };
      if (opened.size > MAX_RECEIPT_BYTES) return { unsafe: true, oversize: true };
      const bytes = readFileSync(fd);
      return bytes.length > MAX_RECEIPT_BYTES ? { unsafe: true, oversize: true } : { bytes };
    } finally {
      closeSync(fd);
    }
  } catch {
    return { unsafe: true };
  }
}

export function classifyLegacyReceipt({ receiptsDirectory, sessionId, compare } = {}) {
  const names = candidateNames(receiptsDirectory, sessionId);
  if (names.length > 1) return unavailable(CODES.receiptAmbiguous);
  if (names.length === 0) return unavailable(CODES.fieldMissing);

  const read = readReceiptBytes(join(receiptsDirectory, names[0]));
  if (read.oversize === true) return unavailable(CODES.receiptOversize);
  if (read.unsafe === true) return unavailable(CODES.targetUnsafe);

  let receipt;
  try {
    receipt = JSON.parse(read.bytes.toString("utf8"));
  } catch {
    return unavailable(CODES.fieldMissing);
  }
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
    return unavailable(CODES.fieldMissing);
  }
  for (const field of ["schema", "status", "sessionSha256"]) {
    if (typeof receipt[field] !== "string" || receipt[field] === "") return unavailable(CODES.fieldMissing);
  }

  if (receipt.status !== EXPECTED_STATUS) return unavailable(CODES.statusMismatch);
  if (receipt.schema !== CLEANUP_RECEIPT_SCHEMA) return unavailable(CODES.schemaMismatch);
  const expectedDigest = createHash("sha256").update(Buffer.from(String(sessionId))).digest("hex");
  if (receipt.sessionSha256 !== expectedDigest) return unavailable(CODES.digestMismatch);

  const flags = compare !== null && typeof compare === "object" ? compare : {};
  for (const flag of COMPARE_FLAGS) {
    if (typeof flags[flag] !== "boolean") return unavailable(CODES.compareFlagMissing);
  }
  for (const flag of COMPARE_FLAGS) {
    if (flags[flag] !== true) return unavailable(CODES.compareFlagFalse);
  }

  return { classification: "matching", mutated: false };
}

export const LEGACY_CUSTODY_AUTHORIZATION_SCHEMA = "pipeline.legacy-custody-authorization.v1";

const RV3_CODES = Object.freeze({
  sessionNotEnded: "LOC-SESSION-NOT-ENDED",
  proofInvalid: "LOC-PROOF-INVALID",
  signerMismatch: "LOC-PROOF-SIGNER-MISMATCH",
  bindingMismatch: "LOC-PROOF-BINDING-MISMATCH",
  // Ruling 25: a package whose own keys are malformed, and a proof whose
  // package is past its signed expiry.
  packageInvalid: "LOC-PACKAGE-INVALID",
  proofExpired: "LOC-PROOF-EXPIRED",
});

const PROOF_KEYS = Object.freeze(["intentSha256", "keyReference", "publicKey", "schema", "signatureBase64"]);
const PROOF_SCHEMA = "pipeline.po-approval-proof.v1";
const DOMAIN_SHA256 = createHash("sha256").update(LEGACY_CUSTODY_AUTHORIZATION_SCHEMA).digest("hex");

// Which on-disk classification each signed disposition may act on.
const DISPOSITION_CLASSIFICATIONS = Object.freeze({
  preserve: ["matching"],
  replay: ["matching"],
  archive: ["conflicting", "malformed"],
  "bind-absence": ["absent"],
});

const DISPOSITIONS = Object.freeze(Object.keys(DISPOSITION_CLASSIFICATIONS));
const CLASSIFICATION_VOCABULARY = Object.freeze(["matching", "conflicting", "malformed", "absent"]);
const PACKAGE_KEYS = Object.freeze([
  "archiveDestination",
  "casPrecondition",
  "classification",
  "disposition",
  "expiresAt",
  "receipt",
  "repository",
  "schema",
  "sessionEnded",
  "sessionId",
]);
const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;

function refusal(code) {
  return { ok: false, code };
}

/** The signed intent: a pure function of the package. */
function custodyIntent(pkg) {
  return createPoApprovalIntent({
    kind: "legacy-custody",
    featureId: "legacy-custody",
    planSha256: DOMAIN_SHA256,
    specSha256: DOMAIN_SHA256,
    candidate: pkg.repository,
    policyRevision: "legacy-custody-v1",
    subjectSha256: createHash("sha256").update(canonical(pkg)).digest("hex"),
    decision: pkg.disposition,
  });
}

// Package shape (ruling 25). Each key is judged on its own; no check below
// reads one key to judge another, so a combination such as sessionEnded or an
// absent receipt with a non-absent classification is never a shape defect here -
// it stays a binding mismatch against the proof (ruling 32). The single
// combination rule, archiveDestination iff disposition is "archive", is a
// separate step (archiveDestinationFollowsDisposition) that the verifier
// applies only once the proof has verified.

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedSorted) {
  const keys = Object.keys(value).sort();
  return keys.length === expectedSorted.length && keys.every((key, index) => key === expectedSorted[index]);
}

/** Exactly { sha256: 64 lowercase hex, size: non-negative integer } or exactly { absent: true }. */
function validReceiptBinding(receipt) {
  if (!isPlainObject(receipt)) return false;
  if (hasExactKeys(receipt, ["absent"])) return receipt.absent === true;
  return (
    hasExactKeys(receipt, ["sha256", "size"])
    && typeof receipt.sha256 === "string" && SHA256_HEX.test(receipt.sha256)
    && Number.isSafeInteger(receipt.size) && receipt.size >= 0
  );
}

/** Exactly { commit, tree }, each a 40- or 64-hex object id. */
function validRepository(repository) {
  return (
    isPlainObject(repository)
    && hasExactKeys(repository, ["commit", "tree"])
    && typeof repository.commit === "string" && GIT_OBJECT_ID.test(repository.commit)
    && typeof repository.tree === "string" && GIT_OBJECT_ID.test(repository.tree)
  );
}

function validClassification(classification) {
  return (
    isPlainObject(classification)
    && typeof classification.classification === "string"
    && CLASSIFICATION_VOCABULARY.includes(classification.classification)
  );
}

function validCasPrecondition(cas) {
  return isPlainObject(cas) && typeof cas.receiptPath === "string" && cas.receiptPath !== "";
}

function validExpiry(value) {
  return typeof value === "string" && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
}

/** A non-empty path that is neither absolute (either platform) nor able to leave the repository. */
function validRelativePath(value) {
  if (typeof value !== "string" || value === "" || value.includes("\u0000")) return false;
  if (posix.isAbsolute(value) || win32.isAbsolute(value) || /^[A-Za-z]:/u.test(value)) return false;
  const segments = value.split(/[\\/]+/u);
  if (segments.includes("..")) return false;
  return segments.some((segment) => segment !== "" && segment !== ".");
}

function packageKeysAreWellFormed(pkg) {
  return (
    isPlainObject(pkg)
    && hasExactKeys(pkg, PACKAGE_KEYS)
    && pkg.schema === LEGACY_CUSTODY_AUTHORIZATION_SCHEMA
    && validReceiptBinding(pkg.receipt)
    && validRepository(pkg.repository)
    && validClassification(pkg.classification)
    && DISPOSITIONS.includes(pkg.disposition)
    && typeof pkg.sessionEnded === "boolean"
    && validCasPrecondition(pkg.casPrecondition)
    && typeof pkg.sessionId === "string" && pkg.sessionId !== ""
    && validExpiry(pkg.expiresAt)
    && (pkg.archiveDestination === null || validRelativePath(pkg.archiveDestination))
  );
}

/** Ruling 25: archiveDestination is a path iff the disposition is "archive", null otherwise. */
function archiveDestinationFollowsDisposition(pkg) {
  return (pkg.disposition === "archive") === (pkg.archiveDestination !== null);
}

export function buildLegacyCustodyAuthorization({
  repository,
  receipt,
  classification,
  disposition,
  sessionEnded,
  casPrecondition,
  sessionId,
  expiresAt,
  archiveDestination,
} = {}) {
  if (sessionEnded !== true) return refusal(RV3_CODES.sessionNotEnded);
  const candidate = {
    schema: LEGACY_CUSTODY_AUTHORIZATION_SCHEMA,
    repository,
    receipt,
    classification,
    disposition,
    sessionEnded: true,
    casPrecondition,
    sessionId,
    expiresAt,
    archiveDestination,
  };
  if (!packageKeysAreWellFormed(candidate) || !archiveDestinationFollowsDisposition(candidate)) {
    return refusal(RV3_CODES.packageInvalid);
  }
  try {
    return structuredClone(candidate);
  } catch {
    // A value the structured clone cannot copy (a function nested in classification) is not a package.
    return refusal(RV3_CODES.packageInvalid);
  }
}

function wellFormedEnvelope(proof) {
  if (proof === null || typeof proof !== "object" || Array.isArray(proof)) return false;
  const keys = Object.keys(proof).sort();
  if (keys.length !== PROOF_KEYS.length || keys.some((key, index) => key !== PROOF_KEYS[index])) return false;
  if (proof.schema !== PROOF_SCHEMA) return false;
  return ["intentSha256", "keyReference", "publicKey", "signatureBase64"].every(
    (key) => typeof proof[key] === "string" && proof[key] !== "",
  );
}

/**
 * Order is fixed (ruling 32): package shape -> proof (envelope, signer,
 * binding) -> expiry. Expiry is judged only for an otherwise valid proof.
 */
export function verifyLegacyCustodyProof({ package: pkg, proof, anchor } = {}) {
  if (!packageKeysAreWellFormed(pkg)) return refusal(RV3_CODES.packageInvalid);

  if (!wellFormedEnvelope(proof)) return refusal(RV3_CODES.proofInvalid);
  if (anchor === null || typeof anchor !== "object" || typeof anchor.keyReference !== "string" || typeof anchor.publicKeySha256 !== "string") {
    return refusal(RV3_CODES.proofInvalid);
  }
  const observed = createHash("sha256").update(proof.publicKey).digest("hex");
  if (proof.keyReference !== anchor.keyReference || observed !== anchor.publicKeySha256) {
    return refusal(RV3_CODES.signerMismatch);
  }
  let intent;
  try {
    intent = custodyIntent(pkg);
  } catch {
    return refusal(RV3_CODES.bindingMismatch);
  }
  if (proof.intentSha256 !== intent.sha256) return refusal(RV3_CODES.bindingMismatch);
  const result = verifyPoApprovalProof({ intent, trustPolicy: anchor, proof });
  if (result.verified !== true) {
    return refusal(result.code === "PO-APPROVAL-TRUST-MISMATCH" ? RV3_CODES.signerMismatch : RV3_CODES.proofInvalid);
  }

  // The one cross-key rule runs here, not with the per-key shape above: a package
  // that was changed after signing is a binding mismatch, and only a package that
  // was signed as it stands can be inconsistent in itself.
  if (!archiveDestinationFollowsDisposition(pkg)) return refusal(RV3_CODES.packageInvalid);
  if (Date.parse(pkg.expiresAt) <= Date.now()) return refusal(RV3_CODES.proofExpired);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// RV-4: preserve / replay / archive / bind-absence under a verified signed
// disposition.
//
// Order is fixed and each stage is zero-mutation until the last:
//   1. verify the detached proof (verifyLegacyCustodyProof)        -> refused
//   2. validate the authorized package against this session        -> refused
//   3. classify the target (candidates, lstat, bounded read, RV-2) -> unavailable
//   4. act: preserve / bind-absence write nothing; replay is not yet defined;
//      archive is the only mutation.
// No lock is taken: a concurrent writer, receipt drift between the signed digest
// and the bytes on disk, and an interrupted archive are RV-5; State/proof/history
// byte-identity is RV-6. Drift observed here is refused (never acted on).
// ---------------------------------------------------------------------------

export const LEGACY_CUSTODY_ARCHIVE_AUDIT_SCHEMA = "pipeline.legacy-custody-archive-audit.v1";

const RV4_CODES = Object.freeze({
  replayPrecondition: "LOC-REPLAY-PRECONDITION",
  targetUnsafe: CODES.targetUnsafe,
  // A mismatch found AFTER the exclusive publish: the archived copy already exists, so this is
  // not the dead-end pre-write LOC-PROOF-BINDING-MISMATCH (RV-D3, ruling 44c).
  archiveOrphanedCopy: "LOC-ARCHIVE-ORPHANED-COPY",
});

const ARCHIVE_DIRECTORY_NAME = "archived";
const ARCHIVE_AUDIT_NAME = "legacy-custody-archive-audit.jsonl";
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function refusedResult(code, mutated = false) {
  return { status: "refused", code, mutated };
}

function unavailableResult(code, mutated = false) {
  return { status: "unavailable", code, mutated };
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** lstat that maps a missing entry to null; any other failure is rethrown. */
function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Validate the structure of a package whose proof already verified, and read out
 * what the apply path needs. A signed-but-nonsensical package is refused, never
 * acted on.
 */
function readAuthorizedPackage(pkg, sessionId) {
  const invalid = { refusal: RV3_CODES.proofInvalid };
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) return invalid;
  if (pkg.schema !== LEGACY_CUSTODY_AUTHORIZATION_SCHEMA) return invalid;
  const classification = pkg.classification?.classification;
  const allowed = DISPOSITION_CLASSIFICATIONS[pkg.disposition];
  if (allowed === undefined || !allowed.includes(classification)) return invalid;
  const receipt = pkg.receipt;
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) return invalid;
  const absent = classification === "absent";
  if (absent) {
    if (Object.keys(receipt).length !== 1 || receipt.absent !== true) return invalid;
  } else if (
    Object.keys(receipt).length !== 2
    || typeof receipt.sha256 !== "string" || !SHA256_HEX.test(receipt.sha256)
    || !Number.isSafeInteger(receipt.size) || receipt.size < 0
  ) {
    return invalid;
  }
  if (pkg.sessionEnded !== true) return { refusal: RV3_CODES.sessionNotEnded };
  const cas = pkg.casPrecondition;
  if (cas === null || typeof cas !== "object" || Array.isArray(cas)) return invalid;
  if (cas.expectedState !== (absent ? "absent" : "present")) return invalid;
  // Signed for another session, or for another session's receipt path: the
  // signature does not bind this target. The receipt name stem is the session id.
  if (pkg.sessionId !== sessionId) return { refusal: RV3_CODES.bindingMismatch };
  if (cas.receiptPath !== receiptFileName(sessionId)) return { refusal: RV3_CODES.bindingMismatch };
  return {
    disposition: pkg.disposition,
    classification,
    absent,
    sha256: absent ? null : receipt.sha256,
    size: absent ? null : receipt.size,
    compare: pkg.classification.compare,
  };
}

/** Candidate entries for the session, tolerating a missing directory but not an unsafe or unreadable one. */
function listCandidateNames(receiptsDirectory, sessionId) {
  try {
    const info = lstatOrNull(receiptsDirectory);
    if (info === null) return { names: [] };
    if (info.isSymbolicLink() || !info.isDirectory()) return { unsafe: true };
    const exact = receiptFileName(sessionId);
    const names = readdirSync(receiptsDirectory).filter((name) => name === exact || name.startsWith(`${sessionId}.`));
    return { names: names.sort() };
  } catch {
    return { unsafe: true };
  }
}

/** RV-2 classification of what is actually on disk, expressed in the package's vocabulary. */
function observedClassification(receiptsDirectory, sessionId, compare) {
  const result = classifyLegacyReceipt({ receiptsDirectory, sessionId, compare });
  if (result.classification === "matching") return "matching";
  switch (result.code) {
    case CODES.statusMismatch:
    case CODES.schemaMismatch:
    case CODES.digestMismatch:
    case CODES.compareFlagFalse:
      return "conflicting";
    case CODES.fieldMissing:
      return "malformed";
    default:
      // compare flags missing from the signed package (or an ambiguity that
      // appeared after the candidate check): the claim cannot be confirmed.
      return null;
  }
}

/** Best-effort directory durability barrier (a directory cannot be opened for fsync on win32); the file fsyncs are the correctness barrier. */
function fsyncDirectory(directory) {
  let fd;
  try {
    fd = openSync(directory, "r");
    fsyncSync(fd);
  } catch {
    // Not supported on this platform or filesystem.
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Publish/readback/audit mechanics copied from the zero-authority orphan archive
// (worktree-lifecycle.mjs:~1098 archiveOrphanSessionDescriptor, with
// publishExclusiveFile ~993 and appendOrphanArchiveAudit ~1025). That primitive
// is descriptor-bound (repository discovery, owner eligibility) and is not
// callable for a receipt, so only the small pattern is reproduced here.

/** Exclusive publish: the target appears complete or not at all and is never overwritten (EEXIST throws). */
function publishExclusiveCopy(directory, path, bytes) {
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const fd = openSync(temporary, "wx", 0o600);
  try {
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    linkSync(temporary, path);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary name is already gone.
    }
  }
  fsyncDirectory(directory);
}

function appendArchiveAudit(path, entry) {
  const fd = openSync(path, "a", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(entry)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Read-only look at the archive destination; true only if every part is safe to write. */
function archiveDestinationUsable({ archiveRoot, archivedDirectory, archivePath, auditPath }) {
  try {
    if (typeof archiveRoot !== "string" || archiveRoot === "") return false;
    const root = lstatOrNull(archiveRoot);
    if (root === null || root.isSymbolicLink() || !root.isDirectory()) return false;
    const archived = lstatOrNull(archivedDirectory);
    if (archived !== null && (archived.isSymbolicLink() || !archived.isDirectory())) return false;
    // Never overwrite: an existing archived copy is RV-5's resume question, not ours.
    if (lstatOrNull(archivePath) !== null) return false;
    const audit = lstatOrNull(auditPath);
    if (audit !== null) {
      if (audit.isSymbolicLink() || !audit.isFile()) return false;
      if (audit.size > 0) {
        // Append-only JSONL: refuse a log whose last line is unterminated.
        const fd = openSync(auditPath, "r");
        try {
          const last = Buffer.alloc(1);
          if (readSyncAt(fd, last, audit.size - 1) !== 1 || last[0] !== 0x0a) return false;
        } finally {
          closeSync(fd);
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function readSyncAt(fd, buffer, position) {
  return readSync(fd, buffer, 0, buffer.length, position);
}

/**
 * Signed archive: exclusive publish of the exact bytes, byte readback, one
 * append-only audit line, and only then removal of the original name. Never
 * throws; `mutated` reports exactly what was left behind.
 */
function archiveReceipt({ receiptsDirectory, sessionId, bytes, sha256, classification, proof, archiveRoot }) {
  const archivedDirectory = join(String(archiveRoot), ARCHIVE_DIRECTORY_NAME);
  const archivePath = join(archivedDirectory, `${sessionId}.${sha256}.json`);
  const auditPath = join(String(archiveRoot), ARCHIVE_AUDIT_NAME);
  const receiptPath = join(receiptsDirectory, receiptFileName(sessionId));
  if (!archiveDestinationUsable({ archiveRoot, archivedDirectory, archivePath, auditPath })) {
    return unavailableResult(RV4_CODES.targetUnsafe);
  }

  let mutated = false;
  try {
    if (lstatOrNull(archivedDirectory) === null) {
      mkdirSync(archivedDirectory, { mode: 0o700 });
      mutated = true;
    }
    publishExclusiveCopy(archivedDirectory, archivePath, bytes);
    mutated = true;
    const published = lstatSync(archivePath);
    if (published.isSymbolicLink() || !published.isFile() || published.nlink !== 1 || !readFileSync(archivePath).equals(bytes)) {
      return unavailableResult(RV4_CODES.targetUnsafe, mutated);
    }

    // TOCTOU: the original must still be the exact signed bytes right before it is removed.
    const again = readReceiptBytes(receiptPath);
    if (again.unsafe === true) return unavailableResult(RV4_CODES.targetUnsafe, mutated);
    // The copy is already published (mutated is true): leave the changed original in place, write no
    // audit line, and say that an orphaned archived copy exists rather than a dead-end refusal.
    if (!again.bytes.equals(bytes)) return refusedResult(RV4_CODES.archiveOrphanedCopy, mutated);

    const entry = {
      schema: LEGACY_CUSTODY_ARCHIVE_AUDIT_SCHEMA,
      sessionId,
      receiptSha256: sha256,
      disposition: "archive",
      classification,
      intentSha256: proof.intentSha256,
      keyReference: proof.keyReference,
      archivedAt: new Date().toISOString(),
    };
    appendArchiveAudit(auditPath, entry);
    fsyncDirectory(archiveRoot);
    const lines = readFileSync(auditPath, "utf8").split("\n").filter((line) => line !== "");
    if (lines.at(-1) !== JSON.stringify(entry)) return unavailableResult(RV4_CODES.targetUnsafe, mutated);

    unlinkSync(receiptPath);
    fsyncDirectory(receiptsDirectory);
    return {
      status: "archived",
      mutated: true,
      sessionId,
      receiptSha256: sha256,
      archivedAs: `${ARCHIVE_DIRECTORY_NAME}/${sessionId}.${sha256}.json`,
    };
  } catch {
    return unavailableResult(RV4_CODES.targetUnsafe, mutated);
  }
}

export function applyLegacyCustodyDisposition({ receiptsDirectory, sessionId, package: pkg, proof, anchor, archiveRoot } = {}) {
  // 1. The proof is verified before a single byte is read or written.
  const verdict = verifyLegacyCustodyProof({ package: pkg, proof, anchor });
  if (verdict.ok !== true) return refusedResult(verdict.code);

  // 2. A signed package must still make sense for this session: it must name the
  //    session whose receipt this call classifies (the receipt name stem).
  const authorized = readAuthorizedPackage(pkg, sessionId);
  if (authorized.refusal !== undefined) return refusedResult(authorized.refusal);

  // 3. Classify the target; no write on unavailable.
  if (
    typeof sessionId !== "string" || !SAFE_SESSION_ID.test(sessionId)
    || typeof receiptsDirectory !== "string" || receiptsDirectory === ""
  ) {
    return unavailableResult(RV4_CODES.targetUnsafe);
  }
  const listing = listCandidateNames(receiptsDirectory, sessionId);
  if (listing.unsafe === true) return unavailableResult(RV4_CODES.targetUnsafe);
  const { names } = listing;
  // Exactly the primary receipt or nothing. A lone `<sessionId>.*` snapshot with
  // no primary receipt cannot honestly bind absence or be treated as the receipt.
  if (names.length > 1 || (names.length === 1 && names[0] !== receiptFileName(sessionId))) {
    return unavailableResult(CODES.receiptAmbiguous);
  }

  if (authorized.absent) {
    if (names.length !== 0) return refusedResult(RV3_CODES.bindingMismatch);
    return { status: "absence-bound", mutated: false, sessionId };
  }
  if (names.length === 0) return refusedResult(RV3_CODES.bindingMismatch);

  const read = readReceiptBytes(join(receiptsDirectory, receiptFileName(sessionId)));
  if (read.unsafe === true) return unavailableResult(RV4_CODES.targetUnsafe);
  const sha256 = sha256Hex(read.bytes);
  // The signature binds exact bytes: what is on disk must still be what was signed.
  if (sha256 !== authorized.sha256 || read.bytes.length !== authorized.size) return refusedResult(RV3_CODES.bindingMismatch);
  if (observedClassification(receiptsDirectory, sessionId, authorized.compare) !== authorized.classification) {
    return refusedResult(RV3_CODES.bindingMismatch);
  }

  // 4. Act.
  switch (authorized.disposition) {
    case "preserve":
      return { status: "preserved", mutated: false, sessionId, receiptSha256: sha256 };
    case "replay":
      // No replay preconditions are defined yet, so a replay is never available.
      // RV-4's positive replay lands with RV-5/RV-6.
      return unavailableResult(RV4_CODES.replayPrecondition);
    default:
      return archiveReceipt({
        receiptsDirectory,
        sessionId,
        bytes: read.bytes,
        sha256,
        classification: authorized.classification,
        proof,
        archiveRoot,
      });
  }
}
