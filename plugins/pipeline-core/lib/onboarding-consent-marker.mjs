// SPDX-License-Identifier: SUL-1.0

/**
 * PHX-WP-ONBOARDING-CONSENT-LOCK: a local marker recording "PO consent given,
 * onboarding not yet complete" -- so a PreToolUse hook (guard-onboarding-
 * consent-lock.mjs) can technically refuse Write/Edit on project files until
 * the marker is cleared, rather than trusting a session to correctly
 * re-derive that Pipeline governance is still wanted after it drifts out of
 * the bootstrap chain.
 *
 * Backlog: backlog/items/2026-08-07-technical-lock-for-pipeline-consent-before-onboarding-complete.md
 * -- accepted 2026-08-18, PO-deprioritized ("not relevant right now, but
 * interesting hardening for the backlog").
 *
 * DESIGN
 *  - One marker file, `.agent-pipeline/onboarding-consent.json`. Present with
 *    the exact blocking schema/status combo == block; absent == no block.
 *    A present-but-unrecognized/corrupt file is ALSO treated as blocking:
 *    this narrow gate fails CLOSED, deliberately the opposite of the
 *    fail-open philosophy the rest of the guard family documents for
 *    missing/broken CONFIG -- a corrupted marker must never silently become
 *    a bypass of the exact protection it exists to provide.
 *  - `recordConsentGiven` writes it at the moment PO consent is given.
 *    Idempotent: re-recording while already blocking keeps the original
 *    `consentGivenAt`, it does not reset the clock.
 *  - `clearConsentMarker` is the ONLY function that removes it, and only for
 *    one of exactly two typed reasons: "onboarding-complete" (the call site
 *    wired into project-onboarding-v3.mjs's own `inspectProjectOnboardingV3`,
 *    fired only when that function computes a genuine session-intent `ready`
 *    result -- the same status value every other admission decision in this
 *    codebase already treats as authoritative) or "po-explicit-override" (an
 *    explicit, PO-confirmed decision to proceed without Pipeline, via the
 *    `onboarding-consent.mjs override-clear` CLI). Any other reason throws
 *    rather than silently no-op-ing: the marker must never clear because a
 *    session simply stopped encountering the check.
 *  - Every clear is appended to a companion append-only audit log
 *    (`.agent-pipeline/onboarding-consent-audit.jsonl`) so a cleared marker
 *    can always be traced to which of the two reasons produced it.
 *  - Atomic marker writes (temp file + fsync + rename), matching the
 *    discipline project-onboarding-v3.mjs itself uses for its own targets,
 *    so a crash mid-write cannot leave a half-written marker on disk.
 *
 * NOT COVERED (gate honesty, mirrors the sibling guards' own NOT COVERED
 * sections)
 *  - This module has no in-session cryptographic proof for the override
 *    reason (no HGO/GMW wiring): `override-clear` accepts a free-text
 *    `--reason` and records it, but does not itself verify the requester is
 *    the PO. Full audited-override wiring (the v2 human-guard-override
 *    protocol other guards use) is out of scope for this dispatch
 *    (PHX-WP-ONBOARDING-CONSENT-LOCK briefing, Forbidden section) and is
 *    left as an explicit open item for a follow-up.
 *  - Wiring `recordConsentGiven` into the live pipeline-start SKILL.md
 *    consent-prose flow is also out of scope for this dispatch (SKILL.md is
 *    not in the briefed edit scope); this module and its CLI exist and are
 *    tested so a follow-up dispatch can wire the call in without inventing
 *    the mechanism itself.
 */
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const CONSENT_MARKER_SCHEMA = "pipeline.onboarding-consent-marker.v1";
export const CONSENT_MARKER_STATUS = "consent-given-onboarding-incomplete";
export const CONSENT_AUDIT_SCHEMA = "pipeline.onboarding-consent-audit.v1";
const MARKER_RELATIVE_PATH = join(".agent-pipeline", "onboarding-consent.json");
const AUDIT_RELATIVE_PATH = join(".agent-pipeline", "onboarding-consent-audit.jsonl");
const CLEAR_REASONS = new Set(["onboarding-complete", "po-explicit-override"]);

export function consentMarkerPath(rootDir) {
  return join(rootDir, MARKER_RELATIVE_PATH);
}

export function consentAuditPath(rootDir) {
  return join(rootDir, AUDIT_RELATIVE_PATH);
}

function atomicWriteFileSync(targetPath, bytes) {
  mkdirSync(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fd = openSync(tempPath, "w");
  try {
    writeSync(fd, bytes);
  } finally {
    closeSync(fd);
  }
  renameSync(tempPath, targetPath);
}

function appendAuditEntry(rootDir, entry) {
  const auditPath = consentAuditPath(rootDir);
  mkdirSync(dirname(auditPath), { recursive: true });
  const fd = openSync(auditPath, "a");
  try {
    writeSync(fd, `${JSON.stringify(entry)}\n`);
  } finally {
    closeSync(fd);
  }
}

/**
 * Read the current marker state. Never throws: an unreadable root or a
 * corrupt marker both resolve to a typed result the caller can act on.
 */
export function readConsentMarker({ rootDir, deps = {} } = {}) {
  const exists = deps.existsSyncFn ?? existsSync;
  const read = deps.readFileSyncFn ?? readFileSync;
  const markerPath = consentMarkerPath(rootDir);
  let present;
  try {
    present = exists(markerPath);
  } catch {
    return { status: "absent" };
  }
  if (!present) return { status: "absent" };
  let parsed;
  try {
    parsed = JSON.parse(read(markerPath, "utf8"));
  } catch {
    return { status: CONSENT_MARKER_STATUS, consentGivenAt: null, corrupt: true };
  }
  if (parsed
    && typeof parsed === "object"
    && !Array.isArray(parsed)
    && parsed.schema === CONSENT_MARKER_SCHEMA
    && parsed.status === CONSENT_MARKER_STATUS) {
    return {
      status: CONSENT_MARKER_STATUS,
      consentGivenAt: typeof parsed.consentGivenAt === "string" ? parsed.consentGivenAt : null,
      corrupt: false,
    };
  }
  return { status: CONSENT_MARKER_STATUS, consentGivenAt: null, corrupt: true };
}

/**
 * Write the marker at the exact moment PO consent to adopt Agent Pipeline is
 * given for this repository.
 */
export function recordConsentGiven({ rootDir, now = new Date(), deps = {} } = {}) {
  const existing = readConsentMarker({ rootDir, deps });
  const consentGivenAt = existing.status === CONSENT_MARKER_STATUS && !existing.corrupt && existing.consentGivenAt
    ? existing.consentGivenAt
    : now.toISOString();
  const record = { schema: CONSENT_MARKER_SCHEMA, status: CONSENT_MARKER_STATUS, consentGivenAt };
  const writeFn = deps.atomicWriteFileSyncFn ?? atomicWriteFileSync;
  writeFn(consentMarkerPath(rootDir), Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
  return record;
}

/**
 * Clear the marker for exactly one of the two admitted reasons. Idempotent
 * on an absent marker (returns `{ status: "absent" }` without touching the
 * audit log -- nothing was cleared).
 */
export function clearConsentMarker({ rootDir, reason, deps = {} } = {}) {
  if (!CLEAR_REASONS.has(reason)) {
    throw new Error(
      `clearConsentMarker: unrecognized reason "${reason}" (must be "onboarding-complete" or "po-explicit-override")`,
    );
  }
  const exists = deps.existsSyncFn ?? existsSync;
  const markerPath = consentMarkerPath(rootDir);
  let present;
  try {
    present = exists(markerPath);
  } catch {
    return { status: "absent" };
  }
  if (!present) return { status: "absent" };
  const unlinkFn = deps.unlinkSyncFn ?? unlinkSync;
  unlinkFn(markerPath);
  const appendFn = deps.appendAuditEntryFn ?? appendAuditEntry;
  appendFn(rootDir, { schema: CONSENT_AUDIT_SCHEMA, clearedAt: new Date().toISOString(), reason });
  return { status: "cleared", reason };
}

/** True exactly when the marker is currently in its blocking state. */
export function isConsentLockBlocking({ rootDir, deps = {} } = {}) {
  return readConsentMarker({ rootDir, deps }).status === CONSENT_MARKER_STATUS;
}
