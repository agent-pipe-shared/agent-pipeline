// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArchitectureDesign, architectureDesignTargets, materializeArchitectureDesign, publishArchitectureDesignTargets } from "./architecture-design.mjs";
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
  const root = mkdtempSync(join(tmpdir(), "architecture-transaction-"));
  try {
    mkdirSync(join(root, "architecture/map"), { recursive: true });
    mkdirSync(join(root, "project"));
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
  "stub-dwp.mjs": `export function readDesignWorkflowPackageFromRepository() { return { ok: false, code: "TEST-DWP-UNUSED" }; }\n`,
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

function hf9Fixture(stage, { block = false, scaffold = "none", receipt = false, staleContinuity = false } = {}) {
  const root = mkdtempSync(join(stage, "fx-"));
  const prd = block ? `# Design\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(hf9Design())}\n\`\`\`\n` : HF9_PRD_NO_BLOCK;
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
