// SPDX-License-Identifier: SUL-1.0

// ALF-C-N1-02C (item pipeline.forensics-and-audit-evidence-not-reconstructable, Acceptance
// "Bootstrap and dispatch compare continuity source digests with the checkout and surface drift
// as an open recovery"): the pipeline-start preflight compares the PRD/Spec digests the State's
// continuity records with the bytes now in the checkout and surfaces a typed ADVISORY
// (`continuityAuthorityDrift`) only when they differ or cannot be compared.
//
// Same hermetic harness as pipeline-start-preflight.session-intent.test.mjs: every observer that
// would touch the host is injected, the readiness probe is injected, and the project root is a
// real (realpath-resolved) scratch fixture holding project/pipeline-state.json plus the PRD and
// Spec files, so the continuity observation itself runs for real against real bytes.
//
// Two invariants are pinned on every shape: the advisory never changes `status`, `nextAction`
// or the exit code (each drifted run is compared with its in-sync twin on the SAME root), and a
// project with nothing to report keeps its envelope key set (an absent key, not a null one).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import {
  CONTINUITY_AUTHORITY_DRIFT_CODE,
  CONTINUITY_AUTHORITY_DRIFT_ROUTE,
  CONTINUITY_AUTHORITY_DRIFT_SCHEMA,
} from "../lib/continuity-authority-drift.mjs";
import { ProjectOnboardingReadyError } from "../lib/project-onboarding-ready-gate.mjs";
import {
  observeContinuityAuthorityDrift,
  observePipelineStartPreflight,
  pipelineStartPreflightExitCode,
} from "./pipeline-start-preflight.mjs";

const PRD_PATH = "docs/prd.md";
const SPEC_PATH = "docs/spec.md";
const KEY = "continuityAuthorityDrift";
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const manifest = JSON.stringify({ version: "0.4.5+test" });
const pluginList = () => JSON.stringify({
  installed: [{
    pluginId: "pipeline-core@agent-pipeline",
    name: "pipeline-core",
    marketplaceName: "agent-pipeline",
    version: "0.4.5+test",
    installed: true,
    enabled: true,
    source: { source: "local", path: "/cache/agent-pipeline/plugins/pipeline-core" },
    marketplaceSource: { sourceType: "git", source: "https://github.com/agent-pipe-shared/agent-pipeline.git" },
  }],
  available: [],
});

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
    plugin: { name: "pipeline-core", version: "0.4.5+test", manifestSha256: "c".repeat(64), contentSha256: "d".repeat(64) },
  };
}

const readyGate = (intent) => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent });
const notReady = (intent, lifecycleStatus) => () => {
  throw new ProjectOnboardingReadyError("PORG-NOT-READY", "raw lifecycle message", { intent, lifecycleStatus });
};

function scope(root, state) {
  return {
    schema: "pipeline.governance-scope.v1",
    state,
    root,
    scopeKey: "a".repeat(64),
    repositoryKind: "git",
    provenance: { kind: "isolated-unit-capability", refs: [] },
    diagnostics: [],
    requiresEnforcement: state === "active" || state === "unverifiable-active",
    hintAllowed: state === "inactive" && root !== null,
  };
}

function preflight(root, options) {
  return observePipelineStartPreflight({
    checkCloneProvisioningFn: () => ({ schema: "pipeline.clone-provisioning-report.v1", status: "ready", checks: [
      { id: "pre-commit-hook", status: "current" }, { id: "commit-msg-hook", status: "current" },
    ] }),
    observeGovernanceScopeFn: ({ rootDir }) => scope(rootDir, "active"),
    observeAntigravityLoadedTopologyFn: ({ loadedPluginRoot }) => ({ schema: "pipeline.antigravity-loaded-topology.v1", status: "current", loadedKind: "direct", loadedPluginRoot, executingGuardAssurance: "not-established-by-topology" }),
    observePrePushHookInstallationFn: () => ({ schema: "pipeline.pre-push-hook-observation.v1", state: "repository-unresolved", installed: false, installCommand: null }),
    observeUnseenPushToRemoteFn: () => ({ schema: "pipeline.pre-push-hook-unseen-remote-push.v1", state: "not-checked" }),
    observeArchitectureAdoptionOrientationFn: ({ rootDir }) => ({
      schema: "pipeline.architecture-adoption-orientation.v1",
      status: "decision-recorded",
      root: rootDir,
      adoption: { state: "deferred", scope: ["specs/"], decisionRef: "po-test-defer", coverageClass: "evaluated", confidence: "measured" },
      physicalMap: { greenfieldScaffold: false, status: "present-unvalidated" },
      guidance: "A durable architecture adoption decision was read back.",
    }),
    observe: readyObservation,
    inspectEffectiveArchitectureDecisionsFn: () => ({
      schema: "pipeline.architecture-effective-decisions.v1", area: "project",
      status: "advisory", code: "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING",
      projectionSha256: "a".repeat(64), decisions: [], activeExceptions: [],
      findings: [{ code: "legacy-decision-without-sidecar", path: "docs/adr/legacy.md" }],
    }),
    requireProjectOnboardingReadyFn: ({ intent }) => readyGate(intent),
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd: root,
    ...options,
  });
}

// The envelope without the advisory and without the two payload SIZE measurements. The size
// measurement counts the bytes of what is emitted (the advisory included), so it moves by exactly
// the advisory's weight; every other key, including the rest of `bootstrapPayload`, must not move.
function comparable(result) {
  const { [KEY]: _omitted, bootstrapPayload, ...rest } = result;
  const { originalMeasurement: _original, emittedMeasurement: _emitted, ...payload } = bootstrapPayload;
  return { ...rest, bootstrapPayload: payload };
}

function assertAdvisoryIsOnlyDifference(drifted, twin, label) {
  assert.equal(drifted.status, twin.status, label);
  assert.deepEqual(drifted.nextAction, twin.nextAction, label);
  assert.equal(pipelineStartPreflightExitCode(drifted), pipelineStartPreflightExitCode(twin), label);
  assert.deepEqual(comparable(drifted), comparable(twin), label);
  assert.ok(drifted.bootstrapPayload.emittedMeasurement.bytes > twin.bootstrapPayload.emittedMeasurement.bytes,
    `${label}: the payload budget counts the advisory it emits`);
  assert.equal(drifted.bootstrapPayload.emittedMeasurement.withinBudget, true, label);
  assert.equal(drifted.bootstrapPayload.overBudget, false, label);
}

function stateWith(continuity) {
  return JSON.stringify({ schema: "pipeline.state.v0", ...(continuity === undefined ? {} : { continuity }) });
}

function recordedContinuity({ prd = "# PRD\n", spec = "# Spec\n" } = {}) {
  return {
    featureId: "feat-drift",
    revision: 3,
    authority: {
      prd: { path: PRD_PATH, sha256: sha256(prd) },
      spec: { path: SPEC_PATH, sha256: sha256(spec) },
    },
  };
}

// A scratch project: the PRD and Spec files, and the State naming the digests of the in-sync bytes.
function withProject(run, { prd = "# PRD\n", spec = "# Spec\n", state = stateWith(recordedContinuity({ prd, spec })) } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "preflight-continuity-drift-")));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, PRD_PATH), prd);
    writeFileSync(join(root, SPEC_PATH), spec);
    if (state !== null) writeFileSync(join(root, "project", "pipeline-state.json"), state);
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const GATES = [
  ["a ready project", undefined],
  ["a bootstrap-not-ready project", ({ intent }) => (intent === "bootstrap" ? notReady("bootstrap", "kickoff-required")() : readyGate(intent))],
];

test("an edited PRD surfaces a typed advisory and changes nothing else, whatever the readiness answer", () => {
  for (const [label, gate] of GATES) {
    withProject((root) => {
      const options = gate === undefined ? {} : { requireProjectOnboardingReadyFn: gate };
      const twin = preflight(root, options);
      assert.equal(KEY in twin, false, `${label}: the in-sync twin carries no advisory`);

      const editedPrd = "# PRD\nedited after the continuity was recorded\n";
      writeFileSync(join(root, PRD_PATH), editedPrd);
      const drifted = preflight(root, options);

      const advisory = drifted[KEY];
      assert.equal(advisory.schema, CONTINUITY_AUTHORITY_DRIFT_SCHEMA);
      assert.equal(advisory.status, "drift");
      assert.equal(advisory.advisory, true);
      assert.equal(advisory.featureId, "feat-drift");
      assert.equal(advisory.revision, 3);
      assert.deepEqual(advisory.artifacts, [
        { role: "prd", path: PRD_PATH, recordedSha256: sha256("# PRD\n"), observedSha256: sha256(editedPrd), state: "changed" },
        { role: "spec", path: SPEC_PATH, recordedSha256: sha256("# Spec\n"), observedSha256: sha256("# Spec\n"), state: "match" },
      ]);
      assert.equal(advisory.recovery.kind, "repair-required");
      assert.equal(advisory.recovery.code, CONTINUITY_AUTHORITY_DRIFT_CODE);
      assert.equal(advisory.recovery.route, CONTINUITY_AUTHORITY_DRIFT_ROUTE);
      assert.equal(advisory.recovery.mutation, false);
      assert.equal(advisory.recovery.requiresConfirmation, false);

      // The advisory is the ONLY difference: status, nextAction, exit code and every other key.
      assertAdvisoryIsOnlyDifference(drifted, twin, label);
    });
  }
});

test("a deleted PRD is reported as unobservable, not as a match and not as a crash", () => {
  withProject((root) => {
    const twin = preflight(root);
    rmSync(join(root, PRD_PATH));
    const result = preflight(root);

    const advisory = result[KEY];
    assert.equal(advisory.status, "drift");
    assert.equal(advisory.advisory, true);
    assert.deepEqual(advisory.artifacts.map((entry) => [entry.role, entry.state, entry.observedSha256]), [
      ["prd", "unobservable", null],
      ["spec", "match", sha256("# Spec\n")],
    ]);
    assertAdvisoryIsOnlyDifference(result, twin, "deleted PRD");
  });
});

test("a PRD replaced by a directory and a recorded path that escapes the checkout are unobservable too", () => {
  withProject((root) => {
    rmSync(join(root, PRD_PATH));
    mkdirSync(join(root, PRD_PATH));
    const result = preflight(root);
    assert.equal(result[KEY].artifacts[0].state, "unobservable");
  });
  const escaping = recordedContinuity();
  escaping.authority.spec.path = "../outside-the-checkout.md";
  withProject((root) => {
    const result = preflight(root);
    assert.deepEqual(result[KEY].artifacts.map((entry) => [entry.role, entry.state]), [["prd", "match"], ["spec", "unobservable"]]);
    assert.equal(result[KEY].artifacts[1].observedSha256, null);
  }, { state: stateWith(escaping) });
});

test("the advisory names recorded repo-relative paths only: no fixture path appears in it", () => {
  withProject((root) => {
    writeFileSync(join(root, PRD_PATH), "changed\n");
    rmSync(join(root, SPEC_PATH));
    const advisory = preflight(root)[KEY];
    assert.equal(advisory.artifacts.length, 2);
    const serialized = JSON.stringify(advisory);
    // The mkdtemp suffix is unique to this fixture, and survives JSON's backslash doubling.
    assert.equal(serialized.includes(basename(root)), false);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes(root.replaceAll("\\", "\\\\")), false);
  });
});

test("an in-sync continuity adds no key and leaves the envelope byte-identical", () => {
  withProject((root) => {
    const result = preflight(root);
    assert.equal(KEY in result, false);
    assert.equal(JSON.stringify(result), JSON.stringify(preflight(root)));
  });
});

test("no State, no continuity or a malformed continuity add no key", () => {
  const cases = [
    ["no State file", null],
    ["State that is not JSON", "{ this is not json"],
    ["State of the wrong schema", JSON.stringify({ schema: "pipeline.state.v9", continuity: recordedContinuity() })],
    ["State without continuity", stateWith(undefined)],
    ["continuity that is a string", stateWith("continuity")],
    ["continuity that is null", stateWith(null)],
    ["continuity that is an array", stateWith([recordedContinuity()])],
    ["continuity without authority", stateWith({ featureId: "feat-drift", revision: 3 })],
    ["authority without a Spec", stateWith({ ...recordedContinuity(), authority: { prd: recordedContinuity().authority.prd } })],
    ["authority whose PRD digest is not a string", stateWith({ ...recordedContinuity(), authority: { ...recordedContinuity().authority, prd: { path: PRD_PATH, sha256: 7 } } })],
    ["authority whose Spec path is not a string", stateWith({ ...recordedContinuity(), authority: { ...recordedContinuity().authority, spec: { path: null, sha256: sha256("# Spec\n") } } })],
  ];
  for (const [label, state] of cases) {
    withProject((root) => {
      // Bytes that would drift if they were compared: only the recorded shape decides.
      writeFileSync(join(root, PRD_PATH), "# PRD\nedited\n");
      const result = preflight(root);
      assert.equal(KEY in result, false, label);
      assert.equal(result.status, "ready", label);
    }, { state });
  }
});

test("the governance-inactive, declined and unverifiable early returns never call the observer", () => {
  for (const state of ["inactive", "declined", "unverifiable-active"]) {
    withProject((root) => {
      writeFileSync(join(root, PRD_PATH), "# PRD\nedited\n");
      const calls = [];
      const result = preflight(root, {
        observeGovernanceScopeFn: ({ rootDir }) => scope(rootDir, state),
        observeContinuityAuthorityDriftFn: (args) => { calls.push(args); return { schema: "must-not-appear" }; },
      });
      assert.equal(result.statusScope, "pipeline-governance-activation", state);
      assert.deepEqual(calls, [], `${state}: the observer must not run before governance is active`);
      assert.equal(KEY in result, false, state);
    });
  }
  withProject((root) => {
    const calls = [];
    const result = preflight(root, {
      observeGovernanceScopeFn: () => { throw new Error("scope observation crashed"); },
      observeContinuityAuthorityDriftFn: (args) => { calls.push(args); return null; },
    });
    assert.equal(result.status, "pipeline-governance-unverifiable");
    assert.deepEqual(calls, []);
  });
});

test("an active governance scope calls the observer once with the resolved root; a fault in it never fails the bootstrap", () => {
  withProject((root) => {
    const calls = [];
    const stub = { schema: CONTINUITY_AUTHORITY_DRIFT_SCHEMA, status: "drift", advisory: true };
    const surfaced = preflight(root, { observeContinuityAuthorityDriftFn: (args) => { calls.push(args); return stub; } });
    assert.deepEqual(calls, [{ rootDir: root }]);
    assert.deepEqual(surfaced[KEY], stub);

    const twin = preflight(root);
    for (const observer of [() => { throw new Error("observer crashed"); }, () => null, () => undefined]) {
      const result = preflight(root, { observeContinuityAuthorityDriftFn: observer });
      assert.equal(KEY in result, false);
      assert.deepEqual(result, twin);
    }
  });
});

test("observeContinuityAuthorityDrift fails open and reuses the shared projection for its verdict", () => {
  const continuity = recordedContinuity();
  const ok = (state) => () => ({ status: "ok", state });
  const matching = (path) => (path === PRD_PATH ? sha256("# PRD\n") : sha256("# Spec\n"));

  assert.equal(observeContinuityAuthorityDrift({ rootDir: "/unused", readStateFn: ok({ continuity }), observeSha256: matching }), null);
  assert.equal(observeContinuityAuthorityDrift({ rootDir: "/unused", readStateFn: () => ({ status: "absent" }), observeSha256: matching }), null);
  assert.equal(observeContinuityAuthorityDrift({ rootDir: "/unused", readStateFn: () => ({ status: "malformed", error: "x" }), observeSha256: matching }), null);
  assert.equal(observeContinuityAuthorityDrift({ rootDir: "/unused", readStateFn: () => { throw new Error("read crashed"); }, observeSha256: matching }), null);

  const changed = observeContinuityAuthorityDrift({ rootDir: "/unused", readStateFn: ok({ continuity }), observeSha256: (path) => (path === SPEC_PATH ? "e".repeat(64) : matching(path)) });
  assert.equal(changed.advisory, true);
  assert.deepEqual(changed.artifacts.map((entry) => entry.state), ["match", "changed"]);

  // An observer that throws, or returns a non-digest, is "unobservable" (the projection owns that rule).
  const crashed = observeContinuityAuthorityDrift({ rootDir: "/unused", readStateFn: ok({ continuity }), observeSha256: () => { throw new Error("hash crashed"); } });
  assert.deepEqual(crashed.artifacts.map((entry) => entry.state), ["unobservable", "unobservable"]);
  assert.equal(JSON.stringify(crashed).includes("hash crashed"), false, "observer error text is never propagated");
});
