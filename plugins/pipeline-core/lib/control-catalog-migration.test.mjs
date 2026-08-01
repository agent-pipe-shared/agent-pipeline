// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import {
  CONTROL_RESULT_VALUES,
  resolveControlMigrationStatus,
} from "./control-catalog-migration.mjs";

function deepFreeze(v, seen = new Set()) {
  if (v && typeof v === "object" && !seen.has(v)) {
    seen.add(v);
    Object.values(v).forEach((x) => deepFreeze(x, seen));
    Object.freeze(v);
  }
  return v;
}

// A minimal stand-in for a CYB-1b `resolveApplicableControls(...).resolvedControls`
// entry -- only the fields this module reads (`id`, `applicability`).
function resolved(id, applicability = "applicable") {
  return { id, control: { id }, contributingModule: null, applicability, missingInputs: [] };
}

// --- registry constant matches CYB-1F §7 exactly ---------------------------

{
  assert.deepEqual(CONTROL_RESULT_VALUES, [
    "met",
    "not-met",
    "not-applicable",
    "unavailable",
    "waived",
    "unknown",
    "invalid",
  ]);
  assert.ok(Object.isFrozen(CONTROL_RESULT_VALUES));
}

// --- AC13 fixture 1: no prior evaluation data at ALL (key omitted) ---------
// -> every applicable control resolves to `unknown`, never `met`, never
// silently omitted.

{
  const resolvedControls = [
    resolved("ctl.base.secrets.no-committed-secrets"),
    resolved("ctl.stack.web-api.rate-limit-config"),
    resolved("ctl.risk.ai-agent.tool-authority-manifest", "unknown"), // CYB-1b already said "unknown"
  ];

  const { migrationStatuses } = resolveControlMigrationStatus({ resolvedControls });

  // never silently omitted: exactly one status per resolved control
  assert.equal(migrationStatuses.length, resolvedControls.length);

  for (const status of migrationStatuses) {
    assert.equal(status.status, "unknown");
    assert.notEqual(status.status, "met");
    assert.equal(status.qualifying, false);
  }
  const byId = Object.fromEntries(migrationStatuses.map((s) => [s.id, s]));
  assert.equal(byId["ctl.base.secrets.no-committed-secrets"].reason, "no-prior-data");
  assert.equal(byId["ctl.stack.web-api.rate-limit-config"].reason, "no-prior-data");
  // a control CYB-1b already marked applicability: 'unknown' is never even
  // consulted against priorEvaluations -- stays 'unknown' unconditionally.
  assert.equal(byId["ctl.risk.ai-agent.tool-authority-manifest"].reason, "applicability-unknown");

  // canonical id-ascending order, independent of resolvedControls input order
  assert.deepEqual(
    migrationStatuses.map((s) => s.id),
    [...migrationStatuses.map((s) => s.id)].sort()
  );
}

// --- AC13 fixture 1b: priorEvaluations present but EMPTY (`{}`) -----------
// -> same guarantee as fully-absent; an empty legacy table must not be
// treated any differently from "no legacy system at all".

{
  const resolvedControls = [resolved("ctl.base.secrets.no-committed-secrets")];
  const { migrationStatuses } = resolveControlMigrationStatus({ resolvedControls, priorEvaluations: {} });
  assert.equal(migrationStatuses.length, 1);
  assert.equal(migrationStatuses[0].status, "unknown");
  assert.equal(migrationStatuses[0].reason, "no-prior-data");
}

// --- AC13 fixture 2: legacy/ambiguous prior-data shapes -- THE bug this AC
// guards against ("no record found -> default to true/compliant", and its
// sibling "some plausible-looking legacy value -> default to true/compliant")
// -- none of these ever produce `met`.

{
  const controlId = "ctl.base.secrets.rotation-evidence";
  const resolvedControls = [resolved(controlId)];

  const legacyShapes = {
    "bare boolean true": true,
    'bare string "ok"': "ok",
    'bare string "passed"': "passed",
    "bare number 1": 1,
    // the sharpest form of the bug: a STRUCTURED record that already claims
    // `result: 'met'` and even has a timestamp, but was never attested as a
    // genuine fresh evaluation (`freshEvaluation` missing) -- this is
    // exactly "legacy data that looks compliant" silently becoming `met`
    // if the guard were weakened to "any truthy/plausible prior value".
    "structured met-looking record without freshEvaluation flag": {
      result: "met",
      compliant: true,
      evaluatedAt: "2024-01-01T00:00:00Z",
    },
    // self-contradictory: claims freshEvaluation but ALSO explicitly
    // self-reports as migrated data -- the negative flag must win.
    "freshEvaluation true but also migrated true": {
      result: "met",
      evaluatedAt: "2026-07-25T00:00:00Z",
      freshEvaluation: true,
      migrated: true,
    },
    // almost-qualifying but missing evaluatedAt
    "freshEvaluation true, valid result, but no evaluatedAt": {
      result: "met",
      freshEvaluation: true,
    },
    // almost-qualifying but result is not a valid CYB-1F §7 enum value
    "freshEvaluation true, evaluatedAt present, but result is not a real enum value": {
      result: "compliant", // not in CONTROL_RESULT_VALUES
      freshEvaluation: true,
      evaluatedAt: "2026-07-25T00:00:00Z",
    },
  };

  for (const [label, priorValue] of Object.entries(legacyShapes)) {
    const { migrationStatuses } = resolveControlMigrationStatus({
      resolvedControls,
      priorEvaluations: { [controlId]: priorValue },
    });
    assert.equal(migrationStatuses.length, 1, `[${label}] must not be omitted`);
    assert.notEqual(migrationStatuses[0].status, "met", `[${label}] must never resolve to met`);
    assert.equal(migrationStatuses[0].status, "unknown", `[${label}] must resolve to unknown`);
    assert.equal(migrationStatuses[0].qualifying, false, `[${label}] must not be marked qualifying`);
    assert.equal(migrationStatuses[0].reason, "non-qualifying-prior-data", `[${label}]`);
  }
}

// --- AC13 fixture 3: an explicit, well-formed, current qualifying input
// DOES resolve to `met` -- the function is not permanently unknown-locked,
// only closed against silent/implicit inheritance.

{
  const controlId = "ctl.base.secrets.rotation-evidence";
  const resolvedControls = [resolved(controlId)];

  const qualifying = {
    result: "met",
    evaluatedAt: "2026-07-25T00:00:00Z",
    freshEvaluation: true,
  };
  const { migrationStatuses } = resolveControlMigrationStatus({
    resolvedControls,
    priorEvaluations: { [controlId]: qualifying },
  });
  assert.equal(migrationStatuses.length, 1);
  assert.equal(migrationStatuses[0].status, "met");
  assert.equal(migrationStatuses[0].qualifying, true);
  assert.equal(migrationStatuses[0].reason, "qualifying-prior-data");

  // a qualifying input declaring a non-met result passes its own declared
  // result through unchanged (the hard rule only gates `met`, it does not
  // force every qualifying entry to become `met`).
  const qualifyingWaived = {
    result: "waived",
    evaluatedAt: "2026-07-25T00:00:00Z",
    freshEvaluation: true,
  };
  const waivedResult = resolveControlMigrationStatus({
    resolvedControls,
    priorEvaluations: { [controlId]: qualifyingWaived },
  });
  assert.equal(waivedResult.migrationStatuses[0].status, "waived");
  assert.equal(waivedResult.migrationStatuses[0].qualifying, true);

  // a control CYB-1b already resolved as applicability: 'unknown' stays
  // 'unknown' even when a qualifying met-input is supplied for it -- the
  // migration function never overrides CYB-1b's own applicability verdict.
  const unknownApplicability = [resolved(controlId, "unknown")];
  const stillUnknown = resolveControlMigrationStatus({
    resolvedControls: unknownApplicability,
    priorEvaluations: { [controlId]: qualifying },
  });
  assert.equal(stillUnknown.migrationStatuses[0].status, "unknown");
  assert.equal(stillUnknown.migrationStatuses[0].reason, "applicability-unknown");

  // A decisive applicability exemption is neither inherited from prior data
  // nor downgraded to `unknown`; the consumer preserves the resolver's new
  // closed result in the public control-result vocabulary.
  const notApplicable = [resolved(controlId, "not-applicable")];
  const preservedExemption = resolveControlMigrationStatus({
    resolvedControls: notApplicable,
    priorEvaluations: { [controlId]: qualifying },
  });
  assert.equal(preservedExemption.migrationStatuses[0].status, "not-applicable");
  assert.equal(preservedExemption.migrationStatuses[0].qualifying, false);
  assert.equal(preservedExemption.migrationStatuses[0].reason, "applicability-not-applicable");
}

// --- purity: no mutation of any input, works against deeply frozen input --

{
  const resolvedControls = [resolved("ctl.base.secrets.no-committed-secrets")];
  const priorEvaluations = {
    "ctl.base.secrets.no-committed-secrets": {
      result: "met",
      evaluatedAt: "2026-07-25T00:00:00Z",
      freshEvaluation: true,
    },
  };
  const input = { resolvedControls, priorEvaluations };
  const before = JSON.stringify(input);
  resolveControlMigrationStatus(input);
  assert.equal(JSON.stringify(input), before);

  const frozen = deepFreeze(structuredClone(input));
  assert.doesNotThrow(() => resolveControlMigrationStatus(frozen));
  const result = resolveControlMigrationStatus(frozen);
  assert.equal(result.migrationStatuses[0].status, "met");
}

// --- malformed input is rejected with typed errors, not guessed at --------

{
  assert.throws(() => resolveControlMigrationStatus(null), TypeError);
  assert.throws(() => resolveControlMigrationStatus("not-an-object"), TypeError);
  assert.throws(() => resolveControlMigrationStatus([]), TypeError);

  const base = { resolvedControls: [resolved("ctl.base.secrets.x")] };

  assert.throws(() => resolveControlMigrationStatus({ resolvedControls: "not-an-array" }), TypeError);
  assert.throws(
    () => resolveControlMigrationStatus({ resolvedControls: [{ control: {} }] }), // no id
    TypeError
  );
  assert.throws(
    () => resolveControlMigrationStatus({ resolvedControls: [resolved("ctl.base.secrets.x", "bogus-value")] }),
    TypeError
  );

  // priorEvaluations must be a plain object map or omitted entirely -- never
  // silently coerced (null/array/string/number all rejected).
  assert.throws(() => resolveControlMigrationStatus({ ...base, priorEvaluations: null }), TypeError);
  assert.throws(() => resolveControlMigrationStatus({ ...base, priorEvaluations: [] }), TypeError);
  assert.throws(() => resolveControlMigrationStatus({ ...base, priorEvaluations: "legacy-db-dump" }), TypeError);
  assert.throws(() => resolveControlMigrationStatus({ ...base, priorEvaluations: 42 }), TypeError);
}

console.log("control-catalog-migration: ok");
