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
  assert.deepEqual(targets.map(target => target.path), ["architecture/map/index.md", "architecture/map/application.md", "architecture/fitness-model.json", "architecture/baseline.json"]);
  assert.match(targets[1].bytes, /responsibility: "Local application"/u);
  assert.equal(targets.some(target => target.path.startsWith("src/")), false);
  const root = mkdtempSync(join(tmpdir(), "architecture-frontmatter-"));
  try {
    const file = join(root, "application.md");
    writeFileSync(file, targets[1].bytes);
    const loaded = loadConceptFile(file, moduleSchema);
    assert.equal(loaded.ok, true, JSON.stringify(loaded.errors));
    assert.equal(loaded.module.id, "application");
    assert.deepEqual(loaded.module.ownedPaths, input.modules[0].ownedPaths);
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
