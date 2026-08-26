#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

// AGY-HARDENFORCE-DETECT-1: bootstrap-time observability for whether the
// Antigravity hard-enforcement PreInvocation hook (antigravity-start-hint.mjs)
// actually fired this session. This closes the observability gap recorded in
// backlog/items/2026-08-23-antigravity-hard-enforcement-layer-has-two-fail-open-paths.md
// ("Candidate future direction") -- it detects the daemon/node-PATH fail-open,
// it never fixes it (no code fix is possible from inside a hook that never runs).

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS,
  ANTIGRAVITY_HARD_ENFORCEMENT_SCHEMA,
  observeAntigravityHardEnforcement,
  observePipelineStartPreflight,
} from "./pipeline-start-preflight.mjs";

const manifest = JSON.stringify({ version: "0.4.5+test" });
const pluginList = () => () => JSON.stringify({ installed: [], available: [] });

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

function writeLock(root, sessionId, mtime) {
  const dir = join(root, ".git", "agent-pipeline", "run", `session-${sessionId}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "requires-bootstrap.lock");
  writeFileSync(path, "locked\n", "utf8");
  utimesSync(path, mtime / 1000, mtime / 1000);
  return path;
}

test("a freshly written lock is observed, with no warning", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "abc", now - 1000);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now });
    assert.equal(result.schema, ANTIGRAVITY_HARD_ENFORCEMENT_SCHEMA);
    assert.equal(result.observed, true);
    assert.equal(result.warning, null);
    assert.equal(result.freshWindowMs, ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS);
  });
});

test("no lock file at all is not observed, with a clear warning naming GEMINI.md", () => {
  withTempRoot((root) => {
    const result = observeAntigravityHardEnforcement({ rootDir: root, now: Date.now() });
    assert.equal(result.observed, false);
    assert.match(result.warning, /GEMINI\.md/u);
    assert.match(result.warning, /Prerequisites/u);
  });
});

test("no .git directory at all is not observed and never throws", () => {
  withTempRoot((root) => {
    const result = observeAntigravityHardEnforcement({ rootDir: root, now: Date.now() });
    assert.equal(result.observed, false);
    assert.notEqual(result.warning, null);
  });
});

test("a lock older than the freshness window is not observed, same as absent", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "old-session", now - ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS - 1);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now });
    assert.equal(result.observed, false);
    assert.notEqual(result.warning, null);
  });
});

test("a lock exactly at the freshness window boundary still counts as observed (inclusive)", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "boundary", now - ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now });
    assert.equal(result.observed, true);
  });
});

test("the freshest of several session locks decides observed, even when older ones are stale", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "very-old", now - (10 * ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS));
    writeLock(root, "fresh", now - 500);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now });
    assert.equal(result.observed, true);
    assert.equal(result.warning, null);
  });
});

test("a future mtime is never trusted as evidence of freshness", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "clock-skew", now + 60_000);
    const result = observeAntigravityHardEnforcement({ rootDir: root, now });
    assert.equal(result.observed, false);
  });
});

test("a directory entry under run/ that is not a session-* name is ignored", () => {
  withTempRoot((root) => {
    const now = Date.now();
    const strayDir = join(root, ".git", "agent-pipeline", "run", "not-a-session");
    mkdirSync(strayDir, { recursive: true });
    writeFileSync(join(strayDir, "requires-bootstrap.lock"), "locked\n", "utf8");
    const result = observeAntigravityHardEnforcement({ rootDir: root, now });
    assert.equal(result.observed, false);
  });
});

test("scanning a session directory that turns out to hold no lock file at all does not throw", () => {
  withTempRoot((root) => {
    mkdirSync(join(root, ".git", "agent-pipeline", "run", "session-empty"), { recursive: true });
    const result = observeAntigravityHardEnforcement({ rootDir: root, now: Date.now() });
    assert.equal(result.observed, false);
    assert.notEqual(result.warning, null);
  });
});

test("an injected scan failure folds into not-observed rather than throwing (fail-open)", () => {
  const result = observeAntigravityHardEnforcement({
    rootDir: "/does/not/matter",
    now: Date.now(),
    readdir: () => { throw new Error("boom"); },
  });
  assert.equal(result.observed, false);
  assert.notEqual(result.warning, null);
});

// --- Wiring into observePipelineStartPreflight -----------------------------

test("the Antigravity runner surfaces the observation field end to end, wired through cwd", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "live", now - 1000);
    const result = observePipelineStartPreflight({
      env: { ANTIGRAVITY_AGENT: "1" },
      pluginList: pluginList(),
      read: () => manifest,
      cwd: root,
    });
    assert.ok(result.antigravityHardEnforcement);
    assert.equal(result.antigravityHardEnforcement.observed, true);
    assert.equal(result.antigravityHardEnforcement.warning, null);
  });
});

test("the Antigravity runner (via AI_AGENT) surfaces a warning when no lock exists", () => {
  withTempRoot((root) => {
    const result = observePipelineStartPreflight({
      env: { AI_AGENT: "antigravity" },
      pluginList: pluginList(),
      read: () => manifest,
      cwd: root,
    });
    assert.ok(result.antigravityHardEnforcement);
    assert.equal(result.antigravityHardEnforcement.observed, false);
    assert.match(result.antigravityHardEnforcement.warning, /GEMINI\.md/u);
  });
});

test("the Antigravity runner surfaces not-observed for a stale prior-session lock", () => {
  withTempRoot((root) => {
    const now = Date.now();
    writeLock(root, "yesterday", now - ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS - 60_000);
    const result = observePipelineStartPreflight({
      env: { ANTIGRAVITY_AGENT: "1" },
      pluginList: pluginList(),
      read: () => manifest,
      cwd: root,
    });
    assert.equal(result.antigravityHardEnforcement.observed, false);
  });
});

// DoD: for Claude/Codex this must not merely "pass" -- the detector must never
// be INVOKED at all. Proven with a spy that throws if called; a passing test
// here is proof of non-invocation, not just of an absent field.
test("a Claude session never invokes the Antigravity detector, and carries no such field", () => {
  const spy = () => { throw new Error("must not be invoked for the Claude runner"); };
  const result = observePipelineStartPreflight({
    env: { CLAUDECODE: "1" },
    pluginList: pluginList(),
    read: () => JSON.stringify({ version: "0.5.2+claude.test" }),
    observeAntigravityHardEnforcementFn: spy,
  });
  assert.equal(Object.hasOwn(result, "antigravityHardEnforcement"), false);
});

test("a Codex session never invokes the Antigravity detector, and carries no such field", () => {
  const spy = () => { throw new Error("must not be invoked for the Codex runner"); };
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    observeAntigravityHardEnforcementFn: spy,
  });
  assert.equal(Object.hasOwn(result, "antigravityHardEnforcement"), false);
});

// Byte-identical surrounding output for Claude/Codex: same exact key set as
// the pre-existing baseline assertion in pipeline-start-preflight.test.mjs
// ("preflight reports exact identity and no-handoff without secret fields"),
// now additionally proven under an injected spy that would blow up the whole
// call if it were ever reached -- so a passing, unchanged key set here is
// proof the new code path contributes nothing observable for these runners.
test("Codex preflight output keys are unchanged by this addition (byte-identical surface)", () => {
  const spy = () => { throw new Error("must not be invoked for the Codex runner"); };
  const cwd = "/projects/current";
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
    observeAntigravityHardEnforcementFn: spy,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "bootstrapPayload", "concurrentSessionWarning", "executionBoundary", "handoff", "installedSource",
    "installedVersion", "nextAction", "pluginRoot", "rulesetSource", "schema", "status", "statusScope",
    "version",
  ]);
});
