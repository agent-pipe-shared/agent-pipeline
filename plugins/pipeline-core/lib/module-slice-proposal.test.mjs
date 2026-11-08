// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { deliversModuleSlice, moduleDispatchScope, readPrdModules } from "./module-dispatch-scope.mjs";
import { MODULE_SLICE_PROPOSAL_SCHEMA, proposeSlicesFromModules } from "./module-slice-proposal.mjs";
import { run as runProposal } from "../scripts/module-slice-proposal.mjs";
import { runCli } from "../scripts/slice-queue.mjs";
import { scopesOverlap } from "./slice-queue.mjs";

const roots = [];
test.after(() => { for (const dir of roots) rmSync(dir, { recursive: true, force: true }); });
const tempDir = () => { const dir = mkdtempSync(join(tmpdir(), "msp-")); roots.push(dir); return dir; };

const mod = (id, ownedPaths, allowedDependencies = []) => ({ id, ownedPaths, allowedDependencies });

test("MSP1: independent modules share wave 0, a dependent module follows the module it depends on", () => {
  const proposal = proposeSlicesFromModules([mod("api", ["src/api/**"], ["core"]), mod("core", ["src/core/**"]), mod("docs", ["docs/**"])]);
  assert.equal(proposal.ok, true);
  assert.equal(proposal.schema, MODULE_SLICE_PROPOSAL_SCHEMA);
  assert.deepEqual(proposal.waves, [["slice-core", "slice-docs"], ["slice-api"]]);
  const api = proposal.slices.find((slice) => slice.moduleId === "api");
  assert.deepEqual(api.dependsOn, ["slice-core"]);
  assert.deepEqual(api.writeScope, ["src/api/**"]);
  assert.deepEqual(proposal.serialized, []);
});

test("MSP2: a long chain gets one wave per link and a diamond joins after both branches", () => {
  const chain = proposeSlicesFromModules([mod("c", ["src/c/**"], ["b"]), mod("b", ["src/b/**"], ["a"]), mod("a", ["src/a/**"])]);
  assert.deepEqual(chain.waves, [["slice-a"], ["slice-b"], ["slice-c"]]);
  const diamond = proposeSlicesFromModules([mod("top", ["src/top/**"], ["left", "right"]), mod("left", ["src/left/**"], ["base"]), mod("right", ["src/right/**"], ["base"]), mod("base", ["src/base/**"])]);
  assert.deepEqual(diamond.waves, [["slice-base"], ["slice-left", "slice-right"], ["slice-top"]]);
});

test("MSP3: modules with overlapping owned paths are serialized, unless the dependencies already order them", () => {
  const overlapping = proposeSlicesFromModules([mod("a", ["src/**"]), mod("b", ["src/b/**"]), mod("c", ["docs/**"])]);
  assert.equal(overlapping.ok, true);
  assert.deepEqual(overlapping.serialized, [{ after: "a", before: "b", reason: "owned paths overlap" }]);
  assert.deepEqual(overlapping.waves, [["slice-a", "slice-c"], ["slice-b"]]);
  const ordered = proposeSlicesFromModules([mod("a", ["src/**"]), mod("b", ["src/b/**"], ["a"])]);
  assert.deepEqual(ordered.serialized, [], "an existing dependency already orders the pair");
  // No slice of one wave may write a path another slice of the same wave writes.
  for (const proposal of [overlapping, ordered]) {
    for (const wave of proposal.waves) {
      const members = proposal.slices.filter((slice) => wave.includes(slice.id));
      for (let i = 0; i < members.length; i += 1) for (let j = i + 1; j < members.length; j += 1) assert.equal(scopesOverlap(members[i].writeScope, members[j].writeScope), false);
    }
  }
});

test("MSP4: a dependency cycle is refused with its members, and every invalid input is a typed refusal that never throws", () => {
  const cycle = proposeSlicesFromModules([mod("a", ["src/a/**"], ["b"]), mod("b", ["src/b/**"], ["c"]), mod("c", ["src/c/**"], ["a"]), mod("d", ["src/d/**"])]);
  assert.equal(cycle.ok, false);
  assert.equal(cycle.code, "MSP-CYCLE");
  assert.deepEqual(cycle.members, ["a", "b", "c"]);
  const invalid = [
    undefined, null, [], "x", [null], [{}], [mod("Bad_Id", ["src/**"])], [mod("a", [])], [mod("a", ["/abs/**"])], [mod("a", ["../up/**"])],
    [mod("a", ["src/{x,y}/**"])], [mod("a", ["src/a/**"]), mod("a", ["src/b/**"])], [mod("a", ["src/a/**"], ["ghost"])], [mod("a", ["src/a/**"], ["a"])],
    [{ id: "a", ownedPaths: ["src/**"], allowedDependencies: "b" }], Array.from({ length: 65 }, (_, index) => mod(`m${index}`, [`src/m${index}/**`])),
  ];
  for (const input of invalid) {
    const proposal = proposeSlicesFromModules(input);
    assert.equal(proposal.ok, false, JSON.stringify(input)?.slice(0, 60));
    assert.equal(proposal.code, "MSP-INPUT");
  }
});

test("MSP5: the printed add commands build a queue the queue library accepts, with the dependencies and scopes of the proposal", () => {
  const proposal = proposeSlicesFromModules([mod("api", ["src/api/**", "tests/api/**"], ["core"]), mod("core", ["src/core/**"]), mod("docs", ["docs/guide/**"])]);
  assert.deepEqual(proposal.warnings, []);
  const queue = join(tempDir(), "slice-queue.json");
  let first = true;
  for (const { argv } of proposal.addCommands) {
    const result = runCli([...argv, "--queue", queue, ...(first ? ["--init-feature", "demo"] : [])]);
    assert.equal(result.exit, 0, JSON.stringify(result.output));
    first = false;
  }
  const validated = runCli(["validate", "--queue", queue]);
  assert.equal(validated.exit, 0, JSON.stringify(validated.output));
  assert.equal(validated.output.slices, 3);
});

test("MSP5b: a module that owns a file only the Elephant writes is flagged before the queue refuses it", () => {
  const proposal = proposeSlicesFromModules([mod("docs", ["docs/**"]), mod("core", ["src/core/**"])]);
  assert.equal(proposal.ok, true);
  assert.deepEqual(proposal.warnings.map(({ code, sliceId, surface }) => ({ code, sliceId, surface })), [{ code: "MSP-SHARED-SURFACE", sliceId: "slice-docs", surface: "docs/state.md" }]);
  const refused = runCli([...proposal.addCommands.find((command) => command.sliceId === "slice-docs").argv, "--queue", join(tempDir(), "q.json"), "--init-feature", "demo"]);
  assert.equal(refused.exit, 3, "the queue library really refuses what the warning names");
  assert.equal(refused.output.code, "SQ-SHARED-SURFACE");
});

test("MSP6: the script reads the design of a PRD, proposes from its modules and refuses a missing, unsafe or invalid input", () => {
  const dir = tempDir();
  const design = {
    schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield",
    disposition: { decision: "approved-scoped", scope: ["specs/", "src/", "tests/", "architecture/"], rationale: "fixture" },
    modules: ["core", "api"].map((id) => ({
      id, responsibility: `the ${id} module`, nonResponsibilities: [], ownedPaths: [`src/${id}/**`], publicContracts: [`src/${id}/index.mjs`],
      allowedDependencies: id === "api" ? ["core"] : [], authorityEffects: [], verificationEntryPoints: [`tests/${id}.test.mjs`], adrReferences: [],
    })),
    implementationSurface: ["src/core/index.mjs", "src/api/index.mjs"],
    fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "fixture", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { minimumModuleFiles: 1 } },
  };
  mkdirSync(join(dir, "specs"), { recursive: true });
  writeFileSync(join(dir, "specs", "prd.md"), `# PRD\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(design, null, 2)}\n\`\`\`\n`);
  const ok = runProposal(["--prd", "specs/prd.md", "--root", dir]);
  assert.equal(ok.exit, 0, JSON.stringify(ok.output));
  assert.deepEqual(ok.output.waves, [["slice-core"], ["slice-api"]]);
  writeFileSync(join(dir, "specs", "no-design.md"), "# PRD without a design block\n");
  const missing = runProposal(["--prd", "specs/no-design.md", "--root", dir]);
  assert.equal(missing.exit, 3);
  assert.equal(missing.output.code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
  symlinkSync(join(dir, "specs", "prd.md"), join(dir, "specs", "link.md"));
  for (const argv of [[], ["--prd"], ["--prd", "specs/prd.md", "--prd", "specs/prd.md", "--root", dir], ["--prd", "../outside.md", "--root", dir], ["--prd", join(dir, "specs", "prd.md"), "--root", dir],
    ["--prd", "specs/absent.md", "--root", dir], ["--prd", "specs/link.md", "--root", dir], ["--other", "x"]]) {
    const refused = runProposal(argv);
    assert.equal(refused.exit, 2, JSON.stringify(argv));
    assert.equal(refused.output.code, "MSP-USAGE");
  }
});

// M1.4 enforcement (candidate 19): the briefing tool derives a dispatch's write scope from the same cut and refuses a scope that crosses it.
const SCOPE_MODULES = [mod("core", ["src/core/**"]), mod("api", ["src/api/**"], ["core"]), mod("docs", ["docs/guide/**"])];

function prdRoot() {
  const dir = tempDir();
  const design = {
    schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield",
    disposition: { decision: "approved-scoped", scope: ["specs/", "src/", "tests/", "architecture/"], rationale: "fixture" },
    modules: ["core", "api"].map((id) => ({
      id, responsibility: `the ${id} module`, nonResponsibilities: [], ownedPaths: [`src/${id}/**`], publicContracts: [`src/${id}/index.mjs`],
      allowedDependencies: id === "api" ? ["core"] : [], authorityEffects: [], verificationEntryPoints: [`tests/${id}.test.mjs`], adrReferences: [],
    })),
    implementationSurface: ["src/core/index.mjs", "src/api/index.mjs"],
    fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "fixture", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { minimumModuleFiles: 1 } },
  };
  mkdirSync(join(dir, "specs"), { recursive: true });
  writeFileSync(join(dir, "specs", "prd.md"), `# PRD\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(design, null, 2)}\n\`\`\`\n`);
  return dir;
}

test("MDS1: without paths the scope is the module's owned paths, exactly the write scope the proposal gives that module", () => {
  const derived = moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "core", integratedSliceIds: [] });
  assert.equal(derived.ok, true, JSON.stringify(derived));
  const proposed = proposeSlicesFromModules(SCOPE_MODULES).slices.find((slice) => slice.moduleId === "core");
  assert.deepEqual(derived.writeScope, proposed.writeScope);
  assert.equal(derived.sliceId, "slice-core");
  assert.equal(derived.wave, 0);
});

test("MDS2: a declared path owned by a different module is refused with the typed code, the owner and a repair", () => {
  const crossing = moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "core", paths: ["src/core/a.mjs", "src/api/handler.mjs"], integratedSliceIds: [] });
  assert.equal(crossing.ok, false);
  assert.equal(crossing.code, "DBG-MODULE-SCOPE-CROSSES");
  assert.match(crossing.message, /src\/api\/handler\.mjs/u);
  assert.match(crossing.message, /module api/u);
  assert.match(crossing.message, /repair:/u);
  const broad = moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "core", paths: ["src/**"], integratedSliceIds: [] });
  assert.equal(broad.code, "DBG-MODULE-SCOPE-CROSSES", "a glob that reaches into another module is a crossing too");
  const inside = moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "core", paths: ["src/core/a.mjs", "tests/core.test.mjs"], integratedSliceIds: [] });
  assert.equal(inside.ok, true, "a path inside the module and a path no module owns are not crossings");
  assert.deepEqual(inside.writeScope, ["src/core/a.mjs", "tests/core.test.mjs"]);
});

test("MDS3: a module whose dependency module has no accepted result is not runnable; the accepted result releases it", () => {
  const blocked = moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "api", integratedSliceIds: [] });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "DBG-MODULE-NOT-RUNNABLE");
  assert.match(blocked.message, /slice-core/u);
  assert.match(blocked.message, /repair:/u);
  assert.equal(moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "api", integratedSliceIds: ["slice-core"] }).ok, true);
  assert.equal(moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "docs", integratedSliceIds: [] }).ok, true, "a wave-0 module needs no result");
});

test("G20-59: a numbered further attempt delivers its module's slice; another module's slice id or a free id never does", () => {
  assert.equal(deliversModuleSlice("slice-core", "slice-core"), true);
  assert.equal(deliversModuleSlice("slice-core-r2", "slice-core"), true);
  assert.equal(deliversModuleSlice("slice-core-r12", "slice-core"), true);
  assert.equal(deliversModuleSlice("slice-core-r1", "slice-core"), false, "the first attempt is the plain id");
  assert.equal(deliversModuleSlice("slice-1a-core", "slice-core"), false);
  assert.equal(deliversModuleSlice("slice-core-x", "slice-core"), false);
  assert.equal(deliversModuleSlice("slice-core-r2", "slice-core", ["slice-core", "slice-core-r2"]), false,
    "a module whose own id looks like an attempt keeps its own slice");
  assert.equal(moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "api", integratedSliceIds: ["slice-core-r2"] }).ok, true);
  assert.equal(moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "api", integratedSliceIds: ["slice-1a-core"] }).code, "DBG-MODULE-NOT-RUNNABLE");
});

test("MDS4: an unknown module, an invalid cut and a malformed call are typed refusals that never throw", () => {
  assert.equal(moduleDispatchScope({ modules: SCOPE_MODULES, moduleId: "nope", integratedSliceIds: [] }).code, "DBG-MODULE-UNKNOWN");
  const cycle = [mod("a", ["src/a/**"], ["b"]), mod("b", ["src/b/**"], ["a"])];
  assert.equal(moduleDispatchScope({ modules: cycle, moduleId: "a", integratedSliceIds: [] }).code, "DBG-MODULE-CUT-INVALID");
  assert.equal(moduleDispatchScope({ modules: "nope", moduleId: "a" }).ok, false);
  assert.equal(moduleDispatchScope({}).ok, false);
});

test("MDS5: the proposal tool and the briefing reader agree on the cut and on the scope of every module of one PRD", () => {
  const dir = prdRoot();
  const read = readPrdModules(dir, "specs/prd.md");
  assert.equal(read.ok, true, JSON.stringify(read));
  const proposal = runProposal(["--prd", "specs/prd.md", "--root", dir]).output;
  for (const slice of proposal.slices) {
    const derived = moduleDispatchScope({ modules: read.modules, moduleId: slice.moduleId, integratedSliceIds: proposal.slices.map((entry) => entry.id) });
    assert.equal(derived.ok, true, JSON.stringify(derived));
    assert.deepEqual(derived.writeScope, slice.writeScope, `module ${slice.moduleId}`);
    assert.equal(derived.wave, slice.wave);
  }
  writeFileSync(join(dir, "specs", "no-design.md"), "# PRD without a design block\n");
  assert.equal(readPrdModules(dir, "specs/no-design.md").code, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
  assert.equal(readPrdModules(dir, "../outside.md").code, "DBG-MODULE-PLAN-UNREADABLE");
  assert.equal(readPrdModules(dir, "specs/absent.md").code, "DBG-MODULE-PLAN-UNREADABLE");
});
