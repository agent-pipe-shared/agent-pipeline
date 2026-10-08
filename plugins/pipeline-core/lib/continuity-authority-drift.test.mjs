/**
 * RED pins for R6-2 (AC-31): continuity PRD/Spec digest drift, pure projection half.
 * Task R6-T0a-20261008 (test-only, QG-04). Design note:
 * specs/sprint-alfred-epic/design/audit-index-r6-2026-10-08.md sections 3-4,
 * ratified by Ruling 63(c) in specs/sprint-alfred-epic/plans/0.7-execution-order.md.
 *
 * Cases covered here: 1-6, 12 (lib half), 13. Cases 7-11 and 12 (registry half) live in
 * scripts/pipeline-state-inspect-continuity-drift.test.mjs.
 *
 * ASSUMPTIONS recorded by this test-only dispatch (the fix slice F1 builds to them; change them
 * here, in the pin, if the F1 design wants different names -- never in the fix):
 *   - module:       lib/continuity-authority-drift.mjs   (NEW, pure, imports no fs)
 *   - export:       projectContinuityAuthorityDrift(continuity, observeSha256) -> projection
 *                   observeSha256(repoRelativePath) -> 64-hex string | null (a throw counts as null)
 *   - schema:       pipeline.continuity-authority-drift.v1
 *   - recovery code CONTINUITY-AUTHORITY-DRIFT, route continuity-authority-revision-plan
 *   - projection:   { schema, status: "current" | "drift", featureId, revision,
 *                     artifacts: [ { role: "prd" | "spec", path, recordedSha256, observedSha256,
 *                                    state: "match" | "changed" | "unobservable" } ],
 *                     recovery: null | { kind: "repair-required", code, route, mutation: false,
 *                                        requiresConfirmation: false, guidance } }
 *
 * Fixtures are in-memory only: no filesystem, no repository State, no home directory.
 * Expected RED reason today: the module does not exist (ERR_MODULE_NOT_FOUND).
 * Registration: this file needs an entry in harness/verify-suites.json (TP-13, signed tranche).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { validateContinuityState } from "./continuity-state.mjs";

const MODULE_URL = new URL("./continuity-authority-drift.mjs", import.meta.url);
const EXPORT_NAME = "projectContinuityAuthorityDrift";
const SCHEMA = "pipeline.continuity-authority-drift.v1";
const CODE = "CONTINUITY-AUTHORITY-DRIFT";
const ROUTE = "continuity-authority-revision-plan";
const HEX64 = /^[0-9a-f]{64}$/u;

let moduleNamespace = null;
let importFailure = null;
try {
  moduleNamespace = await import(MODULE_URL.href);
} catch (error) {
  importFailure = error;
}

const sha = (text) => createHash("sha256").update(text).digest("hex");

const FEATURE_ID = "drift-fixture";
const REVISION = 7;
const PRD_PATH = "specs/drift-fixture/prd.md";
const SPEC_PATH = "specs/drift-fixture/spec.md";
const RECORDED_PRD = sha("prd bytes as recorded");
const RECORDED_SPEC = sha("spec bytes as recorded");
const CHANGED_PRD = sha("prd bytes after an edit");
const CHANGED_SPEC = sha("spec bytes after an edit");

/** A closed, valid pipeline.continuity.v0 object (same shape the State test fixtures use). */
function continuityFixture() {
  return {
    schema: "pipeline.continuity.v0",
    featureId: FEATURE_ID,
    revision: REVISION,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: {
      prd: { path: PRD_PATH, sha256: RECORDED_PRD },
      spec: { path: SPEC_PATH, sha256: RECORDED_SPEC },
      result: null,
    },
    queueHead: { packageId: "drift", actionId: "inspect", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
}

/** Precondition shared by every case: the fixture itself is a valid continuity object. */
function validFixture() {
  const continuity = continuityFixture();
  const validation = validateContinuityState(continuity, FEATURE_ID);
  assert.equal(validation.ok, true, `precondition: fixture must be a valid continuity object (${JSON.stringify(validation)})`);
  return continuity;
}

/** Recording observer: values may be a hex string, null, or an Error to throw. */
function observer(table) {
  const calls = [];
  const observe = (...args) => {
    calls.push(args);
    const value = table[args[0]];
    if (value instanceof Error) throw value;
    return value === undefined ? null : value;
  };
  return { observe, calls };
}

function project(continuity, observe) {
  assert.ok(moduleNamespace !== null,
    `precondition: lib/continuity-authority-drift.mjs must exist (import failed: ${importFailure?.code ?? "unknown"})`);
  assert.equal(typeof moduleNamespace[EXPORT_NAME], "function", `precondition: module must export ${EXPORT_NAME}()`);
  return moduleNamespace[EXPORT_NAME](continuity, observe);
}

const artifact = (role, path, recordedSha256, observedSha256, state) => ({ role, path, recordedSha256, observedSha256, state });

test("R6-2 case 1: equal digests for PRD and Spec -> current, no recovery, both artifacts match", () => {
  const continuity = validFixture();
  const { observe } = observer({ [PRD_PATH]: RECORDED_PRD, [SPEC_PATH]: RECORDED_SPEC });
  const projection = project(continuity, observe);
  assert.deepEqual(projection, {
    schema: SCHEMA,
    status: "current",
    featureId: FEATURE_ID,
    revision: REVISION,
    artifacts: [
      artifact("prd", PRD_PATH, RECORDED_PRD, RECORDED_PRD, "match"),
      artifact("spec", SPEC_PATH, RECORDED_SPEC, RECORDED_SPEC, "match"),
    ],
    recovery: null,
  });
});

test("R6-2 case 2: PRD bytes changed -> drift, prd changed, spec match, recovery code", () => {
  const continuity = validFixture();
  const { observe } = observer({ [PRD_PATH]: CHANGED_PRD, [SPEC_PATH]: RECORDED_SPEC });
  const projection = project(continuity, observe);
  assert.equal(projection.schema, SCHEMA);
  assert.equal(projection.status, "drift");
  assert.equal(projection.featureId, FEATURE_ID);
  assert.equal(projection.revision, REVISION);
  assert.deepEqual(projection.artifacts, [
    artifact("prd", PRD_PATH, RECORDED_PRD, CHANGED_PRD, "changed"),
    artifact("spec", SPEC_PATH, RECORDED_SPEC, RECORDED_SPEC, "match"),
  ]);
  assert.notEqual(projection.artifacts[0].recordedSha256, projection.artifacts[0].observedSha256);
  assert.equal(projection.recovery?.code, CODE);
});

test("R6-2 case 3: Spec bytes changed only -> symmetric to case 2", () => {
  const continuity = validFixture();
  const { observe } = observer({ [PRD_PATH]: RECORDED_PRD, [SPEC_PATH]: CHANGED_SPEC });
  const projection = project(continuity, observe);
  assert.equal(projection.status, "drift");
  assert.deepEqual(projection.artifacts, [
    artifact("prd", PRD_PATH, RECORDED_PRD, RECORDED_PRD, "match"),
    artifact("spec", SPEC_PATH, RECORDED_SPEC, CHANGED_SPEC, "changed"),
  ]);
  assert.equal(projection.recovery?.code, CODE);
});

test("R6-2 case 4: both changed -> two changed artifacts and exactly ONE recovery", () => {
  const continuity = validFixture();
  const { observe } = observer({ [PRD_PATH]: CHANGED_PRD, [SPEC_PATH]: CHANGED_SPEC });
  const projection = project(continuity, observe);
  assert.equal(projection.status, "drift");
  assert.deepEqual(projection.artifacts.map((entry) => entry.state), ["changed", "changed"]);
  assert.equal(Array.isArray(projection.recovery), false, "recovery is one object, never a list");
  assert.equal(projection.recovery?.code, CODE);
});

test("R6-2 case 5: an unobservable PRD (null or a throwing observer) fails closed as drift and never propagates", () => {
  const continuity = validFixture();
  const expected = [
    artifact("prd", PRD_PATH, RECORDED_PRD, null, "unobservable"),
    artifact("spec", SPEC_PATH, RECORDED_SPEC, RECORDED_SPEC, "match"),
  ];

  const nulled = project(continuity, observer({ [PRD_PATH]: null, [SPEC_PATH]: RECORDED_SPEC }).observe);
  assert.equal(nulled.status, "drift");
  assert.deepEqual(nulled.artifacts, expected);
  assert.equal(nulled.recovery?.code, CODE);

  const thrown = project(continuity, observer({ [PRD_PATH]: new Error("EACCES: simulated observer failure"), [SPEC_PATH]: RECORDED_SPEC }).observe);
  assert.deepEqual(thrown, nulled, "a throwing observer yields the identical projection as a null observation");

  const specThrown = project(continuity, observer({ [PRD_PATH]: RECORDED_PRD, [SPEC_PATH]: new Error("simulated") }).observe);
  assert.equal(specThrown.status, "drift");
  assert.deepEqual(specThrown.artifacts, [
    artifact("prd", PRD_PATH, RECORDED_PRD, RECORDED_PRD, "match"),
    artifact("spec", SPEC_PATH, RECORDED_SPEC, null, "unobservable"),
  ]);
});

test("R6-2 case 6: purity -- observer called exactly twice (prd, spec), input untouched, module imports no fs", () => {
  const continuity = validFixture();
  const before = structuredClone(continuity);
  const { observe, calls } = observer({ [PRD_PATH]: CHANGED_PRD, [SPEC_PATH]: RECORDED_SPEC });
  project(continuity, observe);
  assert.deepEqual(calls, [[PRD_PATH], [SPEC_PATH]], "recorded repo-relative paths, prd first, exactly once each");
  assert.deepEqual(continuity, before, "the continuity input is not mutated");

  const source = readFileSync(MODULE_URL, "utf8");
  assert.doesNotMatch(source, /\bfrom\s+["'](?:node:)?fs(?:\/promises)?["']/u, "no static fs import");
  assert.doesNotMatch(source, /\bimport\s*\(\s*["'](?:node:)?fs/u, "no dynamic fs import");
  assert.doesNotMatch(source, /\brequire\s*\(\s*["'](?:node:)?fs/u, "no require of fs");
});

test("R6-2 case 12 (lib half): the recovery is a read-only pointer to the existing revision-plan route", () => {
  const continuity = validFixture();
  const { observe } = observer({ [PRD_PATH]: CHANGED_PRD, [SPEC_PATH]: RECORDED_SPEC });
  const { recovery } = project(continuity, observe);
  assert.notEqual(recovery, null);
  assert.deepEqual(Object.keys(recovery).sort(), ["code", "guidance", "kind", "mutation", "requiresConfirmation", "route"]);
  assert.equal(recovery.kind, "repair-required");
  assert.equal(recovery.code, CODE);
  assert.equal(recovery.route, ROUTE);
  assert.equal(recovery.mutation, false);
  assert.equal(recovery.requiresConfirmation, false);
  assert.equal(typeof recovery.guidance, "string");
  assert.match(recovery.guidance, /--proposal-file/u, "guidance names the one argument the route takes");
});

test("R6-2 case 13: sanitization -- only recorded repo-relative paths and 64-hex digests, never an error text", () => {
  const continuity = validFixture();
  const leak = new Error("EPERM reading C:\\Users\\leaky\\secret.txt and /home/leaky/secret and /Users/leaky/x");
  const scenarios = [
    observer({ [PRD_PATH]: CHANGED_PRD, [SPEC_PATH]: CHANGED_SPEC }),
    observer({ [PRD_PATH]: null, [SPEC_PATH]: RECORDED_SPEC }),
    observer({ [PRD_PATH]: leak, [SPEC_PATH]: leak }),
  ];
  for (const { observe } of scenarios) {
    const projection = project(continuity, observe);
    const serialized = JSON.stringify(projection);
    assert.doesNotMatch(serialized, /[A-Za-z]:[\\/]/u, "no drive-letter path");
    assert.doesNotMatch(serialized, /[\\/](?:home|Users)[\\/]/iu, "no home-directory shape");
    assert.doesNotMatch(serialized, /leaky|EPERM|secret/u, "no observer error text");
    assert.deepEqual(projection.artifacts.map((entry) => entry.path), [PRD_PATH, SPEC_PATH]);
    for (const entry of projection.artifacts) {
      assert.match(entry.recordedSha256, HEX64);
      assert.ok(entry.observedSha256 === null || HEX64.test(entry.observedSha256));
    }
  }
});
