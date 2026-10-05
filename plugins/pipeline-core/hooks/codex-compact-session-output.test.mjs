#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC02C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { main } from "./codex-session-start-hint.mjs";
import { decideOutput } from "./post-compact-reground.mjs";
import { devNull } from "node:os";

const hookPath = fileURLToPath(new URL("./codex-session-start-hint.mjs", import.meta.url));
const scratch = fileURLToPath(new URL("../../../scratch/", import.meta.url));

function fixture(t) {
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "codex-compact-wire-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Isolate Git discovery from the checkout containing Scratch. Otherwise S1
  // correctly resolves consent against that ancestor rather than this fixture.
  const env = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "NODE_OPTIONS", "NODE_PATH"]) delete env[key];
  const git = spawnSync("git", ["init", "--quiet", "--template="], {
    cwd: root, env, encoding: "utf8", shell: false,
  });
  assert.equal(git.status, 0, git.stderr);
  mkdirSync(join(root, ".agent-pipeline"));
  writeFileSync(join(root, ".agent-pipeline/onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-28T00:00:00.000Z",
  }) + "\n");
  return root;
}

function tree(root, prefix = "") {
  return readdirSync(join(root, prefix), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => entry.isDirectory()
      ? tree(root, join(prefix, entry.name))
      : [[join(prefix, entry.name), readFileSync(join(root, prefix, entry.name), "utf8")]]);
}

function capture(root, input) {
  let stdout = "";
  const original = process.stdout.write;
  try {
    process.stdout.write = chunk => { stdout += chunk; return true; };
    main({ projectDir: root, input });
  } finally {
    process.stdout.write = original;
  }
  return JSON.parse(stdout);
}

// Codex's SessionStart wire structs reject unknown fields. Budget diagnostics
// belong to the local reground result, never the SessionStart wire payload.
function supportedWire(value) {
  assert.deepEqual(Object.keys(value).sort(), ["hookSpecificOutput", "systemMessage"]);
  assert.equal(typeof value.systemMessage, "string");
  assert.deepEqual(Object.keys(value.hookSpecificOutput).sort(), ["additionalContext", "hookEventName"]);
  assert.equal(value.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(typeof value.hookSpecificOutput.additionalContext, "string");
}

function exactProjection(actual, local) {
  supportedWire(actual);
  assert.equal(actual.systemMessage, local.payload.systemMessage);
  assert.equal(actual.hookSpecificOutput.additionalContext, local.payload.hookSpecificOutput.additionalContext);
  assert.ok(local.measurement);
  assert.ok(local.payload.hookSpecificOutput.bootstrapPayloadMeasurement);
  assert.ok(local.payload.hookSpecificOutput.originalBootstrapPayloadMeasurement);
}

function readyState(root) {
  const hex = char => char.repeat(64);
  const state = {
    schema: "pipeline.state.v0",
    activeFeature: { id: "f1", planPath: "specs/prd.md", phase: "implementation" },
    continuity: {
      schema: "pipeline.continuity.v0", featureId: "f1", revision: 4,
      runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
      authority: {
        prd: { path: "specs/prd.md", sha256: hex("a") },
        spec: { path: "specs/spec.md", sha256: hex("b") },
        result: { path: "specs/result.md", sha256: hex("c") },
      },
      queueHead: {
        packageId: "P1", actionId: "post-compact-reground", nextAction: "dispatch",
        productRetryCount: 0, environmentRerouteCount: 0, dispatch: null,
      },
      blocker: null, acknowledgedFinal: null,
      resume: { mode: "resume-on-next-turn", sourceRevision: 4, reasonCode: "compact-reload" },
      recovery: null, decisionTxn: null,
      capacity: {
        concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer",
      },
    },
  };
  mkdirSync(join(root, ".claude"));
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, ".claude/pipeline-state.json"), JSON.stringify(state) + "\n");
  writeFileSync(join(root, "docs/state.md"), "Public current work\n## Archived history\nArchived fixture narrative\n");
  return state;
}

test("stopped Compact preserves exact fail-closed context and does not change fixture state", t => {
  const root = fixture(t);
  const input = { source: "compact", session_id: "public-fixture", cwd: root };
  const before = tree(root);
  const local = decideOutput(input, null, { rootDir: root });
  const actual = capture(root, input);
  exactProjection(actual, local);
  assert.equal(local.projection.code, "PCR-OUTER-INVALID");
  assert.equal(local.projection.workResumptionAllowed, false);
  assert.equal(local.projection.dispatchEligibility.allowed, false);
  assert.match(actual.systemMessage, /PCR-OUTER-INVALID/u);
  assert.doesNotMatch(actual.systemMessage, /run pipeline-core:pipeline-start/u);
  assert.deepEqual(tree(root), before);
});

test("ready Compact retains exact validated continuity, bounded narrative and unchanged state", t => {
  const root = fixture(t);
  const state = readyState(root);
  const input = { source: "compact", session_id: "public-fixture", cwd: root };
  const before = tree(root);
  const local = decideOutput(input, state, { rootDir: root });
  const actual = capture(root, input);
  exactProjection(actual, local);
  assert.equal(local.projection.code, "PCR-READY");
  assert.equal(local.projection.workResumptionAllowed, true);
  assert.equal(local.projection.featureId, state.activeFeature.id);
  assert.equal(local.projection.revision, state.continuity.revision);
  for (const key of ["runtime", "authority", "queueHead", "resume", "blocker", "decisionTxn", "recovery"]) {
    assert.deepEqual(local.projection[key], state.continuity[key]);
  }
  const prefix = "Validated continuity projection: ";
  const projectionLine = actual.systemMessage.split("\n").find(line => line.startsWith(prefix));
  assert.ok(projectionLine);
  assert.deepEqual(JSON.parse(projectionLine.slice(prefix.length)), local.projection);
  assert.match(actual.systemMessage, /Public current work/u);
  assert.doesNotMatch(actual.systemMessage, /Archived fixture narrative|run pipeline-core:pipeline-start/u);
  assert.deepEqual(tree(root), before);
});

test("direct hook subprocess emits one supported JSON object for stopped and ready Compact", t => {
  // Run the physical hook with native imports and no preload or module loader.
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  delete env.CLAUDE_PROJECT_DIR;
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  for (const ready of [false, true]) {
    const root = fixture(t);
    const state = ready ? readyState(root) : null;
    const input = { source: "compact", session_id: "public-fixture", cwd: root };
    const before = tree(root);
    const local = decideOutput(input, state, { rootDir: root });
    const result = spawnSync(process.execPath, [hookPath], {
      cwd: root, input: JSON.stringify(input), encoding: "utf8", env,
      timeout: 10000, maxBuffer: 262144, shell: false,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trim().split("\n").length, 1);
    exactProjection(JSON.parse(result.stdout), local);
    assert.deepEqual(tree(root), before);
  }
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 3) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
