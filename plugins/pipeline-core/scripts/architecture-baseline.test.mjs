// SPDX-License-Identifier: SUL-1.0
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
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
import { inspectAdrDraftBindings, inspectArchitectureDecisionAuthoringSources } from "../lib/architecture-effective-decisions.mjs";
import { inspectProspectiveArchitectureManifest } from "../lib/architecture-prospective-materialization.mjs";

// C20 G20-23 (c): fileURLToPath, not a string replace of "file://" (wrong on Windows); the path it names is unchanged.
const DECISION_SCHEMA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
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
        assert.equal(parsed.authorityStatus, "inventory-only");
        assert.equal(parsed.effectiveProjection.status, "advisory");
        assert.ok(parsed.effectiveProjection.findings.some(({ code }) => code === "legacy-decision-without-sidecar"));
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("compiles only byte-validated decisions into the effective identity list and never self-activates a waiver", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-summary-valid-"));
      try {
        const dir = path.join(root, "docs", "adr");
        fs.mkdirSync(dir, { recursive: true });
        const body = "# Valid decision\n";
        const record = { schema: SCHEMA_DECISION, id: "ADR-1", title: "Valid decision", status: "accepted",
          digest: createHash("sha256").update(body).digest("hex"), scope: "project", date: "2026-09-25" };
        fs.writeFileSync(path.join(dir, "ADR-1.md"), body);
        fs.writeFileSync(path.join(dir, "ADR-1.json"), `${JSON.stringify(record)}\n`);
        const moduleBody = "# Module decision\n";
        const moduleRecord = { schema: "pipeline.architecture-decision.v2", id: "ADR-module", title: "Module decision",
          status: "accepted", digest: createHash("sha256").update(moduleBody).digest("hex"),
          scope: "module", date: "2026-09-25", moduleIds: ["pipeline-core"] };
        fs.writeFileSync(path.join(dir, "ADR-module.md"), moduleBody);
        fs.writeFileSync(path.join(dir, "ADR-module.json"), `${JSON.stringify(moduleRecord)}\n`);
        const mapDir = path.join(root, "architecture", "map");
        fs.mkdirSync(mapDir, { recursive: true });
        fs.writeFileSync(path.join(mapDir, "index.md"), "# Map\n\nOKF v0.1 concept bundle.\n\n- [pipeline-core](pipeline-core.md)\n- [harness](harness.md)\n");
        for (const id of ["pipeline-core", "harness"]) {
          fs.writeFileSync(path.join(mapDir, `${id}.md`), `---\ntype: Governed Module\nid: ${id}\nresponsibility: Own ${id}\nnonResponsibilities: []\nownedPaths:\n  - ${id}/**\npublicContracts: []\nallowedDependencies: []\nauthorityEffects: []\nverificationEntryPoints: []\nadrReferences: []\n---\n# ${id}\n`);
        }
        const valid = compileDecisionSummary(root, { write: false });
        // d02409a8a adoption gate: no retained approved aggregate lists these byte-valid decisions, so none is
        // effective yet (advisory decision-adoption-unverified); the compiled inventory still carries them.
        assert.equal(valid.authorityStatus, "inventory-only");
        assert.deepEqual(valid.effectiveProjection.decisionIds, []);
        assert.deepEqual(valid.decisions.find(({ id }) => id === "ADR-module").moduleIds, ["pipeline-core"]);
        assert.deepEqual(valid.effectiveProjection.decisions, []);
        assert.ok(valid.effectiveProjection.findings.some(({ code, path: findingPath }) => code === "decision-adoption-unverified" && findingPath === "docs/adr/ADR-1.md"));
        assert.deepEqual(valid.activeExceptions, []);

        const waivedBody = "# Claimed waiver\n";
        fs.writeFileSync(path.join(dir, "ADR-waiver.md"), waivedBody);
        fs.writeFileSync(path.join(dir, "ADR-waiver.json"), `${JSON.stringify({ ...record, id: "ADR-waiver",
          status: "waived", digest: createHash("sha256").update(waivedBody).digest("hex"),
          exception: { authority: "human-po", rationale: "Test", scope: "project", expiry: "2026-12-31" } })}\n`);
        const unverified = compileDecisionSummary(root, { write: false, now: "2026-09-25T12:00:00.000Z" });
        assert.equal(unverified.authorityStatus, "inventory-only");
        assert.deepEqual(unverified.activeExceptions, []);
        assert.deepEqual(unverified.effectiveProjection.decisionIds, []);
        assert.deepEqual(unverified.effectiveProjection.decisions, []);
        assert.ok(unverified.effectiveProjection.findings.some(({ code }) => code === "waiver-human-authority-unverified"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe("5. Determinism precondition for AC-19 (not a two-runner parity fixture)", () => {
    it("repeats significance-axis assessment in one process without changing the result", () => {
      const testFiles = ["contracts/parity-test.mjs", "package.json"];
      const resA = evaluateSignificanceAxes(testFiles);
      const resB = evaluateSignificanceAxes(testFiles);

      assert.deepEqual(resA.axesEvaluated, resB.axesEvaluated);
      assert.deepEqual(resA.matches, resB.matches);
    });
  });

  describe("6. Schema precondition for AC-20 (not a semantic Critic fixture)", () => {
    it("rejects an ADR with an invalid digest before semantic review", () => {
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
    it("keeps a schema-valid, digest-matching but semantically false ADR/implementation pair for independent Critic review", async () => {
      const fixture = path.join(path.dirname(DECISION_SCHEMA_PATH), "..", "specs", "sprint-alfred-epic", "fixtures", "ac20-token-adr");
      const decisionBytes = fs.readFileSync(path.join(fixture, "decision.md"));
      const decision = JSON.parse(fs.readFileSync(path.join(fixture, "decision.json"), "utf8"));
      assert.equal(validateArchitectureDecision(decision, decisionSchema).valid, true);
      assert.equal(decision.digest, createHash("sha256").update(decisionBytes).digest("hex"));
      assert.match(decisionBytes.toString("utf8"), /returns `false`\s+whenever `approved` is `false`/u);
      const { mayPublish } = await import(pathToFileURL(path.join(fixture, "implementation.mjs")).href);
      assert.equal(mayPublish({ approved: false, urgent: true }), true,
        "the fixture contradicts the valid ADR; only a semantic review may call this nonconformant");
    });
  });

  // C20 G20-26 / G20-23: the sidecar schemas ship in the plugin, `--validate` accepts both schema versions, and the
  // sanctioned `create-adr.mjs` writes a proposal the existing prospective materialization (draft- files, status proposed) accepts.
  describe("7. Shipped decision schemas and the create-adr generator (C20 G20-26)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const CREATE_ADR = path.join(here, "create-adr.mjs");
    const BASELINE = path.join(here, "architecture-baseline.mjs");
    const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const tempRoots = [];
    const makeRoot = () => {
      const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "create-adr-")));
      tempRoots.push(root);
      return root;
    };
    const makeMap = (root, ids) => {
      const mapDir = path.join(root, "architecture", "map");
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, "index.md"),
        `# Map\n\nOKF v0.1 concept bundle.\n\n${ids.map((id) => `- [${id}](${id}.md)`).join("\n")}\n`);
      for (const id of ids) {
        fs.writeFileSync(path.join(mapDir, `${id}.md`), `---\ntype: Governed Module\nid: ${id}\nresponsibility: Own ${id}\nnonResponsibilities: []\nownedPaths:\n  - ${id}/**\npublicContracts: []\nallowedDependencies: []\nauthorityEffects: []\nverificationEntryPoints: []\nadrReferences: []\n---\n# ${id}\n`);
      }
    };
    const create = (root, ...args) => spawnSync(process.execPath, [CREATE_ADR, "--root", root, ...args], { encoding: "utf8" });
    const validate = (file) => spawnSync(process.execPath, [BASELINE, "--validate", file], { encoding: "utf8" });
    after(() => { for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true }); });

    it("7.1 ships both sidecar schemas in the plugin, byte-identical to the repository copies", () => {
      for (const name of ["pipeline.architecture-decision.v1.json", "pipeline.architecture-decision.v2.json"]) {
        const shipped = fs.readFileSync(path.join(here, "..", "schemas", name));
        const canonical = fs.readFileSync(path.join(here, "..", "..", "..", "schemas", name));
        assert.ok(shipped.equals(canonical), `${name}: plugin copy differs from the repository schemas/ copy`);
      }
    });

    it("7.2 validates a v2 module record against the shipped schema and keeps rejecting malformed ones", () => {
      const base = { schema: "pipeline.architecture-decision.v2", id: "draft-x", title: "T", status: "proposed",
        digest: "a".repeat(64), scope: "module", moduleIds: ["a-b", "c"], date: "2026-11-07" };
      assert.equal(validateArchitectureDecision(base).valid, true, JSON.stringify(validateArchitectureDecision(base).errors));
      for (const bad of [{ ...base, scope: "project" }, { ...base, moduleIds: [] }, { ...base, moduleIds: ["c", "a-b"] },
        { ...base, moduleIds: ["A"] }, { ...base, extra: 1 }, { ...base, schema: "pipeline.architecture-decision.v3" }]) {
        assert.equal(validateArchitectureDecision(bad).valid, false, JSON.stringify(bad));
      }
      const v1 = { ...base, schema: SCHEMA_DECISION, scope: "project" };
      delete v1.moduleIds;
      assert.equal(validateArchitectureDecision(v1).valid, true);
      assert.equal(validateArchitectureDecision({ ...v1, moduleIds: ["a"] }).valid, false);
    });

    it("7.3 reads the default schema from the plugin copy through fileURLToPath, never through the repository root", () => {
      const source = fs.readFileSync(BASELINE, "utf8");
      const body = source.slice(source.indexOf("export function validateArchitectureDecision"), source.indexOf("function parseArgs"));
      assert.match(body, /fileURLToPath\(new URL\(`?"?\.\.\/schemas\//u);
      assert.doesNotMatch(body, /import\.meta\.url\.replace/u);
      assert.doesNotMatch(body, /"\.\.\/\.\.\/\.\."/u);
    });

    it("7.4 --validate accepts a v2 sidecar and refuses a digest that does not match the sibling Markdown", () => {
      const root = makeRoot();
      const dir = path.join(root, "docs", "adr");
      fs.mkdirSync(dir, { recursive: true });
      const body = "# T\n";
      const record = { schema: "pipeline.architecture-decision.v2", id: "ADR-v2", title: "T", status: "proposed",
        digest: sha(body), scope: "module", moduleIds: ["a"], date: "2026-11-07" };
      fs.writeFileSync(path.join(dir, "ADR-v2.md"), body);
      fs.writeFileSync(path.join(dir, "ADR-v2.json"), `${JSON.stringify(record)}\n`);
      assert.equal(validate(path.join(dir, "ADR-v2.json")).status, 0);
      fs.writeFileSync(path.join(dir, "ADR-v2.json"), `${JSON.stringify({ ...record, digest: "b".repeat(64) })}\n`);
      const drifted = validate(path.join(dir, "ADR-v2.json"));
      assert.equal(drifted.status, 1);
      assert.match(drifted.stderr, /digest/u);
    });

    it("7.5 create-adr writes the draft pair: proposed, id = file stem, digest of the exact Markdown bytes", () => {
      const root = makeRoot();
      const out = create(root, "--slug", "storage-adapter", "--title", "Use a storage adapter", "--date", "2026-11-07");
      assert.equal(out.status, 0, out.stderr);
      const result = JSON.parse(out.stdout);
      assert.equal(result.markdown, "docs/adr/draft-storage-adapter.md");
      assert.equal(result.sidecar, "docs/adr/draft-storage-adapter.json");
      const markdown = fs.readFileSync(path.join(root, result.markdown));
      const record = JSON.parse(fs.readFileSync(path.join(root, result.sidecar), "utf8"));
      assert.deepEqual(record, { schema: "pipeline.architecture-decision.v1", id: "draft-storage-adapter",
        title: "Use a storage adapter", status: "proposed", digest: sha(markdown), scope: "project", date: "2026-11-07" });
      assert.match(markdown.toString("utf8"), /^# Use a storage adapter\n/u);
      assert.doesNotMatch(markdown.toString("utf8"), /^\s*(?:\*\*)?status/imu, "the status lives in the sidecar only");
      assert.equal(validate(path.join(root, result.sidecar)).status, 0);
      const authoring = inspectArchitectureDecisionAuthoringSources({ rootDir: root, area: "project" });
      assert.deepEqual(authoring.findings, [], JSON.stringify(authoring));
    });

    it("7.6 create-adr names the next free number and ignores draft files when counting", () => {
      const root = makeRoot();
      fs.mkdirSync(path.join(root, "docs", "adr"), { recursive: true });
      for (const name of ["0001-first.md", "0007-seventh.md", "draft-other.md", "README.md"]) fs.writeFileSync(path.join(root, "docs", "adr", name), "# x\n");
      const result = JSON.parse(create(root, "--slug", "next", "--title", "Next", "--date", "2026-11-07").stdout);
      assert.equal(result.nextFreeNumber, "0008");
      assert.equal(result.acceptedIdAfterApproval, "0008-next");
    });

    it("7.6a create-adr --refresh without a slug updates every draft in one call", () => {
      const root = makeRoot();
      assert.equal(create(root, "--slug", "one", "--title", "One", "--date", "2026-11-07").status, 0);
      assert.equal(create(root, "--slug", "two", "--title", "Two", "--date", "2026-11-07").status, 0);
      fs.appendFileSync(path.join(root, "docs", "adr", "draft-two.md"), "\nedited\n");
      const refreshed = JSON.parse(create(root, "--refresh").stdout);
      assert.deepEqual(refreshed.refreshed.map((entry) => entry.id), ["draft-one", "draft-two"]);
      assert.deepEqual(refreshed.changed, ["draft-two"]);
      const record = JSON.parse(fs.readFileSync(path.join(root, "docs", "adr", "draft-two.json"), "utf8"));
      assert.equal(record.digest, sha(fs.readFileSync(path.join(root, "docs", "adr", "draft-two.md"))));
    });

    // C28-PLAN-GATES (AC-108): a draft that is deliberately not wanted is discarded with a reason, as an auditable record and no signature.
    it("7.6b create-adr --discard --reason records the discard for the exact draft bytes, leaves the draft in place and resolves it for submit-plan", () => {
      const root = makeRoot();
      assert.equal(create(root, "--slug", "unwanted", "--title", "Unwanted", "--date", "2026-11-07").status, 0);
      const before = { md: fs.readFileSync(path.join(root, "docs", "adr", "draft-unwanted.md")), json: fs.readFileSync(path.join(root, "docs", "adr", "draft-unwanted.json")) };
      const out = create(root, "--slug", "unwanted", "--discard", "--reason", "the storage decision replaced it");
      assert.equal(out.status, 0, out.stderr);
      const result = JSON.parse(out.stdout);
      assert.equal(result.ok, true);
      assert.equal(result.discarded, "docs/adr/draft-unwanted.md");
      assert.equal(result.record, "docs/adr/discarded/draft-unwanted.json");
      const record = JSON.parse(fs.readFileSync(path.join(root, result.record), "utf8"));
      assert.deepEqual(Object.keys(record).sort(), ["discardedAt", "id", "markdownSha256", "reason", "schema", "sidecarSha256"]);
      assert.equal(record.schema, "pipeline.adr-draft-discard.v1");
      assert.equal(record.id, "draft-unwanted");
      assert.equal(record.markdownSha256, sha(before.md));
      assert.equal(record.sidecarSha256, sha(before.json));
      assert.equal(record.reason, "the storage decision replaced it");
      assert.equal(new Date(record.discardedAt).toISOString(), record.discardedAt);
      assert.ok(fs.readFileSync(path.join(root, "docs", "adr", "draft-unwanted.md")).equals(before.md), "ADRs are history: the draft stays");
      assert.ok(fs.readFileSync(path.join(root, "docs", "adr", "draft-unwanted.json")).equals(before.json));
      assert.deepEqual(inspectAdrDraftBindings({ rootDir: root, featureDirs: ["specs/f"] }).map((entry) => entry.state), ["discarded"]);
      assert.deepEqual(inspectArchitectureDecisionAuthoringSources({ rootDir: root, area: "project" }).findings, [], "the record raises no decision finding");
      assert.equal(create(root, "--refresh").status, 0, "a draft-wide refresh still works with a discard record present");
    });

    it("7.6c create-adr --discard refuses without a one-line reason, for an unknown, already discarded or materialized draft, and mixed with create flags; nothing is written", () => {
      const root = makeRoot();
      assert.equal(create(root, "--slug", "unwanted", "--title", "Unwanted", "--date", "2026-11-07").status, 0);
      const noRecord = () => assert.equal(fs.existsSync(path.join(root, "docs", "adr", "discarded")), false, "no record directory was created");
      for (const args of [["--discard"], ["--discard", "--reason"], ["--discard", "--reason", ""], ["--discard", "--reason", "two\nlines"], ["--discard", "--reason", "x".repeat(301)],
        ["--discard", "--reason", "ok", "--title", "Mixed"], ["--reason", "alone"]]) {
        const refused = create(root, "--slug", "unwanted", ...args);
        assert.notEqual(refused.status, 0, args.join(" "));
        assert.match(refused.stderr, /create-adr refused|create-adr:/u);
      }
      noRecord();
      const unknown = create(root, "--slug", "nothing-here", "--discard", "--reason", "x");
      assert.notEqual(unknown.status, 0);
      assert.match(unknown.stderr, /docs\/adr\/draft-nothing-here\.md/u);
      noRecord();
      fs.writeFileSync(path.join(root, "docs", "adr", "0001-unwanted.md"), "# accepted\n");
      fs.writeFileSync(path.join(root, "docs", "adr", "0001-unwanted.json"), `${JSON.stringify({ schema: "pipeline.architecture-decision.v1", id: "0001-unwanted", title: "Unwanted", status: "accepted", digest: sha("# accepted\n"), scope: "project", date: "2026-11-07" })}\n`);
      const materialized = create(root, "--slug", "unwanted", "--discard", "--reason", "x");
      assert.notEqual(materialized.status, 0);
      assert.match(materialized.stderr, /0001-unwanted/u, "names the accepted record that makes a discard meaningless");
      noRecord();
      fs.rmSync(path.join(root, "docs", "adr", "0001-unwanted.md"));
      fs.rmSync(path.join(root, "docs", "adr", "0001-unwanted.json"));
      assert.equal(create(root, "--slug", "unwanted", "--discard", "--reason", "first").status, 0);
      const twice = create(root, "--slug", "unwanted", "--discard", "--reason", "second");
      assert.notEqual(twice.status, 0);
      assert.match(twice.stderr, /already discarded/u);
      assert.equal(JSON.parse(fs.readFileSync(path.join(root, "docs", "adr", "discarded", "draft-unwanted.json"), "utf8")).reason, "first", "the first record is never rewritten");
    });

    it("7.7 create-adr writes a v2 record for named modules, sorted and unique, only when the physical map has them", () => {
      const root = makeRoot();
      makeMap(root, ["alpha", "beta"]);
      const refused = create(root, "--slug", "mod", "--title", "Mod", "--modules", "alpha,gamma", "--date", "2026-11-07");
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /gamma/u);
      assert.match(refused.stderr, /alpha, beta/u);
      assert.equal(fs.existsSync(path.join(root, "docs", "adr", "draft-mod.md")), false, "a refused request leaves no file");
      const ok = create(root, "--slug", "mod", "--title", "Mod", "--modules", "beta,alpha,beta", "--date", "2026-11-07");
      assert.equal(ok.status, 0, ok.stderr);
      const record = JSON.parse(fs.readFileSync(path.join(root, "docs", "adr", "draft-mod.json"), "utf8"));
      assert.equal(record.schema, "pipeline.architecture-decision.v2");
      assert.equal(record.scope, "module");
      assert.deepEqual(record.moduleIds, ["alpha", "beta"]);
      assert.equal(validate(path.join(root, "docs", "adr", "draft-mod.json")).status, 0);
      const authoring = inspectArchitectureDecisionAuthoringSources({ rootDir: root, area: "project" });
      assert.deepEqual(authoring.findings, [], JSON.stringify(authoring));
    });

    it("7.8 create-adr records scope global and a supersedes id that names an existing ADR", () => {
      const root = makeRoot();
      fs.mkdirSync(path.join(root, "docs", "adr"), { recursive: true });
      fs.writeFileSync(path.join(root, "docs", "adr", "0003-old.md"), "# ADR-0003: Old\n");
      const missing = create(root, "--slug", "new", "--title", "New", "--supersedes", "0009-none", "--date", "2026-11-07");
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, /0009-none/u);
      const ok = create(root, "--slug", "new", "--title", "New", "--scope", "global", "--supersedes", "0003-old", "--date", "2026-11-07");
      assert.equal(ok.status, 0, ok.stderr);
      const record = JSON.parse(fs.readFileSync(path.join(root, "docs", "adr", "draft-new.json"), "utf8"));
      assert.equal(record.scope, "global");
      assert.equal(record.supersedes, "0003-old");
    });

    it("7.10 --refresh recomputes only the digest of an edited proposal and refuses anything that is not a draft proposal", () => {
      const root = makeRoot();
      assert.equal(create(root, "--slug", "edit", "--title", "Edit me", "--date", "2026-11-07").status, 0);
      const markdownPath = path.join(root, "docs", "adr", "draft-edit.md"), sidecarPath = path.join(root, "docs", "adr", "draft-edit.json");
      const before = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
      fs.writeFileSync(markdownPath, "# Edit me\n\n## Decision\n\nWe use a file adapter.\n");
      assert.equal(validate(sidecarPath).status, 1, "an edited Markdown makes the digest stale until --refresh");
      const refreshed = spawnSync(process.execPath, [CREATE_ADR, "--root", root, "--slug", "edit", "--refresh"], { encoding: "utf8" });
      assert.equal(refreshed.status, 0, refreshed.stderr);
      const after = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
      assert.deepEqual({ ...after, digest: before.digest }, before, "only the digest changes");
      assert.equal(after.digest, sha(fs.readFileSync(markdownPath)));
      assert.equal(validate(sidecarPath).status, 0);
      // never a path to `accepted`: a record that is not a proposal for this draft id is refused and left untouched
      for (const tampered of [{ ...after, status: "accepted" }, { ...after, id: "draft-other" }]) {
        fs.writeFileSync(sidecarPath, `${JSON.stringify(tampered, null, 2)}\n`);
        const bytes = fs.readFileSync(sidecarPath);
        const refused = spawnSync(process.execPath, [CREATE_ADR, "--root", root, "--slug", "edit", "--refresh"], { encoding: "utf8" });
        assert.notEqual(refused.status, 0, JSON.stringify(tampered));
        assert.ok(fs.readFileSync(sidecarPath).equals(bytes));
      }
      assert.notEqual(spawnSync(process.execPath, [CREATE_ADR, "--root", root, "--slug", "absent", "--refresh"], { encoding: "utf8" }).status, 0);
    });

    it("7.11 the real prospective manifest inspector accepts a create-adr proposal and activates it as the next numbered ADR", () => {
      // The consumer is lib/architecture-prospective-materialization.mjs (what `materialize-architecture` publishes from). The rows are
      // built with the formulas of its own fixture, so this proves the generator output satisfies the consumer's proposal predicate.
      const root = makeRoot();
      fs.mkdirSync(path.join(root, "docs", "adr"), { recursive: true });
      fs.writeFileSync(path.join(root, "docs", "adr", "0004-earlier.md"), "# ADR-0004: Earlier\n");
      const out = JSON.parse(create(root, "--slug", "egm", "--title", "Item-owned EGM", "--date", "2026-11-07").stdout);
      // QG-04 restatement (C20 G20-23 (b)): the consumer now refuses a draft that still holds a create-adr `REPLACE:` template line, so
      // this case first proves that refusal on the untouched template and then does what the skill tells the agent to do before binding:
      // write the Markdown and recompute the digest with --refresh. Every assertion below the inspector call is unchanged.
      const build = () => {
      const files = new Map();
      const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
      const add = (rel, content) => {
        const bytes = Buffer.from(content);
        files.set(rel, { path: rel, bytes, text: bytes.toString("utf8"), sha256: sha(bytes) });
        return { path: rel, sha256: sha(bytes) };
      };
      const markdown = add(out.markdown, fs.readFileSync(path.join(root, out.markdown)));
      const sidecar = add(out.sidecar, fs.readFileSync(path.join(root, out.sidecar)));
      const proposed = JSON.parse(files.get(out.sidecar).text);
      const originValue = { selections: [{ topic: "ownership", text: "One owner performs the work." }] };
      const origin = add("specs/x/original.json", jsonText(originValue));
      const choice = { schema: "pipeline.architecture-prospective-chat-selection.v1", id: proposed.id, decision: "selected",
        markdownSha256: markdown.sha256, sidecarSha256: sidecar.sha256, scope: proposed.scope, moduleIds: [], supersedes: null,
        attributedTo: "PO chat selection", origin, selections: originValue.selections };
      const chatSelection = add("specs/x/selection.json", jsonText(choice));
      const id = `${out.nextFreeNumber}-egm`;
      assert.equal(id, out.acceptedIdAfterApproval);
      const acceptedMarkdown = `# ADR-${id}: ${proposed.title}\n\nAccepted through the canonical aggregate design approval.\n\n## Approved proposal, preserved verbatim\n\n${files.get(out.markdown).text}`;
      const acceptedSidecar = { ...proposed, id, status: "accepted", digest: sha(acceptedMarkdown) };
      const { origin: _origin, selections: _selections, ...selected } = choice;
      const acceptedChoice = { ...selected, schema: "pipeline.design-decision-chat-selection.v1", id, decision: "accepted",
        markdownSha256: sha(acceptedMarkdown), sidecarSha256: sha(jsonText(acceptedSidecar)) };
      const row = { id, proposedMarkdown: markdown, proposedSidecar: sidecar, chatSelection, predecessor: null,
        outputs: { markdown: { path: `docs/adr/${id}.md`, sha256: sha(acceptedMarkdown) }, sidecar: { path: `docs/adr/${id}.json`, sha256: sha(jsonText(acceptedSidecar)) },
          chatSelection: { path: `project/architecture-chat-selections/${id}.json`, sha256: sha(jsonText(acceptedChoice)) } } };
      const manifest = add("specs/x/manifest.json", jsonText({ schema: "pipeline.architecture-prospective-materialization.v1", decisions: [row] }));
      const sources = { prd: add("specs/x/prd.md", "# prd\n"), spec: add("specs/x/spec.md", "# spec\n"), companions: [markdown, sidecar, origin, chatSelection, manifest] };
      return { inspected: inspectProspectiveArchitectureManifest({ manifest, sources, read: (name) => files.get(name), existing: () => null }), files, sidecar, id };
      };
      assert.throws(build, /DDB-PROSPECTIVE-PLACEHOLDER-REMAINS/u);
      fs.writeFileSync(path.join(root, out.markdown), "# Item-owned EGM\n\n## Decision\n\nOne owner performs the work.\n");
      assert.equal(spawnSync(process.execPath, [CREATE_ADR, "--root", root, "--slug", "egm", "--refresh"], { encoding: "utf8" }).status, 0);
      const { inspected, files, sidecar, id } = build();
      assert.equal(inspected.materialized, false);
      assert.deepEqual(inspected.targets.map((target) => target.path).sort(), [`docs/adr/${id}.json`, `docs/adr/${id}.md`, `project/architecture-chat-selections/${id}.json`]);
      assert.equal(inspected.decisions[0].record.status, "accepted");
      assert.equal(files.get(out.sidecar).sha256, sidecar.sha256, "the signed proposal bytes are never rewritten");
      assert.equal(JSON.parse(files.get(out.sidecar).text).status, "proposed");
    });

    it("7.9 create-adr refuses unsafe or ambiguous input without writing and never overwrites", () => {
      const root = makeRoot();
      const args = (...rest) => ["--title", "T", "--date", "2026-11-07", ...rest];
      for (const bad of [["--slug", "../x"], ["--slug", "A_b"], ["--slug", "-x"], ["--slug", "x/y"], ["--slug", ""], ["--slug", "a".repeat(80)]]) {
        assert.notEqual(create(root, ...args(...bad)).status, 0, JSON.stringify(bad));
      }
      for (const bad of [["--title", ""], ["--title", "a\nb"], ["--title", "a\u0007b"] /* NUL cannot reach an argv at all; BEL is the control character a shell can pass */, ["--date", "2026-02-30"], ["--date", "tomorrow"],
        ["--scope", "module"], ["--scope", "galaxy"], ["--bogus", "1"], ["--modules", "A"], ["--slug", "ok", "--slug", "again"]]) {
        const list = ["--slug", "ok", "--title", "T", "--date", "2026-11-07"];
        assert.notEqual(create(root, ...list, ...bad).status, 0, JSON.stringify(bad));
      }
      assert.notEqual(spawnSync(process.execPath, [CREATE_ADR, "--root", "relative/dir", "--slug", "ok", "--title", "T"], { encoding: "utf8" }).status, 0);
      assert.equal(fs.existsSync(path.join(root, "docs", "adr")) ? fs.readdirSync(path.join(root, "docs", "adr")).length : 0, 0);
      assert.equal(create(root, "--slug", "ok", "--title", "T", "--date", "2026-11-07").status, 0);
      const before = fs.readFileSync(path.join(root, "docs", "adr", "draft-ok.md"));
      const again = create(root, "--slug", "ok", "--title", "Other", "--date", "2026-11-07");
      assert.notEqual(again.status, 0);
      assert.ok(fs.readFileSync(path.join(root, "docs", "adr", "draft-ok.md")).equals(before));
    });

    // C20 G20-23 (remainder): the sanctioned binding step. Everything below drives the real scripts and the real lifecycle:
    // create-adr -> bind-adr-proposals -> design review receipt -> submit-plan -> present-plan -> approve-plan -> materialize-architecture.
    const BIND = path.join(here, "bind-adr-proposals.mjs");
    const run = (script, ...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    const ok = (script, ...args) => { const out = run(script, ...args); assert.equal(out.status, 0, `${path.basename(script)} ${args.join(" ")}: ${out.stderr}`); return out; };
    // Glossover G1 (candidate 28e): --feature takes exactly the lifecycle's feature-id shape, refused before any file is read or written.
    it("bind-adr-proposals refuses a feature id the design chain would refuse later, naming --feature", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "bind-feature-id-"));
      try {
        for (const feature of ["2026-10-26-epic2", "Epic2", "epic2.kontakt", "ab"]) {
          const out = run(BIND, "--root", root, "--feature", feature, "--carrier", "specs/x/design.md", "--selection", "specs/x/po-selection.json", "--draft", "d");
          assert.equal(out.status, 1, feature);
          assert.match(out.stderr, /bind-adr-proposals refused: --feature ".*" is not a valid feature id: .*\^\[a-z\]\[a-z0-9-\]\{2,63\}\$/u, feature);
        }
        assert.match(run(BIND, "--root", root, "--feature", "2026-10-26-epic2", "--carrier", "c.md", "--selection", "s.json", "--draft", "d").stderr, /starts with a digit/u);
        assert.deepEqual(fs.readdirSync(root), [], "nothing was written");
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });
    const HISTORIC = "# ADR-9997: METHOD original\n\nAccepted original requirement.\n";
    const filled = (title) => `# ${title}\n\n## Context\n\nOne owner performs analysis, tests, code and targeted fixes.\n\n## Decision\n\nThe item owner is the only writer.\n\n## Consequences\n\nOne review per item.\n\n## Affected Contracts\n\nnone\n`;
    const SELECTION = { attributedTo: "PO chat selection 2026-11-07", selections: [{ topic: "ownership", text: "One item Goldfish owns analysis, tests, code and fixes." }] };
    const fixtureWalk = async ({ predecessorSidecar }) => {
      const fxt = await import("../lib/architecture-prospective-materialization.fixture.mjs");
      const { readEffectiveDesignArchitectureAuthority } = await import("../lib/design-decision-bindings.mjs");
      let bound, drafts;
      const f = fxt.makeFixture("signature", { stage: "approved-unmaterialized", bindProposals(fixture, companions) {
        fxt.write(fixture, "docs/adr/9997-method-original.md", HISTORIC);
        if (predecessorSidecar) {
          fxt.write(fixture, "docs/adr/9997-method-original.json", `${JSON.stringify({ schema: "pipeline.architecture-decision.v1", id: "9997-method-original",
            title: "METHOD original", status: "accepted", digest: sha(HISTORIC), scope: "project", date: "2026-01-01" }, null, 2)}\n`);
          fxt.git(fixture, "add", "--", "docs/adr/9997-method-original.json");
        }
        ok(CREATE_ADR, "--root", fixture.dir, "--slug", "method-egm", "--title", "METHOD item-owned EGM", "--supersedes", "9997-method-original", "--date", "2026-10-10");
        fs.writeFileSync(path.join(fixture.dir, "docs/adr/draft-method-egm.md"), filled("METHOD item-owned EGM"));
        ok(CREATE_ADR, "--root", fixture.dir, "--slug", "method-egm", "--refresh");
        fxt.write(fixture, "specs/e2e/po-selection.json", `${JSON.stringify(SELECTION, null, 2)}\n`);
        bound = JSON.parse(ok(BIND, "--root", fixture.dir, "--feature", "e2e", "--carrier", "specs/e2e/design.md", "--selection", "specs/e2e/po-selection.json", "--draft", "method-egm").stdout);
        for (const name of bound.companions) if (!companions.includes(name)) companions.push(name);
        drafts = ["docs/adr/draft-method-egm.md", "docs/adr/draft-method-egm.json"].map((name) => [name, fs.readFileSync(path.join(fixture.dir, name))]);
      } });
      assert.equal(bound.bound[0].id, "9998-method-egm");
      // C28-PLAN-GATES (AC-108): the binding names the accepted path the modules cite in adrReferences, never the draft (Codex greenfield 2026-11).
      assert.deepEqual(bound.adrReferences, ["docs/adr/9998-method-egm.md"]);
      assert.match(bound.next, /adrReferences/u);
      assert.match(bound.next, /never a docs\/adr\/draft-/u);
      assert.deepEqual(inspectAdrDraftBindings({ rootDir: f.dir, featureDirs: ["specs/e2e"] }).map((entry) => `${entry.slug}:${entry.state}:${entry.acceptedId}`), ["method-egm:bound:9998-method-egm"],
        "the real binding output is what submit-plan recognizes as bound");
      for (const name of ["docs/adr/9998-method-egm.md", "docs/adr/9998-method-egm.json", "project/architecture-chat-selections/9998-method-egm.json"]) {
        assert.equal(fs.existsSync(path.join(f.dir, name)), false, `${name} must not exist before the PO's approval is consumed`);
      }
      fxt.must(f, ["materialize-architecture"]);
      const accepted = JSON.parse(fs.readFileSync(path.join(f.dir, "docs/adr/9998-method-egm.json"), "utf8"));
      assert.equal(accepted.status, "accepted");
      assert.equal(accepted.supersedes, "9997-method-original");
      const predecessor = JSON.parse(fs.readFileSync(path.join(f.dir, "docs/adr/9997-method-original.json"), "utf8"));
      assert.equal(predecessor.status, "superseded");
      assert.equal(predecessor.id, "9997-method-original");
      for (const name of ["docs/adr/9998-method-egm.json", "docs/adr/9997-method-original.json"]) assert.equal(validate(path.join(f.dir, name)).status, 0, name);
      for (const [name, bytes] of drafts) assert.ok(fs.readFileSync(path.join(f.dir, name)).equals(bytes), `${name}: the signed proposal is never rewritten`);
      const effective = readEffectiveDesignArchitectureAuthority({ rootDir: f.dir });
      assert.equal(effective.ok, true, JSON.stringify(effective));
      assert.deepEqual(effective.decisions.map((entry) => entry.id), ["9998-method-egm"]);
      return { f, predecessor, accepted };
    };

    it("7.12 create-adr -> bind-adr-proposals -> approval -> materialize-architecture publishes the accepted record and the superseded Markdown-only predecessor with no hand-built file", async () => {
      await fixtureWalk({ predecessorSidecar: false });
    });

    it("7.13 a predecessor that already has an accepted sidecar is superseded through the signed preimage (no TARGET-DRIFT) and keeps its own fields", async () => {
      const { predecessor } = await fixtureWalk({ predecessorSidecar: true });
      assert.equal(predecessor.title, "METHOD original");
      assert.equal(predecessor.date, "2026-01-01", "the predecessor keeps its own date and scope; only the status changes");
    });

    it("7.13b after a reopen the registrar rebuilds a manifest that lists only earlier approvals and keeps them; any other manifest stays a conflict", async () => {
      const { f } = await fixtureWalk({ predecessorSidecar: false });
      const REGISTER = path.join(here, "register-feature-package.mjs");
      const manifestPath = path.join(f.dir, "specs/e2e/lifecycle.json");
      const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const envelope = current.artifacts.find((entry) => entry.class === "candidate-evidence");
      const earlierBytes = "earlier approval\n";
      const earlierPath = `specs/e2e/evidence/accepted-delivery-contract-${sha(earlierBytes)}.json`;
      fs.writeFileSync(path.join(f.dir, earlierPath), earlierBytes);
      const swapped = (entryPath) => ({ ...current, artifacts: current.artifacts.map((entry) => (entry === envelope ? { ...entry, path: entryPath, sha256: sha(earlierBytes) } : entry)) });
      fs.writeFileSync(manifestPath, `${JSON.stringify(swapped("specs/e2e/evidence/other-record.json"), null, 2)}\n`);
      const conflict = run(REGISTER, "--root", f.dir);
      assert.notEqual(conflict.status, 0);
      assert.match(conflict.stdout, /FPR-MANIFEST-CONFLICT/u);
      fs.writeFileSync(manifestPath, `${JSON.stringify(swapped(earlierPath), null, 2)}\n`);
      const rebuilt = JSON.parse(ok(REGISTER, "--root", f.dir).stdout);
      assert.equal(rebuilt.status, "registered");
      const evidence = JSON.parse(fs.readFileSync(manifestPath, "utf8")).artifacts.filter((entry) => entry.class === "candidate-evidence").map((entry) => entry.path);
      assert.deepEqual(evidence, [earlierPath, envelope.path], "the earlier approval is retained and the current one registered");
    });

    // C28e (Claude test run 2026-11-13): after a Critic round the package also lists that round's evidence, so the re-approved design met
    // FPR-MANIFEST-CONFLICT with no route. A package that has not reached verification is superseded with every unchanged entry retained.
    it("7.13c a re-approval after a Critic round supersedes an approved or implementing package and retains its unchanged evidence; drifted, foreign or verifying ones stay a conflict", async () => {
      const { f } = await fixtureWalk({ predecessorSidecar: false });
      const REGISTER = path.join(here, "register-feature-package.mjs");
      const manifestPath = path.join(f.dir, "specs/e2e/lifecycle.json");
      const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const envelope = current.artifacts.find((entry) => entry.class === "candidate-evidence");
      const earlierBytes = "earlier approval\n";
      const earlierPath = `specs/e2e/evidence/accepted-delivery-contract-${sha(earlierBytes)}.json`;
      const roundBytes = "{\"round\":1}\n";
      const roundPath = "specs/e2e/evidence/critic-lineage-round-1.json";
      fs.writeFileSync(path.join(f.dir, earlierPath), earlierBytes);
      fs.writeFileSync(path.join(f.dir, roundPath), roundBytes);
      const threatBytes = "# Threat model\n";
      const threatPath = "specs/e2e/design/threat-model.md";
      fs.mkdirSync(path.join(f.dir, "specs/e2e/design"), { recursive: true });
      fs.writeFileSync(path.join(f.dir, threatPath), threatBytes);
      // As observed: the package still binds the PRD and Spec digests of the earlier approval (FTP-ARTIFACT-0/1 in the refusal).
      const others = current.artifacts.filter((entry) => entry !== envelope)
        .map((entry) => (entry.class === "prd" || entry.class === "spec" ? { ...entry, sha256: sha(`earlier ${entry.class}\n`) } : entry));
      const threat = { class: "threat-model", path: threatPath, sha256: sha(threatBytes), authority: false, mutability: "immutable", retention: "retain" };
      const listed = ({ state = "implementing", round = { path: roundPath, sha256: sha(roundBytes) }, threatSha256 = threat.sha256 } = {}) => ({ ...current, state,
        artifacts: [...others, { ...threat, sha256: threatSha256 }, { ...envelope, path: earlierPath, sha256: sha(earlierBytes) }, { ...envelope, ...round }] });
      const refusedWith = (manifest, name) => {
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        const before = fs.readFileSync(manifestPath);
        const out = run(REGISTER, "--root", f.dir);
        assert.notEqual(out.status, 0, name);
        assert.match(out.stdout, /FPR-MANIFEST-CONFLICT/u, name);
        assert.ok(fs.readFileSync(manifestPath).equals(before), `${name}: the manifest is left as it was`);
      };
      refusedWith(listed({ state: "verifying" }), "a package past implementation");
      refusedWith(listed({ round: { path: roundPath, sha256: sha("other bytes\n") } }), "an entry whose file no longer holds its recorded bytes");
      refusedWith(listed({ round: { path: "specs/other/evidence/critic-lineage-round-1.json", sha256: sha(roundBytes) } }), "an entry outside the feature's directory");
      refusedWith(listed({ threatSha256: sha("another threat model\n") }), "a retained non-evidence entry whose file no longer holds its recorded bytes");
      for (const state of ["approved", "implementing"]) {
        fs.writeFileSync(manifestPath, `${JSON.stringify(listed({ state }), null, 2)}\n`);
        const rebuilt = JSON.parse(ok(REGISTER, "--root", f.dir).stdout);
        assert.equal(rebuilt.status, "registered", state);
        const evidence = JSON.parse(fs.readFileSync(manifestPath, "utf8")).artifacts.filter((entry) => entry.class === "candidate-evidence").map((entry) => entry.path);
        assert.deepEqual(evidence, [earlierPath, roundPath, envelope.path], `${state}: the earlier approval and the round's evidence are retained, the current approval registered`);
        assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, "utf8")).artifacts.filter((entry) => entry.class === "threat-model"), [threat], `${state}: the threat model is retained with its own fields`);
        const sources = JSON.parse(fs.readFileSync(manifestPath, "utf8")).artifacts.filter((entry) => entry.class === "prd" || entry.class === "spec");
        for (const entry of sources) assert.equal(entry.sha256, sha(fs.readFileSync(path.join(f.dir, entry.path))), `${state}: ${entry.class} is rebound to the approved bytes`);
      }
    });

    // C28e (PO decision 2026-11-13): a re-approved Spec with other criterion ids met the unit generated for the earlier approval, so the first
    // Critic round would bind the earlier ids. Before any round, a generated single-course unit is rendered anew; once a round is retained the
    // course is bound to the unit (CCA/CGB-REVIEW-UNIT-BINDING, CRL-V2-CARRY-COVERAGE) and it is kept and reported; a hand-written one is kept.
    it("7.13d a re-approval re-renders a generated review unit whose criterion ids no longer match the approved Spec before the first Critic round; a retained round or a hand-written unit keeps it", async () => {
      const { f } = await fixtureWalk({ predecessorSidecar: false });
      const REGISTER = path.join(here, "register-feature-package.mjs");
      const manifestPath = path.join(f.dir, "specs/e2e/lifecycle.json");
      const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const envelope = current.artifacts.find((entry) => entry.class === "candidate-evidence");
      const earlierBytes = "earlier approval\n";
      const earlierPath = `specs/e2e/evidence/accepted-delivery-contract-${sha(earlierBytes)}.json`;
      fs.writeFileSync(path.join(f.dir, earlierPath), earlierBytes);
      const unitPath = "specs/e2e/design/critic-review-unit.json";
      const unitFile = path.join(f.dir, unitPath);
      const fresh = JSON.parse(fs.readFileSync(unitFile, "utf8"));
      assert.ok(fresh.criterionIds.length > 0, "the fixture's Spec names criterion ids");
      const supersede = (extra = []) => fs.writeFileSync(manifestPath, `${JSON.stringify({ ...current, state: "implementing",
        artifacts: [...current.artifacts.map((entry) => (entry === envelope ? { ...entry, path: earlierPath, sha256: sha(earlierBytes) } : entry)), ...extra] }, null, 2)}\n`);
      const unitEntry = () => JSON.parse(fs.readFileSync(manifestPath, "utf8")).artifacts.find((entry) => entry.path === unitPath);

      fs.writeFileSync(unitFile, `${JSON.stringify({ ...fresh, criterionIds: ["AC-999"] }, null, 2)}\n`);
      supersede();
      const rebuilt = JSON.parse(ok(REGISTER, "--root", f.dir).stdout);
      assert.equal(rebuilt.status, "registered");
      assert.equal(rebuilt.reviewUnit.status, "re-rendered");
      assert.deepEqual(rebuilt.reviewUnit.previousCriterionIds, ["AC-999"]);
      assert.deepEqual(JSON.parse(fs.readFileSync(unitFile, "utf8")).criterionIds, fresh.criterionIds, "the unit binds the approved Spec's ids again");
      assert.equal(unitEntry().sha256, sha(fs.readFileSync(unitFile)), "the manifest binds the re-rendered bytes");
      assert.ok(!fs.readdirSync(path.dirname(unitFile)).some((name) => name.includes(".registering-")), "no temporary file is left");

      const handBytes = `${JSON.stringify({ ...fresh, logicalWorkIds: ["e2e-a", "e2e-b"], criterionIds: ["AC-999"] }, null, 2)}\n`;
      fs.writeFileSync(unitFile, handBytes);
      supersede();
      const kept = JSON.parse(ok(REGISTER, "--root", f.dir).stdout);
      assert.equal(kept.reviewUnit.status, "found", "a multi-item unit is the author's, never rendered anew");
      assert.equal(fs.readFileSync(unitFile, "utf8"), handBytes);
      assert.equal(unitEntry().sha256, sha(handBytes));

      // A retained Critic round binds the course to the unit: kept byte-identical and reported, never rendered anew.
      const staleBytes = `${JSON.stringify({ ...fresh, criterionIds: ["AC-999"] }, null, 2)}\n`;
      fs.writeFileSync(unitFile, staleBytes);
      const lineageBytes = "{\"round\":1}\n";
      const lineagePath = `specs/e2e/evidence/critic-lineage-${sha(lineageBytes)}.json`;
      fs.writeFileSync(path.join(f.dir, lineagePath), lineageBytes);
      supersede([{ class: "candidate-evidence", path: lineagePath, sha256: sha(lineageBytes), authority: false, mutability: "immutable", retention: "retain" }]);
      const bound = JSON.parse(ok(REGISTER, "--root", f.dir).stdout);
      assert.equal(bound.status, "registered");
      assert.equal(bound.reviewUnit.status, "stale-bound-to-course");
      assert.deepEqual(bound.reviewUnit.criterionIds, ["AC-999"]);
      assert.deepEqual(bound.reviewUnit.approvedCriterionIds, fresh.criterionIds);
      assert.match(bound.reviewUnit.reason, /new feature/u);
      assert.equal(fs.readFileSync(unitFile, "utf8"), staleBytes, "the course-bound unit is never replaced");
      assert.equal(unitEntry().sha256, sha(staleBytes));
    });

    it("7.13a the binding step refuses a git-ignored selection and one holding a private identifier before anything is written, and names the repair", () => {
      const root = makeRoot();
      assert.equal(spawnSync("git", ["-C", root, "init", "-q"], { encoding: "utf8" }).status, 0);
      assert.equal(spawnSync("git", ["-C", root, "config", "user.email", "owner@corp.example"], { encoding: "utf8" }).status, 0);
      fs.mkdirSync(path.join(root, "specs"), { recursive: true });
      fs.mkdirSync(path.join(root, "scratch"), { recursive: true });
      fs.writeFileSync(path.join(root, ".gitignore"), "scratch/\n");
      fs.writeFileSync(path.join(root, "specs", "design.md"), "# Design\n");
      assert.equal(create(root, "--slug", "store", "--title", "Use a store", "--date", "2026-11-07").status, 0);
      fs.writeFileSync(path.join(root, "docs", "adr", "draft-store.md"), filled("Use a store"));
      ok(CREATE_ADR, "--root", root, "--slug", "store", "--refresh");
      const base = ["--root", root, "--feature", "e2e", "--carrier", "specs/design.md", "--draft", "store"];
      const carrier = fs.readFileSync(path.join(root, "specs", "design.md"));
      fs.writeFileSync(path.join(root, "scratch", "po-selection.json"), `${JSON.stringify(SELECTION)}\n`);
      const ignored = run(BIND, ...base, "--selection", "scratch/po-selection.json");
      assert.notEqual(ignored.status, 0);
      assert.match(ignored.stderr, /git-ignored[\s\S]*specs\/po-selection\.json/u);
      const held = { attributedTo: "PO chat selection 2026-11-08", selections: [{ topic: "owner", text: "Mail owner@corp.example about every release." }] };
      fs.writeFileSync(path.join(root, "specs", "po-selection.json"), `${JSON.stringify(held)}\n`);
      const identifier = run(BIND, ...base, "--selection", "specs/po-selection.json");
      assert.notEqual(identifier.status, 0);
      assert.match(identifier.stderr, /private identifier[\s\S]*Replace the identifier/u);
      assert.doesNotMatch(identifier.stderr, /owner@corp/u, "the refusal names the category, never the value");
      assert.ok(fs.readFileSync(path.join(root, "specs", "design.md")).equals(carrier), "the carrier is untouched");
    });

    it("7.14 the binding step refuses without the PO's own selection, with a REPLACE: placeholder or with a malformed selection, names the repair and leaves nothing behind", () => {
      const root = makeRoot();
      assert.equal(spawnSync("git", ["-C", root, "init", "-q"], { encoding: "utf8" }).status, 0);
      fs.mkdirSync(path.join(root, "specs"), { recursive: true });
      fs.writeFileSync(path.join(root, "specs", "design.md"), "# Design\n");
      assert.equal(create(root, "--slug", "store", "--title", "Use a store", "--date", "2026-11-07").status, 0);
      const tree = () => fs.readdirSync(root, { recursive: true }).map(String).filter((name) => !name.startsWith(".git")).sort().join("\n");
      const base = ["--root", root, "--feature", "e2e", "--carrier", "specs/design.md", "--draft", "store"];
      const carrier = fs.readFileSync(path.join(root, "specs", "design.md"));
      const refuse = (args, pattern) => {
        const before = tree();
        const out = run(BIND, ...args);
        assert.notEqual(out.status, 0, args.join(" "));
        assert.match(out.stderr, pattern);
        assert.equal(tree(), before, "a refused request leaves no file behind");
        assert.ok(fs.readFileSync(path.join(root, "specs", "design.md")).equals(carrier), "and the carrier is untouched");
      };
      refuse([...base, "--selection", "specs/po-selection.json"], /specs\/po-selection\.json[\s\S]*attributedTo[\s\S]*selections/u);
      refuse(base, /--selection/u);
      fs.writeFileSync(path.join(root, "specs", "po-selection.json"), `${JSON.stringify(SELECTION)}\n`);
      refuse([...base, "--selection", "specs/po-selection.json"], /REPLACE:[\s\S]*--refresh/u);
      fs.writeFileSync(path.join(root, "docs", "adr", "draft-store.md"), filled("Use a store"));
      ok(CREATE_ADR, "--root", root, "--slug", "store", "--refresh");
      const refreshedTree = tree();
      for (const bad of [{ selections: SELECTION.selections }, { attributedTo: "", selections: SELECTION.selections }, { attributedTo: "PO", selections: [] },
        { attributedTo: "PO", selections: [{ topic: "t", text: "REPLACE: say it" }] }, { attributedTo: "PO", selections: [{ topic: "t" }] }]) {
        fs.writeFileSync(path.join(root, "specs", "po-selection.json"), `${JSON.stringify(bad)}\n`);
        const out = run(BIND, ...base, "--selection", "specs/po-selection.json");
        assert.notEqual(out.status, 0, JSON.stringify(bad));
        assert.match(out.stderr, /specs\/po-selection\.json/u);
        assert.equal(tree(), refreshedTree);
      }
    });
  });
});
