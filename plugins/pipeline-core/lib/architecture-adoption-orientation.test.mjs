// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  ARCHITECTURE_ADOPTION_ORIENTATION_SCHEMA,
  hasExactGreenfieldDesignPendingScaffold,
  observeArchitectureAdoptionOrientation,
} from "./architecture-adoption-orientation.mjs";
import { initialGreenfieldMapTargets } from "./architecture-map-scaffold.mjs";

function fixtureRoot(prefix) {
  return mkdtempSync(join(tmpdir(), `architecture-orientation-${prefix}-`));
}

function writeGreenfieldScaffold(root) {
  for (const target of initialGreenfieldMapTargets("fresh")) {
    const output = join(root, target.path);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, target.bytes, "utf8");
  }
}

test("greenfield scaffold is classified as design-pending without pretending it is adopted", () => {
  const root = fixtureRoot("greenfield-");
  writeGreenfieldScaffold(root);
  const result = observeArchitectureAdoptionOrientation({ rootDir: root });
  assert.equal(result.schema, ARCHITECTURE_ADOPTION_ORIENTATION_SCHEMA);
  assert.equal(result.status, "design-pending");
  assert.equal(result.adoption.state, "adoption-required");
  assert.equal(result.physicalMap.greenfieldScaffold, true);
  assert.match(result.guidance, /not an adopted architecture baseline/u);
});

// CGF-08 / CGF-23 (AC-108): the orientation names what kind of verdict it is. It is report-only (it never decides readiness), carries its
// observation date and scope, and is not bound to a candidate commit.
test("CGF-08 the orientation carries a verdict label: report-only, observation date, adoption scope, no candidate", () => {
  const root = fixtureRoot("label-");
  const now = new Date("2026-11-09T10:00:00.000Z");
  const adopted = observeArchitectureAdoptionOrientation({ rootDir: root, now, deps: { resolveAdoptionState: () => ({ state: "approved-scoped", scope: "src/**", decisionRef: "ADR-1", coverageClass: "measured", confidence: "measured" }) } });
  assert.deepEqual([adopted.verdict.source, adopted.verdict.verdict, adopted.verdict.effect, adopted.verdict.currency, adopted.verdict.candidate, adopted.verdict.observedAt, adopted.verdict.scope],
    ["architecture-adoption-orientation", "decision-recorded", "report-only", "current", null, "2026-11-09T10:00:00.000Z", "src/**"]);
  const none = observeArchitectureAdoptionOrientation({ rootDir: root, now });
  // No wall clock enters the byte-compared bootstrap envelope (AC-245): without a supplied clock the date is typed null.
  assert.equal(observeArchitectureAdoptionOrientation({ rootDir: root }).verdict.observedAt, null);
  assert.deepEqual(observeArchitectureAdoptionOrientation({ rootDir: root }), observeArchitectureAdoptionOrientation({ rootDir: root }));
  assert.equal(none.verdict.verdict, "adoption-required");
  assert.match(none.verdict.scope, /no scope recorded/u);
});

// CGF-08 (AC-108): the orientation reads the ONE architecture projection from stored observations only. It never runs the boundary check and
// carries no wall clock (AC-245 byte-compares two bootstrap envelopes), so without a stored blocking result the gate is typed
// "no-blocking-result"; the recorded fitness observation stays beside it, report-only, with its own observation date.
test("CGF-08 the orientation carries the architecture projection: no stored blocking result is typed, the recorded fitness observation stays report-only and open with its date", () => {
  const root = fixtureRoot("projection-");
  const bare = observeArchitectureAdoptionOrientation({ rootDir: root });
  assert.equal(bare.architectureProjection.schema, "pipeline.architecture-projection.v1");
  assert.deepEqual([bare.architectureProjection.gate.verdict, bare.architectureProjection.gate.candidate, bare.architectureProjection.gate.observedAt], ["no-blocking-result", null, null]);
  assert.equal(bare.architectureProjection.reportOnly, null, "nothing stored: nothing claimed");
  const recorded = { observedAt: "2026-11-08T08:00:00.000Z", candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, fitnessProjection: { outcomes: [{ classId: 2, propertyId: "p2", outcome: "pass" }, { classId: 3, propertyId: "p3", outcome: "finding" }] } };
  const calls = [];
  const deps = { readFitnessObservation: (rootDir) => { calls.push(rootDir); return recorded; }, resolveAdoptionState: () => ({ state: "approved-scoped", scope: "src/**", decisionRef: "ADR-1", coverageClass: "measured", confidence: "measured" }) };
  const seen = observeArchitectureAdoptionOrientation({ rootDir: root, deps });
  assert.equal(calls.length, 1);
  assert.deepEqual([seen.architectureProjection.reportOnly.effect, seen.architectureProjection.reportOnly.verdict, seen.architectureProjection.reportOnly.observedAt], ["report-only", "observed-open", "2026-11-08T08:00:00.000Z"]);
  assert.deepEqual(seen.architectureProjection.reportOnly.reportOnlyOpen.map((entry) => entry.classId), [3]);
  assert.equal(seen.architectureProjection.gate.verdict, "no-blocking-result", "the fitness observation never turns into a gate verdict");
  // byte-stable: nothing in it comes from a clock or the boundary check
  assert.deepEqual(observeArchitectureAdoptionOrientation({ rootDir: root, deps }), observeArchitectureAdoptionOrientation({ rootDir: root, deps }));
  // an unreadable store leaves the observation typed absent, never a thrown bootstrap
  const unreadable = observeArchitectureAdoptionOrientation({ rootDir: root, deps: { readFitnessObservation: () => { throw new Error("state unreadable"); } } });
  assert.equal(unreadable.architectureProjection.reportOnly, null);
});

test("brownfield without a physical map has an actionable adoption-required readback", () => {
  const root = fixtureRoot("brownfield-");
  writeFileSync(join(root, "package.json"), "{}\n", "utf8");
  const result = observeArchitectureAdoptionOrientation({ rootDir: root });
  assert.equal(result.status, "adoption-required");
  assert.equal(result.adoption.state, "adoption-required");
  assert.equal(result.physicalMap.greenfieldScaffold, false);
  assert.equal(result.physicalMap.status, "missing");
  assert.match(result.guidance, /staged read-only adoption proposal/u);
});

test("near-matching inventory cannot turn an existing repository into greenfield", () => {
  const root = fixtureRoot("near-miss-");
  writeGreenfieldScaffold(root);
  const inventory = join(root, "architecture/map/inventory.json");
  const parsed = JSON.parse(readFileSync(inventory, "utf8"));
  parsed.modules.push({ id: "invented" });
  writeFileSync(inventory, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  assert.equal(hasExactGreenfieldDesignPendingScaffold({ rootDir: root }), false);
  const orientation = observeArchitectureAdoptionOrientation({ rootDir: root });
  assert.equal(orientation.status, "adoption-required");
  assert.equal(orientation.physicalMap.status, "present-unvalidated");
});

test("a valid durable adoption decision is shown as a readback, never as physical-map readiness", () => {
  const root = fixtureRoot("decision-");
  const result = observeArchitectureAdoptionOrientation({
    rootDir: root,
    deps: {
      resolveAdoptionState: () => ({
        state: "approved-scoped",
        scope: ["src/"],
        decisionRef: "po-architecture-17",
        coverageClass: "evaluated",
        confidence: "measured",
      }),
    },
  });
  assert.equal(result.status, "decision-recorded");
  assert.equal(result.adoption.decisionRef, "po-architecture-17");
  assert.equal(result.physicalMap.status, "missing");
  assert.match(result.guidance, /physical map index is missing/u);
});

test("D162 S4: a legacy deferred adoption yields migration-required with the migration guidance", () => {
  const root = fixtureRoot("d162s4-deferred-");
  const result = observeArchitectureAdoptionOrientation({
    rootDir: root,
    deps: { resolveAdoptionState: () => ({ state: "deferred", scope: null, decisionRef: "po-deferral-3", coverageClass: "unavailable", confidence: "estimated" }) },
  });
  assert.equal(result.status, "migration-required");
  assert.equal(result.adoption.state, "deferred");
  assert.equal(
    result.guidance,
    "A legacy deferred architecture adoption exists. Before implementation it must be migrated to an approved-scoped adoption over a measured baseline (D162): review the read-only proposal's migration block with the PO, who confirms it through the same route as a fresh adoption.",
  );
});

test("D162 S4: approved-scoped and partial adoption states still yield decision-recorded", () => {
  for (const state of ["approved-scoped", "partial"]) {
    const root = fixtureRoot(`d162s4-${state}-`);
    const result = observeArchitectureAdoptionOrientation({
      rootDir: root,
      deps: { resolveAdoptionState: () => ({ state, scope: ["src/"], decisionRef: "po-architecture-17", coverageClass: "evaluated", confidence: "measured" }) },
    });
    assert.equal(result.status, "decision-recorded", state);
    assert.match(result.guidance, /physical map index is missing/u, state);
  }
});
