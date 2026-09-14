// SPDX-License-Identifier: SUL-1.0
/**
 * architecture-adoption.test.mjs -- Unit tests for Architecture Adoption Demand and Proposal Generator.
 * (WP-D4, Issue #109, AC-9, AC-17, Spec §7.4, Doctrine §5 & §6)
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  resolveAdoptionState,
  generateAdoptionProposal,
  applyAdoptionDecision,
  checkPlanningAdoptionDisposition,
  STATE_ADOPTION_REQUIRED,
  STATE_APPROVED_SCOPED,
  STATE_DEFERRED,
  STATE_PARTIAL,
  SCHEMA_ADOPTION_STATE,
  SCHEMA_ADOPTION_PROPOSAL
} from "./architecture-adoption.mjs";

describe("Architecture Adoption (WP-D4, Issue #109, AC-9, AC-17)", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "adoption-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("1. Adoption State Lifecycle", () => {
    it("resolves adoption-required when neither adoption-state nor baseline exists", () => {
      const state = resolveAdoptionState(tempDir);
      assert.equal(state.schema, SCHEMA_ADOPTION_STATE);
      assert.equal(state.state, STATE_ADOPTION_REQUIRED);
      assert.equal(state.coverageClass, "unavailable");
      assert.equal(state.confidence, "estimated");
      assert.ok(state.rationale);
    });

    it("applies and resolves approved-scoped adoption decision", () => {
      const decision = applyAdoptionDecision({
        rootDir: tempDir,
        decision: STATE_APPROVED_SCOPED,
        scope: "architecture/map/",
        rationale: "Initial architecture map adoption covering core modules",
        by: "PO"
      });

      assert.equal(decision.state, STATE_APPROVED_SCOPED);
      assert.equal(decision.scope, "architecture/map/");
      assert.equal(decision.coverageClass, "evaluated");
      assert.equal(decision.confidence, "measured");
      assert.ok(decision.decidedAt);
      assert.ok(decision.decisionRef);

      const resolved = resolveAdoptionState(tempDir);
      assert.equal(resolved.state, STATE_APPROVED_SCOPED);
      assert.equal(resolved.scope, "architecture/map/");
    });

    it("applies and resolves deferred adoption decision with expiry", () => {
      const futureDate = "2027-01-01";
      const decision = applyAdoptionDecision({
        rootDir: tempDir,
        decision: STATE_DEFERRED,
        scope: "plugins/legacy/",
        rationale: "Deferred until Q1 2027 refactor",
        expiresAt: futureDate,
        by: "PO"
      });

      assert.equal(decision.state, STATE_DEFERRED);
      assert.equal(decision.expiresAt, futureDate);

      const resolved = resolveAdoptionState(tempDir, new Date("2026-09-14T00:00:00Z"));
      assert.equal(resolved.state, STATE_DEFERRED);
      assert.equal(resolved.expiresAt, futureDate);
    });

    it("re-raises adoption-required when deferral has expired", () => {
      const pastDate = "2026-01-01";
      applyAdoptionDecision({
        rootDir: tempDir,
        decision: STATE_DEFERRED,
        scope: "plugins/legacy/",
        rationale: "Deferred until 2026",
        expiresAt: pastDate,
        by: "PO"
      });

      const resolved = resolveAdoptionState(tempDir, new Date("2026-09-14T00:00:00Z"));
      assert.equal(resolved.state, STATE_ADOPTION_REQUIRED);
      assert.equal(resolved.expired, true);
      assert.ok(resolved.rationale.includes("expired"));
    });

    it("applies and resolves partial adoption decision", () => {
      const decision = applyAdoptionDecision({
        rootDir: tempDir,
        decision: STATE_PARTIAL,
        scope: "architecture/map/pipeline-core.md",
        rationale: "Partial adoption for pipeline-core only",
        by: "PO"
      });

      assert.equal(decision.state, STATE_PARTIAL);
      const resolved = resolveAdoptionState(tempDir);
      assert.equal(resolved.state, STATE_PARTIAL);
    });

    it("rejects invalid decision or empty rationale", () => {
      assert.throws(() => {
        applyAdoptionDecision({
          rootDir: tempDir,
          decision: "invalid-state",
          rationale: "test"
        });
      }, /Invalid adoption decision/);

      assert.throws(() => {
        applyAdoptionDecision({
          rootDir: tempDir,
          decision: STATE_APPROVED_SCOPED,
          rationale: ""
        });
      }, /non-empty rationale/);
    });
  });

  describe("2. Staged Proposal Generation (#109 §5)", () => {
    it("generates a 4-stage proposal with map first", () => {
      const proposal = generateAdoptionProposal(tempDir);
      assert.equal(proposal.schema, SCHEMA_ADOPTION_PROPOSAL);
      assert.equal(proposal.stages.length, 4);

      // Stage 1: Navigation map bundle (map first)
      assert.equal(proposal.stages[0].stage, 1);
      assert.ok(proposal.stages[0].name.includes("Navigation map bundle"));
      assert.ok(proposal.stages[0].name.includes("map first"));
      assert.ok(proposal.stages[0].primaryDeliverables.includes("AGENTS.md"));

      // Stage 2: Core contracts by traversal frequency / priority
      assert.equal(proposal.stages[1].stage, 2);
      assert.ok(proposal.stages[1].name.includes("Core contracts"));
      assert.ok(proposal.stages[1].contracts.length > 0);

      // Stage 3: Fitness model and baseline ratchet
      assert.equal(proposal.stages[2].stage, 3);
      assert.ok(proposal.stages[2].name.includes("Fitness model"));
      assert.ok(proposal.stages[2].primaryDeliverables.includes("architecture/baseline.json"));

      // Stage 4: Continuous enforcement and receipts
      assert.equal(proposal.stages[3].stage, 4);
      assert.ok(proposal.stages[3].name.includes("Continuous enforcement"));

      // What is NOT proposed
      assert.ok(proposal.whatIsNotProposed.includes("No architectural restructuring"));
      assert.ok(proposal.whatIsNotProposed.includes("No all-at-once migration"));
    });

    it("enforces backfill safety and deterministic-pass rule", () => {
      const proposal = generateAdoptionProposal(tempDir);
      assert.equal(proposal.deterministicPassSafe, true);
      assert.ok(proposal.coverageClass);
      assert.ok(proposal.confidence);

      for (const stage of proposal.stages) {
        assert.ok(stage.coverageClass);
        assert.ok(stage.confidence);
        assert.ok(stage.effort.units);
        assert.ok(["measured", "estimated", "unavailable"].includes(stage.effort.status));
      }
    });
  });

  describe("3. AC-17 Disposition Before Authority", () => {
    it("fails planning check if disposition is unconfigured (adoption-required)", () => {
      const res = checkPlanningAdoptionDisposition(tempDir, "plugins/pipeline-core/foo.mjs");
      assert.equal(res.ok, false);
      assert.equal(res.disposition, STATE_ADOPTION_REQUIRED);
      assert.ok(res.error.includes("unresolved"));
    });

    it("passes planning check if disposition is approved-scoped for covered scope", () => {
      applyAdoptionDecision({
        rootDir: tempDir,
        decision: STATE_APPROVED_SCOPED,
        scope: "plugins/pipeline-core/",
        rationale: "Core plugin scope approved"
      });

      const res = checkPlanningAdoptionDisposition(tempDir, "plugins/pipeline-core/scripts/bar.mjs");
      assert.equal(res.ok, true);
      assert.equal(res.disposition, STATE_APPROVED_SCOPED);
    });

    it("fails planning check if task scope is outside approved-scoped boundary", () => {
      applyAdoptionDecision({
        rootDir: tempDir,
        decision: STATE_APPROVED_SCOPED,
        scope: "plugins/pipeline-core/",
        rationale: "Core plugin scope approved"
      });

      const res = checkPlanningAdoptionDisposition(tempDir, "harness/scripts/test.mjs");
      assert.equal(res.ok, false);
      assert.equal(res.disposition, STATE_APPROVED_SCOPED);
      assert.ok(res.error.includes("outside approved architecture adoption scope"));
    });

    it("passes planning check if disposition is deferred (AC-17)", () => {
      applyAdoptionDecision({
        rootDir: tempDir,
        decision: STATE_DEFERRED,
        scope: "harness/",
        rationale: "Harness adoption deferred until next wave",
        expiresAt: "2027-01-01"
      });

      const res = checkPlanningAdoptionDisposition(tempDir, "harness/scripts/test.mjs", new Date("2026-09-14T00:00:00Z"));
      assert.equal(res.ok, true);
      assert.equal(res.disposition, STATE_DEFERRED);
    });

    it("fails planning check if deferral has expired", () => {
      applyAdoptionDecision({
        rootDir: tempDir,
        decision: STATE_DEFERRED,
        scope: "harness/",
        rationale: "Harness adoption deferred until 2026",
        expiresAt: "2026-01-01"
      });

      const res = checkPlanningAdoptionDisposition(tempDir, "harness/scripts/test.mjs", new Date("2026-09-14T00:00:00Z"));
      assert.equal(res.ok, false);
      assert.equal(res.disposition, "expired-deferral");
      assert.ok(res.error.includes("expired"));
    });
  });
});
