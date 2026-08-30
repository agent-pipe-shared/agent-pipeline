#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

// AGY-HARDENFORCE-DETECT-1: bootstrap-time observability for whether the
// Antigravity hard-enforcement PreInvocation hook (antigravity-start-hint.mjs)
// actually fired this session. This closes the observability gap recorded in
// backlog/items/2026-08-23-antigravity-hard-enforcement-layer-has-two-fail-open-paths.md
// ("Candidate future direction") -- it detects the daemon/node-PATH fail-open,
// it never fixes it (no code fix is possible from inside a hook that never runs).
//
// NVA-ARMEDPROOF-1 (2026-08-27) extends this suite rather than replacing it:
// (a) the lock is now bound to the exact installed plugin version, so a lock
// left behind by an uninstalled or since-upgraded build no longer vouches for
// guards that are no longer installed; (b) the Antigravity runner can no
// longer reach `status: "ready"` when the hard-enforcement layer was not
// observed this session (fail-closed).

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS,
  ANTIGRAVITY_HARD_ENFORCEMENT_NOT_OBSERVED_STATUS,
  ANTIGRAVITY_HARD_ENFORCEMENT_SCHEMA,
  observeAntigravityHardEnforcement,
  observePipelineStartPreflight,
  pipelineStartPreflightExitCode,
} from "./pipeline-start-preflight.mjs";

// The version this suite's fixtures agree on as "the currently installed
// build" -- matches `manifest` below, which every `read` mock in this file
// returns regardless of the manifest path requested.
const TEST_VERSION = "0.4.5+test";
const manifest = JSON.stringify({ version: TEST_VERSION });
const pluginList = () => () => JSON.stringify({ installed: [], available: [] });

// Deterministic, hermetic attestation default for the Claude/Codex-runner
// tests below (mirrors `readyObservation`/`preflight` in
// pipeline-start-preflight.test.mjs, this file's own sibling): those tests
// are about the Antigravity-field/status wiring, not about the separate
// self-application origin/content attestation, so that attestation is
// defaulted to "ready" via an injected `observe` rather than depending on
// this checkout's live git state.
//
// NOT used for the Antigravity-runner wiring tests below: `runner: "agy"`
// is what `evaluateSelfApplicationAttestation`'s downstream
// `normalizeRulesetSource` accepts, but `pipeline-start-preflight.mjs`
// resolves this runner's identity string as `"antigravity"` (env
// `ANTIGRAVITY_AGENT`/`AI_AGENT` -- see its own `runner` resolution) --
// an unrelated, out-of-scope mismatch that makes self-application
// attestation unconditionally fail for a real Antigravity session against a
// real self-application git checkout, regardless of `observe`'s return
// value. In scope here, those tests instead route `scriptUrl` at a
// synthetic path with no `.git` two directories up
// (`pluginRootHasSelfApplicationGit` false), which skips the attestation
// attempt entirely rather than depending on that unrelated bug's outcome.
function readyObservation() {
  return {
    schema: "pipeline.public-core-observation.v1",
    status: "ready",
    candidate: {
      repository: "https://github.com/agent-pipe-shared/agent-pipeline.git",
      branch: "main",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
    },
    plugin: {
      name: "pipeline-core",
      version: TEST_VERSION,
      manifestSha256: "c".repeat(64),
      contentSha256: "d".repeat(64),
    },
  };
}

// A synthetic scriptUrl under `root` (a fresh tmpdir with no `.git` two
// directories above it) so `pluginRootHasSelfApplicationGit` reads false and
// self-application attestation is skipped entirely -- see readyObservation's
// own comment above for why the Antigravity-runner tests need this instead
// of the `observe` mock.
function noSelfApplicationGitScriptUrl(root) {
  return pathToFileURL(join(root, "scripts", "pipeline-start-preflight.mjs")).href;
}

// Helper mirroring pipeline-start-preflight.test.mjs's own fixture shape:
// a temp directory stands in for `rootDir`/`cwd`, holding a real
// `.git/agent-pipeline/run/session-*/requires-bootstrap.lock` tree so the
// end-to-end wiring (not just the unit-level function) is proven. Cleaned up
// unconditionally after every test that creates one (Restore-before-yield).
function withTempRoot(run) {
  const root = mkdtempSync(join(tmpdir(), "agy-hardenforce-detect-1-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// `version` defaults to TEST_VERSION (the "currently installed" build in
// every fixture below) so pre-existing tests that only care about freshness
// keep writing a version-matching lock without having to say so themselves.
// Passing `version: null` explicitly (NOT `undefined`, which would only
// re-trigger the default parameter) writes the older-build plain-text body
// (`locked\n`) that predates NVA-ARMEDPROOF-1's version field entirely.
function writeLock(root, sessionId, mtime, version = TEST_VERSION) {
  const dir = join(root, ".git", "agent-pipeline", "run", `session-${sessionId}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "requires-bootstrap.lock");
  const body = version === null ? "locked\n" : `${JSON.stringify({ locked: true, version })}\n`;
  writeFileSync(path, body, "utf8");
  utimesSync(path, mtime / 1000, mtime / 1000);
  return path;
}

test("a freshly written lock naming the current version is observed, with no warning", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "abc", now - 1000);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.schema, ANTIGRAVITY_HARD_ENFORCEMENT_SCHEMA);
    assert.equal(result.observed, true);
    assert.equal(result.warning, null);
    assert.equal(result.freshWindowMs, ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS);
  });
});

test("no lock file at all is not observed, with a clear warning naming GEMINI.md", () => {
  withTempRoot((root) => {
    const result = observeAntigravityHardEnforcement({ rootDir: root, now: Date.now(), currentVersion: TEST_VERSION });
    assert.equal(result.observed, false);
    assert.match(result.warning, /GEMINI\.md/u);
    assert.match(result.warning, /Prerequisites/u);
  });
});

test("no .git directory at all is not observed and never throws", () => {
  withTempRoot((root) => {
    const result = observeAntigravityHardEnforcement({ rootDir: root, now: Date.now(), currentVersion: TEST_VERSION });
    assert.equal(result.observed, false);
    assert.notEqual(result.warning, null);
  });
});

test("a lock older than the freshness window is not observed, same as absent", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "old-session", now - ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS - 1);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.observed, false);
    assert.notEqual(result.warning, null);
  });
});

test("a lock exactly at the freshness window boundary still counts as observed (inclusive)", () => {
  withTempRoot((root) => {
    const requestedNow = Date.now();
    const lockPath = writeLock(root, "boundary", requestedNow - ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS);
    // `utimesSync()` is allowed to round to the filesystem's timestamp
    // precision. Bind the exact-window assertion to the mtime that was
    // actually persisted instead of assuming the requested fractional value
    // survived byte-for-byte; the production comparison remains inclusive.
    const now = statSync(lockPath).mtimeMs + ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS;
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.observed, true);
  });
});

test("the freshest of several session locks decides observed, even when older ones are stale", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "very-old", now - (10 * ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS));
    writeLock(root, "fresh", now - 500);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.observed, true);
    assert.equal(result.warning, null);
  });
});

test("a future mtime is never trusted as evidence of freshness", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "clock-skew", now + 60_000);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.observed, false);
  });
});

test("a directory entry under run/ that is not a session-* name is ignored", () => {
  withTempRoot((root) => {
    const now = Date.now();
    const strayDir = join(root, ".git", "agent-pipeline", "run", "not-a-session");
    mkdirSync(strayDir, { recursive: true });
    writeFileSync(join(strayDir, "requires-bootstrap.lock"), `${JSON.stringify({ locked: true, version: TEST_VERSION })}\n`, "utf8");
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.observed, false);
  });
});

test("scanning a session directory that turns out to hold no lock file at all does not throw", () => {
  withTempRoot((root) => {
    mkdirSync(join(root, ".git", "agent-pipeline", "run", "session-empty"), { recursive: true });
    const result = observeAntigravityHardEnforcement({ rootDir: root, now: Date.now(), currentVersion: TEST_VERSION });
    assert.equal(result.observed, false);
    assert.notEqual(result.warning, null);
  });
});

test("an injected scan failure folds into not-observed rather than throwing (fail-open)", () => {
  const result = observeAntigravityHardEnforcement({
    rootDir: "/does/not/matter",
    now: Date.now(),
    currentVersion: TEST_VERSION,
    readdir: () => { throw new Error("boom"); },
  });
  assert.equal(result.observed, false);
  assert.notEqual(result.warning, null);
});

// --- Version binding (NVA-ARMEDPROOF-1) -------------------------------------

test("a fresh lock naming a DIFFERENT version is not observed, exactly like an absent lock", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "mismatched", now - 1000, "0.4.4+test");
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.observed, false);
    assert.notEqual(result.warning, null);
  });
});

test("a fresh lock with NO version field at all (an older-build body) is not observed", () => {
  withTempRoot((root) => {
    const now = Date.now();
    // version: null writes the pre-binding literal "locked\n" body.
    writeLock(root, "legacy-build", now - 1000, null);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.observed, false);
    assert.notEqual(result.warning, null);
  });
});

test("a fresh, version-matching lock alongside an older-build unversioned one still resolves observed via the matching entry", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "legacy-build", now - 500, null);
    writeLock(root, "current-build", now - 200, TEST_VERSION);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.observed, true);
  });
});

test("no currentVersion supplied at all means nothing can ever match, even a fresh version-carrying lock", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "abc", now - 1000, TEST_VERSION);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now });
    assert.equal(result.observed, false);
  });
});

test("an unparseable lock body (corrupted, not JSON) is not observed rather than throwing", () => {
  withTempRoot((root) => {
    const now = Date.now();
    const dir = join(root, ".git", "agent-pipeline", "run", "session-corrupt");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "requires-bootstrap.lock");
    writeFileSync(path, "{not json", "utf8");
    utimesSync(path, (now - 1000) / 1000, (now - 1000) / 1000);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now, currentVersion: TEST_VERSION });
    assert.equal(result.observed, false);
    assert.notEqual(result.warning, null);
  });
});

// --- Wiring into observePipelineStartPreflight -----------------------------
// Every test below injects `observe: readyObservation` to hold the separate
// self-application origin/content attestation hermetically at "ready" -- so
// any non-"ready" status observed is attributable ONLY to the Antigravity
// hard-enforcement signal under test, never to this checkout's live git state.

test("the Antigravity runner surfaces the observation field end to end, wired through cwd, and status stays ready", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "live", now - 1000);
    const result = observePipelineStartPreflight({
      env: { ANTIGRAVITY_AGENT: "1" },
      pluginList: pluginList(),
      read: () => manifest,
      cwd: root,
      scriptUrl: noSelfApplicationGitScriptUrl(root),
    });
    assert.ok(result.antigravityHardEnforcement);
    assert.equal(result.antigravityHardEnforcement.observed, true);
    assert.equal(result.antigravityHardEnforcement.warning, null);
    assert.equal(result.status, "ready");
    assert.equal(pipelineStartPreflightExitCode(result), 0);
  });
});

test("the Antigravity runner (via AI_AGENT) surfaces a warning when no lock exists, and status is fail-closed, not ready", () => {
  withTempRoot((root) => {
    const result = observePipelineStartPreflight({
      env: { AI_AGENT: "antigravity" },
      pluginList: pluginList(),
      read: () => manifest,
      cwd: root,
      scriptUrl: noSelfApplicationGitScriptUrl(root),
    });
    assert.ok(result.antigravityHardEnforcement);
    assert.equal(result.antigravityHardEnforcement.observed, false);
    assert.match(result.antigravityHardEnforcement.warning, /GEMINI\.md/u);
    assert.equal(result.status, ANTIGRAVITY_HARD_ENFORCEMENT_NOT_OBSERVED_STATUS);
    assert.notEqual(result.status, "ready");
    assert.equal(pipelineStartPreflightExitCode(result), 2);
  });
});

test("the Antigravity runner surfaces not-observed for a stale prior-session lock, and status is fail-closed", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "yesterday", now - ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS - 60_000);
    const result = observePipelineStartPreflight({
      env: { ANTIGRAVITY_AGENT: "1" },
      pluginList: pluginList(),
      read: () => manifest,
      cwd: root,
      scriptUrl: noSelfApplicationGitScriptUrl(root),
    });
    assert.equal(result.antigravityHardEnforcement.observed, false);
    assert.equal(result.status, ANTIGRAVITY_HARD_ENFORCEMENT_NOT_OBSERVED_STATUS);
  });
});

test("the Antigravity runner surfaces not-observed for a fresh lock bound to an uninstalled/older version, and status is fail-closed", () => {
  withTempRoot((root) => {
    const now = Date.now();
    // A lock left behind by a build that has since been uninstalled or
    // upgraded: fresh in time, but bound to a version that is no longer the
    // one actually loaded (`manifest` above reports TEST_VERSION).
    writeLock(root, "stale-build", now - 1000, "0.4.4+test");
    const result = observePipelineStartPreflight({
      env: { ANTIGRAVITY_AGENT: "1" },
      pluginList: pluginList(),
      read: () => manifest,
      cwd: root,
      scriptUrl: noSelfApplicationGitScriptUrl(root),
    });
    assert.equal(result.antigravityHardEnforcement.observed, false);
    assert.equal(result.status, ANTIGRAVITY_HARD_ENFORCEMENT_NOT_OBSERVED_STATUS);
    assert.notEqual(result.status, "ready");
  });
});

test("wiring passes the preflight's own resolved version as currentVersion, not a second independently-derived one", () => {
  withTempRoot((root) => {
    const now = Date.now();
    // The lock names a DIFFERENT version than the one `read` reports as
    // installed -- if the wiring ever passed a hardcoded or mismatched
    // currentVersion, this would spuriously flip to observed regardless of
    // the actual manifest content.
    writeLock(root, "abc", now - 1000, "9.9.9+not-the-installed-version");
    const result = observePipelineStartPreflight({
      env: { ANTIGRAVITY_AGENT: "1" },
      pluginList: pluginList(),
      read: () => manifest, // reports TEST_VERSION
      cwd: root,
      observe: readyObservation,
    });
    assert.equal(result.antigravityHardEnforcement.observed, false);
  });
});

// DoD: for Claude/Codex this must not merely "pass" -- the detector must never
// be INVOKED at all. Proven with a spy that throws if called; a passing test
// here is proof of non-invocation, not just of an absent field. Status is
// additionally asserted "ready" (deterministically, via readyObservation):
// NVA-ARMEDPROOF-1's DoD requires "their status must be unaffected", not just
// the field's absence.
test("a Claude session never invokes the Antigravity detector, carries no such field, and status stays ready", () => {
  const spy = () => { throw new Error("must not be invoked for the Claude runner"); };
  const result = observePipelineStartPreflight({
    env: { CLAUDECODE: "1" },
    pluginList: pluginList(),
    read: () => JSON.stringify({ version: TEST_VERSION }),
    observeAntigravityHardEnforcementFn: spy,
    observe: readyObservation,
  });
  assert.equal(Object.hasOwn(result, "antigravityHardEnforcement"), false);
  assert.equal(result.status, "ready");
});

test("a Codex session never invokes the Antigravity detector, carries no such field, and status stays ready", () => {
  const spy = () => { throw new Error("must not be invoked for the Codex runner"); };
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    observeAntigravityHardEnforcementFn: spy,
    observe: readyObservation,
  });
  assert.equal(Object.hasOwn(result, "antigravityHardEnforcement"), false);
  assert.equal(result.status, "ready");
});

// Byte-identical surrounding output for Claude/Codex: same exact key set as
// the pre-existing baseline assertion in pipeline-start-preflight.test.mjs
// ("preflight reports exact identity and no-handoff without secret fields"),
// now additionally proven under an injected spy that would blow up the whole
// call if it were ever reached -- so a passing, unchanged key set here is
// proof the new code path contributes nothing observable for these runners.
// The status value itself is also asserted "ready" here (NVA-ARMEDPROOF-1's
// DoD: "their status must be unaffected"), not just the key set -- made
// deterministic via readyObservation rather than depending on live git state.
test("Codex preflight output keys and status are unchanged by this addition (byte-identical surface)", () => {
  const spy = () => { throw new Error("must not be invoked for the Codex runner"); };
  const cwd = "/projects/current";
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
    observeAntigravityHardEnforcementFn: spy,
    observe: readyObservation,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "bootstrapPayload", "concurrentSessionWarning", "executionBoundary", "handoff", "installedSource",
    "installedVersion", "nextAction", "pluginRoot", "rulesetSource", "schema", "status", "statusScope",
    "version",
  ]);
  assert.equal(result.status, "ready");
  assert.equal(pipelineStartPreflightExitCode(result), 0);
});
