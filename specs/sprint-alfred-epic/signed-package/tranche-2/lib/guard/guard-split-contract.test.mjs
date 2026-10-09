// SPDX-License-Identifier: SUL-1.0
/**
 * guard-split-contract.test.mjs -- the standing contract of the guard split (plan stage S2,
 * specs/sprint-alfred-epic/design/s2-guard-split-plan.md, row S2-70).
 *
 * The lifecycle guard (hooks/guard-lifecycle-ready.mjs) is being split into the layered modules
 * of plugins/pipeline-core/lib/guard/ named in harness/guard-split-map.json. This file pins what
 * must stay true before AND after the facade lands, independently of the extractor tool that
 * produced the modules (it reads the files and the map itself, it does not call
 * harness/scripts/guard-split-map.mjs):
 *
 *   GSC01  the module files on disk are exactly the modules of the map (tests excluded);
 *   GSC02  every first-party import between the modules points at a strictly lower layer, no
 *          module imports the facade, and an independent depth-first search finds no cycle;
 *   GSC03  the facade's runtime export surface is exactly the pinned table below (name and
 *          typeof): 40 names, measured with
 *          `node harness/scripts/guard-split-map.mjs export-surface --file <facade>`;
 *   GSC04  once the facade imports from ../lib/guard/ it is at most 500 lines (skipped while the
 *          monolith is still live), and it imports only modules named in the map;
 *   GSC05  every module is a never-liftable kernel path (lib/guard-maintenance-window.mjs).
 *
 * Imports are read from module-level `import`/`export ... from` statements at the start of a
 * line, so a specifier quoted in prose or in a block comment is never counted.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { NEVER_LIFTABLE_KERNEL_PATHS } from "../guard-maintenance-window.mjs";

const MODULE_DIR_ABS = fileURLToPath(new URL("./", import.meta.url));
const MAP_ABS = fileURLToPath(new URL("../../../../harness/guard-split-map.json", import.meta.url));
const FACADE_ABS = fileURLToPath(new URL("../../hooks/guard-lifecycle-ready.mjs", import.meta.url));

const MODULE_DIR_REL = "plugins/pipeline-core/lib/guard";
const FACADE_REL = "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs";
const FACADE_LINE_BUDGET = 500;

// The facade's export surface, measured once (40 names) and pinned literally: name -> typeof.
const FACADE_EXPORT_SURFACE = Object.freeze({
  ADMITTED_GRAMMAR_SHAPES: "object",
  BASE_GOVERNANCE_MARKERS: "object",
  DISPATCH_RECORD_COLLISION_DENIAL_CODE: "string",
  DISPATCH_RECORD_INTERIM_OUTCOME: "string",
  DISPATCH_RECORD_OWNER_SCHEMA: "string",
  EVIDENCE_HOST_PATH_DENIAL_CODE: "string",
  GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS: "object",
  MANIFEST_FAILURE_WARNING: "string",
  checkDispatchRecordCollision: "function",
  claimDispatchRecordOwnership: "function",
  claudeSessionMemoryDirectory: "function",
  evaluateLifecycleReadyGuard: "function",
  extractWritePayload: "function",
  gateStrengthShellNeedleFor: "function",
  governanceMarkers: "function",
  isAgentPoPublicCommand: "function",
  isBoundedCatPipeline: "function",
  isClaudeSessionMemoryWritePath: "function",
  isEvidenceArtifactPath: "function",
  isForbiddenCrossRepositoryMutation: "function",
  isHostOnlyClaudeCaptureInvocation: "function",
  isHumanPoSigningCommand: "function",
  isMachinePlaneWritePath: "function",
  isMeaningfulGateStrengthShellNeedle: "function",
  isNarrowRepositoryRecoveryCommand: "function",
  isOutsideRootBoundedDiagnosticRead: "function",
  isOutsideRootSingleCommandRead: "function",
  isProjectWritePath: "function",
  isReadOnlyDiagnosticCommand: "function",
  isRealpathedWithinBoundary: "function",
  isRestartResumeHintCapture: "function",
  isRestartResumeHintInputWrite: "function",
  isRestartResumeHintInspect: "function",
  isSanctionedGhReadOnlyDiagnostic: "function",
  isSanctionedLifecycleCommand: "function",
  isSanctionedStartPreflightInvocation: "function",
  machinePlaneFilePath: "function",
  main: "function",
  retryActionsForDeniedCommand: "function",
  signedQualityPackageCommandAdmission: "function",
});

const SORT = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function loadMap() {
  const map = JSON.parse(readFileSync(MAP_ABS, "utf8"));
  assert.equal(map.moduleDir, MODULE_DIR_REL, "the map's moduleDir is the directory this test lives in");
  assert.equal(map.facade, FACADE_REL, "the map's facade is the lifecycle guard hook");
  const layers = new Map();
  for (const [name, entry] of Object.entries(map.modules)) {
    assert.ok(Number.isInteger(entry.layer) && entry.layer >= 0, `module ${name} declares an integer layer`);
    layers.set(name, entry.layer);
  }
  assert.ok(layers.has("facade"), "the map declares the facade");
  return { map, layers, moduleNames: [...layers.keys()].filter((name) => name !== "facade").sort(SORT) };
}

function diskModuleNames() {
  return readdirSync(MODULE_DIR_ABS, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs") && !entry.name.endsWith(".test.mjs"))
    .map((entry) => entry.name.slice(0, -".mjs".length))
    .sort(SORT);
}

// Specifiers of module-level static imports and `export ... from` re-exports, in source order.
function staticSpecifiers(source) {
  const specs = [];
  const fromRe = /^(?:import|export)\s[^;"']*?\bfrom\s*(["'])([^"']+)\1/gm;
  const bareRe = /^import\s*(["'])([^"']+)\1/gm;
  for (const re of [fromRe, bareRe]) {
    let match;
    while ((match = re.exec(source)) !== null) specs.push({ index: match.index, spec: match[2] });
  }
  return specs.sort((a, b) => a.index - b.index).map((entry) => entry.spec);
}

// A relative specifier resolved against a repo-relative directory; non-relative specifiers are not first-party.
function resolveRelative(fromDirRel, spec) {
  return spec.startsWith(".") ? posix.normalize(posix.join(fromDirRel, spec)) : null;
}

function laneEdges(name, source) {
  const edges = [];
  const violations = [];
  for (const spec of staticSpecifiers(source)) {
    const resolved = resolveRelative(MODULE_DIR_REL, spec);
    if (resolved === null) continue;
    if (resolved === FACADE_REL) {
      violations.push(`${name} imports the facade ("${spec}")`);
    } else if (posix.dirname(resolved) === MODULE_DIR_REL) {
      if (!resolved.endsWith(".mjs")) violations.push(`${name} imports "${spec}", which does not name a .mjs module`);
      else edges.push(posix.basename(resolved, ".mjs"));
    }
  }
  return { edges, violations };
}

test("GSC01 the module files of lib/guard are exactly the modules of the split map", () => {
  const { moduleNames } = loadMap();
  assert.equal(moduleNames.length, 23, "the map names 23 modules besides the facade");
  assert.deepEqual(diskModuleNames(), moduleNames);
});

test("GSC02 module imports point only at lower layers, never at the facade, and the graph has no cycle", () => {
  const { layers, moduleNames } = loadMap();
  const graph = new Map();
  const violations = [];
  for (const name of moduleNames) {
    const source = readFileSync(`${MODULE_DIR_ABS}${name}.mjs`, "utf8");
    const { edges, violations: own } = laneEdges(name, source);
    violations.push(...own);
    graph.set(name, [...new Set(edges)]);
    for (const target of graph.get(name)) {
      if (!layers.has(target) || target === "facade") {
        violations.push(`${name} imports ./${target}.mjs, which is not a module of the map`);
      } else if (!(layers.get(target) < layers.get(name))) {
        violations.push(`${name} (layer ${layers.get(name)}) imports ${target} (layer ${layers.get(target)}): not a strictly lower layer`);
      }
    }
  }
  assert.deepEqual(violations, [], `layer violations:\n${violations.join("\n")}`);
  // Not vacuous: the split lanes do import each other, so the scan above must have seen edges.
  assert.ok([...graph.values()].some((targets) => targets.length > 0), "the import scan found no edge between the lib/guard modules");

  // Independent cycle check over the actual edges (three-colour depth-first search): the strict
  // layer rule above already forbids a cycle, so this fails first if the map and the files ever
  // disagree about what a layer is.
  const state = new Map();
  const stack = [];
  const cycles = [];
  const visit = (name) => {
    state.set(name, "open");
    stack.push(name);
    for (const target of graph.get(name) ?? []) {
      if (state.get(target) === "open") cycles.push([...stack.slice(stack.indexOf(target)), target].join(" -> "));
      else if (!state.has(target)) visit(target);
    }
    stack.pop();
    state.set(name, "done");
  };
  for (const name of moduleNames) if (!state.has(name)) visit(name);
  assert.deepEqual(cycles, [], `import cycle(s) among the lib/guard modules:\n${cycles.join("\n")}`);
});

test("GSC03 the facade's export surface is exactly the pinned 40-name table (name and typeof)", async () => {
  const namespace = await import("../../hooks/guard-lifecycle-ready.mjs");
  const measured = Object.fromEntries(Object.keys(namespace).sort(SORT).map((key) => [key, typeof namespace[key]]));
  assert.equal(Object.keys(FACADE_EXPORT_SURFACE).length, 40, "the pinned table holds 40 names");
  assert.deepEqual(Object.keys(measured), Object.keys(FACADE_EXPORT_SURFACE).sort(SORT), "export names");
  assert.deepEqual(measured, { ...FACADE_EXPORT_SURFACE }, "export typeof values");
});

test("GSC04 once the facade is wired to lib/guard it is a thin facade of at most 500 lines", (t) => {
  const { layers } = loadMap();
  const source = readFileSync(FACADE_ABS, "utf8");
  const facadeDirRel = posix.dirname(FACADE_REL);
  const laneImports = staticSpecifiers(source)
    .map((spec) => resolveRelative(facadeDirRel, spec))
    .filter((resolved) => resolved !== null && resolved.startsWith(`${MODULE_DIR_REL}/`));
  if (laneImports.length === 0) {
    t.skip("monolith still live; facade lands with S2 package 1");
    return;
  }
  for (const resolved of laneImports) {
    const name = posix.basename(resolved, ".mjs");
    assert.ok(resolved.endsWith(".mjs") && layers.has(name) && name !== "facade", `the facade imports ${resolved}, which is not a module of the map`);
  }
  const lines = source.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  assert.ok(lines.length <= FACADE_LINE_BUDGET, `the facade has ${lines.length} lines; the budget is ${FACADE_LINE_BUDGET}`);
});

test("GSC05 every lib/guard module is a never-liftable kernel path", () => {
  const { moduleNames } = loadMap();
  const kernel = new Set(NEVER_LIFTABLE_KERNEL_PATHS);
  const missing = moduleNames.map((name) => `${MODULE_DIR_REL}/${name}.mjs`).filter((path) => !kernel.has(path));
  assert.deepEqual(missing, [], `lib/guard modules missing from NEVER_LIFTABLE_KERNEL_PATHS:\n${missing.join("\n")}`);
});
