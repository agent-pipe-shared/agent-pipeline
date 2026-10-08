/**
 * RED pins for R6-2 (AC-31): the State `inspect` verb reports continuity PRD/Spec digest drift.
 * Task R6-T0a-20261008 (test-only, QG-04). Design note:
 * specs/sprint-alfred-epic/design/audit-index-r6-2026-10-08.md sections 2-4,
 * ratified by Ruling 63(c) in specs/sprint-alfred-epic/plans/0.7-execution-order.md.
 *
 * Cases covered here: 7, 8 (+8b unobservable, 8c in-sync), 9, 10, 11 and 12 (registry half).
 * Cases 1-6, 12 (lib half) and 13 live in lib/continuity-authority-drift.test.mjs.
 *
 * ASSUMPTIONS recorded by this test-only dispatch (the fix slice F2 builds to them):
 *   - new additive payload key `continuityAuthorityDrift` on `pipeline.inspect.v1`:
 *     null when the State has no `continuity`, else the projection of
 *     lib/continuity-authority-drift.mjs (schema pipeline.continuity-authority-drift.v1,
 *     recovery code CONTINUITY-AUTHORITY-DRIFT, route continuity-authority-revision-plan).
 *   - report-only: no new blocking state; `nextAction` keeps the existing precedence and falls
 *     back to the projection's `recovery` (kind "repair-required") only when it would be null.
 *   - PIPELINE_STATE_COMMANDS is a non-exported const in scripts/pipeline-state.mjs, so the
 *     registry half reads the verb list from the `--help` text ("Commands: a, b, c.").
 *   - the existing `pipeline-state.test.mjs` (TP-5) has no State `inspect` payload pin at all
 *     (lines 322-364 are PS55c/d, the PO-authority decision), so no key-set conflict exists.
 *
 * Fixtures: a fresh temp directory per case, in-process run() with deps.dir pointing at it;
 * never the real repository State, home directory or .git/agent-pipeline/.
 * Expected RED reason today: the `continuityAuthorityDrift` payload key is missing.
 * Registration: this file needs an entry in harness/verify-suites.json (TP-13, signed tranche).
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SCHEMA_ID, readState, run, statePath } from "./pipeline-state.mjs";
import { continuityDispatchAllowed, validateContinuityState } from "../lib/continuity-state.mjs";

const KEY = "continuityAuthorityDrift";
const SCHEMA = "pipeline.continuity-authority-drift.v1";
const CODE = "CONTINUITY-AUTHORITY-DRIFT";
const ROUTE = "continuity-authority-revision-plan";
const ORIGINAL_KEYS = [
  "schema", "generatedAt", "status", "activeFeature", "phase", "planApproved", "lifecycle",
  "mixedPlanRecovery", "pushApproval", "closedFeaturesCount", "phoenixEpicHistory", "nextAction", "nextActionText",
];
const HEX64 = /^[0-9a-f]{64}$/u;
const sha = (value) => createHash("sha256").update(value).digest("hex");

const DIRS = [];
after(() => { for (const dir of DIRS) rmSync(dir, { recursive: true, force: true }); });

const PLAN_PATH = "specs/drift-fixture/prd.md";
const SPEC_PATH = "specs/drift-fixture/spec.md";
const SPEC_TEXT = "# Drift fixture Spec\n";
const SPEC_SHA = sha(SPEC_TEXT);
const PRD_TEXT = `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${SPEC_SHA} -->\n# Drift fixture PRD\n`;
const PRD_SHA = sha(PRD_TEXT);
const PRD_EDITED_TEXT = `${PRD_TEXT}\nHuman-reviewed scope change.\n`;
const PRD_EDITED_SHA = sha(PRD_EDITED_TEXT);
const STALE_SHA = "7".repeat(64);

/**
 * options.withContinuity   false -> State carries no `continuity` key.
 * options.prdEdit          true  -> the checkout PRD differs from the bytes the State recorded.
 * options.continuityPrd    "checkout" (default): recorded continuity PRD digest equals the checkout bytes;
 *                          "recorded": equals the ORIGINAL bytes (so an edited checkout drifts);
 *                          "stale": a digest matching nothing while the checkout bytes are untouched.
 * options.deletePrd        true  -> the checkout PRD file is removed after seeding.
 * The plan-side authority (planApproval.poGateAuthority) always records the ORIGINAL PRD bytes.
 */
function seed(label, options = {}) {
  const { withContinuity = true, prdEdit = false, continuityPrd = "checkout", deletePrd = false } = options;
  const dir = mkdtempSync(join(tmpdir(), `inspect-continuity-drift-${label}-`));
  DIRS.push(dir);
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, "project", "pipeline.json"), JSON.stringify({ schema: "pipeline.project.v1", verify: "echo ok" }) + "\n");
  mkdirSync(join(dir, "specs", "drift-fixture"), { recursive: true });
  writeFileSync(join(dir, SPEC_PATH), SPEC_TEXT);
  writeFileSync(join(dir, PLAN_PATH), prdEdit ? PRD_EDITED_TEXT : PRD_TEXT);
  const checkoutSha = prdEdit ? PRD_EDITED_SHA : PRD_SHA;
  const recordedContinuityPrd = { checkout: checkoutSha, recorded: PRD_SHA, stale: STALE_SHA }[continuityPrd];
  const continuity = {
    schema: "pipeline.continuity.v0", featureId: "drift-fixture", revision: 3,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: { prd: { path: PLAN_PATH, sha256: recordedContinuityPrd }, spec: { path: SPEC_PATH, sha256: SPEC_SHA }, result: null },
    queueHead: { packageId: "drift", actionId: "inspect", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  const profile = { humanFacing: "en", sourceSha256: "a".repeat(64), runtimeSha256: "b".repeat(64), receiptSha256: "c".repeat(64), repositoryFingerprint: "d".repeat(64) };
  const state = {
    schema: SCHEMA_ID,
    activeFeature: { id: "drift-fixture", planPath: PLAN_PATH, phase: "implementation" },
    planApproved: true,
    planApproval: {
      schema: "pipeline.plan-approval.v2", approvedBy: "fixture", approvedAt: "2026-10-08T09:00:00.000Z",
      specBoundBy: "fixture", specBoundAt: "2026-10-08T09:00:00.000Z",
      poGateAuthority: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath: PLAN_PATH, planSha256: PRD_SHA, specPath: SPEC_PATH, specSha256: SPEC_SHA },
    },
    ...(withContinuity ? { continuity } : {}),
    updatedAt: "2026-10-08T09:00:00.000Z",
  };
  mkdirSync(join(statePath(dir), ".."), { recursive: true });
  writeFileSync(statePath(dir), JSON.stringify(state, null, 2) + "\n");
  if (deletePrd) unlinkSync(join(dir, PLAN_PATH));
  const deps = { dir, env: { CODEX_THREAD_ID: "continuity-drift-inspect-fixture" }, now: () => "2026-10-08T10:00:00.000Z" };
  return { dir, deps, continuity: withContinuity ? continuity : null, checkoutSha, state };
}

/** Run the real `inspect` verb in-process against a fixture directory; capture its stdout JSON. */
function inspect(fixture, argv = ["inspect"]) {
  const out = [];
  const err = [];
  const log = console.log;
  const error = console.error;
  console.log = (...parts) => out.push(parts.join(" "));
  console.error = (...parts) => err.push(parts.join(" "));
  let value;
  try {
    value = run(argv, fixture.deps);
  } finally {
    console.log = log;
    console.error = error;
  }
  const text = out.join("\n");
  return { value, text, err: err.join("\n"), payload: argv[0] === "inspect" && text.length > 0 ? JSON.parse(text) : null };
}

/** Precondition: the verb ran cleanly and still emits exactly the 13 original keys with their schema. */
function assertBaseline(result, label) {
  assert.equal(result.value, 0, `precondition (${label}): inspect exits 0 (${result.err.slice(0, 200)})`);
  assert.notEqual(result.payload, null, `precondition (${label}): inspect printed JSON`);
  assert.equal(result.payload.schema, "pipeline.inspect.v1");
  const originals = ORIGINAL_KEYS.filter((key) => Object.hasOwn(result.payload, key));
  assert.deepEqual(originals, ORIGINAL_KEYS, `precondition (${label}): every pre-existing payload key is still emitted`);
}

function assertContinuityFixtureValid(fixture) {
  assert.equal(validateContinuityState(fixture.continuity, "drift-fixture").ok, true, "precondition: continuity fixture is valid");
}

function walk(root, base = root, found = []) {
  for (const name of readdirSync(root).sort()) {
    const full = join(root, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, base, found);
    else found.push(`${full.slice(base.length + 1).replaceAll("\\", "/")}|${info.size}|${info.mtimeMs}`);
  }
  return found;
}

/** Contract: the existing nextAction wins; only a would-be-null nextAction becomes the recovery action. */
function assertPrecedence(driftPayload, twinPayload, label) {
  const projection = driftPayload[KEY];
  assert.equal(projection?.status, "drift", `${label}: precondition: the drift projection exists`);
  assert.equal(Array.isArray(driftPayload.nextAction), false, `${label}: exactly one action, never a list`);
  if (twinPayload.nextAction !== null) {
    assert.deepEqual(driftPayload.nextAction, twinPayload.nextAction, `${label}: the existing action is unchanged`);
  } else {
    assert.notEqual(driftPayload.nextAction, null, `${label}: a would-be-null nextAction carries the recovery`);
    assert.equal(driftPayload.nextAction.kind, "repair-required");
    assert.equal(driftPayload.nextAction.code, CODE);
    assert.equal(driftPayload.nextAction.route, ROUTE);
    assert.equal(driftPayload.nextAction.mutation, false);
    assert.equal(driftPayload.nextAction.requiresConfirmation, false);
  }
}

test("R6-2 precondition: a continuity-bearing in-sync fixture inspects cleanly (passes today)", (t) => {
  const fixture = seed("baseline");
  assertContinuityFixtureValid(fixture);
  const result = inspect(fixture);
  assertBaseline(result, "baseline");
  t.diagnostic(`baseline nextAction kind: ${result.payload.nextAction?.kind ?? "null"}; lifecycle: ${JSON.stringify(result.payload.lifecycle)}`);
});

test("R6-2 case 7: State without continuity -> continuityAuthorityDrift is an explicit null, every other key intact", () => {
  const fixture = seed("no-continuity", { withContinuity: false });
  const result = inspect(fixture);
  assertBaseline(result, "no-continuity");
  const { payload } = result;
  assert.equal(Object.hasOwn(payload, KEY), true, "the new key is present");
  assert.equal(payload[KEY], null, "explicit null, not omitted");
  assert.deepEqual(Object.keys(payload).filter((key) => key !== KEY).sort(), [...ORIGINAL_KEYS].sort(), "no other key appears or disappears");
  assert.equal(payload.schema, "pipeline.inspect.v1");
  assert.equal(typeof payload.generatedAt, "string");
  assert.deepEqual(payload.activeFeature, { id: "drift-fixture", planPath: PLAN_PATH, phase: "implementation" });
  assert.equal(payload.phase, "implementation");
  assert.equal(payload.planApproved, true);
  assert.deepEqual(Object.keys(payload.lifecycle).sort(), ["code", "ok", "status"]);
  assert.equal(payload.mixedPlanRecovery, null);
  assert.equal(payload.closedFeaturesCount, 0);
  assert.equal(typeof payload.nextActionText, "string");
});

test("R6-2 case 8: PRD bytes differ in a temp repo -> inspect reports drift with recorded and observed digests", () => {
  const fixture = seed("prd-edited", { prdEdit: true, continuityPrd: "recorded" });
  assertContinuityFixtureValid(fixture);
  const result = inspect(fixture);
  assertBaseline(result, "prd-edited");
  const projection = result.payload[KEY];
  assert.notEqual(projection ?? null, null, "continuityAuthorityDrift is present for a State that carries continuity");
  assert.equal(projection.schema, SCHEMA);
  assert.equal(projection.status, "drift");
  assert.equal(projection.featureId, "drift-fixture");
  assert.equal(projection.revision, 3);
  assert.deepEqual(projection.artifacts, [
    { role: "prd", path: PLAN_PATH, recordedSha256: PRD_SHA, observedSha256: PRD_EDITED_SHA, state: "changed" },
    { role: "spec", path: SPEC_PATH, recordedSha256: SPEC_SHA, observedSha256: SPEC_SHA, state: "match" },
  ]);
  assert.equal(projection.recovery?.code, CODE);
  const serialized = JSON.stringify(projection);
  assert.equal(serialized.includes(fixture.dir), false, "the temp root is never echoed");
  assert.doesNotMatch(serialized, /[A-Za-z]:[\\/]/u);
  assert.doesNotMatch(serialized, /[\\/](?:home|Users)[\\/]/iu);
});

test("R6-2 case 8b: a missing PRD file is unobservable and fails closed as drift", () => {
  const fixture = seed("prd-missing", { deletePrd: true });
  const result = inspect(fixture);
  assertBaseline(result, "prd-missing");
  const projection = result.payload[KEY];
  assert.equal(projection?.status, "drift");
  assert.deepEqual(projection.artifacts[0], { role: "prd", path: PLAN_PATH, recordedSha256: PRD_SHA, observedSha256: null, state: "unobservable" });
  assert.equal(projection.artifacts[1].state, "match");
  assert.equal(projection.recovery?.code, CODE);
});

test("R6-2 case 8c: an in-sync continuity State is reported current with no recovery", () => {
  const fixture = seed("in-sync");
  const result = inspect(fixture);
  assertBaseline(result, "in-sync");
  const projection = result.payload[KEY];
  assert.notEqual(projection ?? null, null, "continuityAuthorityDrift is present for a State that carries continuity");
  assert.equal(projection.status, "current");
  assert.equal(projection.recovery, null);
  assert.deepEqual(projection.artifacts.map((entry) => entry.state), ["match", "match"]);
});

test("R6-2 case 9: inspect is read-only -- State bytes and the whole tree are identical afterwards", () => {
  const fixture = seed("read-only", { prdEdit: true, continuityPrd: "recorded" });
  const stateBefore = readFileSync(statePath(fixture.dir));
  const treeBefore = walk(fixture.dir);
  const result = inspect(fixture);
  assertBaseline(result, "read-only");
  assert.equal(result.payload[KEY]?.status, "drift", "precondition: the drift path was exercised");
  assert.deepEqual(readFileSync(statePath(fixture.dir)), stateBefore, "State bytes unchanged");
  assert.deepEqual(walk(fixture.dir), treeBefore, "no lock, journal or temp file appeared and no file changed");
});

test("R6-2 case 10: precedence -- the existing nextAction wins; a would-be-null one becomes the recovery; one action", () => {
  // Continuity-only drift: checkout bytes untouched, recorded continuity digest stale.
  const onlyDrift = inspect(seed("prec-only-drift", { continuityPrd: "stale" }));
  const onlyTwin = inspect(seed("prec-only-twin"));
  assertBaseline(onlyDrift, "prec-only-drift");
  assertBaseline(onlyTwin, "prec-only-twin");
  assertPrecedence(onlyDrift.payload, onlyTwin.payload, "continuity-only drift");

  // One real PRD edit that also moves the plan-side authority: the twin has the same edit but resynced continuity.
  const edited = inspect(seed("prec-edit-drift", { prdEdit: true, continuityPrd: "recorded" }));
  const editedTwin = inspect(seed("prec-edit-twin", { prdEdit: true, continuityPrd: "checkout" }));
  assertBaseline(edited, "prec-edit-drift");
  assertBaseline(editedTwin, "prec-edit-twin");
  assertPrecedence(edited.payload, editedTwin.payload, "single PRD edit");
});

test("R6-2 case 11: drift is not a blocker -- status, lifecycle, planApproved and dispatch permission are unchanged", () => {
  const driftFixture = seed("blocker-drift", { continuityPrd: "stale" });
  const twinFixture = seed("blocker-twin");
  const drift = inspect(driftFixture);
  const twin = inspect(twinFixture);
  assertBaseline(drift, "blocker-drift");
  assertBaseline(twin, "blocker-twin");
  assert.equal(drift.payload[KEY]?.status, "drift", "precondition: drift is reported");
  assert.equal(drift.value, twin.value, "drift does not change the exit code");
  for (const key of ["status", "lifecycle", "planApproved", "phase", "activeFeature", "mixedPlanRecovery", "pushApproval", "closedFeaturesCount", "phoenixEpicHistory"]) {
    assert.deepEqual(drift.payload[key], twin.payload[key], `payload.${key} identical with and without drift`);
  }
  const driftState = readState(driftFixture.dir).state;
  const twinState = readState(twinFixture.dir).state;
  assert.deepEqual(continuityDispatchAllowed(driftState.continuity), continuityDispatchAllowed(twinState.continuity));
  assert.equal(continuityDispatchAllowed(driftState.continuity).ok, true, "the continuity object stays valid under drift");
});

test("R6-2 case 12 (registry half): recovery.route is a registered State verb and the guidance names --proposal-file", () => {
  const fixture = seed("registry", { prdEdit: true, continuityPrd: "recorded" });
  const help = inspect(fixture, ["--help"]);
  assert.equal(help.value, 0, "precondition: --help answers");
  const listed = /Commands:\s*([^.]+)\./u.exec(`${help.text}\n${help.err}`);
  assert.notEqual(listed, null, "precondition: --help prints the verb list");
  const verbs = listed[1].split(",").map((verb) => verb.trim());
  assert.equal(verbs.includes("inspect"), true, "precondition: the parsed list is the real registry");
  assert.equal(verbs.includes(ROUTE), true, "precondition: the existing route is registered");

  const result = inspect(fixture);
  assertBaseline(result, "registry");
  const recovery = result.payload[KEY]?.recovery;
  assert.notEqual(recovery ?? null, null, "a drift projection with a recovery is present");
  assert.equal(recovery.route, ROUTE);
  assert.equal(verbs.includes(recovery.route), true, "the pointer targets a registered verb, not an invented one");
  assert.match(recovery.guidance, /--proposal-file/u);
  assert.equal(recovery.mutation, false);
  assert.equal(recovery.requiresConfirmation, false);
  for (const entry of result.payload[KEY].artifacts) {
    assert.ok(entry.observedSha256 === null || HEX64.test(entry.observedSha256));
  }
});
