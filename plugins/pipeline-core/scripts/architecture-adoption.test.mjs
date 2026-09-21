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
import { spawnSync } from "node:child_process";
import { applyAdoptionDecision as rawApply } from "./architecture-adoption.mjs";
import { prepareAdoptionAuthority } from "../lib/architecture-adoption-authority.mjs";
import { setupAdoptionFixture, signAdoptionRequest, fixtureGit } from "./architecture-adoption-test-fixture.mjs";

import {
  resolveAdoptionState,
  generateAdoptionProposal,
  checkPlanningAdoptionDisposition,
  STATE_ADOPTION_REQUIRED,
  STATE_APPROVED_SCOPED,
  STATE_DEFERRED,
  STATE_PARTIAL,
  SCHEMA_ADOPTION_STATE,
  SCHEMA_ADOPTION_PROPOSAL
} from "./architecture-adoption.mjs";
import { fixtureAdoption as applyAdoptionDecision } from "./architecture-adoption-test-fixture.mjs";

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
      assert.deepEqual(decision.scope, ["architecture/map/"]);
      assert.equal(decision.coverageClass, "evaluated");
      assert.equal(decision.confidence, "measured");
      assert.ok(decision.decidedAt);
      assert.ok(decision.decisionRef);

      const resolved = resolveAdoptionState(tempDir);
      assert.equal(resolved.state, STATE_APPROVED_SCOPED);
      assert.deepEqual(resolved.scope, ["architecture/map/"]);
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
        rawApply({
          rootDir: tempDir,
          decision: "invalid-state",
          rationale: "test"
        });
      }, /Invalid adoption decision/);

      assert.throws(() => {
        rawApply({
          rootDir: tempDir,
          decision: STATE_APPROVED_SCOPED,
          rationale: ""
        });
      }, /non-empty rationale/);
    });
  });

  describe("2. Staged Proposal Generation (#109 §5)", () => {
    it("generates a 4-stage proposal with map first", () => {
      // This assertion covers harvested contracts; supply a schema-valid map
      // rather than asserting a non-empty inventory for an empty temp root.
      fs.mkdirSync(path.join(tempDir, "architecture", "map"), { recursive: true });
      fs.mkdirSync(path.join(tempDir, "plugins", "pipeline-core", "lib"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "architecture", "map", "index.md"), "# Architecture map\n");
      fs.writeFileSync(path.join(tempDir, "architecture", "map", "core.md"), `---
id: core
responsibility: Proposal contract fixture.
nonResponsibilities: []
ownedPaths:
  - plugins/pipeline-core/lib/**
publicContracts:
  - plugins/pipeline-core/lib/contract.mjs
allowedDependencies: []
authorityEffects: []
verificationEntryPoints: []
adrReferences: []
---
# Core
`);
      fs.writeFileSync(path.join(tempDir, "plugins", "pipeline-core", "lib", "contract.mjs"), "export {};\n");
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

describe("Adoption authority anti-forgery and durable readback", () => {
  let root, key, input, request, proof;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adoption-authority-"));
    key = setupAdoptionFixture(root);
    input = { rootDir: root, decision: "approved-scoped", scope: "src/", rationale: "Fixture decision", decidedAt: "2026-01-01T00:00:00.000Z", expiresAt: null, reviewDate: null, decisionRef: "TEST-1" };
    request = prepareAdoptionAuthority(input);
    proof = signAdoptionRequest(request, key);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const statePath = root => path.join(root, "architecture/adoption-state.json");
  const apply = (input, request, proof) => rawApply({ ...input, approvalRequest: request, proof });

  it("ships all validation schemas with canonical source parity", () => {
    for (const name of ["pipeline.adoption-state.v1.json", "pipeline.adoption-proposal.v1.json", "pipeline.module-inventory.v1.json"]) assert.deepEqual(JSON.parse(fs.readFileSync(path.join("plugins/pipeline-core/schemas", name))), JSON.parse(fs.readFileSync(path.join("schemas", name))));
  });
  it("fails closed on malformed trust policy and unsigned mutation of stored intent", () => {
    apply(input, request, proof);
    const persisted = JSON.parse(fs.readFileSync(statePath(root)));
    persisted.authority.request.intent.value.candidate.commit = "b".repeat(40);
    fs.writeFileSync(statePath(root), JSON.stringify(persisted));
    assert.equal(resolveAdoptionState(root).state, "adoption-required");
    fs.writeFileSync(path.join(root, "project/critical-human-proof.json"), "{");
    assert.throws(() => apply(input, request, proof), /POLICY/);
  });

  it("refuses ordinary apply, then verifies a real detached signature and later legitimate commits", () => {
    assert.throws(() => rawApply(input), /AUTHORITY/);
    assert.equal(fs.existsSync(statePath(root)), false);
    apply(input, request, proof);
    assert.equal(resolveAdoptionState(root).state, "approved-scoped");
    fixtureGit(root, ["commit", "--allow-empty", "-qm", "later legitimate work"]);
    assert.equal(resolveAdoptionState(root).state, "approved-scoped");
    assert.equal(checkPlanningAdoptionDisposition(root, "src/a.mjs").ok, true);
    assert.equal(checkPlanningAdoptionDisposition(root, "src/../other/a.mjs").ok, false);
  });
  for (const field of ["scope", "decision", "rationale", "expiresAt", "reviewDate", "decisionRef", "decidedAt", "candidate", "profileSha256"]) {
    it(`rejects signed-subject tamper: ${field}, preserving state`, () => {
      apply(input, request, proof);
      const before = fs.readFileSync(statePath(root), "utf8");
      const altered = structuredClone(request);
      altered.subject[field] = field === "scope" ? ["other/"] : field === "decision" ? "partial" : field === "candidate" ? { commit: "b".repeat(40), tree: "c".repeat(40) } : field === "profileSha256" ? "d".repeat(64) : field.endsWith("At") || field === "reviewDate" ? "2099-01-01" : "changed";
      assert.throws(() => apply(input, altered, proof), /authority rejected/);
      assert.equal(fs.readFileSync(statePath(root), "utf8"), before);
    });
  }
  it("rejects edited intent bytes even when supplied digest and signature stay valid", () => {
    request.intent.value.decision = "partial";
    assert.throws(() => apply(input, request, proof), /INTENT-MISMATCH/);
  });
  it("rejects changed apply arguments, stale candidate and changed input", () => {
    assert.throws(() => apply({ ...input, scope: "other/" }, request, proof), /SUBJECT-MISMATCH/);
    fs.writeFileSync(path.join(root, "project/pipeline.json"), "{}");
    assert.throws(() => apply(input, request, proof), /INPUT-CHANGED/);
    fs.unlinkSync(path.join(root, "project/pipeline.json"));
    fixtureGit(root, ["commit", "--allow-empty", "-qm", "changed candidate"]);
    assert.throws(() => apply(input, request, proof), /INPUT-CHANGED/);
  });
  it("rejects missing/malformed proof and wrong key", () => {
    for (const invalid of [null, {}, { ...proof, signatureBase64: "AA==" }, { ...proof, publicKey: "broken" }]) assert.throws(() => apply(input, request, invalid), /authority rejected/);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "adoption-other-"));
    try {
      const otherKey = setupAdoptionFixture(other);
      assert.throws(() => apply(input, request, signAdoptionRequest(request, otherKey)), /TRUST-MISMATCH/);
      assert.throws(() => apply({ ...input, rootDir: other }, request, proof), /REPOSITORY-MISMATCH/);
    } finally { fs.rmSync(other, { recursive: true, force: true }); }
  });
  it("rejects forged legacy state and modified persisted authority", () => {
    fs.mkdirSync(path.dirname(statePath(root)), { recursive: true });
    fs.writeFileSync(statePath(root), JSON.stringify({ schema: SCHEMA_ADOPTION_STATE, state: "approved-scoped", scope: "src/", by: "PO" }));
    assert.equal(resolveAdoptionState(root).state, "adoption-required");
    apply(input, request, proof);
    const state = JSON.parse(fs.readFileSync(statePath(root), "utf8"));
    state.scope = ["other/"];
    fs.writeFileSync(statePath(root), JSON.stringify(state));
    assert.equal(resolveAdoptionState(root).state, "adoption-required");
  });
  it("validates scopes and dates; deferred scope is bounded and expires on review date", () => {
    for (const scope of [null, [], "", "*", "../src", "/src", "src/../other", "src//x"]) assert.throws(() => prepareAdoptionAuthority({ ...input, scope }));
    for (const expiresAt of ["invalid", "2026-02-30", ""]) assert.throws(() => prepareAdoptionAuthority({ ...input, expiresAt }));
    const deferred = { ...input, decision: "deferred", reviewDate: "2027-01-01" };
    const req = prepareAdoptionAuthority(deferred);
    apply(deferred, req, signAdoptionRequest(req, key));
    assert.equal(checkPlanningAdoptionDisposition(root, "other/a", new Date("2026-09-19")).ok, false);
    assert.equal(checkPlanningAdoptionDisposition(root, "src/a", new Date("2026-09-19")).ok, true);
    assert.equal(resolveAdoptionState(root, new Date("2027-01-01")).state, "adoption-required");
  });
  it("chat attribution is explicit, intent-bound and cannot satisfy signature-mode readback", () => {
    setupAdoptionFixture(root, { mode: "chat" });
    const req = prepareAdoptionAuthority(input);
    assert.throws(() => rawApply({ ...input, approvalRequest: req, by: "PO" }), /ATTRIBUTION/);
    const chatApproval = { mode: "chat-attributed-unattested", by: "Test PO", decisionRef: "chat approval fixture", intentSha256: req.intent.sha256 };
    const state = rawApply({ ...input, approvalRequest: req, chatApproval });
    assert.equal(state.authority.mode, "chat-attributed-unattested");
    assert.equal(resolveAdoptionState(root).state, "approved-scoped");
    setupAdoptionFixture(root);
    assert.equal(resolveAdoptionState(root).state, "adoption-required");
  });
  it("actual CLI prepares, applies and reads back from a plugin-only installation", () => {
    const plugin = path.join(root, "plugin");
    fs.cpSync(path.resolve("plugins/pipeline-core"), plugin, { recursive: true });
    const script = path.join(plugin, "scripts/architecture-adoption.mjs");
    const args = ["--root", root, "--decision", input.decision, "--scope", input.scope, "--rationale", input.rationale, "--decision-ref", input.decisionRef, "--decided-at", input.decidedAt, "--json"];
    const prepared = spawnSync(process.execPath, [script, "prepare", ...args], { encoding: "utf8" });
    assert.equal(prepared.status, 0, prepared.stderr);
    const req = JSON.parse(prepared.stdout);
    fs.writeFileSync(path.join(root, "request.json"), JSON.stringify(req));
    fs.writeFileSync(path.join(root, "proof.json"), JSON.stringify(signAdoptionRequest(req, key)));
    const unsigned = spawnSync(process.execPath, [script, "apply", ...args], { encoding: "utf8" });
    assert.notEqual(unsigned.status, 0);
    const applied = spawnSync(process.execPath, [script, "apply", ...args, "--request", path.join(root, "request.json"), "--proof", path.join(root, "proof.json")], { encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr);
    const observed = spawnSync(process.execPath, [script, "status", "--root", root, "--json"], { encoding: "utf8" });
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(JSON.parse(observed.stdout).state, "approved-scoped");
    const proposed = spawnSync(process.execPath, [script, "propose", "--root", root, "--json"], { encoding: "utf8" });
    assert.equal(proposed.status, 0, proposed.stderr);
    fs.unlinkSync(path.join(plugin, "schemas/pipeline.adoption-state.v1.json"));
    const missingSchema = spawnSync(process.execPath, [script, "status", "--root", root, "--json"], { encoding: "utf8" });
    assert.notEqual(missingSchema.status, 0);
  });
});
