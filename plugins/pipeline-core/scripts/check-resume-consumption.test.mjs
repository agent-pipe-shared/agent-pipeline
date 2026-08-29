#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-resume-consumption.test.mjs -- drives checkResumeConsumption() through all three
 * documented outcomes (backlog/items/2026-08-29-mechanical-proof-of-complete-prior-input-
 * consumption-across-restart.md Acceptance): PASS/no-card, PASS/consumed, FATAL/not-consumed --
 * plus the two FATAL sub-shapes (digest mismatch, no digest record at all) and a CLI-level
 * smoke test. Every fixture is a fresh, synthetic temp root -- never this repository's own
 * real state.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkResumeConsumption, SCHEMA } from "./check-resume-consumption.mjs";
import {
  buildResumeHint, captureResumeHint, recordResumeHintCardDigest, recordResumeHintConsumption,
} from "../lib/resume-hint.mjs";

const script = fileURLToPath(new URL("./check-resume-consumption.mjs", import.meta.url));

const BASE_CONTEXT = {
  intent: "Resume the resume-consumption verifier work.",
  scope: ["Consumption checker script only"],
  constraints: ["No transcript reading"],
  questions: ["Any remaining gap?"],
};

/** Fixture root: git-initialized AND carrying project/pipeline.yaml, the precondition
 * captureResumeHint (RH-PROJECT-UNINITIALIZED) and the private-state resolver both require --
 * same helper shape as lib/resume-hint.test.mjs's own gitInitRoot(). */
function gitInitRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  return root;
}

/** Captures a card via the real library call AND records its digest -- mirrors exactly what
 * scripts/resume-hint.mjs's `capture` CLI command does after a successful capture. */
function captureWithDigest(root, context = BASE_CONTEXT) {
  captureResumeHint({ rootDir: root, context });
  return recordResumeHintCardDigest({ rootDir: root, card: context });
}

test("PASS: no card was ever captured -- status absent", () => {
  const root = gitInitRoot("check-resume-consumption-absent-");
  try {
    const result = checkResumeConsumption({ rootDir: root, sessionId: "session-a" });
    assert.equal(result.ok, true);
    assert.equal(result.schema, SCHEMA);
    assert.equal(result.code, "RH-CHECK-NO-CARD");
    assert.equal(result.cardStatus, "absent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("PASS: an available card with a matching consumption receipt", () => {
  const root = gitInitRoot("check-resume-consumption-consumed-");
  try {
    const { cardDigest } = captureWithDigest(root);
    const consumed = recordResumeHintConsumption({ rootDir: root, sessionId: "session-a" });
    assert.equal(consumed.status, "recorded");

    const result = checkResumeConsumption({ rootDir: root, sessionId: "session-a" });
    assert.equal(result.ok, true);
    assert.equal(result.code, "RH-CHECK-CONSUMED");
    assert.equal(result.cardStatus, "available");
    assert.equal(result.cardDigest, cardDigest);

    // A DIFFERENT session, never having consumed, must still fail -- consumption is per-session.
    const otherSession = checkResumeConsumption({ rootDir: root, sessionId: "session-b" });
    assert.equal(otherSession.ok, false);
    assert.equal(otherSession.code, "RH-CHECK-RH-RECEIPT-ABSENT");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * FATAL, sub-shape 1: the F12/F13 regression case itself -- a card is `available` and this
 * exact session never produced a receipt at all. This is the fixture the item's own Acceptance
 * names explicitly: "a fabricated available-card-no-receipt fixture must be constructible and
 * must produce the fatal finding."
 */
test("FATAL: an available card with no consumption receipt at all", () => {
  const root = gitInitRoot("check-resume-consumption-no-receipt-");
  try {
    captureWithDigest(root);
    const result = checkResumeConsumption({ rootDir: root, sessionId: "session-a" });
    assert.equal(result.ok, false);
    assert.equal(result.schema, SCHEMA);
    assert.equal(result.code, "RH-CHECK-RH-RECEIPT-ABSENT");
    assert.equal(result.cardStatus, "available");
    assert.match(result.message, /F12\/F13 regression shape/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("FATAL: a receipt exists but binds a DIFFERENT digest than the card's current one", () => {
  const root = gitInitRoot("check-resume-consumption-mismatch-");
  try {
    captureWithDigest(root);
    recordResumeHintConsumption({ rootDir: root, sessionId: "session-a" }); // receipt bound to digest 1

    // A second capture replaces the card and its recorded digest without a new consumption --
    // the stale receipt from the first card must not be mistaken for consuming the new one.
    captureWithDigest(root, { ...BASE_CONTEXT, intent: "A different, later intent entirely." });

    const result = checkResumeConsumption({ rootDir: root, sessionId: "session-a" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "RH-CHECK-RH-RECEIPT-DIGEST-MISMATCH");
    assert.notEqual(result.receiptDigest, result.cardDigest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * FATAL, sub-shape 2: a card is `available` (a valid file sits at project/resume-hint.json) but
 * no card-digest record was ever written -- the card was captured through the raw library call
 * only (`captureResumeHint`), never through the CLI `capture` command that additionally calls
 * `recordResumeHintCardDigest`. There is nothing to verify a receipt against.
 */
test("FATAL: an available card with no card-digest record to check consumption against", () => {
  const root = gitInitRoot("check-resume-consumption-no-digest-");
  try {
    captureResumeHint({ rootDir: root, context: BASE_CONTEXT }); // no recordResumeHintCardDigest call
    const result = checkResumeConsumption({ rootDir: root, sessionId: "session-a" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "RH-CHECK-NO-DIGEST-RECORD");
    assert.equal(result.cardStatus, "available");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A fully synthetic fixture with no filesystem at all, proving `inspect`/`query` injection
 * genuinely drives the fatal path -- independent of anything the real repository, or even a
 * real git-initialized temp root, currently contains.
 */
test("FATAL: synthetic injected inspect/query fixture, no filesystem involved", () => {
  const inspect = () => ({ status: "available", hint: { context: BASE_CONTEXT } });
  const query = () => ({ outcome: "not-consumed", cardDigest: "a".repeat(64), code: "RH-RECEIPT-ABSENT" });
  const result = checkResumeConsumption({ rootDir: "/does/not/exist", sessionId: "session-x", inspect, query });
  assert.equal(result.ok, false);
  assert.equal(result.code, "RH-CHECK-RH-RECEIPT-ABSENT");
  assert.equal(result.cardDigest, "a".repeat(64));
});

test("PASS: synthetic injected fixture for challenged-stale/ignored-invalid status, never fatal", () => {
  for (const status of ["challenged-stale", "ignored-invalid"]) {
    const inspect = () => ({ status, hint: null, code: "RH-AGED" });
    const query = () => { throw new Error("must not be called when no card is available"); };
    const result = checkResumeConsumption({ rootDir: "/does/not/exist", sessionId: "session-x", inspect, query });
    assert.equal(result.ok, true);
    assert.equal(result.code, "RH-CHECK-NO-CARD");
    assert.equal(result.cardStatus, status);
  }
});

test("buildResumeHint import sanity: the fixture context this suite uses is itself a valid card", () => {
  assert.equal(buildResumeHint({ context: BASE_CONTEXT }).context.intent, BASE_CONTEXT.intent);
});

// --- CLI-level smoke tests --------------------------------------------------------------------

test("CLI: usage error (exit 3) when --session-id is missing", () => {
  const root = gitInitRoot("check-resume-consumption-cli-usage-");
  try {
    const result = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
    assert.equal(result.status, 3);
    assert.match(result.stderr, /usage: check-resume-consumption\.mjs/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: exit 0 and JSON PASS output when no card is available", () => {
  const root = gitInitRoot("check-resume-consumption-cli-pass-");
  try {
    const result = spawnSync(process.execPath, [script, "--root", root, "--session-id", "session-a", "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.code, "RH-CHECK-NO-CARD");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: exit 1 and FATAL stderr output when an available card has no receipt", () => {
  const root = gitInitRoot("check-resume-consumption-cli-fatal-");
  try {
    captureWithDigest(root);
    const result = spawnSync(process.execPath, [script, "--root", root, "--session-id", "session-a"], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^FATAL \(RH-CHECK-RH-RECEIPT-ABSENT\):/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: exit 0 after consume, via the real consume CLI subcommand", () => {
  const root = gitInitRoot("check-resume-consumption-cli-consumed-");
  try {
    captureWithDigest(root);
    const helper = fileURLToPath(new URL("./resume-hint.mjs", import.meta.url));
    const consumed = spawnSync(process.execPath, [helper, "consume", "--root", root, "--session-id", "session-a"], { encoding: "utf8" });
    assert.equal(consumed.status, 0, consumed.stderr);

    const result = spawnSync(process.execPath, [script, "--root", root, "--session-id", "session-a", "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).code, "RH-CHECK-CONSUMED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
