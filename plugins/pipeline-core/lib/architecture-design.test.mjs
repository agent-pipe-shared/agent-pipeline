// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArchitectureDesign, architectureDesignTargets, materializeArchitectureDesign, publishArchitectureDesignTargets } from "./architecture-design.mjs";
import { makeAggregateFixture as actualAuthorityFixture } from "./architecture-prospective-materialization.fixture.mjs";
import { initialGreenfieldMapTargets } from "./architecture-map-scaffold.mjs";
import { generateAdoptionProposal } from "../scripts/architecture-adoption.mjs";
import { loadConceptFile } from "../scripts/module-inventory.mjs";
import { checkArchitectureOverview } from "../scripts/generate-architecture-overview.mjs";
import moduleSchema from "../schemas/pipeline.module-inventory.v1.json" with { type: "json" };

function design() {
  const module = { id: "application", responsibility: "Local application", nonResponsibilities: ["Network"],
    ownedPaths: ["src/**", "tests/**", "docs/contract.md"], publicContracts: ["docs/contract.md"],
    allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/application.test.mjs"], adrReferences: [] };
  return { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield",
    disposition: { decision: "approved-scoped", scope: ["src/", "tests/", "docs/contract.md", "architecture/", "specs/"], rationale: "Explicit design scope" },
    modules: [module], implementationSurface: ["src/application.mjs"],
    fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "local", revision: 1,
      modules: [{ id: module.id, ownedPaths: module.ownedPaths, allowedDependencies: [], authorityEffects: [], verificationEntryPoints: module.verificationEntryPoints }],
      allowedBoundaryCrossings: [], antiFragmentationPolicy: { rejectTrivialFacades: true } },
    baseline: { schema: "pipeline.architecture-baseline.v1", baselineRevision: 1, acceptedViolations: [],
      ratchetMetrics: { totalAcceptedViolations: 0, cycleCount: 0, boundaryCrossingsCount: 0 } } };
}
const prd = input => `# Design\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(input)}\n\`\`\`\n`;
test("architecture package explicitly carries bounded modules and renders only design artifacts", () => {
  const input = design();
  assert.deepEqual(parseArchitectureDesign(prd(input)), input);
  const targets = architectureDesignTargets(input);
  assert.deepEqual(targets.map(target => target.path), ["architecture/map/index.md", "architecture/map/application.md", "architecture/map/overview.html", "architecture/fitness-model.json", "architecture/baseline.json"]);
  assert.match(targets[1].bytes, /responsibility: "Local application"/u);
  assert.match(targets[0].bytes, /OKF v0\.1 concept bundle/u);
  assert.match(targets[1].bytes, /type: "Governed Module"/u);
  assert.match(targets[2].bytes, /id="module-application"/u);
  assert.equal(targets.some(target => target.path.startsWith("src/")), false);
  const root = mkdtempSync(join(tmpdir(), "architecture-frontmatter-"));
  try {
    const file = join(root, "application.md");
    writeFileSync(file, targets[1].bytes);
    const loaded = loadConceptFile(file, moduleSchema);
    assert.equal(loaded.ok, true, JSON.stringify(loaded.errors));
    assert.equal(loaded.module.id, "application");
    assert.deepEqual(loaded.module.ownedPaths, input.modules[0].ownedPaths);
    mkdirSync(join(root, "architecture/map"), { recursive: true });
    for (const target of targets.filter((row) => row.path.startsWith("architecture/map/"))) {
      writeFileSync(join(root, target.path), target.bytes);
    }
    assert.equal(checkArchitectureOverview(root).ok, true, "materialized human view must match exact map sources");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("closed package refuses missing, duplicate, brownfield, broad, escaping and debt-bearing input", () => {
  assert.throws(() => parseArchitectureDesign("# Draft"), /PACKAGE-REQUIRED/u);
  assert.throws(() => parseArchitectureDesign(prd(design()) + prd(design())), /PACKAGE-REQUIRED/u);
  for (const mutate of [
    input => { input.repositoryKind = "brownfield"; },
    input => { input.disposition.scope = ["*"]; },
    input => { input.modules[0].id = "../escape"; },
    input => { input.modules[0].ownedPaths = ["../outside/**"]; },
    input => { input.implementationSurface = ["unowned.mjs"]; },
    input => { input.modules[0].verificationEntryPoints = []; },
    input => { input.modules[0].allowedDependencies = ["unbound"]; },
    input => { input.fitnessModel.modules = []; },
    input => { input.baseline.acceptedViolations = [{ invented: true }]; },
    input => { input.extra = "unreviewed"; },
  ]) {
    const input = design(); mutate(input);
    assert.throws(() => parseArchitectureDesign(prd(input)), /ARCHITECTURE-DESIGN-/u);
  }
});
test("compact greenfield package derives redundant fitness rows and zero baseline", (t) => {
  const input = design();
  const fullBytes = Buffer.byteLength(JSON.stringify(input));
  delete input.fitnessModel.modules;
  delete input.baseline;
  const compactBytes = Buffer.byteLength(JSON.stringify(input));
  assert.ok(compactBytes < fullBytes);
  t.diagnostic(`architecture design authoring bytes: ${fullBytes} -> ${compactBytes}`);
  const parsed = parseArchitectureDesign(prd(input));
  assert.deepEqual(parsed.fitnessModel.modules, [{ id: "application",
    ownedPaths: ["src/**", "tests/**", "docs/contract.md"], allowedDependencies: [], authorityEffects: [],
    verificationEntryPoints: ["tests/application.test.mjs"] }]);
  assert.deepEqual(parsed.baseline.ratchetMetrics,
    { totalAcceptedViolations: 0, cycleCount: 0, boundaryCrossingsCount: 0 });
  const targets = architectureDesignTargets(parsed);
  assert.deepEqual(JSON.parse(targets.find(row => row.path === "architecture/fitness-model.json").bytes).modules,
    parsed.fitnessModel.modules);
});
test("field-local diagnostics identify the single invalid architecture input", () => {
  for (const [mutate, field, code] of [
    [input => { input.disposition.scope[1] = "tests/**"; }, "disposition.scope[1]", "ARCHITECTURE-DESIGN-DISPOSITION-INVALID"],
    [input => { input.modules[0].ownedPaths[0] = "../escape/**"; }, "modules[0].ownedPaths[0]", "ARCHITECTURE-DESIGN-PATH-INVALID"],
    [input => { input.modules[0].publicContracts[0] = "docs/*"; }, "modules[0].publicContracts[0]", "ARCHITECTURE-DESIGN-PATH-INVALID"],
    [input => { input.modules[0].verificationEntryPoints[0] = "tests/*"; }, "modules[0].verificationEntryPoints[0]", "ARCHITECTURE-DESIGN-PATH-INVALID"],
    // Candidate 19 (Q7): the surface refusal names the entry that is invalid, not only the code.
    [input => { input.implementationSurface = ["src/application.mjs", "src/icons/"]; }, "implementationSurface[1]", "ARCHITECTURE-DESIGN-SURFACE-INVALID"],
    [input => { input.implementationSurface = ["unowned.mjs"]; }, "implementationSurface[0]", "ARCHITECTURE-DESIGN-SURFACE-INVALID"],
  ]) {
    const input = design(); mutate(input);
    assert.throws(() => parseArchitectureDesign(prd(input)), error =>
      error.message === code && error.field === field && typeof error.expected === "string");
  }
  const input = design();
  input.fitnessModel.modules[0].ownedPaths = ["wrong/**"];
  assert.throws(() => parseArchitectureDesign(prd(input)), error =>
    error.message === "ARCHITECTURE-DESIGN-FITNESS-MISMATCH"
      && error.field === "fitnessModel.modules[0].ownedPaths");
});
test("fitness model sizeBudgets accepts positive integers, refuses others and is passed through unchanged (AC-108)", () => {
  const accepted = design();
  accepted.fitnessModel.sizeBudgets = { maxFileLines: 300, maxModuleLines: 1500 };
  const parsed = parseArchitectureDesign(prd(accepted));
  assert.deepEqual(parsed.fitnessModel.sizeBudgets, { maxFileLines: 300, maxModuleLines: 1500 });
  assert.deepEqual(JSON.parse(architectureDesignTargets(parsed).find(row => row.path === "architecture/fitness-model.json").bytes).sizeBudgets,
    { maxFileLines: 300, maxModuleLines: 1500 });
  const partial = design();
  partial.fitnessModel.sizeBudgets = { maxFileLines: 10 };
  assert.deepEqual(parseArchitectureDesign(prd(partial)).fitnessModel.sizeBudgets, { maxFileLines: 10 });
  for (const bad of [0, -1, 1.5, "500"]) {
    const input = design();
    input.fitnessModel.sizeBudgets = { maxFileLines: bad };
    assert.throws(() => parseArchitectureDesign(prd(input)), error => error.message === "ARCHITECTURE-DESIGN-FITNESS-MISMATCH", String(bad));
  }
  const unknownKey = design();
  unknownKey.fitnessModel.sizeBudgets = { maxFiles: 5 };
  assert.throws(() => parseArchitectureDesign(prd(unknownKey)), error => error.message === "ARCHITECTURE-DESIGN-FITNESS-MISMATCH");
  const without = JSON.parse(architectureDesignTargets(parseArchitectureDesign(prd(design()))).find(row => row.path === "architecture/fitness-model.json").bytes);
  assert.equal("sizeBudgets" in without, false);
});
function snapshot(root) {
  const result = {};
  function visit(directory, prefix = "") {
    for (const row of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + row.name;
      if (row.isDirectory()) visit(join(directory, row.name), name + "/");
      else result[name] = readFileSync(join(directory, row.name), "utf8");
    }
  }
  visit(root); return result;
}
test("brownfield proposal is read-only, reports unknown inventory, and materializer refuses to invent approval", () => {
  const root = mkdtempSync(join(tmpdir(), "architecture-brownfield-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "existing.mjs"), "export const existing = true;\n");
    const before = snapshot(root);
    const proposal = generateAdoptionProposal(root);
    assert.equal(proposal.inventorySummary.moduleCount, 0);
    assert.deepEqual(proposal.inventorySummary.candidateModules, []);
    assert.deepEqual(proposal.stages[1].contracts, []);
    assert.equal(proposal.coverageClass, "unknown");
    assert.equal(materializeArchitectureDesign(root).ok, false);
    assert.deepEqual(snapshot(root), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function transactionFixture(run) {
  const root = actualAuthorityFixture({stage: "approved-unmaterialized"}).dir;
  try {
    mkdirSync(join(root, "architecture/map"), { recursive: true });
    mkdirSync(join(root, "project"), { recursive: true });
    for (const target of initialGreenfieldMapTargets("fresh")) writeFileSync(join(root, target.path), target.bytes);
    const lock = { ok: true, path: join(root, "project/pipeline-state.json.lock"), token: "architecture-test", ownerNonce: "transaction-test" };
    writeFileSync(lock.path, JSON.stringify({ schema: "pipeline.continuity-lock.v0", token: lock.token, ownerNonce: lock.ownerNonce, acquiredAtMs: 1 }));
    run({ rootDir: root, lock, targets: architectureDesignTargets(design()), validateAuthority: () => true });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test("materialization transaction restores exact scaffold after a partial staged write", () => transactionFixture(options => {
  const before = snapshot(options.rootDir);
  let writes = 0;
  const result = publishArchitectureDesignTargets({ ...options, io: { writeFileSync(fd, contents, encoding) {
    if (++writes === 2) { writeFileSync(fd, contents.slice(0, 17), encoding); throw new Error("injected-partial-write"); }
    writeFileSync(fd, contents, encoding);
  } } });
  assert.equal(result.status, "rolled-back");
  assert.equal(result.code, "injected-partial-write");
  assert.deepEqual(snapshot(options.rootDir), before);
}));
test("materialization transaction preserves a target raced by another writer and restores earlier outputs", () => transactionFixture(options => {
  const before = snapshot(options.rootDir);
  let writes = 0;
  const result = publishArchitectureDesignTargets({ ...options, io: { writeFileSync(fd, contents, encoding) {
    writeFileSync(fd, contents, encoding);
    if (++writes === 2) writeFileSync(join(options.rootDir, "architecture/map/application.md"), "foreign concurrent content\n");
  } } });
  assert.equal(result.status, "rolled-back");
  assert.match(result.code, /EEXIST/u);
  assert.deepEqual(snapshot(options.rootDir), { ...before, "architecture/map/application.md": "foreign concurrent content\n" });
}));
test("authority CAS change after first publication rolls back and a changed lock refuses all writes", () => transactionFixture(options => {
  const before = snapshot(options.rootDir);
  let checks = 0;
  const result = publishArchitectureDesignTargets({ ...options, validateAuthority: () => ++checks < 3 });
  assert.equal(result.status, "rolled-back");
  assert.equal(result.code, "ARCHITECTURE-DESIGN-AUTHORITY-CHANGED");
  assert.deepEqual(snapshot(options.rootDir), before);
  const blocked = publishArchitectureDesignTargets({ ...options, lock: { ...options.lock, ownerNonce: "another-owner" } });
  assert.equal(blocked.code, "ARCHITECTURE-DESIGN-LOCK-CHANGED");
  assert.deepEqual(snapshot(options.rootDir), before);
}));

// ---------- Operator hotfix 9: a brownfield repository needs no greenfield architecture design block at implementation entry ----------
// Defect (pre-hotfix): inspectArchitectureDesign (the implementation-entry projection) demanded the greenfield design block even when the
// repository never carried the fresh greenfield map scaffold, so an approved brownfield PRD without a block was refused with
// ARCHITECTURE-DESIGN-PACKAGE-REQUIRED while the draft-time inspector already exempted it. The new branch sits AFTER the lifecycle / PO-gate
// authority / continuity / approval checks, which a throwaway fixture cannot satisfy with real signatures. The repository's own module source
// is therefore staged into a temp directory with ONLY its five approval modules replaced by test-controlled stubs (every other import
// resolves to the repository counterpart; everything after those checks runs unmodified).
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HF9_LIB = fileURLToPath(new URL("./", import.meta.url));
const HF9_STUBS = new Map([
  ["./plan-spec-state-v2.mjs", "stub-lifecycle.mjs"], ["./po-gate-authority.mjs", "stub-authority.mjs"], ["./design-workflow-package.mjs", "stub-dwp.mjs"],
  ["./design-workflow-approval.mjs", "stub-dwa.mjs"], ["./critical-human-proof-policy.mjs", "stub-policy.mjs"],
]);
const HF9_STUB_SOURCES = {
  "controls.mjs": `export const controls = { lifecycle: { ok: true, status: "approved" }, authorityOk: true };\n`,
  "stub-lifecycle.mjs": `import { controls } from "./controls.mjs";\nexport function derivePlanLifecycle() { return controls.lifecycle; }\n`,
  "stub-authority.mjs": `import { readFileSync } from "node:fs";\nimport { join } from "node:path";\nimport { controls } from "./controls.mjs";\nexport function validatePoGateAuthorityForRepository({ repoRoot }) {\n  if (!controls.authorityOk) return { ok: false, code: "TEST-AUTHORITY-REFUSED" };\n  const state = JSON.parse(readFileSync(join(repoRoot, "project", "pipeline-state.json"), "utf8"));\n  return { ok: true, value: state.planApproval.poGateAuthority };\n}\n`,
  "stub-dwp.mjs": `export function readDesignWorkflowPackageFromRepository() { return { ok: false, code: "TEST-DWP-UNUSED" }; }\nexport function rereadApprovedDesignWorkflowPackage() { return { ok: false, code: "TEST-DWP-UNUSED" }; }\n`,
  "stub-dwa.mjs": `export function verifyStoredDesignWorkflowPackageSignature() { return { ok: false, code: "TEST-DWA-UNUSED" }; }\n`,
  "stub-policy.mjs": `export function readCriticalHumanProofPolicy() { return { ok: false, code: "TEST-POLICY-UNUSED" }; }\n`,
};
const HF9_FEATURE = "feat-1";
const HF9_PLAN = "specs/f/prd.md";
const HF9_SPEC = "specs/f/spec.md";
const HF9_PRD_NO_BLOCK = "# Brownfield plan\n\nThis PRD carries no greenfield architecture design block.\n";
const HF9_SPEC_TEXT = "# Spec\n";
const HF9_NOT_REQUIRED = { ok: true, status: "not-required", required: false, scope: null };
const hf9Sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

let hf9Staged;
function hf9Load() {
  hf9Staged ??= (async () => {
    const stage = mkdtempSync(join(tmpdir(), "hf9-"));
    process.on("exit", () => { try { rmSync(stage, { recursive: true, force: true }); } catch { /* best effort */ } });
    for (const [file, source] of Object.entries(HF9_STUB_SOURCES)) writeFileSync(join(stage, file), source);
    const source = readFileSync(join(HF9_LIB, "architecture-design.mjs"), "utf8");
    const staged = source.replace(/(["'])(\.{1,2}\/[^"']+)\1/gu, (_match, quote, specifier) => {
      const target = HF9_STUBS.has(specifier) ? join(stage, HF9_STUBS.get(specifier)) : resolve(HF9_LIB, specifier);
      return `${quote}${pathToFileURL(target).href}${quote}`;
    });
    assert.equal(/["']\.{1,2}\/[^"']+["']/u.test(staged), false, "every relative reference of the module was rewritten");
    writeFileSync(join(stage, "architecture-design-staged.mjs"), staged);
    const { controls } = await import(pathToFileURL(join(stage, "controls.mjs")).href);
    const mod = await import(pathToFileURL(join(stage, "architecture-design-staged.mjs")).href);
    return { stage, controls, mod };
  })();
  return hf9Staged;
}

function hf9Design() {
  const module = { id: "application", responsibility: "Local application", nonResponsibilities: ["Network"], ownedPaths: ["src/**", "tests/**", "docs/contract.md"],
    publicContracts: ["docs/contract.md"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/application.test.mjs"], adrReferences: [] };
  return { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield",
    disposition: { decision: "approved-scoped", scope: ["src/", "tests/", "docs/contract.md", "architecture/", "specs/"], rationale: "Explicit design scope" },
    modules: [module], implementationSurface: ["src/application.mjs"],
    fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "local", revision: 1,
      modules: [{ id: module.id, ownedPaths: module.ownedPaths, allowedDependencies: [], authorityEffects: [], verificationEntryPoints: module.verificationEntryPoints }],
      allowedBoundaryCrossings: [], antiFragmentationPolicy: { rejectTrivialFacades: true } },
    baseline: { schema: "pipeline.architecture-baseline.v1", baselineRevision: 1, acceptedViolations: [], ratchetMetrics: { totalAcceptedViolations: 0, cycleCount: 0, boundaryCrossingsCount: 0 } } };
}

function hf9Put(root, relative, text) {
  const path = join(root, ...relative.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function hf9Fixture(stage, { block = false, scaffold = "none", receipt = false, staleContinuity = false, designInput = null } = {}) {
  // Real source writers establish neutral manifest/state selection; the five
  // original branch-test stubs below remain unchanged and are never DAB proof.
  const root = actualAuthorityFixture({stage: "presented"}).dir;
  for (const target of initialGreenfieldMapTargets("fresh")) unlinkSync(join(root, target.path));
  const prd = block ? `# Design\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(designInput ?? hf9Design())}\n\`\`\`\n` : HF9_PRD_NO_BLOCK;
  hf9Put(root, HF9_PLAN, prd);
  hf9Put(root, HF9_SPEC, HF9_SPEC_TEXT);
  hf9Put(root, "project/pipeline-state.json", JSON.stringify({
    activeFeature: { id: HF9_FEATURE, planPath: HF9_PLAN },
    planApproval: { poGateAuthority: { planPath: HF9_PLAN, specPath: HF9_SPEC } },
    continuity: { featureId: HF9_FEATURE, authority: { prd: { path: HF9_PLAN, sha256: staleContinuity ? "0".repeat(64) : hf9Sha(prd) }, spec: { path: HF9_SPEC, sha256: hf9Sha(HF9_SPEC_TEXT) } } },
  }, null, 2));
  const [index, inventory] = initialGreenfieldMapTargets("fresh");
  const edited = (target) => ({ ...target, bytes: `${target.bytes}\n<!-- brownfield edit -->\n` });
  const written = { none: [], exact: [index, inventory], "both-edited": [edited(index), edited(inventory)], "index-only-edited": [edited(index)], "index-exact-no-inventory": [index], "inventory-only": [inventory] }[scaffold];
  for (const target of written) hf9Put(root, target.path, target.bytes);
  if (receipt) hf9Put(root, "architecture/design-materialization.json", "{}\n");
  return { root, planPath: HF9_PLAN, prdSha: hf9Sha(prd) };
}

test("hotfix 9: a brownfield repository (no greenfield scaffold) with a valid approval needs no design block at implementation entry", async () => {
  const { stage, mod } = await hf9Load();
  for (const block of [false, true]) {
    const fixture = hf9Fixture(stage, { block, scaffold: "none" });
    // pre-hotfix, without a block: { ok: false, code: "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED" }
    assert.deepEqual(mod.inspectArchitectureDesign(fixture.root, HF9_PLAN, {}), HF9_NOT_REQUIRED, `block=${block}`);
  }
});

test("hotfix 9: the not-required branch never bypasses an earlier lifecycle, authority or continuity check", async () => {
  const { stage, controls, mod } = await hf9Load();
  const fixture = hf9Fixture(stage, { scaffold: "none" });
  assert.deepEqual(mod.inspectArchitectureDesign(fixture.root, null, {}), HF9_NOT_REQUIRED, "positive control");
  controls.lifecycle = { ok: false, code: "TEST-LIFECYCLE" };
  try { assert.equal(mod.inspectArchitectureDesign(fixture.root, null, {}).code, "ARCHITECTURE-DESIGN-APPROVAL-STALE"); }
  finally { controls.lifecycle = { ok: true, status: "approved" }; }
  controls.authorityOk = false;
  try { assert.equal(mod.inspectArchitectureDesign(fixture.root, null, {}).code, "DWP-FINAL-APPROVAL-STATE"); }
  finally { controls.authorityOk = true; }
  const stale = hf9Fixture(stage, { scaffold: "none", staleContinuity: true });
  assert.equal(mod.inspectArchitectureDesign(stale.root, null, {}).code, "ARCHITECTURE-DESIGN-CONTINUITY-STALE");
  assert.deepEqual(mod.inspectArchitectureDesign(fixture.root, null, {}), HF9_NOT_REQUIRED, "positive control again");
});

test("hotfix 9: greenfield stays strict (byte-exact fresh scaffold still requires the design block) and a receipt is never exempted", async () => {
  const { stage, mod } = await hf9Load();
  const missing = mod.inspectArchitectureDesign(hf9Fixture(stage, { block: false, scaffold: "exact" }).root, HF9_PLAN, {});
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "design-required");
  assert.equal(missing.code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
  assert.equal(missing.prdPath, HF9_PLAN);
  const valid = mod.inspectArchitectureDesign(hf9Fixture(stage, { block: true, scaffold: "exact" }).root, HF9_PLAN, {});
  assert.equal(valid.ok, true);
  assert.equal(valid.status, "materialization-required");
  const noBlockWithReceipt = mod.inspectArchitectureDesign(hf9Fixture(stage, { block: false, scaffold: "none", receipt: true }).root, HF9_PLAN, {});
  assert.equal(noBlockWithReceipt.code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED", "a materialization receipt disables the exemption");
  const blockWithReceipt = mod.inspectArchitectureDesign(hf9Fixture(stage, { block: true, scaffold: "none", receipt: true }).root, HF9_PLAN, {});
  assert.equal(blockWithReceipt.code, "ARCHITECTURE-DESIGN-RECEIPT-STALE");
});

test("hotfix 9: implementation entry applies the same applicability predicate as the draft inspector (edited scaffold exempt, partial scaffold fails closed)", async () => {
  const { stage, mod } = await hf9Load();
  for (const scaffold of ["both-edited", "index-only-edited"]) {
    const fixture = hf9Fixture(stage, { scaffold });
    assert.deepEqual(mod.inspectArchitectureDesign(fixture.root, HF9_PLAN, {}), HF9_NOT_REQUIRED, scaffold);
    assert.deepEqual(mod.inspectArchitectureDesignDraft({ rootDir: fixture.root, planPath: fixture.planPath, expectedPlanSha256: fixture.prdSha }), { ok: true, required: false }, scaffold);
  }
  for (const scaffold of ["index-exact-no-inventory", "inventory-only"]) {
    const fixture = hf9Fixture(stage, { scaffold });
    const entry = mod.inspectArchitectureDesign(fixture.root, HF9_PLAN, {});
    const draft = mod.inspectArchitectureDesignDraft({ rootDir: fixture.root, planPath: fixture.planPath, expectedPlanSha256: fixture.prdSha });
    assert.equal(entry.ok, false, scaffold);
    assert.match(entry.code, /ENOENT/u, scaffold);
    assert.equal(entry.code, draft.code, scaffold);
  }
});

test("hotfix 9: materializeArchitectureDesign returns the not-required result unchanged and writes nothing for a brownfield repository", async () => {
  const { stage, mod } = await hf9Load();
  const fixture = hf9Fixture(stage, { scaffold: "none" });
  const lockPath = join(fixture.root, "project", "pipeline-state.json.lock");
  writeFileSync(lockPath, JSON.stringify({ schema: "pipeline.continuity-lock.v0", token: "token-1", ownerNonce: "nonce-1" }));
  const before = snapshot(fixture.root);
  const result = mod.materializeArchitectureDesign(fixture.root, { lock: { ok: true, path: lockPath, token: "token-1", ownerNonce: "nonce-1" } });
  assert.deepEqual(result, HF9_NOT_REQUIRED);
  assert.deepEqual(snapshot(fixture.root), before);
});

// --- C18-12 (AC-241): the scope-mismatch refusal names the required paths the approved scope does not cover ---
test("C18-12: ARCHITECTURE-DESIGN-SCOPE-MISMATCH names each uncovered required path; code and condition are unchanged", async () => {
  const { stage, mod } = await hf9Load();
  const narrow = hf9Design();
  narrow.disposition.scope = ["src/", "tests/", "docs/contract.md", "specs/"];
  const refused = mod.inspectArchitectureDesign(hf9Fixture(stage, { block: true, scaffold: "exact", designInput: narrow }).root, HF9_PLAN, {});
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "ARCHITECTURE-DESIGN-SCOPE-MISMATCH");
  assert.equal(refused.field, "disposition.scope");
  for (const path of ["architecture/map/index.md", "architecture/fitness-model.json", "architecture/baseline.json"]) assert.match(refused.expected, new RegExp(path.replace(/\./gu, "\\.")), path);
  assert.doesNotMatch(refused.expected, /specs\/f\/prd\.md/u, "a covered path is not named");
  assert.doesNotMatch(refused.expected, /src\/application\.mjs/u, "a covered implementation-surface path is not named");

  const surface = hf9Design();
  surface.disposition.scope = ["tests/", "docs/contract.md", "architecture/", "specs/"];
  const bySurface = mod.inspectArchitectureDesign(hf9Fixture(stage, { block: true, scaffold: "exact", designInput: surface }).root, HF9_PLAN, {});
  assert.equal(bySurface.code, "ARCHITECTURE-DESIGN-SCOPE-MISMATCH");
  assert.match(bySurface.expected, /src\/application\.mjs/u);

  const byTask = mod.inspectArchitectureDesign(hf9Fixture(stage, { block: true, scaffold: "exact" }).root, "other/task.md", {});
  assert.equal(byTask.code, "ARCHITECTURE-DESIGN-SCOPE-MISMATCH");
  assert.match(byTask.expected, /other\/task\.md/u);

  const ok = mod.inspectArchitectureDesign(hf9Fixture(stage, { block: true, scaffold: "exact" }).root, HF9_PLAN, {});
  assert.equal(ok.status, "materialization-required", "a fully covering scope still passes");
});

// --- C18-12 follow-up (candidate 19): the same rule runs on the draft, before the PO is asked to sign ---
test("C18-12 follow-up: the draft inspection refuses a scope that misses required paths, with the same detail, before any signature", async () => {
  const { stage, mod } = await hf9Load();
  const narrow = hf9Design();
  narrow.disposition.scope = ["src/", "tests/", "docs/contract.md", "specs/"];
  const fixture = hf9Fixture(stage, { block: true, scaffold: "exact", designInput: narrow });
  const draft = mod.inspectArchitectureDesignDraft({ rootDir: fixture.root, planPath: fixture.planPath, expectedPlanSha256: fixture.prdSha });
  assert.equal(draft.ok, false);
  assert.equal(draft.required, true);
  assert.equal(draft.code, "ARCHITECTURE-DESIGN-SCOPE-MISMATCH");
  assert.equal(draft.field, "disposition.scope");
  for (const path of ["architecture/map/index.md", "architecture/fitness-model.json", "architecture/baseline.json"]) assert.match(draft.expected, new RegExp(path.replace(/\./gu, "\\.")), path);
  assert.doesNotMatch(draft.expected, /src\/application\.mjs/u, "a covered implementation-surface path is not named");

  const good = hf9Fixture(stage, { block: true, scaffold: "exact" });
  const accepted = mod.inspectArchitectureDesignDraft({ rootDir: good.root, planPath: good.planPath, expectedPlanSha256: good.prdSha });
  assert.equal(accepted.ok, true, "a fully covering scope still passes the draft");
  assert.equal(accepted.required, true);
});

// --- W7: a module declared kind "documentation" with only non-executable owned paths needs no verification entry point (D9) ---
import { loadMapBundle } from "../scripts/module-inventory.mjs";
function docDesign(ownedPaths = ["docs/guide/**", "README.md"]) {
  const input = design();
  input.modules = [{ id: "handbook", kind: "documentation", responsibility: "Written guidance", nonResponsibilities: ["Code"],
    ownedPaths, publicContracts: ["docs/guide/index.md"], allowedDependencies: [], authorityEffects: [],
    verificationEntryPoints: [], adrReferences: [] }];
  input.implementationSurface = ["docs/guide/index.md"];
  input.disposition.scope = ["docs/", "README.md", "architecture/", "specs/"];
  delete input.fitnessModel.modules;
  return input;
}
test("W7 documentation module: empty entry points and docs paths are valid in the design and clean in class 6", () => {
  const parsed = parseArchitectureDesign(prd(docDesign()));
  assert.equal(parsed.fitnessModel.modules[0].kind, "documentation");
  assert.deepEqual(parsed.fitnessModel.modules[0].verificationEntryPoints, []);
  const root = mkdtempSync(join(tmpdir(), "architecture-doc-module-"));
  try {
    for (const target of architectureDesignTargets(parsed).filter((row) => row.path.startsWith("architecture/map/"))) {
      mkdirSync(join(root, "architecture/map"), { recursive: true });
      writeFileSync(join(root, target.path), target.bytes);
    }
    mkdirSync(join(root, "docs/guide"), { recursive: true });
    writeFileSync(join(root, "docs/guide/index.md"), "# Guide\n");
    writeFileSync(join(root, "README.md"), "# Readme\n");
    // The rendered concept file carries the declaration and validates against the schema (kind is optional, enum documentation).
    const concept = readFileSync(join(root, "architecture/map/handbook.md"), "utf8");
    assert.match(concept, /^kind: "documentation"$/mu);
    const bundle = loadMapBundle(root);
    assert.deepEqual(bundle.errors, []);
    assert.ok(bundle.modules.some((module) => module.id === "handbook"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("W7 documentation module: an executable owned path is refused with the typed code naming the path", () => {
  for (const [paths, field] of [[["src/**"], "modules[0].ownedPaths[0]"], [["docs/**", "scripts/run.mjs"], "modules[0].ownedPaths[1]"],
    [["docs/**", "tests/a.mjs"], "modules[0].ownedPaths[1]"]]) {
    assert.throws(() => parseArchitectureDesign(prd(docDesign(paths))), error =>
      error.message === "ARCHITECTURE-DESIGN-DOC-MODULE-INVALID" && error.field === field && typeof error.expected === "string");
  }
  for (const [ok, surface] of [[["docs/**"], "docs/x.md"], [["notes/a.txt", "x/b.rst", "c.adoc", "d.mdx"], "notes/a.txt"]]) {
    assert.doesNotThrow(() => parseArchitectureDesign(prd({ ...docDesign(ok), implementationSurface: [surface] })));
  }
});
test("W7 documentation module: without the declaration an empty entry point list stays refused, and an unknown kind is refused", () => {
  const plain = docDesign(); delete plain.modules[0].kind;
  assert.throws(() => parseArchitectureDesign(prd(plain)), error => error.message === "ARCHITECTURE-DESIGN-MODULE-INVALID");
  const odd = docDesign(); odd.modules[0].kind = "other";
  assert.throws(() => parseArchitectureDesign(prd(odd)), error => error.message === "ARCHITECTURE-DESIGN-MODULE-INVALID");
});
test("live greenfield: one refusal names every invalid module and every reason, each with its repair", () => {
  const input = docDesign(); delete input.modules[0].kind;
  input.modules.push({ ...input.modules[0], id: "Bad_Id", responsibility: "  ", kind: "documentation" });
  input.modules.push({ ...input.modules[0], id: input.modules[0].id, verificationEntryPoints: ["tests/a.test.mjs"] });
  assert.throws(() => parseArchitectureDesign(prd(input)), error => {
    assert.equal(error.message, "ARCHITECTURE-DESIGN-MODULE-INVALID");
    assert.equal(error.field, "modules[0]");
    assert.match(error.expected, /modules\[0\] \([^)]*\): verificationEntryPoints is empty, name at least one test file/u);
    assert.match(error.expected, /modules\[1\] \(Bad_Id\): id must be lowercase[^|]*responsibility is empty/u);
    assert.match(error.expected, /modules\[2\] \([^)]*\): this id is used by an earlier module/u);
    return true;
  });
});
test("W7 documentation module: kind absent leaves the derived rows byte-identical, and an explicit row must match kind", () => {
  const input = design(); delete input.fitnessModel.modules;
  const rows = parseArchitectureDesign(prd(input)).fitnessModel.modules;
  assert.equal(Object.hasOwn(rows[0], "kind"), false);
  assert.equal(JSON.stringify(rows), JSON.stringify([{ id: "application", ownedPaths: ["src/**", "tests/**", "docs/contract.md"],
    allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/application.test.mjs"] }]));
  const doc = docDesign();
  const derived = parseArchitectureDesign(prd(doc)).fitnessModel.modules;
  doc.fitnessModel.modules = structuredClone(derived);
  assert.doesNotThrow(() => parseArchitectureDesign(prd(doc)));
  delete doc.fitnessModel.modules[0].kind;
  assert.throws(() => parseArchitectureDesign(prd(doc)), error => error.message === "ARCHITECTURE-DESIGN-FITNESS-MISMATCH");
});

// ---------- C19-F1: a closed predecessor's receipt is accepted for the next feature when the design and every target digest are equal ----------
function f1Fixture(stage, { closed = true, edit = receipt => receipt, rawReceipt = null, driftTarget = false } = {}) {
  const fixture = hf9Fixture(stage, { block: true, scaffold: "none", receipt: true });
  const input = parseArchitectureDesign(readFileSync(join(fixture.root, HF9_PLAN), "utf8"));
  const targets = architectureDesignTargets(input);
  for (const target of targets) hf9Put(fixture.root, target.path, driftTarget ? `${target.bytes}\ndrift\n` : target.bytes);
  const base = { schema: "pipeline.architecture-design-materialization.v1", featureId: "feat-0", planPath: "specs/old/prd.md",
    planSha256: "a".repeat(64), specSha256: "b".repeat(64), designSha256: hf9Sha(`${JSON.stringify(input, null, 2)}\n`),
    targets: targets.map(target => ({ path: target.path, sha256: hf9Sha(target.bytes) })) };
  hf9Put(fixture.root, "architecture/design-materialization.json", rawReceipt ?? `${JSON.stringify(edit(base, fixture), null, 2)}\n`);
  const statePath = join(fixture.root, "project/pipeline-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.closedFeatures = closed ? [{ id: "feat-0", planPath: "specs/old/prd.md", closedAt: "2026-01-01T00:00:00.000Z", forCommit: null }] : [];
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  return { ...fixture, base };
}

test("C19-F1: a closed predecessor's receipt with an equal design and equal target digests is accepted and names the predecessor", async () => {
  const { stage, mod } = await hf9Load();
  const fixture = f1Fixture(stage);
  const result = mod.inspectArchitectureDesign(fixture.root, null, {});
  assert.equal(result.ok, true, result.code);
  assert.equal(result.status, "materialized");
  assert.deepEqual(result.inheritedFrom, { featureId: "feat-0", planPath: "specs/old/prd.md", designSha256: fixture.base.designSha256 });
  assert.equal(result.receipt.featureId, HF9_FEATURE, "the returned receipt stays the one for the current feature");
  assert.equal(JSON.parse(readFileSync(join(fixture.root, "architecture/design-materialization.json"), "utf8")).featureId, "feat-0", "nothing is rewritten");
});

test("C19-F1: an open or unknown predecessor, a different design or any target digest difference, or an unparseable receipt keeps ARCHITECTURE-DESIGN-RECEIPT-STALE", async () => {
  const { stage, mod } = await hf9Load();
  const stale = (options, label) => assert.equal(mod.inspectArchitectureDesign(f1Fixture(stage, options).root, null, {}).code, "ARCHITECTURE-DESIGN-RECEIPT-STALE", label);
  stale({ closed: false }, "predecessor not closed");
  stale({ edit: r => ({ ...r, targets: [{ ...r.targets[0], sha256: "c".repeat(64) }, ...r.targets.slice(1)] }) }, "one target digest differs");
  stale({ edit: r => ({ ...r, designSha256: "d".repeat(64) }) }, "design digest differs");
  stale({ edit: r => ({ ...r, schema: "pipeline.other.v1" }) }, "schema differs");
  stale({ edit: r => ({ ...r, featureId: HF9_FEATURE }) }, "the active feature's own receipt must be byte-equal");
  stale({ rawReceipt: "{not json" }, "not valid JSON");
});

test("C19-F1: an accepted predecessor receipt does not relax the target drift check, and the exact receipt of the active feature has no inheritedFrom", async () => {
  const { stage, mod } = await hf9Load();
  assert.equal(mod.inspectArchitectureDesign(f1Fixture(stage, { driftTarget: true }).root, null, {}).code, "ARCHITECTURE-DESIGN-ARTIFACT-DRIFT");
  const fixture = f1Fixture(stage, { edit: (r, f) => ({ ...r, featureId: HF9_FEATURE, planPath: HF9_PLAN, planSha256: f.prdSha, specSha256: hf9Sha(HF9_SPEC_TEXT) }) });
  const exact = mod.inspectArchitectureDesign(fixture.root, null, {});
  assert.equal(exact.status, "materialized");
  assert.equal(Object.hasOwn(exact, "inheritedFrom"), false);
});

// Live on native Windows, 2026-11-10: after a reopened design got its new signature, the first materialization's receipt could only be answered with another reopen.
test("a reopened and newly approved design refreshes its own receipt over the recorded bytes, and nothing else does", async () => {
  const { stage, mod } = await hf9Load();
  const own = (r, f) => ({ ...r, featureId: HF9_FEATURE, planPath: HF9_PLAN, planSha256: "a".repeat(64), specSha256: hf9Sha(HF9_SPEC_TEXT) });
  const fixture = f1Fixture(stage, { edit: own });
  const result = mod.inspectArchitectureDesign(fixture.root, null, {});
  assert.equal(result.status, "materialization-required", result.code);
  assert.ok(result.targets.every(target => /^[0-9a-f]{64}$/u.test(target.preimageSha256)), "every existing target is bound to its recorded bytes");
  assert.equal(result.receiptPreimageSha256, hf9Sha(readFileSync(join(fixture.root, "architecture/design-materialization.json"), "utf8")));
  const lockPath = join(fixture.root, "project", "pipeline-state.json.lock");
  writeFileSync(lockPath, JSON.stringify({ schema: "pipeline.continuity-lock.v0", token: "token-1", ownerNonce: "nonce-1" }));
  const published = mod.materializeArchitectureDesign(fixture.root, { lock: { ok: true, path: lockPath, token: "token-1", ownerNonce: "nonce-1" } });
  assert.equal(published.status, "materialized", published.code);
  assert.equal(JSON.parse(readFileSync(join(fixture.root, "architecture/design-materialization.json"), "utf8")).planSha256, fixture.prdSha, "the receipt now names the newly approved plan");
  assert.equal(mod.inspectArchitectureDesign(fixture.root, null, {}).status, "materialized", "the refresh is settled, not repeated");

  assert.equal(mod.inspectArchitectureDesign(f1Fixture(stage, { edit: own, driftTarget: true }).root, null, {}).code, "ARCHITECTURE-DESIGN-ARTIFACT-DRIFT", "a hand-edited target is not silently replaced");
  const unchangedSources = (r, f) => ({ ...own(r, f), planSha256: f.prdSha, designSha256: "d".repeat(64) });
  assert.equal(mod.inspectArchitectureDesign(f1Fixture(stage, { edit: unchangedSources }).root, null, {}).code, "ARCHITECTURE-DESIGN-RECEIPT-STALE", "with unchanged plan and Spec a differing receipt was edited");

  const orphan = "architecture/map/removed-module.md";
  const withOrphan = f1Fixture(stage, { edit: (r, f) => ({ ...own(r, f), targets: [...r.targets, { path: orphan, sha256: "e".repeat(64) }] }) });
  hf9Put(withOrphan.root, orphan, "old module\n");
  const refused = mod.inspectArchitectureDesign(withOrphan.root, null, {});
  assert.equal(refused.code, "ARCHITECTURE-DESIGN-TARGET-REMOVED");
  assert.deepEqual(refused.rejectedValue, [orphan], "the refusal names the file the new design dropped");
  unlinkSync(join(withOrphan.root, orphan));
  assert.equal(mod.inspectArchitectureDesign(withOrphan.root, null, {}).status, "materialization-required", "once the file is gone the refresh proceeds");
});

// K-13 (PO tile 2026-11-11): a follow-up epic adds modules to the design a closed epic materialized. Only an addition is accepted; the closed predecessor's plan must still be the one
// its receipt names, every predecessor module must be in the new design (unchanged but for growth, see the test below), and each recorded target must still hold its recorded bytes.
const k13Module = (id, over = {}) => ({ id, responsibility: `the ${id} module`, nonResponsibilities: ["Network"], ownedPaths: [`src/${id}.mjs`], publicContracts: [`src/${id}.mjs`],
  allowedDependencies: [], authorityEffects: [], verificationEntryPoints: [`tests/${id}.test.mjs`], adrReferences: [], ...over });
function k13Design(modules) {
  const base = hf9Design(); const { modules: _omitted, ...fitnessModel } = base.fitnessModel;
  return { ...base, modules, implementationSurface: modules.map((module) => module.ownedPaths[0]), fitnessModel };
}
function k13Fixture(stage, { closed = true, discarded = false, current = [k13Module("engine"), k13Module("shell")], earlier = [k13Module("engine")], editPlan = false, driftTarget = false } = {}) {
  const fixture = hf9Fixture(stage, { block: true, scaffold: "none", receipt: true, designInput: k13Design(current) });
  const oldPrd = `# Design\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(k13Design(earlier))}\n\`\`\`\n`;
  hf9Put(fixture.root, "specs/old/prd.md", editPlan ? `${oldPrd}\nedited after the close\n` : oldPrd);
  const oldInput = parseArchitectureDesign(oldPrd); const oldTargets = architectureDesignTargets(oldInput);
  for (const target of oldTargets) hf9Put(fixture.root, target.path, driftTarget ? `${target.bytes}\ndrift\n` : target.bytes);
  const receipt = { schema: "pipeline.architecture-design-materialization.v1", featureId: "feat-0", planPath: "specs/old/prd.md", planSha256: hf9Sha(oldPrd), specSha256: "b".repeat(64),
    designSha256: hf9Sha(`${JSON.stringify(oldInput, null, 2)}\n`), targets: oldTargets.map((target) => ({ path: target.path, sha256: hf9Sha(target.bytes) })) };
  hf9Put(fixture.root, "architecture/design-materialization.json", `${JSON.stringify(receipt, null, 2)}\n`);
  const statePath = join(fixture.root, "project/pipeline-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.closedFeatures = closed ? [{ id: "feat-0", planPath: "specs/old/prd.md", closedAt: "2026-01-01T00:00:00.000Z", forCommit: null }] : [];
  // discard-feature writes the feature to discardedFeatures (never to closedFeatures) with these fields.
  if (discarded) state.discardedFeatures = [{ id: "feat-0", planPath: "specs/old/prd.md", phaseAtDiscard: "implementation", discardedAt: "2026-01-01T00:00:00.000Z", discardedBy: "the PO", reason: "damaged Critic course", forCommit: null }];
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  return { ...fixture, receipt };
}

test("K-13: a follow-up design that only adds a module extends the closed predecessor's materialization over the recorded bytes and publishes", async () => {
  const { stage, mod } = await hf9Load();
  const fixture = k13Fixture(stage);
  const result = mod.inspectArchitectureDesign(fixture.root, null, {});
  assert.equal(result.status, "materialization-required", result.code);
  assert.deepEqual(result.extendsClosedFeature, { featureId: "feat-0", planPath: "specs/old/prd.md", designSha256: fixture.receipt.designSha256 });
  const recorded = new Set(fixture.receipt.targets.map((target) => target.path));
  assert.ok(result.targets.filter((target) => recorded.has(target.path)).every((target) => /^[0-9a-f]{64}$/u.test(target.preimageSha256)), "every recorded target is bound to its recorded bytes");
  const added = result.targets.filter((target) => !recorded.has(target.path));
  assert.ok(added.some((target) => target.path === "architecture/map/shell.md") && added.every((target) => target.preimageSha256 === undefined), "the new module's file is a creation, not a replacement");
  assert.equal(result.receiptPreimageSha256, hf9Sha(readFileSync(join(fixture.root, "architecture/design-materialization.json"), "utf8")));
  const lockPath = join(fixture.root, "project", "pipeline-state.json.lock");
  writeFileSync(lockPath, JSON.stringify({ schema: "pipeline.continuity-lock.v0", token: "token-1", ownerNonce: "nonce-1" }));
  const published = mod.materializeArchitectureDesign(fixture.root, { lock: { ok: true, path: lockPath, token: "token-1", ownerNonce: "nonce-1" } });
  assert.equal(published.status, "materialized", published.code);
  const stored = JSON.parse(readFileSync(join(fixture.root, "architecture/design-materialization.json"), "utf8"));
  assert.equal(stored.featureId, HF9_FEATURE, "the receipt now names the follow-up feature");
  assert.equal(mod.inspectArchitectureDesign(fixture.root, null, {}).status, "materialized", "the extension is settled, not repeated");
});

test("K-13: removing or changing a predecessor module, an open predecessor, an edited predecessor plan or a drifted target keeps the refusal", async () => {
  const { stage, mod } = await hf9Load();
  const refused = (options, label, code = "ARCHITECTURE-DESIGN-RECEIPT-STALE") => assert.equal(mod.inspectArchitectureDesign(k13Fixture(stage, options).root, null, {}).code, code, label);
  refused({ current: [k13Module("shell")] }, "the predecessor module is gone");
  refused({ current: [k13Module("engine", { responsibility: "another job" }), k13Module("shell")] }, "the predecessor module changed");
  refused({ closed: false }, "the predecessor is not closed");
  refused({ editPlan: true }, "the predecessor's plan is not the one its receipt names");
  refused({ driftTarget: true }, "a recorded target no longer holds its recorded bytes", "ARCHITECTURE-DESIGN-ARTIFACT-DRIFT");
});

// C30d (Codex greenfield, 2026-11-16): the recovery of a damaged Critic course is the PO's discard and a successor feature with its own signed plan. The receipt the discarded feature left
// is bound to its id and plan path, and the discard writes discardedFeatures, so neither the refresh of the same feature nor the inheritance of a closed one applied: the successor was
// stuck on ARCHITECTURE-DESIGN-RECEIPT-STALE although its design was signed and verified. The whole sequence: materialized design, discard, successor, signed plan, materialization, entry.
test("C30d: the successor of a DISCARDED feature materializes its signed design over the recorded bytes, including a changed ownership, and the receipt then names the successor", async () => {
  const { stage, mod } = await hf9Load();
  const widened = [k13Module("engine", { ownedPaths: ["src/engine.mjs", "src/more.mjs"] }), k13Module("shell")];
  const fixture = k13Fixture(stage, { closed: false, discarded: true, current: widened });
  const result = mod.inspectArchitectureDesign(fixture.root, null, {});
  assert.equal(result.status, "materialization-required", result.code);
  assert.deepEqual(result.supersedesDiscardedFeature, { featureId: "feat-0", planPath: "specs/old/prd.md", designSha256: fixture.receipt.designSha256 });
  assert.equal(Object.hasOwn(result, "extendsClosedFeature"), false, "a discard is not a close");
  const recorded = new Set(fixture.receipt.targets.map((target) => target.path));
  assert.ok(result.targets.filter((target) => recorded.has(target.path)).every((target) => /^[0-9a-f]{64}$/u.test(target.preimageSha256)), "every recorded target is replaced only over its recorded bytes");
  assert.equal(result.receiptPreimageSha256, hf9Sha(readFileSync(join(fixture.root, "architecture/design-materialization.json"), "utf8")));
  const lockPath = join(fixture.root, "project", "pipeline-state.json.lock");
  writeFileSync(lockPath, JSON.stringify({ schema: "pipeline.continuity-lock.v0", token: "token-1", ownerNonce: "nonce-1" }));
  const published = mod.materializeArchitectureDesign(fixture.root, { lock: { ok: true, path: lockPath, token: "token-1", ownerNonce: "nonce-1" } });
  assert.equal(published.status, "materialized", published.code);
  assert.equal(JSON.parse(readFileSync(join(fixture.root, "architecture/design-materialization.json"), "utf8")).featureId, HF9_FEATURE, "the receipt now names the successor");
  const settled = mod.inspectArchitectureDesign(fixture.root, null, {});
  assert.equal(settled.status, "materialized", "the recovery is settled, not repeated");
  assert.equal(Object.hasOwn(settled, "supersedesDiscardedFeature"), false);
});

test("C30d: a discarded predecessor with the equal design is inherited like a closed one", async () => {
  const { stage, mod } = await hf9Load();
  const result = mod.inspectArchitectureDesign(k13Fixture(stage, { closed: false, discarded: true, current: [k13Module("engine")] }).root, null, {});
  assert.equal(result.status, "materialized", result.code);
  assert.equal(result.inheritedFrom.featureId, "feat-0");
});

test("C30d: independent drift, an edited predecessor plan, and a predecessor that is neither closed nor discarded stay refused", async () => {
  const { stage, mod } = await hf9Load();
  const widened = [k13Module("engine", { ownedPaths: ["src/engine.mjs", "src/more.mjs"] }), k13Module("shell")];
  const refused = (options, label, code = "ARCHITECTURE-DESIGN-RECEIPT-STALE") => assert.equal(mod.inspectArchitectureDesign(k13Fixture(stage, { closed: false, current: widened, ...options }).root, null, {}).code, code, label);
  refused({ discarded: true, driftTarget: true }, "a recorded target no longer holds its recorded bytes", "ARCHITECTURE-DESIGN-ARTIFACT-DRIFT");
  refused({ discarded: true, editPlan: true }, "the discarded predecessor's plan is not the one its receipt names");
  refused({ discarded: false }, "an open predecessor (in neither list) is no lineage");
  // the receipt of a discarded feature on the closed route still needs the additive rule: a closed predecessor does not gain the ownership change
  refused({ closed: true }, "a CLOSED predecessor may still only be extended additively");
  // a dropped module whose file still exists is named, not silently kept
  const dropped = mod.inspectArchitectureDesign(k13Fixture(stage, { closed: false, discarded: true, current: [k13Module("shell")] }).root, null, {});
  assert.equal(dropped.code, "ARCHITECTURE-DESIGN-TARGET-REMOVED");
});

// Consumer finding on the first build (2026-11-11): a module that owns the pages must gain a dependency on every new module, so a predecessor module may GROW in exactly three lists.
test("K-13: a predecessor module may grow its dependencies, contracts and test entry points, nothing else, and growth never closes a loop", async () => {
  const { stage, mod } = await hf9Load();
  const status = (options) => mod.inspectArchitectureDesign(k13Fixture(stage, options).root, null, {});
  const grown = status({ current: [k13Module("engine", { allowedDependencies: ["shell"], publicContracts: ["src/engine.mjs", "src/engine-api.mjs"], verificationEntryPoints: ["tests/engine.test.mjs", "tests/engine-more.test.mjs"] }), k13Module("shell")] });
  assert.equal(grown.status, "materialization-required", grown.code);
  assert.equal(grown.extendsClosedFeature.featureId, "feat-0");
  const refused = (current, label) => assert.equal(status({ current }).code, "ARCHITECTURE-DESIGN-RECEIPT-STALE", label);
  refused([k13Module("engine", { ownedPaths: ["src/engine.mjs", "src/more.mjs"] }), k13Module("shell")], "a predecessor module may not take over more paths");
  refused([k13Module("engine", { authorityEffects: ["writes-files"] }), k13Module("shell")], "a predecessor module may not gain an authority effect");
  refused([k13Module("engine", { publicContracts: ["src/engine-api.mjs"] }), k13Module("shell")], "an earlier contract may not be dropped");
  refused([k13Module("engine", { verificationEntryPoints: ["tests/other.test.mjs"] }), k13Module("shell")], "an earlier test entry point may not be dropped");
  refused([k13Module("engine", { allowedDependencies: ["shell"] }), k13Module("shell", { allowedDependencies: ["engine"] })], "growth that closes a loop is refused");
  refused([k13Module("engine", { allowedDependencies: ["engine"] }), k13Module("shell")], "a module may not depend on itself");
});

// --- G20-65 (AC-108): a module that owns no admissible check is reported at design time, before the PO signs, with the move that repairs it ---
// Measured in the Claude greenfield on candidate 20c: the module user-guide owned two documents and its test belonged to module shell; the dispatch
// route refused every check only after the design was signed.
function g2065Design(over = {}) {
  const base = hf9Design();
  const module = (id, ownedPaths, verificationEntryPoints, extra = {}) => ({ id, responsibility: `the ${id} module`, nonResponsibilities: ["Network"], ownedPaths,
    publicContracts: [ownedPaths.find((path) => !path.includes("*"))], allowedDependencies: [], authorityEffects: [], verificationEntryPoints, adrReferences: [], ...extra });
  const modules = over.modules ?? [module("engine", ["src/engine.mjs"], ["tests/engine.test.mjs"]), module("shell", ["tests/**", "src/shell.mjs"], ["tests/shell.test.mjs"])];
  const { modules: _omitted, ...fitnessModel } = base.fitnessModel;
  return { ...base, modules, implementationSurface: over.implementationSurface ?? ["src/engine.mjs", "src/shell.mjs"], fitnessModel };
}

test("G20-65: the draft inspection reports a module whose only test is owned by another module, naming the module and the move, before any signature", async () => {
  const { stage, mod } = await hf9Load();
  const fixture = hf9Fixture(stage, { block: true, scaffold: "exact", designInput: g2065Design() });
  const draft = mod.inspectArchitectureDesignDraft({ rootDir: fixture.root, planPath: fixture.planPath, expectedPlanSha256: fixture.prdSha });
  assert.equal(draft.ok, false, JSON.stringify(draft));
  assert.equal(draft.required, true);
  assert.equal(draft.code, "ARCHITECTURE-DESIGN-MODULE-NO-CHECK");
  assert.equal(draft.field, "modules[0].verificationEntryPoints");
  assert.match(draft.expected, /engine/u);
  assert.match(draft.expected, /tests\/engine\.test\.mjs/u, "the test that module shell owns is named");
  assert.match(draft.expected, /move|own/u);
  assert.match(draft.expected, /documentation/u, "the documentation-only alternative is named");
  assert.equal(draft.rejectedValue, "engine");
});

test("G20-65: a module is admissible by an own test, an unowned test, an owned directory, documentation only, or a registered command", async () => {
  const { stage, mod } = await hf9Load();
  const module = (id, ownedPaths, verificationEntryPoints, extra = {}) => ({ id, responsibility: `the ${id} module`, nonResponsibilities: [], ownedPaths, publicContracts: [ownedPaths[0]],
    allowedDependencies: [], authorityEffects: [], verificationEntryPoints, adrReferences: [], ...extra });
  const none = (modules, options) => mod.modulesWithoutAdmissibleCheck(modules, options).map((entry) => entry.id);
  assert.deepEqual(none([module("a", ["src/a.mjs", "tests/a.test.mjs"], ["tests/a.test.mjs"])]), [], "an owned test file");
  assert.deepEqual(none([module("a", ["src/a.mjs"], ["tests/a.test.mjs"])]), [], "a test no module owns can be created by the dispatch (not a crossing)");
  assert.deepEqual(none([module("a", ["src/a/**"], [])]), [], "an owned directory can hold the module's own test");
  assert.deepEqual(none([module("guide", ["app/GUIDE.txt", "docs/manual-checklist.md"], [], { kind: "documentation" })]), [], "documentation only");
  assert.deepEqual(none([module("guide", ["app/GUIDE.txt"], ["tests/guide.test.mjs"]), module("shell", ["tests/**"], ["tests/shell.test.mjs"])]), [], "documentation-only is judged by the owned paths, not by the declared kind or by the test of another module");
  assert.deepEqual(none([module("mixed", ["src/a.mjs", "docs/a.md"], ["tests/a.test.mjs"]), module("shell", ["tests/**"], ["tests/shell.test.mjs"])]), ["mixed"], "one code path makes the module a code module");
  assert.deepEqual(none([module("a", ["src/a.mjs"], ["tests/a.test.mjs"]), module("shell", ["tests/**"], ["tests/s.test.mjs"])]), ["a"]);
  assert.deepEqual(none([module("a", ["src/a.mjs"], ["tests/a.test.mjs"]), module("shell", ["tests/**"], ["tests/s.test.mjs"])], { registeredCommands: true }), [], "a registered verifyImpact command is an admissible check for every module");
  assert.deepEqual(none([module("a", ["src/a.mjs"], ["src/a.mjs"]), module("b", ["src/b.mjs"], ["tests/b.test.mjs"])]), ["a"], "an entry point that is not a test file is no check");
});

test("G20-65: the document suffix set of the check validator equals the one of the design validator", async () => {
  const { mod } = await hf9Load();
  const { DOCUMENT_CHECK_FILE } = await import("./native-goldfish-host-return.mjs");
  assert.equal(DOCUMENT_CHECK_FILE.source, mod.DOCUMENT_OWNED_FILE.source, "the two copies of the document suffix set must not drift");
});
