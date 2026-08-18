#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * onboarding-consent-marker.mjs — unit-level suite (PHX-WP-ONBOARDING-CONSENT-LOCK).
 *
 * Covers the marker's own contract in isolation from the hook that consumes
 * it (see ../hooks/guard-onboarding-consent-lock.test.mjs for the hook-level
 * suite): record/read/clear round-trip, idempotency, the two admitted clear
 * reasons vs. every other reason, corrupt-marker fail-closed behaviour, and
 * the audit trail.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CONSENT_MARKER_STATUS,
  clearConsentMarker,
  consentAuditPath,
  consentMarkerPath,
  isConsentLockBlocking,
  readConsentMarker,
  recordConsentGiven,
} from "./onboarding-consent-marker.mjs";

let pass = 0;
const failures = [];
function check(id, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS  ${id}`);
  } catch (e) {
    failures.push(`${id}: ${e.message}`);
    console.log(`FAIL  ${id} -- ${e.message}`);
  }
}

function freshRoot() {
  return mkdtempSync(join(tmpdir(), "onboarding-consent-marker-test-"));
}

// OCM1 -- absent marker on a fresh root.
check("OCM1 absent marker on a fresh root reads absent, does not block", () => {
  const root = freshRoot();
  try {
    assert.deepEqual(readConsentMarker({ rootDir: root }), { status: "absent" });
    assert.equal(isConsentLockBlocking({ rootDir: root }), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// OCM2 -- recordConsentGiven writes a blocking marker at the exact moment called.
check("OCM2 recordConsentGiven writes a blocking marker", () => {
  const root = freshRoot();
  try {
    const now = new Date("2026-08-18T12:00:00.000Z");
    const record = recordConsentGiven({ rootDir: root, now });
    assert.equal(record.status, CONSENT_MARKER_STATUS);
    assert.equal(record.consentGivenAt, "2026-08-18T12:00:00.000Z");
    assert.ok(existsSync(consentMarkerPath(root)));
    assert.equal(isConsentLockBlocking({ rootDir: root }), true);
    const read = readConsentMarker({ rootDir: root });
    assert.equal(read.status, CONSENT_MARKER_STATUS);
    assert.equal(read.consentGivenAt, "2026-08-18T12:00:00.000Z");
    assert.equal(read.corrupt, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// OCM3 -- idempotent: re-recording keeps the original consentGivenAt.
check("OCM3 re-recording consent while already blocking keeps the original timestamp", () => {
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root, now: new Date("2026-08-18T12:00:00.000Z") });
    const second = recordConsentGiven({ rootDir: root, now: new Date("2026-08-18T13:00:00.000Z") });
    assert.equal(second.consentGivenAt, "2026-08-18T12:00:00.000Z");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// OCM4 -- clearConsentMarker("onboarding-complete") clears and audits.
check("OCM4 clearConsentMarker(onboarding-complete) clears the marker and appends an audit entry", () => {
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root });
    const result = clearConsentMarker({ rootDir: root, reason: "onboarding-complete" });
    assert.equal(result.status, "cleared");
    assert.equal(isConsentLockBlocking({ rootDir: root }), false);
    assert.equal(existsSync(consentMarkerPath(root)), false);
    const auditLines = readFileSync(consentAuditPath(root), "utf8").trim().split("\n");
    assert.equal(auditLines.length, 1);
    const entry = JSON.parse(auditLines[0]);
    assert.equal(entry.reason, "onboarding-complete");
    assert.ok(typeof entry.clearedAt === "string" && entry.clearedAt.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// OCM5 -- clearConsentMarker("po-explicit-override") also clears and audits, distinctly.
check("OCM5 clearConsentMarker(po-explicit-override) clears the marker with a distinct audit reason", () => {
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root });
    clearConsentMarker({ rootDir: root, reason: "po-explicit-override" });
    assert.equal(isConsentLockBlocking({ rootDir: root }), false);
    const entry = JSON.parse(readFileSync(consentAuditPath(root), "utf8").trim());
    assert.equal(entry.reason, "po-explicit-override");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// OCM6 -- every other reason throws rather than silently no-op-ing.
check("OCM6 an unrecognized clear reason throws instead of clearing", () => {
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root });
    assert.throws(() => clearConsentMarker({ rootDir: root, reason: "session-just-moved-on" }));
    assert.equal(isConsentLockBlocking({ rootDir: root }), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// OCM7 -- clearing an already-absent marker is a no-op, not an error, and does not audit.
check("OCM7 clearing an absent marker is an idempotent no-op with no audit entry", () => {
  const root = freshRoot();
  try {
    const result = clearConsentMarker({ rootDir: root, reason: "onboarding-complete" });
    assert.deepEqual(result, { status: "absent" });
    assert.equal(existsSync(consentAuditPath(root)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// OCM8 -- a present-but-corrupt marker still blocks (fail CLOSED for this narrow gate).
check("OCM8 a present-but-unparseable marker file still reads as blocking", () => {
  const root = freshRoot();
  try {
    mkdirSync(join(root, ".agent-pipeline"), { recursive: true });
    writeFileSync(consentMarkerPath(root), "not json", "utf8");
    const read = readConsentMarker({ rootDir: root });
    assert.equal(read.status, CONSENT_MARKER_STATUS);
    assert.equal(read.corrupt, true);
    assert.equal(isConsentLockBlocking({ rootDir: root }), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// OCM9 -- a present file with the wrong schema/status also still blocks.
check("OCM9 a present marker with an unrecognized shape still reads as blocking", () => {
  const root = freshRoot();
  try {
    mkdirSync(join(root, ".agent-pipeline"), { recursive: true });
    writeFileSync(consentMarkerPath(root), JSON.stringify({ schema: "something-else", status: "x" }), "utf8");
    assert.equal(isConsentLockBlocking({ rootDir: root }), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log(`\n${pass}/${pass + failures.length} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
