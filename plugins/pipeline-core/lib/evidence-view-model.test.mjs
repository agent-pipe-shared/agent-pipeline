// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildEvidenceViewModel, buildEvidenceViewModelFromFeaturePackage } from "./evidence-view-model.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
function packageFixture({ corrupt = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "evidence-view-model-")); const id = "viewer-fixture"; const base = join(root, "specs", id); mkdirSync(base, { recursive: true });
  const files = [["prd.md", "prd"], ["spec.md", "spec"], ["acceptance.md", "acceptance"], ["result.md", "result"], ["evidence.json", "evidence"]];
  for (const [path, bytes] of files) writeFileSync(join(base, path), bytes);
  const artifacts = files.map(([path, bytes], index) => ({ class: ["prd", "spec", "acceptance", "result", "candidate-evidence"][index], path: `specs/${id}/${path}`, sha256: corrupt && index === 0 ? "f".repeat(64) : hash(bytes), authority: index < 2, mutability: index === 4 ? "immutable" : "mutable", retention: "active" }));
  writeFileSync(join(base, "lifecycle.json"), `${JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state: "completed", artifacts, candidate, supersedes: null })}\n`);
  return { root, manifest: `specs/${id}/lifecycle.json` };
}

test("renders only candidate-bound non-authoritative explicit evidence", () => {
  const model = buildEvidenceViewModel({ candidate, status: "pass", artifacts: [{ path: "specs/result.md", sha256: "c".repeat(64), state: "verified" }] });
  assert.equal(model.authority, "non-authoritative"); assert.equal(model.schema, "pipeline.evidence-view-model.v1");
});
test("rejects open or unbound explicit viewer input", () => {
  const input = { candidate, status: "pass", artifacts: [{ path: "specs/result.md", sha256: "c".repeat(64), state: "verified" }] };
  assert.throws(() => buildEvidenceViewModel({ ...input, approval: true })); assert.throws(() => buildEvidenceViewModel({ ...input, candidate: { commit: "bad", tree: "bad" } }));
});
test("projects only a valid complete feature package and keeps its success claim unknown", () => {
  const fixture = packageFixture(); const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest });
  assert.equal(model.schema, "pipeline.evidence-view-model.v2"); assert.equal(model.source.topology, "valid"); assert.equal(model.candidate.commit, candidate.commit); assert.equal(model.status, "unknown"); assert.equal(model.artifacts.length, 5); assert.equal(model.artifacts[0].state, "verified");
});
test("invalid topology is an invalid view with no candidate or artifact leak", () => {
  const fixture = packageFixture({ corrupt: true }); const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest });
  assert.equal(model.status, "invalid"); assert.equal(model.candidate.state, "unavailable"); assert.equal(model.artifacts.length, 0); assert.equal(model.notices[0].valueClass, "invalid");
});
// V-AC-08: the viewer represents the exact canonical lifecycle state, or a
// typed invalid/unavailable result -- never a nearby state it finds plausible.
function statefulFixture(state, { supersedes = null, withCandidate = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "evidence-view-state-")); const id = "viewer-fixture"; const base = join(root, "specs", id); mkdirSync(base, { recursive: true });
  const files = [["prd.md", "prd"], ["spec.md", "spec"], ["acceptance.md", "acceptance"], ["result.md", "result"], ["evidence.json", "evidence"]];
  for (const [path, bytes] of files) writeFileSync(join(base, path), bytes);
  const artifacts = files.map(([path, bytes], index) => ({ class: ["prd", "spec", "acceptance", "result", "candidate-evidence"][index], path: `specs/${id}/${path}`, sha256: hash(bytes), authority: index < 2, mutability: index === 4 ? "immutable" : "mutable", retention: "active" }));
  writeFileSync(join(base, "lifecycle.json"), `${JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state, artifacts, candidate: withCandidate ? candidate : null, supersedes })}\n`);
  return { root, manifest: `specs/${id}/lifecycle.json` };
}
test("V-AC-08 represents the exact canonical lifecycle state or a typed unavailable result", () => {
  for (const state of ["awaiting-approval", "approved", "implementing", "verifying", "completed"]) {
    const fixture = statefulFixture(state);
    const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest });
    assert.equal(model.feature.lifecycleState, state, state);
    assert.equal(model.source.topology, "valid", state);
    assert.equal(model.artifacts[0].lifecycleState, state, state);
  }
  for (const state of ["superseded", "retained"]) {
    const fixture = statefulFixture(state, { supersedes: "prior-feature" });
    const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest });
    assert.equal(model.feature.lifecycleState, state, state);
  }
  // `abandoned` is the one state that carries its own view status, and it is
  // still reported as itself rather than folded into a generic failure.
  const abandoned = buildEvidenceViewModelFromFeaturePackage(((fixture) => ({ rootDir: fixture.root, manifestPath: fixture.manifest }))(statefulFixture("abandoned")));
  assert.equal(abandoned.feature.lifecycleState, "abandoned");
  assert.equal(abandoned.status, "fail");
  // A state outside the canonical vocabulary is a typed invalid view, never a
  // nearby state and never a pass.
  const invented = statefulFixture("shipped");
  const rejected = buildEvidenceViewModelFromFeaturePackage({ rootDir: invented.root, manifestPath: invented.manifest });
  assert.equal(rejected.status, "invalid");
  assert.equal(rejected.feature.lifecycleState, "unavailable");
  assert.equal(rejected.candidate.state, "unavailable");
  assert.equal(rejected.artifacts.length, 0);
  // A missing package is unavailable, not absent-therefore-fine.
  const missing = buildEvidenceViewModelFromFeaturePackage({ rootDir: invented.root, manifestPath: "specs/nothing/lifecycle.json" });
  assert.equal(missing.status, "invalid");
  assert.equal(missing.feature.lifecycleState, "unavailable");
  // No lifecycle state ever produces a derived pass claim.
  for (const state of ["awaiting-approval", "approved", "implementing", "verifying", "completed"]) {
    const fixture = statefulFixture(state);
    assert.notEqual(buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest }).status, "pass", state);
  }
});
test("redacted package projection is deterministic and withholds artifact paths", () => {
  const fixture = packageFixture(); const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, sharing: "redacted" });
  assert.equal(model.source.manifest, null); assert.equal(model.artifacts[0].path, "artifact-1"); assert.equal(model.artifacts[0].sourcePath, null); assert.ok(model.notices.some((entry) => entry.valueClass === "redacted"));
});
test("projects explicitly supplied delivery observation without changing the candidate claim", () => {
  const fixture = packageFixture(); const exportObservation = { schema: "pipeline.governance-export-view-status.v1", destinationProfile: "audit", state: "retryable-failure", cursor: 2, lag: 3, receipt: { batchId: "batch-1", acknowledgementClass: "partial", terminalDisposition: "retryable-failure" }, failureCount: 2, quarantineCount: 1, integrityGaps: ["EG-DIGEST-MISMATCH"], recoveryState: null };
  const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation });
  assert.equal(model.status, "unknown"); assert.equal(model.exportStatus.state, "retryable-failure"); assert.equal(model.exportStatus.lag, 3); assert.equal(model.exportStatus.failureCount, 2); assert.equal(model.exportStatus.quarantineCount, 1); assert.deepEqual(model.exportStatus.integrityGaps, ["EG-DIGEST-MISMATCH"]);
  assert.throws(() => buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...exportObservation, receipt: { raw: "forbidden" } } }), (error) => error.code === "EVM-EXPORT");
});
// V-AC-02: the delivery observation is the one supplied input this projection
// validates for shape only -- no digest, no canonical source record, no
// exact-candidate binding -- so its values are a declared premise, not verified
// facts like the digest-bound artifacts and manifest. The declaration is made
// only when an observation was actually supplied.
test("V-AC-02 declares the supplied delivery observation as an assumption, and only when one is supplied", () => {
  const fixture = packageFixture();
  const exportObservation = { schema: "pipeline.governance-export-view-status.v1", destinationProfile: "audit", state: "delivered", cursor: 4, lag: 0, receipt: null, failureCount: 0, quarantineCount: 0, integrityGaps: [], recoveryState: null };
  const assumed = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation });
  const declared = assumed.notices.filter((entry) => entry.valueClass === "assumption");
  assert.equal(declared.length, 1);
  assert.equal(declared[0].code, "EVM-EXPORT-ASSUMED");
  const unsupplied = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest });
  assert.equal(unsupplied.notices.some((entry) => entry.valueClass === "assumption"), false);
  assert.equal(unsupplied.exportStatus.state, "unavailable");
  assert.equal(unsupplied.exportStatus.failureCount, null);
  assert.equal(unsupplied.exportStatus.quarantineCount, null);
  assert.equal(unsupplied.exportStatus.integrityGaps, null);
});
// E-AC-19: failure/quarantine counts are non-negative integers or an explicit
// `null` (never observed); malformed values fail closed exactly like every
// other shape check in this block.
test("E-AC-19 accepts observed failure/quarantine counts and rejects malformed ones", () => {
  const fixture = packageFixture();
  const base = { schema: "pipeline.governance-export-view-status.v1", destinationProfile: "audit", state: "quarantined", cursor: 1, lag: 1, receipt: null, recoveryState: null };
  const valid = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...base, failureCount: 3, quarantineCount: 5, integrityGaps: null } });
  assert.equal(valid.exportStatus.failureCount, 3); assert.equal(valid.exportStatus.quarantineCount, 5); assert.equal(valid.exportStatus.integrityGaps, null);
  for (const badObservation of [
    { ...base, failureCount: -1, quarantineCount: 0, integrityGaps: null },
    { ...base, failureCount: 1.5, quarantineCount: 0, integrityGaps: null },
    { ...base, failureCount: "3", quarantineCount: 0, integrityGaps: null },
    { ...base, failureCount: 0, quarantineCount: -1, integrityGaps: null },
    { ...base, failureCount: 0, quarantineCount: 0 },
  ]) {
    assert.throws(() => buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: badObservation }), (error) => error.code === "EVM-EXPORT");
  }
});
// E-AC-19/K-AC-09: `integrityGaps` distinguishes "not observed" (`null`) from
// "checked, none found" (`[]`) -- both are valid and must not collapse into
// each other. A malformed entry (wrong type, wrong shape) fails closed.
test("E-AC-19 distinguishes absent integrity gaps from an empty, checked list, and rejects malformed entries", () => {
  const fixture = packageFixture();
  const base = { schema: "pipeline.governance-export-view-status.v1", destinationProfile: "audit", state: "pending", cursor: 0, lag: 0, receipt: null, failureCount: 0, quarantineCount: 0, recoveryState: null };
  const notObserved = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...base, integrityGaps: null } });
  assert.equal(notObserved.exportStatus.integrityGaps, null);
  const checkedNone = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...base, integrityGaps: [] } });
  assert.deepEqual(checkedNone.exportStatus.integrityGaps, []);
  const checkedSome = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...base, integrityGaps: ["EG-DIGEST-MISMATCH", "EG-SEQUENCE-GAP"] } });
  assert.deepEqual(checkedSome.exportStatus.integrityGaps, ["EG-DIGEST-MISMATCH", "EG-SEQUENCE-GAP"]);
  for (const badGaps of [["bad-lowercase"], [123], "not-an-array", [""]]) {
    assert.throws(() => buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...base, integrityGaps: badGaps } }), (error) => error.code === "EVM-EXPORT");
  }
});
// E-AC-19: recovery state is the sixth item this criterion names. `null`
// means "not observed"; an observed value is closed to exactly `{blocked,
// guidance}`, with `blocked: true` always carrying at least one non-empty
// guidance string and `blocked: false` always carrying `guidance: null` --
// never the reverse, and never an empty-but-present guidance array either way.
test("E-AC-19 accepts observed recovery state and rejects malformed or contradictory shapes", () => {
  const fixture = packageFixture();
  const base = { schema: "pipeline.governance-export-view-status.v1", destinationProfile: "audit", state: "quarantined", cursor: 1, lag: 1, receipt: null, failureCount: 0, quarantineCount: 1, integrityGaps: null };
  const notObserved = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...base, recoveryState: null } });
  assert.equal(notObserved.exportStatus.recoveryState, null);
  const notBlocked = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...base, recoveryState: { blocked: false, guidance: null } } });
  assert.deepEqual(notBlocked.exportStatus.recoveryState, { blocked: false, guidance: null });
  const blocked = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...base, recoveryState: { blocked: true, guidance: ["Pending entries advance to acknowledged only via applyGovernanceExportDelivery."] } } });
  assert.deepEqual(blocked.exportStatus.recoveryState, { blocked: true, guidance: ["Pending entries advance to acknowledged only via applyGovernanceExportDelivery."] });
  for (const badRecoveryState of [
    { blocked: true, guidance: null },
    { blocked: true, guidance: [] },
    { blocked: true, guidance: [""] },
    { blocked: false, guidance: [] },
    { blocked: false, guidance: ["text"] },
    { blocked: "yes", guidance: null },
    { blocked: true, guidance: ["text"], extra: true },
  ]) {
    assert.throws(() => buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...base, recoveryState: badRecoveryState } }), (error) => error.code === "EVM-EXPORT", JSON.stringify(badRecoveryState));
  }
});
// V-AC-02: `estimate` is a distinct class from both `fact` and `assumption`.
// The gate estimate is a coordinator-recorded projected range surfaced through
// projectGateEstimate (lib/gate-estimate.mjs); this model re-hashes nothing
// about it, so it is not a fact, and it is a statement about the future rather
// than a premise the report leans on, so it is not an assumption either. The
// three states it can reach are pinned here: known (resolved and correlated),
// unavailable (wanted but not obtainable, including an estimate belonging to
// another feature), and not-applicable (nothing to estimate at all).
const gateObservation = (overrides = {}) => ({
  schema: "pipeline.gate-estimate-view-observation.v1", featureId: "viewer-fixture", gate: "prd", state: "known",
  rangeMinutes: { min: 30, max: 90 }, source: { path: "specs/viewer-fixture/estimate.json", sha256: hash("estimate") }, code: "CS-ETA-KNOWN", ...overrides,
});
const unresolved = (code) => gateObservation({ state: "unknown", rangeMinutes: null, source: null, code });
test("V-AC-02 labels a correlated gate projection as an estimate and separates unavailable from not-applicable", () => {
  const fixture = packageFixture();
  const build = (gateEstimateObservation) => buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, gateEstimateObservation });
  const known = build(gateObservation());
  assert.equal(known.gateEstimate.state, "known");
  assert.equal(known.gateEstimate.gate, "prd");
  assert.deepEqual({ ...known.gateEstimate.rangeMinutes }, { min: 30, max: 90 });
  assert.equal(known.gateEstimate.source.sha256, hash("estimate"));
  const declared = known.notices.filter((entry) => entry.valueClass === "estimate");
  assert.equal(declared.length, 1);
  assert.equal(declared[0].code, "EVM-GATE-ESTIMATE");
  // An estimate never upgrades the report's own claim, and never becomes a fact.
  assert.equal(known.status, "unknown");
  assert.equal(known.notices.some((entry) => entry.valueClass === "assumption"), false);
  // Wanted but not obtainable: the projection's own refusal code is carried through.
  const drifted = build(unresolved("CS-ETA-EVIDENCE-DRIFT"));
  assert.equal(drifted.gateEstimate.state, "unavailable");
  assert.equal(drifted.gateEstimate.code, "CS-ETA-EVIDENCE-DRIFT");
  assert.equal(drifted.gateEstimate.rangeMinutes, null);
  // Another feature's estimate is refused, not correlated by an invented rule.
  const foreign = build(gateObservation({ featureId: "other-feature" }));
  assert.equal(foreign.gateEstimate.state, "unavailable");
  assert.equal(foreign.gateEstimate.code, "EVM-ESTIMATE-FEATURE");
  // Nothing to estimate: no context supplied at all, no active feature, no next gate.
  assert.equal(build(undefined).gateEstimate.state, "not-applicable");
  assert.equal(build(undefined).gateEstimate.code, "EVM-ESTIMATE-ABSENT");
  assert.equal(build(undefined).notices.some((entry) => entry.code.startsWith("EVM-GATE-ESTIMATE")), false);
  for (const code of ["CS-ETA-FEATURE", "CS-ETA-NO-NEXT-GATE"]) {
    const inactive = build({ ...unresolved(code), featureId: null, gate: null });
    assert.equal(inactive.gateEstimate.state, "not-applicable", code);
    assert.equal(inactive.gateEstimate.code, code);
    assert.ok(inactive.notices.some((entry) => entry.valueClass === "not-applicable" && entry.code === "EVM-GATE-ESTIMATE-UNRESOLVED"), code);
  }
  // A malformed observation is refused outright rather than silently downgraded.
  for (const broken of [gateObservation({ rangeMinutes: { min: 30 } }), gateObservation({ gate: "release" }), gateObservation({ code: "not a code" }), gateObservation({ state: "unknown" }), gateObservation({ extra: true })]) {
    assert.throws(() => build(broken), (error) => error.code === "EVM-ESTIMATE");
  }
  // An invalid package has no verified feature to bind an estimate to.
  const corrupt = packageFixture({ corrupt: true });
  const invalid = buildEvidenceViewModelFromFeaturePackage({ rootDir: corrupt.root, manifestPath: corrupt.manifest, gateEstimateObservation: gateObservation() });
  assert.equal(invalid.status, "invalid");
  assert.equal(invalid.gateEstimate.state, "unavailable");
  assert.equal(invalid.gateEstimate.code, "EVM-ESTIMATE-FEATURE");
});
