// SPDX-License-Identifier: SUL-1.0
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  evaluateSignificanceAxes,
  checkBaselineAdrs,
  evaluateArchitectureBaseline,
  compileDecisionSummary,
  validateArchitectureDecision,
  SIGNIFICANCE_AXES,
  STATUS_INITIAL_ADR_REQUIRED,
  STATUS_BASELINE_SUFFICIENT,
  STATUS_NO_MATERIAL_DECISION,
  SCHEMA_BASELINE_RESULT,
  SCHEMA_DECISION
} from "./architecture-baseline.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const DECISION_SCHEMA_PATH = path.join(
  path.dirname(import.meta.url.replace(/^file:\/\//, "")),
  "../../..",
  "schemas",
  "pipeline.architecture-decision.v1.json"
);

describe("architecture-baseline & architecture decision continuity (WP-D1)", () => {
  let decisionSchema;

  before(() => {
    assert.ok(fs.existsSync(DECISION_SCHEMA_PATH), "decision schema exists");
    decisionSchema = JSON.parse(fs.readFileSync(DECISION_SCHEMA_PATH, "utf8"));
  });

  describe("1. Significance axes evaluation (all 5 axes)", () => {
    it("Axis 1: triggers on component boundaries, public contracts, and exports", () => {
      const files = ["contracts/auth-v1.mjs", "src/index.mjs", "api/routes.mjs"];
      const result = evaluateSignificanceAxes(files);
      const axis1 = result.axesEvaluated.find((a) => a.id === "system-structure-or-boundaries");
      assert.ok(axis1, "axis 1 found");
      assert.equal(axis1.triggered, true);
      assert.ok(result.matches.some((m) => m.axis === "system-structure-or-boundaries"));
    });

    it("Axis 2: triggers on runtime, framework, dependencies, storage migrations", () => {
      const files = ["package.json", "prisma/schema.prisma", "migrations/001_init.sql"];
      const result = evaluateSignificanceAxes(files);
      const axis2 = result.axesEvaluated.find((a) => a.id === "runtime-framework-dependency-storage-integration");
      assert.ok(axis2, "axis 2 found");
      assert.equal(axis2.triggered, true);
      assert.ok(result.matches.some((m) => m.axis === "runtime-framework-dependency-storage-integration"));
    });

    it("Axis 3: triggers on deployment, containers, runner configs, hooks", () => {
      const files = [".github/workflows/ci.yml", "Dockerfile", "guard-config.json"];
      const result = evaluateSignificanceAxes(files);
      const axis3 = result.axesEvaluated.find((a) => a.id === "deployment-and-execution-environment");
      assert.ok(axis3, "axis 3 found");
      assert.equal(axis3.triggered, true);
      assert.ok(result.matches.some((m) => m.axis === "deployment-and-execution-environment"));
    });

    it("Axis 4: triggers on quality attributes (security, privacy, telemetry)", () => {
      const files = ["policies/security-rules.json", "guardrails/auth.md", "telemetry/receipts.mjs"];
      const result = evaluateSignificanceAxes(files);
      const axis4 = result.axesEvaluated.find((a) => a.id === "quality-attributes");
      assert.ok(axis4, "axis 4 found");
      assert.equal(axis4.triggered, true);
      assert.ok(result.matches.some((m) => m.axis === "quality-attributes"));
    });

    it("Axis 5: triggers on costly, risky, or hard to reverse choices (freeze, license, wire IDL)", () => {
      const files = ["LICENSE", "schemas/contract-freeze.json", "proto/service.proto"];
      const result = evaluateSignificanceAxes(files);
      const axis5 = result.axesEvaluated.find((a) => a.id === "costly-risky-or-hard-to-reverse");
      assert.ok(axis5, "axis 5 found");
      assert.equal(axis5.triggered, true);
      assert.ok(result.matches.some((m) => m.axis === "costly-risky-or-hard-to-reverse"));
    });

    it("Routine changes do not trigger any axis (no-material-architecture-decision)", () => {
      const files = [
        "src/utils/math-helper.mjs",
        "README.md",
        "plugins/pipeline-core/scripts/sample.test.mjs",
        "scratch/probe.mjs"
      ];
      const result = evaluateSignificanceAxes(files);
      assert.equal(result.matches.length, 0);
      assert.ok(result.axesEvaluated.every((a) => !a.triggered));
    });
  });

  describe("2. Deterministic recommendation outcomes", () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-baseline-test-"));
    });

    after(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns no-material-architecture-decision when no axis fires", () => {
      const result = evaluateArchitectureBaseline({
        root: tmpDir,
        files: ["README.md", "src/helper.mjs"]
      });
      assert.equal(result.schema, SCHEMA_BASELINE_RESULT);
      assert.equal(result.status, STATUS_NO_MATERIAL_DECISION);
      assert.equal(result.recommendation, STATUS_NO_MATERIAL_DECISION);
      assert.equal(result.matches.length, 0);
    });

    it("returns initial-adr-required when material axis fires and no baseline ADRs exist", () => {
      const result = evaluateArchitectureBaseline({
        root: tmpDir,
        files: ["contracts/service-api.mjs"]
      });
      assert.equal(result.schema, SCHEMA_BASELINE_RESULT);
      assert.equal(result.status, STATUS_INITIAL_ADR_REQUIRED);
      assert.equal(result.recommendation, STATUS_INITIAL_ADR_REQUIRED);
      assert.ok(result.matches.length > 0);
    });

    it("returns architecture-baseline-sufficient when baseline ADRs exist in docs/adr", () => {
      const adrDir = path.join(tmpDir, "docs", "adr");
      fs.mkdirSync(adrDir, { recursive: true });
      fs.writeFileSync(
        path.join(adrDir, "0001-baseline-architecture.md"),
        "# ADR-0001 — Baseline architecture\n\n**Status:** accepted\n\nContext and decision.\n",
        "utf8"
      );

      const result = evaluateArchitectureBaseline({
        root: tmpDir,
        files: ["contracts/service-api.mjs"]
      });
      assert.equal(result.schema, SCHEMA_BASELINE_RESULT);
      assert.equal(result.status, STATUS_BASELINE_SUFFICIENT);
      assert.equal(result.recommendation, STATUS_BASELINE_SUFFICIENT);
      assert.ok(result.matches.length > 0);
    });
  });

  describe("3. Schema validation against pipeline.architecture-decision.v1", () => {
    it("validates a standard accepted decision record", () => {
      const record = {
        schema: "pipeline.architecture-decision.v1",
        id: "ADR-0099",
        title: "Architecture decision continuity",
        status: "accepted",
        digest: "a".repeat(64),
        scope: "project",
        date: "2026-09-13"
      };

      const result = validateAgainstSchema(record, decisionSchema);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
    });

    it("validates a waived decision record with exception", () => {
      const record = {
        schema: "pipeline.architecture-decision.v1",
        id: "ADR-0100",
        title: "Temporary storage deviation",
        status: "waived",
        digest: "b".repeat(64),
        scope: "module",
        date: "2026-09-13",
        supersedes: "ADR-0040",
        exception: {
          authority: "PO-André",
          rationale: "Performance spike requires temporary local cache",
          scope: "module",
          expiry: "2026-12-31"
        }
      };

      const result = validateAgainstSchema(record, decisionSchema);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
    });

    it("rejects invalid status", () => {
      const record = {
        schema: "pipeline.architecture-decision.v1",
        id: "ADR-0101",
        title: "Invalid status test",
        status: "invalid-status",
        digest: "c".repeat(64),
        scope: "project",
        date: "2026-09-13"
      };

      const result = validateAgainstSchema(record, decisionSchema);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("status")));
    });

    it("rejects missing required properties", () => {
      const record = {
        schema: "pipeline.architecture-decision.v1",
        id: "ADR-0102"
      };

      const result = validateAgainstSchema(record, decisionSchema);
      assert.equal(result.valid, false);
      assert.ok(result.errors.length >= 5);
    });

    it("rejects additional unknown properties (additionalProperties: false)", () => {
      const record = {
        schema: "pipeline.architecture-decision.v1",
        id: "ADR-0103",
        title: "Extra property test",
        status: "proposed",
        digest: "d".repeat(64),
        scope: "global",
        date: "2026-09-13",
        unexpectedProperty: "forbidden"
      };

      const result = validateAgainstSchema(record, decisionSchema);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("unexpected additional property")));
    });
  });

  describe("4. CLI options and invocation", () => {
    const cliPath = path.join(
      path.dirname(import.meta.url.replace(/^file:\/\//, "")),
      "architecture-baseline.mjs"
    );

    it("runs CLI with --format json and produces valid result schema on stdout", () => {
      const stdout = execFileSync(
        process.execPath,
        [cliPath, "--root", process.cwd(), "--format", "json"],
        { encoding: "utf8" }
      );
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.schema, SCHEMA_BASELINE_RESULT);
      assert.ok([STATUS_INITIAL_ADR_REQUIRED, STATUS_BASELINE_SUFFICIENT, STATUS_NO_MATERIAL_DECISION].includes(parsed.status));
      assert.ok(Array.isArray(parsed.axesEvaluated));
      assert.equal(parsed.axesEvaluated.length, 5);
    });

    it("runs CLI with --format text and exits 0", () => {
      const stdout = execFileSync(
        process.execPath,
        [cliPath, "--root", process.cwd(), "--format", "text"],
        { encoding: "utf8" }
      );
      assert.ok(stdout.includes("Architecture Baseline Assessment"));
      assert.ok(stdout.includes("Status:"));
      assert.ok(stdout.includes("Recommendation:"));
    });

    it("runs CLI with --compile-summary", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-summary-test-"));
      try {
        const adrDir = path.join(tmpDir, "docs", "adr");
        fs.mkdirSync(adrDir, { recursive: true });
        fs.writeFileSync(
          path.join(adrDir, "0001-test.md"),
          "# 0001 Test\n\n**Status:** accepted\n",
          "utf8"
        );

        const stdout = execFileSync(
          process.execPath,
          [cliPath, "--root", tmpDir, "--compile-summary", "--format", "json"],
          { encoding: "utf8" }
        );
        const parsed = JSON.parse(stdout);
        assert.equal(parsed.count, 1);
        assert.equal(parsed.decisions[0].id, "0001-test");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("5. AC-19: Decision parity across runners fixture", () => {
    it("produces identical deterministic assessment for same repo state regardless of invocation context", () => {
      const testFiles = ["contracts/parity-test.mjs", "package.json"];
      const resA = evaluateSignificanceAxes(testFiles);
      const resB = evaluateSignificanceAxes(testFiles);

      assert.deepEqual(resA.axesEvaluated, resB.axesEvaluated);
      assert.deepEqual(resA.matches, resB.matches);
    });
  });

  describe("6. AC-20: Semantic conformance / token-ADR fixture (#99 §7)", () => {
    it("catches a token ADR that does not match schema or has invalid digest", () => {
      const tokenAdr = {
        schema: "pipeline.architecture-decision.v1",
        id: "TOKEN-ADR-FAKE",
        title: "Token ADR that claims conformance",
        status: "accepted",
        digest: "invalid-short-hash",
        scope: "project",
        date: "2026-09-13"
      };

      const res = validateArchitectureDecision(tokenAdr, decisionSchema);
      assert.equal(res.valid, false, "Token ADR with invalid digest must be rejected");
      assert.ok(res.errors.length > 0);
    });
  });
});
