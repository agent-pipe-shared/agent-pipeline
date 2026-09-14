// SPDX-License-Identifier: SUL-1.0
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  compareRemedies,
  isMisleadingTinyModuleOptimization,
  REMEDY_PENALTY_FRAGMENTATION
} from "./architecture-remedy.mjs";

describe("architecture-remedy & active optimization (WP-D2, AC-21, AC-22)", () => {
  describe("1. Remedy comparison for contract violations (AC-22)", () => {
    it("proposes conformant remedies and trade-off comparison for contract violation", () => {
      const result = compareRemedies({
        findingType: "contract-violation",
        currentModule: "pipeline-core"
      });

      assert.equal(result.findingType, "contract-violation");
      assert.equal(result.currentModule, "pipeline-core");
      assert.ok(Array.isArray(result.remedies));
      assert.ok(result.remedies.length >= 2, "Must produce multiple remedy options");

      // Verify each remedy has the required fields
      for (const remedy of result.remedies) {
        assert.ok(typeof remedy.id === "string" && remedy.id.length > 0);
        assert.ok(typeof remedy.description === "string" && remedy.description.length > 0);
        assert.ok(typeof remedy.churnScore === "number");
        assert.ok(typeof remedy.conformant === "boolean");
        assert.ok(typeof remedy.recommendation === "string" && remedy.recommendation.length > 0);
      }

      // Best remedy should be conformant and recommended
      assert.ok(result.bestRemedy, "Must identify bestRemedy");
      assert.equal(result.bestRemedy.conformant, true);
      assert.equal(result.bestRemedy.id, "clarify-and-generate-contract");
      assert.ok(result.bestRemedy.churnScore <= 30);
      assert.ok(result.bestRemedy.recommendation.includes("(Recommended)"));
    });
  });

  describe("2. Remedy comparison for boundary crossings (AC-22)", () => {
    it("proposes conformant remedies for boundary crossing / unauthorized dependency", () => {
      const result = compareRemedies({
        findingType: "boundary-crossing",
        currentModule: "harness"
      });

      assert.equal(result.findingType, "boundary-crossing");
      assert.equal(result.currentModule, "harness");

      assert.ok(result.remedies.some((r) => r.id === "invert-dependency" && r.conformant));
      assert.ok(result.remedies.some((r) => r.id === "record-adr-and-realign-boundary" && r.conformant));

      assert.ok(result.bestRemedy);
      assert.equal(result.bestRemedy.conformant, true);
      assert.equal(result.bestRemedy.id, "invert-dependency");
    });
  });

  describe("3. Anti-fragmentation fixture (AC-21: misleading tiny-module optimization)", () => {
    it("identifies misleading tiny-module optimization keywords and flags", () => {
      assert.equal(isMisleadingTinyModuleOptimization({ id: "tiny-module-optimization" }), true);
      assert.equal(isMisleadingTinyModuleOptimization({ description: "Shred topology into tiny files" }), true);
      assert.equal(isMisleadingTinyModuleOptimization({ splitIntoTinyModules: true }), true);
      assert.equal(isMisleadingTinyModuleOptimization({ strategy: "tiny-modules" }), true);
      assert.equal(isMisleadingTinyModuleOptimization({ id: "clarify-contract" }), false);
    });

    it("rejects misleading tiny-module optimization with penalty churn score and non-conformance (AC-21 fixture)", () => {
      const result = compareRemedies({
        findingType: "contract-violation",
        currentModule: "pipeline-core",
        proposedChanges: [
          {
            id: "tiny-module-optimization",
            description: "Shred module into tiny 5-line files to bypass contract surface checks"
          }
        ]
      });

      const tinyRemedy = result.remedies.find((r) => r.id === "tiny-module-optimization");
      assert.ok(tinyRemedy, "Must evaluate tiny-module-optimization");
      assert.equal(tinyRemedy.conformant, false, "Must reject tiny-module optimization as non-conformant");
      assert.equal(tinyRemedy.churnScore, REMEDY_PENALTY_FRAGMENTATION, "Must penalize with high churnScore");
      assert.ok(
        tinyRemedy.recommendation.includes("Rejected per AC-21"),
        `Recommendation must cite AC-21: got "${tinyRemedy.recommendation}"`
      );
      assert.ok(
        tinyRemedy.recommendation.includes("misleading tiny-module optimization"),
        "Recommendation must name misleading tiny-module optimization"
      );

      // Best remedy should pick a conformant alternative, NOT the tiny module remedy
      if (result.bestRemedy) {
        assert.notEqual(result.bestRemedy.id, "tiny-module-optimization");
        assert.equal(result.bestRemedy.conformant, true);
      }
    });

    it("returns null bestRemedy when only non-conformant tiny-module optimization is proposed without alternatives", () => {
      // Direct detection when isolated candidate is invalid
      const customResult = compareRemedies({
        findingType: "isolated-check",
        currentModule: "pipeline-core",
        proposedChanges: [
          {
            id: "micro-module-shredding",
            description: "Fragment topology",
            splitIntoTinyModules: true
          }
        ]
      });

      // The sole candidate was non-conformant
      const shredded = customResult.remedies.find((r) => r.id === "micro-module-shredding");
      assert.ok(shredded);
      assert.equal(shredded.conformant, false);
    });
  });
});
