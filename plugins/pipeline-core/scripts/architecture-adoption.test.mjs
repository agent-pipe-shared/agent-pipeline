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
      assert.deepEqual(proposal.decisionOptions, [STATE_APPROVED_SCOPED, STATE_DEFERRED, STATE_PARTIAL]);
      assert.ok(proposal.coverageClass);
      assert.ok(proposal.confidence);

      for (const stage of proposal.stages) {
        assert.ok(stage.coverageClass);
        assert.ok(stage.confidence);
        assert.ok(stage.effort.units);
        assert.ok(["measured", "estimated", "unavailable"].includes(stage.effort.status));
      }
    });

    it("retains a durable deferral when proposing a missing physical map", () => {
      const proposalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adoption-proposal-deferral-"));
      try {
        applyAdoptionDecision({
          rootDir: proposalRoot,
          decision: STATE_DEFERRED,
          scope: "src/",
          rationale: "Existing repository may defer migration while its map is prepared",
          reviewDate: "2027-10-20",
          by: "PO"
        });
        // The signed fixture provisions a map before recording authority.
        // Simulate a later physical-map loss without changing that decision.
        fs.rmSync(path.join(proposalRoot, "architecture/map/index.md"));
        assert.equal(fs.existsSync(path.join(proposalRoot, "architecture/map/index.md")), false);
        const proposal = generateAdoptionProposal(proposalRoot);
        assert.equal(resolveAdoptionState(proposalRoot).state, STATE_DEFERRED);
        assert.equal(proposal.stages[0].stage, 1);
        assert.ok(proposal.stages[0].primaryDeliverables.includes("architecture/map/index.md"));
        assert.deepEqual(proposal.decisionOptions, [], "the existing decision must not be presented for repeat approval");
        assert.ok(proposal.whatIsNotProposed.some((line) => line.includes("No repeat adoption decision")));
      } finally {
        fs.rmSync(proposalRoot, { recursive: true, force: true });
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
    assert.deepEqual(JSON.parse(proposed.stdout).decisionOptions, [], "installed CLI must not re-offer a durable approved decision");
    const usage = fs.readFileSync(path.resolve("docs/usage.md"), "utf8");
    for (const command of [
      "architecture-adoption.mjs status --root <project-root> --json",
      "architecture-adoption.mjs propose --root <project-root> --json",
      "module-inventory.mjs --root <project-root> --check",
      "generate-architecture-overview.mjs --root <project-root> --check",
      "generate-architecture-overview.mjs --root <project-root> --write",
    ]) assert.ok(usage.includes(command), `consumer guide must name the tested installed-plugin command: ${command}`);
    const concept = path.join(root, "architecture/map/core.md");
    fs.writeFileSync(concept, fs.readFileSync(concept, "utf8").replace("---\nid:", "---\ntype: Governed Module\nid:"));
    const inventory = spawnSync(process.execPath, [path.join(plugin, "scripts/module-inventory.mjs"), "--root", root, "--check"], { encoding: "utf8" });
    assert.equal(inventory.status, 0, inventory.stderr);
    const overviewScript = path.join(plugin, "scripts/generate-architecture-overview.mjs");
    const overviewWrite = spawnSync(process.execPath, [overviewScript, "--root", root, "--write"], { encoding: "utf8" });
    assert.equal(overviewWrite.status, 0, overviewWrite.stderr);
    const overviewCheck = spawnSync(process.execPath, [overviewScript, "--root", root, "--check"], { encoding: "utf8" });
    assert.equal(overviewCheck.status, 0, overviewCheck.stderr);
    fs.unlinkSync(path.join(plugin, "schemas/pipeline.adoption-state.v1.json"));
    const missingSchema = spawnSync(process.execPath, [script, "status", "--root", root, "--json"], { encoding: "utf8" });
    assert.notEqual(missingSchema.status, 0);
  });
});

// ADOPT-SIGN-T: the request file the PO signs is written by `prepare` itself, not by a shell
// redirect (the closed shell grammar admits none), so the signing ceremony can read it back.
// `--out` is pinned with an absolute path under the fixture root so the pin holds whether a
// later implementation resolves a relative value against --root or against the working directory.
describe("ADOPT-SIGN-T: adoption request file for the signing ceremony", () => {
  const script = path.resolve("plugins/pipeline-core/scripts/architecture-adoption.mjs");
  let root, escapeTarget;
  const prepareArgs = () => ["--root", root, "--decision", "approved-scoped", "--scope", "src/", "--rationale", "Request file fixture", "--decision-ref", "ADOPT-SIGN-FIXTURE-1", "--decided-at", "2026-01-01T00:00:00.000Z", "--json"];
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adoption-request-file-"));
    escapeTarget = path.join(os.tmpdir(), `adoption-request-escape-${process.pid}.json`);
    setupAdoptionFixture(root);
    fs.mkdirSync(path.join(root, "scratch"), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(escapeTarget, { force: true });
  });

  it("ADOPT-SIGN-T: prepare --out writes the request JSON byte-identical to its stdout form", () => {
    const printed = spawnSync(process.execPath, [script, "prepare", ...prepareArgs()], { encoding: "utf8" });
    assert.equal(printed.status, 0, printed.stderr);
    const target = path.join(root, "scratch", "adoption-request.json");
    const written = spawnSync(process.execPath, [script, "prepare", ...prepareArgs(), "--out", target], { encoding: "utf8" });
    assert.equal(written.status, 0, `prepare must accept --out <scratch path>: ${written.stderr}`);
    const bytes = fs.readFileSync(target, "utf8");
    assert.equal(bytes, printed.stdout, "the request file must be byte-identical to the stdout form of the same prepare");
    assert.equal(JSON.parse(bytes).schema, "pipeline.adoption-approval-request.v1");
  });

  it("ADOPT-SIGN-T: prepare --out refuses a path outside scratch/, names the boundary and writes nothing", () => {
    for (const target of [
      path.join(root, "adoption-request.json"),
      path.join(root, "scratch", "..", "adoption-request-dotdot.json"),
      escapeTarget,
    ]) {
      const refused = spawnSync(process.execPath, [script, "prepare", ...prepareArgs(), "--out", target], { encoding: "utf8" });
      assert.notEqual(refused.status, 0, `${target} is outside scratch/ and must be refused`);
      assert.doesNotMatch(refused.stderr, /Unknown or incomplete option/u, "the refusal must be about the path, not an unrecognised --out flag");
      assert.match(refused.stderr, /scratch/u, "the refusal must name the scratch/ boundary");
      assert.equal(fs.existsSync(path.resolve(target)), false, "a refused --out must write nothing");
    }
  });
});

// ADOPT-SIGN-T2: the hardening ADOPT-SIGN-F shipped around `prepare --out` without a negative pin.
// Every refusal below must exit 1, print no request on stdout and leave the filesystem as it was
// (for a refused existing target "nothing written" means its bytes and kind are unchanged). A
// relative --out resolves against --root, so the discriminating cases run from a different cwd.
// Link-based cases skip with an explicit reason on a host that cannot create the link.
describe("ADOPT-SIGN-T2: the scratch-bound --out of `prepare`", () => {
  const script = path.resolve("plugins/pipeline-core/scripts/architecture-adoption.mjs");
  let root, scratch, side, foreignCwd, stray;
  const prepareArgs = () => ["--root", root, "--decision", "approved-scoped", "--scope", "src/", "--rationale", "Request file fixture", "--decision-ref", "ADOPT-SIGN-FIXTURE-1", "--decided-at", "2026-01-01T00:00:00.000Z", "--json"];
  const run = (command, args, options = {}) => spawnSync(process.execPath, [script, command, ...args], { encoding: "utf8", ...options });
  const prepare = (out, options) => run("prepare", [...prepareArgs(), "--out", out], options);
  const entries = (dir) => fs.readdirSync(dir).sort();
  const assertRefused = (refused, label) => {
    assert.equal(refused.status, 1, `${label} must be refused with exit 1: ${refused.stderr}`);
    assert.doesNotMatch(refused.stderr, /Unknown or incomplete option/u, `${label}: the refusal must be about the path, not an unrecognised --out flag`);
    assert.match(refused.stderr, /scratch\//u, `${label}: the refusal must name the scratch/ boundary`);
    assert.equal(refused.stdout, "", `${label}: a refused --out prints no request`);
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adoption-request-t2-"));
    scratch = path.join(root, "scratch");
    side = fs.mkdtempSync(path.join(os.tmpdir(), "adoption-request-t2-side-"));
    foreignCwd = fs.mkdtempSync(path.join(os.tmpdir(), "adoption-request-t2-cwd-"));
    stray = path.join(os.tmpdir(), `adoption-request-t2-up-${process.pid}.json`);
    setupAdoptionFixture(root);
    fs.mkdirSync(scratch, { recursive: true });
  });
  afterEach(() => {
    for (const entry of [root, side, foreignCwd, stray]) fs.rmSync(entry, { recursive: true, force: true });
  });

  it("ADOPT-SIGN-T2-1: --out on a command other than prepare is refused with exit 1, names prepare and writes nothing", () => {
    const before = entries(root);
    for (const [command, args] of [["status", ["--root", root, "--json"]], ["propose", ["--root", root, "--json"]], ["apply", prepareArgs()]]) {
      const refused = run(command, [...args, "--out", "scratch/request.json"]);
      assert.equal(refused.status, 1, `${command} --out must be refused with exit 1: ${refused.stderr}`);
      assert.match(refused.stderr, /--out is only valid with the 'prepare' command/u, `${command}: the refusal must say --out belongs to prepare`);
      assert.equal(refused.stdout, "", `${command}: a refused --out prints nothing`);
      assert.deepEqual(entries(scratch), [], `${command}: a refused --out must write nothing into scratch/`);
    }
    assert.deepEqual(entries(root), before, "a refused --out must leave the root untouched");
  });

  it("ADOPT-SIGN-T2-2: --out naming scratch/ itself is refused, names the boundary and leaves scratch/ an empty directory", () => {
    const before = entries(root);
    for (const out of ["scratch", "scratch/", "./scratch", scratch]) {
      assertRefused(prepare(out), out);
      assert.ok(fs.lstatSync(scratch).isDirectory(), `${out}: scratch/ must still be a real directory`);
      assert.deepEqual(entries(scratch), [], `${out}: scratch/ must stay empty`);
    }
    assert.deepEqual(entries(root), before);
  });

  it("ADOPT-SIGN-T2-3: a relative --out resolves against --root, so a path outside scratch/ is refused from any working directory", () => {
    const before = entries(root);
    for (const out of ["adoption-request.json", `../${path.basename(stray)}`, "scratch/../adoption-request-dotdot.json", "scratch-sibling/adoption-request.json"]) {
      // cwd = scratch/: were the value resolved against the working directory, the first form would land inside scratch/.
      assertRefused(prepare(out, { cwd: scratch }), out);
      assert.deepEqual(entries(scratch), [], `${out}: nothing may be written into scratch/`);
    }
    assert.deepEqual(entries(root), before, "no refused --out may create a file or directory beside scratch/");
    assert.equal(fs.existsSync(stray), false, "no refused --out may write above the root");
  });

  it("ADOPT-SIGN-T2-4: a relative --out resolves against --root (not the working directory) and the file equals stdout byte for byte", () => {
    const printed = run("prepare", prepareArgs(), { cwd: foreignCwd });
    assert.equal(printed.status, 0, printed.stderr);
    const written = prepare("scratch/request-relative.json", { cwd: foreignCwd });
    assert.equal(written.status, 0, written.stderr);
    const target = path.join(scratch, "request-relative.json");
    assert.ok(fs.readFileSync(target).equals(Buffer.from(written.stdout, "utf8")), "the file must equal the stdout of the same call byte for byte");
    assert.equal(written.stdout, printed.stdout, "the stdout form must not change when --out is given");
    assert.deepEqual(entries(foreignCwd), [], "a relative --out must not be resolved against the working directory");
    assert.match(written.stderr, /adoption request written: scratch\/request-relative\.json/u);
  });

  it("ADOPT-SIGN-T2-5: a symlinked scratch/ is refused, names the boundary and nothing is written through the link", (t) => {
    fs.rmSync(scratch, { recursive: true, force: true });
    try { fs.symlinkSync(side, scratch, "dir"); } catch (error) {
      t.skip(`this host cannot create a directory symlink (${error.code}); the symlinked scratch/ refusal is not exercised here`);
      return;
    }
    assertRefused(prepare("scratch/request-through-link.json"), "scratch/request-through-link.json");
    assert.deepEqual(entries(side), [], "nothing may be written through the symlinked scratch/");
  });

  it("ADOPT-SIGN-T2-6: a symlinked directory under scratch/ and a symlinked existing target are refused and nothing is written through them", (t) => {
    const victim = path.join(side, "victim.json");
    fs.writeFileSync(victim, "victim-sentinel\n");
    try {
      fs.symlinkSync(side, path.join(scratch, "link"), "dir");
      fs.symlinkSync(victim, path.join(scratch, "request-link.json"), "file");
    } catch (error) {
      t.skip(`this host cannot create a symlink (${error.code}); the symlinked parent and target refusals are not exercised here`);
      return;
    }
    assertRefused(prepare("scratch/link/request.json"), "scratch/link/request.json");
    assert.deepEqual(entries(side), ["victim.json"], "nothing may be written through a symlinked parent directory");
    assertRefused(prepare("scratch/request-link.json"), "scratch/request-link.json");
    assert.equal(fs.readFileSync(victim, "utf8"), "victim-sentinel\n", "a symlinked target must not be written through");
  });

  it("ADOPT-SIGN-T2-7: control: an existing unlinked regular target is replaced, so the refusals below are about links and kind", () => {
    const plain = path.join(scratch, "request-plain.json");
    fs.writeFileSync(plain, "old-sentinel\n");
    const replaced = prepare("scratch/request-plain.json");
    assert.equal(replaced.status, 0, replaced.stderr);
    assert.equal(fs.readFileSync(plain, "utf8"), replaced.stdout);
  });

  it("ADOPT-SIGN-T2-8: a hardlinked existing target is refused, names the boundary and neither name changes", (t) => {
    const primary = path.join(scratch, "request-linked.json");
    const alias = path.join(scratch, "request-alias.json");
    fs.writeFileSync(primary, "linked-sentinel\n");
    try { fs.linkSync(primary, alias); } catch (error) {
      t.skip(`this host cannot create a hardlink (${error.code}); the hardlinked target refusal is not exercised here`);
      return;
    }
    for (const out of ["scratch/request-linked.json", "scratch/request-alias.json"]) {
      assertRefused(prepare(out), out);
      assert.equal(fs.readFileSync(primary, "utf8"), "linked-sentinel\n", `${out}: the hardlinked file must keep its bytes`);
      assert.equal(fs.readFileSync(alias, "utf8"), "linked-sentinel\n", `${out}: the second name of the hardlinked file must keep its bytes`);
    }
  });

  it("ADOPT-SIGN-T2-9: an existing non-regular target (a directory) is refused, names the boundary and is left as it was", () => {
    const dir = path.join(scratch, "request-dir.json");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "keep.txt"), "keep\n");
    assertRefused(prepare("scratch/request-dir.json"), "scratch/request-dir.json");
    assert.ok(fs.lstatSync(dir).isDirectory(), "the directory must still be a directory");
    assert.deepEqual(entries(dir), ["keep.txt"]);
  });
});
