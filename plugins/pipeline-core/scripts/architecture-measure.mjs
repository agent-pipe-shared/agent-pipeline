#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * D162 S1: measure an existing (brownfield) Git repository into the three physical
 * architecture artifacts (architecture/map/, architecture/fitness-model.json,
 * architecture/baseline.json). Existing debt is accepted as an excepted baseline.
 *
 * Usage: node scripts/architecture-measure.mjs --root <dir> [--apply] [--json]
 * Without --apply nothing is written. Exit 0 for planned/written, 1 for refused.
 * Never writes architecture/adoption-state.json, AGENTS.md or anything outside the
 * three targets, and never overwrites an existing target.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { architectureDesignTargets } from "../lib/architecture-design.mjs";
import { evaluateArchitectureFitness, extractJsImports, SCHEMA_ARCHITECTURE_BASELINE } from "./architecture-fitness.mjs";
import { inspectArchitectureReentryPointer } from "./module-inventory.mjs";

export const ARCHITECTURE_MEASURE_SCHEMA = "pipeline.architecture-measure.v1";
const TARGET_PATHS = ["architecture/map", "architecture/fitness-model.json", "architecture/baseline.json"];
const SOURCE_EXT = /\.(?:js|mjs|cjs|jsx|ts|tsx)$/u;
const ADOPTION_FOLLOW_UP = "adoption record not written: run the adoption step";
const POINTER_FOLLOW_UP = "AGENTS.md has no link to architecture/map/index.md";

function defaultGit(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 && !r.error ? { ok: true, stdout: r.stdout } : { ok: false, stdout: "" };
}

function refusal(code) {
  return { schema: ARCHITECTURE_MEASURE_SCHEMA, status: "refused", code, baselineCommit: null,
    modules: [], acceptedViolationCount: null, targets: [], followUps: [] };
}

function moduleId(dir, taken) {
  let base = dir.toLowerCase().replace(/^\.+/u, "").replace(/[^a-z0-9-]/gu, "-") || "module";
  if (base === "index") base = "index-module";
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** Shared read-only measurement; returns a refusal or the measured shape. */
function measure(rootDir, deps) {
  const root = path.resolve(rootDir);
  const git = deps.git ?? defaultGit;
  const top = git(["rev-parse", "--show-toplevel"], root);
  const head = top.ok ? git(["rev-parse", "--verify", "HEAD^{commit}"], root) : { ok: false };
  let sameRoot = false;
  try { sameRoot = top.ok && fs.realpathSync(top.stdout.trim()) === fs.realpathSync(root); } catch { /* not a work tree */ }
  if (!sameRoot || !head.ok || !head.stdout.trim()) return { refusal: refusal("ARCHITECTURE-MEASURE-NO-COMMIT") };
  const baselineCommit = head.stdout.trim();
  if (TARGET_PATHS.some((target) => fs.existsSync(path.join(root, target)))) {
    return { refusal: refusal("ARCHITECTURE-MEASURE-TARGET-EXISTS") };
  }
  const status = git(["status", "--porcelain"], root);
  if (!status.ok || status.stdout.trim() !== "") return { refusal: refusal("ARCHITECTURE-MEASURE-DIRTY-TREE") };
  const listing = git(["ls-files", "-z"], root);
  const tracked = (listing.ok ? listing.stdout.split("\0") : []).filter(Boolean)
    .filter((file) => !file.startsWith("architecture/") && !file.startsWith(".claude/")).sort();
  if (tracked.length === 0) return { refusal: refusal("ARCHITECTURE-MEASURE-EMPTY") };

  const dirs = [...new Set(tracked.filter((file) => file.includes("/")).map((file) => file.split("/")[0]))].sort();
  const rootFiles = tracked.filter((file) => !file.includes("/"));
  const taken = new Set();
  const idByDir = new Map(dirs.map((dir) => [dir, moduleId(dir, taken)]));
  const rootId = rootFiles.length > 0 ? moduleId("root", taken) : null;
  const ownerOf = (file) => {
    if (!file.includes("/")) return rootFiles.includes(file) ? rootId : null;
    return idByDir.get(file.split("/")[0]) ?? null;
  };
  const edges = new Map();
  for (const file of tracked.filter((name) => SOURCE_EXT.test(name))) {
    const owner = ownerOf(file);
    let source;
    try { source = fs.readFileSync(path.join(root, file), "utf8"); } catch { continue; }
    for (const spec of extractJsImports(source)) {
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      if (target.startsWith("..")) continue;
      const targetOwner = ownerOf(target);
      if (!targetOwner || targetOwner === owner) continue;
      if (!edges.has(owner)) edges.set(owner, new Set());
      edges.get(owner).add(targetOwner);
    }
  }
  const modules = [...dirs.map((dir) => ({ dir, id: idByDir.get(dir), ownedPaths: [`${dir}/**`],
    responsibility: `Measured brownfield module for ${dir}/; refine in design.` })),
  ...(rootId ? [{ dir: null, id: rootId, ownedPaths: rootFiles,
    responsibility: "Measured brownfield root files; refine in design." }] : [])]
    .map(({ id, ownedPaths, responsibility }) => ({ id, responsibility, nonResponsibilities: [], ownedPaths,
      publicContracts: [], allowedDependencies: [...(edges.get(id) ?? [])].sort(), authorityEffects: [],
      verificationEntryPoints: [], adrReferences: [], provisional: true, profileSource: "brownfield-measured" }));
  const followUps = [ADOPTION_FOLLOW_UP];
  if (!inspectArchitectureReentryPointer(root).ok) followUps.unshift(POINTER_FOLLOW_UP);
  return { root, git, baselineCommit, modules, followUps };
}

function summarize(status, measured, extra = {}) {
  return { schema: ARCHITECTURE_MEASURE_SCHEMA, status, code: status === "planned" ? "ARCHITECTURE-MEASURE-PLANNED" : "ARCHITECTURE-MEASURE-WRITTEN",
    baselineCommit: measured.baselineCommit,
    modules: measured.modules.map(({ id, ownedPaths, allowedDependencies }) => ({ id, ownedPaths, allowedDependencies })),
    acceptedViolationCount: null, targets: [], followUps: measured.followUps, ...extra };
}

const fitnessModelFor = (modules) => ({ schema: "pipeline.fitness-model.v1", profileId: "brownfield-measured", revision: 1,
  modules: modules.map((module) => module.id), allowedBoundaryCrossings: [], antiFragmentationPolicy: { rejectTrivialFacades: true } });
const emptyBaseline = () => ({ schema: SCHEMA_ARCHITECTURE_BASELINE, baselineRevision: 1, acceptedViolations: [],
  ratchetMetrics: { totalAcceptedViolations: 0, cycleCount: 0, boundaryCrossingsCount: 0 } });

export function planArchitectureMeasure(rootDir, deps = {}) {
  const measured = measure(rootDir, deps);
  if (measured.refusal) return measured.refusal;
  return summarize("planned", measured);
}

export function applyArchitectureMeasure(rootDir, deps = {}) {
  const measured = measure(rootDir, deps);
  if (measured.refusal) return measured.refusal;
  const { root, baselineCommit, modules } = measured;
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = new Date(now).toISOString();
  const createdDirs = [];
  const written = [];
  const ensureDir = (dir) => {
    const missing = [];
    for (let cur = dir; !fs.existsSync(cur); cur = path.dirname(cur)) missing.unshift(cur);
    fs.mkdirSync(dir, { recursive: true });
    createdDirs.push(...missing);
  };
  const write = (relative, bytes, overwrite = false) => {
    const full = path.join(root, relative);
    ensureDir(path.dirname(full));
    fs.writeFileSync(full, bytes, { encoding: "utf8", flag: overwrite ? "w" : "wx" });
    if (!written.includes(full)) written.push(full);
  };
  const rollback = () => {
    for (const file of written) fs.rmSync(file, { force: true });
    for (const dir of [...createdDirs].reverse()) fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    const input = { modules, fitnessModel: fitnessModelFor(modules), baseline: emptyBaseline() };
    const targets = architectureDesignTargets(input);
    for (const target of targets) write(target.path, target.bytes);
    const first = evaluateArchitectureFitness({ rootDir: root, mode: "candidate", now });
    const seen = new Map();
    for (const outcome of first.outcomes) {
      if (outcome.outcome !== "finding") continue;
      for (const violation of outcome.violations ?? []) {
        const ruleId = violation.ruleId ?? outcome.propertyId;
        const key = JSON.stringify([ruleId, violation.module, violation.target ?? null]);
        if (seen.has(key)) continue;
        seen.set(key, { ruleId, module: violation.module, ...(violation.target ? { target: violation.target } : {}),
          acceptedAt: nowIso, rationale: `D162 brownfield measurement: existing debt accepted at baseline commit ${baselineCommit}` });
      }
    }
    const accepted = [...seen.values()];
    const baseline = { schema: SCHEMA_ARCHITECTURE_BASELINE, baselineRevision: 1, origin: "brownfield-measure",
      baselineCommit, measuredAt: nowIso, acceptedViolations: accepted,
      ratchetMetrics: { totalAcceptedViolations: accepted.length,
        cycleCount: accepted.filter((entry) => entry.ruleId === "dependency-cycle").length,
        boundaryCrossingsCount: accepted.filter((entry) => entry.ruleId === "unauthorized-boundary-crossing").length } };
    write("architecture/baseline.json", `${JSON.stringify(baseline, null, 2)}\n`, true);
    const second = evaluateArchitectureFitness({ rootDir: root, mode: "candidate", now });
    // Converged: no finding remains, and the only unavailable classes are 9 (profile drift,
    // resolves once the adoption record exists) and 10 (calibrated thresholds, report-only).
    const pending = new Set([9, 10]);
    const converged = second.outcomes.every((outcome) => outcome.outcome !== "finding"
      && (outcome.outcome !== "unavailable" || pending.has(outcome.classId))
      && ["pass", "excepted", "unavailable"].includes(outcome.outcome));
    if (!converged) {
      rollback();
      return refusal("ARCHITECTURE-MEASURE-NOT-CONVERGED");
    }
    const pendingClasses = [...new Set(second.outcomes.filter((outcome) => outcome.outcome === "unavailable").map((outcome) => outcome.classId))].sort((x, y) => x - y);
    return summarize("written", measured, { acceptedViolationCount: accepted.length, targets: targets.map((target) => target.path), pendingClasses });
  } catch (error) {
    rollback();
    throw error;
  }
}

function runCli(argv) {
  let root = process.cwd();
  let apply = false;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root" && argv[i + 1]) root = argv[++i];
    else if (argv[i] === "--apply") apply = true;
    else if (argv[i] === "--json") json = true;
    else { process.stderr.write(`Unknown argument: ${argv[i]}\n`); return 2; }
  }
  const result = apply ? applyArchitectureMeasure(root) : planArchitectureMeasure(root);
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`${result.status}: ${result.code}\n`);
    for (const module of result.modules) process.stdout.write(`- ${module.id}: ${module.ownedPaths.join(", ")} -> [${module.allowedDependencies.join(", ")}]\n`);
    for (const followUp of result.followUps) process.stdout.write(`follow-up: ${followUp}\n`);
  }
  return result.status === "refused" ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
