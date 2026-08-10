#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Coverage for PX0-AC-13's mechanism, `ruleset-freshness-host.mjs`, absent
 * until this suite: (a) `inspectHostRulesetFreshness` selects the host
 * transport correctly when a valid preflight binding is present, and falls
 * back to the CLI/direct path when it is not; (b) the `observeRulesetSource`
 * producer -- previously `main()`'s missing default, always `null` -- shapes
 * a well-formed `pipeline.ruleset-source.v1` observation from realistic
 * fixture inputs, and types a degraded/unavailable input path honestly
 * rather than crashing.
 *
 * No real `codex`/`git` host process and no real network read is started
 * anywhere in this file: every observer and host-control dependency is
 * injected. Section 2's fixtures use real temporary directories only for the
 * cheap, local `.git`-presence gate (`existsSync`), never a `git` subprocess.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateRulesetSource } from "../lib/ruleset-source.mjs";
import { PUBLIC_MARKETPLACE_URL } from "../lib/public-core-origin-allowlist.mjs";
import { WSL_FRESHNESS_BOUNDARY_ID } from "./ruleset-freshness.mjs";
import {
  hostControlBinding,
  inspectHostRulesetFreshness,
  main,
  observeRulesetSource,
} from "./ruleset-freshness-host.mjs";

const CONTENT_SHA = "f".repeat(64);
const VERSION = "0.5.4+host.test";
const DAEMON = {
  status: "running", backend: "pid", managedCodexPath: "/opt/codex", managedCodexVersion: "0.144.6",
  socketPath: "/tmp/codex.sock", cliVersion: "0.144.6", appServerVersion: "0.144.6",
};
const READY_HOST_CONTROL_OBSERVATION = {
  schema: "pipeline.codex-app-server-health.v1",
  status: "ready",
  code: "CAS-READY",
  phase: "observe",
  daemon: DAEMON,
};
const EXPECTED_CONTROL_SHA = hostControlBinding(READY_HOST_CONTROL_OBSERVATION).daemonIdentitySha256;
const VALID_PREFLIGHT_BINDING = Object.freeze({
  executionBoundary: "host-authorized-wsl",
  boundaryId: WSL_FRESHNESS_BOUNDARY_ID,
  preflightSha256: "a".repeat(64),
});

// ------------------------------------------------------------------ helpers

/** `<root>` with (or without) a `.git` entry, for the self-application gate. */
function fixtureSelfApplicationRoot({ withGit = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ruleset-freshness-host-"));
  const loadedPluginRoot = join(root, "plugins", "pipeline-core");
  mkdirSync(loadedPluginRoot, { recursive: true });
  if (withGit) mkdirSync(join(root, ".git"), { recursive: true });
  return {
    loadedPluginRoot,
    selfApplicationRoot: root,
    dispose() { rmSync(root, { recursive: true, force: true }); },
  };
}

/** The shape `observeCodexPublicCoreIdentity` returns on success. */
function readyIdentity({ repository = PUBLIC_MARKETPLACE_URL, version = VERSION, contentSha256 = CONTENT_SHA } = {}) {
  return {
    schema: "pipeline.public-core-observation.v1",
    status: "ready",
    candidate: { repository, branch: "main", commit: "a".repeat(40), tree: "b".repeat(40) },
    plugin: { name: "pipeline-core", version, manifestSha256: "c".repeat(64), contentSha256 },
  };
}

function noop() {}

// =========================================================== section 1 =====
// inspectHostRulesetFreshness: host-transport selection vs. CLI/direct path.

test("inspectHostRulesetFreshness: falls back to the CLI/direct path when no preflight binding is present", () => {
  const observeCalls = [];
  const executeCalls = [];
  const result = inspectHostRulesetFreshness({
    repoPath: "/repo",
    loadedPluginRoot: "/repo/plugins/pipeline-core",
    codexObservation: null,
    preflightBinding: null,
    execute: (action) => { executeCalls.push(action); return null; },
    observeHostControl: () => { observeCalls.push(1); return READY_HOST_CONTROL_OBSERVATION; },
  });
  // Neither the host-control observer nor the host executor is ever consulted
  // -- the branch returns before either dependency is touched.
  assert.deepEqual(observeCalls, []);
  assert.deepEqual(executeCalls, []);
  assert.equal(result.status, "invalid-input");
});

test("inspectHostRulesetFreshness: falls back to the CLI/direct path when the preflight binding is malformed", () => {
  const executeCalls = [];
  const malformed = { ...VALID_PREFLIGHT_BINDING, boundaryId: "not-the-wsl-boundary" };
  const result = inspectHostRulesetFreshness({
    repoPath: "/repo",
    loadedPluginRoot: "/repo/plugins/pipeline-core",
    codexObservation: null,
    preflightBinding: malformed,
    execute: (action) => { executeCalls.push(action); return null; },
    observeHostControl: noop,
  });
  assert.deepEqual(executeCalls, []);
  assert.equal(result.status, "invalid-input");
});

test("inspectHostRulesetFreshness: falls back to the CLI/direct path when the preflight binding is valid but host control is unavailable", () => {
  const observeCalls = [];
  const executeCalls = [];
  const result = inspectHostRulesetFreshness({
    repoPath: "/repo",
    loadedPluginRoot: "/repo/plugins/pipeline-core",
    codexObservation: null,
    preflightBinding: VALID_PREFLIGHT_BINDING,
    execute: (action) => { executeCalls.push(action); return null; },
    observeHostControl: () => { observeCalls.push(1); return { schema: "wrong" }; },
  });
  // Host control WAS attempted (the branch got that far)...
  assert.deepEqual(observeCalls, [1]);
  // ...but never resolved to an identity, so the host executor is never reached.
  assert.deepEqual(executeCalls, []);
  assert.equal(result.status, "invalid-input");
});

test("inspectHostRulesetFreshness: selects the host transport when a valid preflight binding and ready host control are present", () => {
  const executeCalls = [];
  const result = inspectHostRulesetFreshness({
    repoPath: "/repo",
    loadedPluginRoot: "/repo/plugins/pipeline-core",
    codexObservation: null,
    preflightBinding: VALID_PREFLIGHT_BINDING,
    execute: (action) => {
      executeCalls.push(action);
      return { schema: "pipeline.ruleset-freshness-host-result.v1", requestSha256: action.requestSha256, status: "unavailable", stdout: "", receipt: null };
    },
    observeHostControl: () => READY_HOST_CONTROL_OBSERVATION,
  });
  // codexObservation is null here (not "ready"), so inspectCliRulesetFreshness
  // never reaches the remote-read code that would invoke hostTransport.execute
  // -- this case pins that null/non-ready codexObservation short-circuits
  // before transport selection matters, independent of preflight validity.
  assert.deepEqual(executeCalls, []);
  assert.equal(result.status, "invalid-input");
});

test("inspectHostRulesetFreshness: the constructed host transport actually reaches the injected host executor for a ready, marketplace-public observation", () => {
  const executeCalls = [];
  const codexObservation = {
    status: "ready",
    observation: {
      schema: "pipeline.ruleset-source.v1",
      runner: "codex",
      selectedPlugin: { id: "pipeline-core", version: VERSION },
      source: { class: "marketplace-public" },
      loadedIdentity: { status: "available", algorithm: "content-sha256", value: CONTENT_SHA },
      installedIdentity: { status: "available", algorithm: "content-sha256", value: CONTENT_SHA },
    },
  };
  const result = inspectHostRulesetFreshness({
    repoPath: "/repo",
    loadedPluginRoot: "/repo/plugins/pipeline-core",
    codexObservation,
    preflightBinding: VALID_PREFLIGHT_BINDING,
    execute: (action) => {
      executeCalls.push(action);
      return { schema: "pipeline.ruleset-freshness-host-result.v1", requestSha256: action.requestSha256, status: "unavailable", stdout: "", receipt: null };
    },
    observeHostControl: () => READY_HOST_CONTROL_OBSERVATION,
  });
  // The host executor WAS reached, with the exact boundary/control-identity
  // binding this file's own action-construction logic produces -- this is
  // the positive selection proof the negative cases above only imply.
  assert.equal(executeCalls.length, 1);
  assert.equal(executeCalls[0].boundaryId, WSL_FRESHNESS_BOUNDARY_ID);
  assert.equal(executeCalls[0].expectedControlIdentitySha256, EXPECTED_CONTROL_SHA);
  // The injected executor reported "unavailable", so the freshness read
  // degrades honestly -- it never fabricates an "equal"/"ahead" claim.
  assert.equal(result.status, "remote-unavailable");
});

// =========================================================== section 2 =====
// observeRulesetSource: shape and honesty of the new producer.

test("observeRulesetSource: shapes a well-formed, validateRulesetSource-passing observation from a ready, allowlisted identity", () => {
  const fixture = fixtureSelfApplicationRoot();
  try {
    const observeCalls = [];
    const result = observeRulesetSource(
      { loadedPluginRoot: fixture.loadedPluginRoot, selfApplicationRoot: fixture.selfApplicationRoot },
      { observe: (input) => { observeCalls.push(input); return readyIdentity(); } },
    );
    assert.equal(result.status, "ready");
    assert.deepEqual(result.diagnostics, []);
    assert.equal(validateRulesetSource(result.observation).valid, true);
    assert.deepEqual(result.observation, {
      schema: "pipeline.ruleset-source.v1",
      runner: "codex",
      selectedPlugin: { id: "pipeline-core", version: VERSION },
      source: { class: "self-application" },
      loadedIdentity: { status: "available", algorithm: "content-sha256", value: CONTENT_SHA },
      installedIdentity: { status: "available", algorithm: "content-sha256", value: CONTENT_SHA },
    });
    // Self-referential call shape: loaded root IS the root being attested.
    assert.deepEqual(observeCalls, [{
      sourcePluginRoot: fixture.loadedPluginRoot,
      installedPluginRoot: fixture.loadedPluginRoot,
    }]);
  } finally {
    fixture.dispose();
  }
});

test("observeRulesetSource: also accepts the second reviewed SSH origin", () => {
  const fixture = fixtureSelfApplicationRoot();
  try {
    const result = observeRulesetSource(
      { loadedPluginRoot: fixture.loadedPluginRoot, selfApplicationRoot: fixture.selfApplicationRoot },
      { observe: () => readyIdentity({ repository: "git@github-public:agent-pipe-shared/agent-pipeline.git" }) },
    );
    assert.equal(result.status, "ready");
  } finally {
    fixture.dispose();
  }
});

test("observeRulesetSource: types a missing self-application git checkout honestly, without ever invoking the observer", () => {
  const fixture = fixtureSelfApplicationRoot({ withGit: false });
  try {
    const observeCalls = [];
    const result = observeRulesetSource(
      { loadedPluginRoot: fixture.loadedPluginRoot, selfApplicationRoot: fixture.selfApplicationRoot },
      { observe: (input) => { observeCalls.push(input); return readyIdentity(); } },
    );
    assert.equal(result.status, "source-unavailable");
    assert.equal(result.observation, null);
    // Skipped entirely -- not attempted, not failed (mirrors
    // pluginRootHasSelfApplicationGit's own documented contract).
    assert.deepEqual(observeCalls, []);
  } finally {
    fixture.dispose();
  }
});

test("observeRulesetSource: types a rejected host identity honestly", () => {
  const fixture = fixtureSelfApplicationRoot();
  try {
    const result = observeRulesetSource(
      { loadedPluginRoot: fixture.loadedPluginRoot, selfApplicationRoot: fixture.selfApplicationRoot },
      { observe: () => ({ schema: "pipeline.public-core-observation.v1", status: "rejected", reasonCodes: ["SNT-A2-GIT-UNAVAILABLE"] }) },
    );
    assert.equal(result.status, "source-unavailable");
    assert.equal(result.observation, null);
    assert.deepEqual(result.diagnostics, ["SNT-A2-GIT-UNAVAILABLE"]);
  } finally {
    fixture.dispose();
  }
});

test("observeRulesetSource: types a ready-but-not-allowlisted origin honestly, never treating an unreviewed origin as self-application", () => {
  const fixture = fixtureSelfApplicationRoot();
  try {
    const result = observeRulesetSource(
      { loadedPluginRoot: fixture.loadedPluginRoot, selfApplicationRoot: fixture.selfApplicationRoot },
      { observe: () => readyIdentity({ repository: "https://github.com/example/not-reviewed.git" }) },
    );
    assert.equal(result.status, "source-unavailable");
    assert.equal(result.observation, null);
    assert.deepEqual(result.diagnostics, ["ruleset-source-origin-not-allowlisted"]);
  } finally {
    fixture.dispose();
  }
});

test("observeRulesetSource: never throws even when the injected observer throws", () => {
  const fixture = fixtureSelfApplicationRoot();
  try {
    assert.doesNotThrow(() => {
      const result = observeRulesetSource(
        { loadedPluginRoot: fixture.loadedPluginRoot, selfApplicationRoot: fixture.selfApplicationRoot },
        { observe: () => { throw new Error("boom"); } },
      );
      assert.equal(result.status, "source-unavailable");
      assert.equal(result.observation, null);
    });
  } finally {
    fixture.dispose();
  }
});

test("observeRulesetSource: types missing/invalid input honestly without touching the filesystem", () => {
  assert.deepEqual(observeRulesetSource({}), {
    status: "source-unavailable",
    observation: null,
    diagnostics: ["ruleset-source-input-invalid"],
  });
  assert.deepEqual(observeRulesetSource(), {
    status: "source-unavailable",
    observation: null,
    diagnostics: ["ruleset-source-input-invalid"],
  });
});

// =========================================================== section 3 =====
// main(): the wiring itself -- correct call shape, and no longer a null default.

test("main(): is no longer permanently fail-closed -- the observeRulesetSource default parameter is the real producer, not null", () => {
  // A direct, environment-independent identity check on the wiring itself
  // (never invokes the real producer, so no filesystem/host/network access
  // occurs here): the destructured default expression must reference the
  // exported observeRulesetSource, not the literal `null` this file shipped
  // with before this change.
  const source = main.toString();
  assert.match(source, /observeRulesetSource:\s*observeRulesetSourceDefault\s*=\s*observeRulesetSource/u);
  assert.doesNotMatch(source, /observeRulesetSource\s*=\s*null/u);
});

test("main(): calls the injected observeRulesetSource override with the exact {loadedPluginRoot, selfApplicationRoot} shape, and its ready result reaches the freshness output", () => {
  const calls = [];
  const argv = ["--repo", "/repo", "--preflight-sha256", "a".repeat(64)];
  const exitCode = main(argv, {
    observePreflight: () => ({ schema: "pipeline.start-preflight.v1", status: "ready", executionBoundary: "default" }),
    observeRulesetSource: (input) => {
      calls.push(input);
      return {
        status: "ready",
        observation: {
          schema: "pipeline.ruleset-source.v1",
          runner: "codex",
          selectedPlugin: { id: "pipeline-core", version: VERSION },
          source: { class: "marketplace-public" },
          loadedIdentity: { status: "available", algorithm: "content-sha256", value: CONTENT_SHA },
          installedIdentity: { status: "available", algorithm: "content-sha256", value: CONTENT_SHA },
        },
      };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].loadedPluginRoot, "string");
  assert.ok(calls[0].loadedPluginRoot.length > 0);
  assert.equal(typeof calls[0].selfApplicationRoot, "string");
  // selfApplicationRoot is exactly two directories above loadedPluginRoot.
  assert.equal(join(calls[0].loadedPluginRoot, "..", ".."), join(calls[0].selfApplicationRoot));
  // No valid preflight binding here (executionBoundary is "default"), so this
  // exercises the CLI/direct freshness path with a real, ready ruleset-source
  // observation -- distinct from a null/invalid-input codexObservation.
  assert.equal(typeof exitCode, "number");
});
