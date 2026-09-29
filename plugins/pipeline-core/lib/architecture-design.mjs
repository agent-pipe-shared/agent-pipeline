// SPDX-License-Identifier: SUL-1.0
/** Explicit architecture content in the PO-approved design, never inferred from a repository. */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";
import { validatePoGateAuthorityForRepository } from "./po-gate-authority.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";
import { initialGreenfieldMapTargets } from "./architecture-map-scaffold.mjs";
import { resolveModuleForPath } from "../scripts/module-inventory.mjs";
import { renderArchitectureOverview } from "../scripts/generate-architecture-overview.mjs";
const moduleSchema = JSON.parse(readFileSync(new URL("../schemas/pipeline.module-inventory.v1.json", import.meta.url), "utf8"));

export const ARCHITECTURE_DESIGN_SCHEMA = "pipeline.architecture-design.v1";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function requireValue(value, code) { if (!value) throw new Error(code); }
function rejectField(code, field, expected, value) {
  const error = new Error(code);
  error.field = field;
  error.expected = expected;
  error.rejectedValue = typeof value === "string" && /^[A-Za-z0-9_./*-]{0,96}$/u.test(value)
    ? value : "[redacted]";
  throw error;
}
function requireField(value, code, field, expected, rejectedValue) {
  if (!value) rejectField(code, field, expected, rejectedValue);
}
function bounded(value) {
  return typeof value === "string" && value.length > 0 && !/[\\:\x00-\x1f*?]/u.test(value)
    && !value.startsWith("/") && value.split("/").every(part => part && part !== "." && part !== "..");
}
function physical(root, name) {
  requireValue(bounded(name), "ARCHITECTURE-DESIGN-PATH-INVALID");
  let current = root;
  requireValue(!lstatSync(root).isSymbolicLink(), "ARCHITECTURE-DESIGN-SYMLINK");
  for (const part of name.split("/")) {
    current = join(current, part);
    try { requireValue(!lstatSync(current).isSymbolicLink(), "ARCHITECTURE-DESIGN-SYMLINK"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return current;
}
function bytes(root, name) { return readFileSync(physical(root, name), "utf8"); }
function covers(scope, name) { return scope.some(prefix => name === prefix || (prefix.endsWith("/") && name.startsWith(prefix))); }

/** The entire closed package is visible within the PRD and bound by its existing approval. */
export function parseArchitectureDesign(prd) {
  const blocks = [...prd.matchAll(/^```pipeline-architecture-design\r?\n([\s\S]*?)^```\s*$/gmu)];
  requireValue(blocks.length === 1, "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED");
  const input = JSON.parse(blocks[0][1]);
  requireValue(input && typeof input === "object" && !Array.isArray(input)
    && ["schema", "repositoryKind", "disposition", "modules", "implementationSurface", "fitnessModel"]
      .every(key => Object.hasOwn(input, key))
    && Object.keys(input).every(key => ["schema", "repositoryKind", "disposition", "modules", "implementationSurface", "fitnessModel", "baseline"].includes(key))
    && input.schema === ARCHITECTURE_DESIGN_SCHEMA && input.repositoryKind === "greenfield", "ARCHITECTURE-DESIGN-PACKAGE-INVALID");
  requireValue(exact(input.disposition, ["decision", "scope", "rationale"])
    && input.disposition.decision === "approved-scoped" && input.disposition.rationale?.trim()
    && Array.isArray(input.disposition.scope) && input.disposition.scope.length > 0,
  "ARCHITECTURE-DESIGN-DISPOSITION-INVALID");
  input.disposition.scope.forEach((path, index) => requireField(
    typeof path === "string" && bounded(path.replace(/\/$/u, "")),
    "ARCHITECTURE-DESIGN-DISPOSITION-INVALID", `disposition.scope[${index}]`,
    "bounded repository-relative path or directory prefix ending in /; use tests/, not tests/**", path,
  ));
  requireValue(Array.isArray(input.modules) && input.modules.length > 0, "ARCHITECTURE-DESIGN-MODULES-REQUIRED");
  const ids = new Set();
  for (const [index, module] of input.modules.entries()) {
    requireValue(validateAgainstSchema(module, moduleSchema).valid && !module.provisional && !module.candidateBinding
      && /^[a-z][a-z0-9-]*$/u.test(module.id)
      && module.id !== "index" && !ids.has(module.id) && module.responsibility.trim()
      && module.ownedPaths.length > 0 && module.publicContracts.length > 0 && module.verificationEntryPoints.length > 0,
    "ARCHITECTURE-DESIGN-MODULE-INVALID");
    ids.add(module.id);
    module.ownedPaths.forEach((path, pathIndex) => requireField(
      typeof path === "string" && bounded(path.replace(/\/\*\*?$/u, "")),
      "ARCHITECTURE-DESIGN-PATH-INVALID", `modules[${index}].ownedPaths[${pathIndex}]`,
      "bounded repository-relative path or owned prefix ending in /**", path,
    ));
    for (const key of ["publicContracts", "verificationEntryPoints"]) {
      module[key].forEach((path, pathIndex) => requireField(
        bounded(path), "ARCHITECTURE-DESIGN-PATH-INVALID", `modules[${index}].${key}[${pathIndex}]`,
        "bounded repository-relative file path without glob", path,
      ));
    }
  }
  requireValue(input.modules.every(module => module.allowedDependencies.every(id => ids.has(id))), "ARCHITECTURE-DESIGN-DEPENDENCY-INVALID");
  requireValue(Array.isArray(input.implementationSurface) && input.implementationSurface.length > 0
    && input.implementationSurface.every(p => bounded(p) && resolveModuleForPath(p, input.modules)), "ARCHITECTURE-DESIGN-SURFACE-INVALID");
  const model = input.fitnessModel;
  requireValue(model?.schema === "pipeline.fitness-model.v1" && model.profileId?.trim() && model.revision === 1
    && Array.isArray(model.allowedBoundaryCrossings) && model.antiFragmentationPolicy
    && (model.modules === undefined || Array.isArray(model.modules)), "ARCHITECTURE-DESIGN-FITNESS-MISMATCH");
  const moduleRows = input.modules.map(module => ({ id: module.id,
    ownedPaths: module.ownedPaths, allowedDependencies: module.allowedDependencies,
    authorityEffects: module.authorityEffects, verificationEntryPoints: module.verificationEntryPoints }));
  if (model.modules !== undefined) {
    requireField(model.modules.length === moduleRows.length, "ARCHITECTURE-DESIGN-FITNESS-MISMATCH",
      "fitnessModel.modules", "omit redundant modules or provide one matching row per declared module", model.modules.length);
    moduleRows.forEach((derived, index) => {
      const explicit = model.modules.find(row => row?.id === derived.id);
      for (const [key, value] of Object.entries(derived)) {
        requireField(JSON.stringify(explicit?.[key]) === JSON.stringify(value), "ARCHITECTURE-DESIGN-FITNESS-MISMATCH",
          `fitnessModel.modules[${index}].${key}`, "same value as canonical modules declaration, or omit fitnessModel.modules", explicit?.[key]);
      }
      requireField(Object.keys(explicit).length === Object.keys(derived).length,
        "ARCHITECTURE-DESIGN-FITNESS-MISMATCH", `fitnessModel.modules[${index}]`,
        "only canonical module fields, or omit fitnessModel.modules", explicit);
    });
  }
  const baseline = input.baseline === undefined ? { schema: "pipeline.architecture-baseline.v1", baselineRevision: 1,
    acceptedViolations: [], ratchetMetrics: { totalAcceptedViolations: 0, cycleCount: 0, boundaryCrossingsCount: 0 } } : input.baseline;
  requireValue(exact(baseline, ["schema", "baselineRevision", "acceptedViolations", "ratchetMetrics"])
    && baseline.schema === "pipeline.architecture-baseline.v1" && baseline.baselineRevision === 1
    && Array.isArray(baseline.acceptedViolations) && baseline.acceptedViolations.length === 0
    && exact(baseline.ratchetMetrics, ["totalAcceptedViolations", "cycleCount", "boundaryCrossingsCount"])
    && Object.values(baseline.ratchetMetrics).every(value => value === 0), "ARCHITECTURE-DESIGN-GREENFIELD-DEBT-INVALID");
  return { ...input, fitnessModel: { ...model, modules: moduleRows }, baseline };
}

export function architectureDesignTargets(input) {
  const targets = [{ path: "architecture/map/index.md", bytes: "# Architecture Navigation Map Index\n\nOKF v0.1 concept bundle.\n\n[Generated architecture overview](overview.html) is a derived human view; edit the concepts, not the HTML.\n\n## Governed Modules\n\n"
    + input.modules.map(module => `- [${module.id}](${module.id}.md): ${module.responsibility}`).join("\n") + "\n" }];
  for (const module of input.modules) {
    const lines = Object.entries({ ...module, type: "Governed Module" }).map(([key, value]) => Array.isArray(value)
      ? (value.length ? `${key}:\n${value.map(item => `  - ${JSON.stringify(item)}`).join("\n")}` : `${key}: []`)
      : `${key}: ${JSON.stringify(value)}`);
    const dependencies = module.allowedDependencies.length
      ? `\n## Declared module dependencies\n${module.allowedDependencies.map(id => `- [${id}](${id}.md): Declared allowed dependency; rationale must be recorded by the project.\n`).join("")}`
      : "";
    targets.push({ path: `architecture/map/${module.id}.md`, bytes: `---\n${lines.join("\n")}\n---\n\n# Module: ${module.id}\n${dependencies}` });
  }
  const digest = createHash("sha256");
  digest.update("index\0");
  digest.update(targets[0].bytes);
  const conceptSources = new Map();
  for (const module of [...input.modules].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = targets.find((target) => target.path === `architecture/map/${module.id}.md`).bytes;
    digest.update(`${module.id}\0`);
    digest.update(source);
    conceptSources.set(module.id, source);
  }
  targets.push({ path: "architecture/map/overview.html", bytes: renderArchitectureOverview(
    input.modules.map((module) => ({ ...module, type: "Governed Module" })), conceptSources, digest.digest("hex"),
  ) });
  targets.push({ path: "architecture/fitness-model.json", bytes: json(input.fitnessModel) },
    { path: "architecture/baseline.json", bytes: json(input.baseline) });
  return targets;
}

/** Read-only authority projection: no adoption record or second PO decision is fabricated. */
export function inspectArchitectureDesign(rootDir, taskScope = null) {
  const root = resolve(rootDir);
  try {
    const state = JSON.parse(bytes(root, "project/pipeline-state.json"));
    const authority = state.planApproval?.poGateAuthority;
    requireValue(authority?.planPath && authority?.specPath, "ARCHITECTURE-DESIGN-APPROVAL-REQUIRED");
    const prd = bytes(root, authority.planPath);
    const spec = bytes(root, authority.specPath);
    const observation = { planSha256: hash(prd), specSha256: hash(spec) };
    const lifecycle = derivePlanLifecycle(state, observation);
    requireValue(lifecycle.ok && ["approved", "implementing"].includes(lifecycle.status), "ARCHITECTURE-DESIGN-APPROVAL-STALE");
    const continuity = state.continuity;
    requireValue(continuity?.featureId === state.activeFeature.id
      && continuity.authority?.prd?.path === authority.planPath && continuity.authority.prd.sha256 === observation.planSha256
      && continuity.authority?.spec?.path === authority.specPath && continuity.authority.spec.sha256 === observation.specSha256,
    "ARCHITECTURE-DESIGN-CONTINUITY-STALE");
    const verified = validatePoGateAuthorityForRepository({ repoRoot: root,
      expectedPlanSha256: observation.planSha256, expectedSpecSha256: observation.specSha256 });
    requireValue(verified.ok, verified.code);
    requireValue(Object.entries(authority).every(([key, value]) => verified.value[key] === value),
      "ARCHITECTURE-DESIGN-PROFILE-AUTHORITY-STALE");
    const input = parseArchitectureDesign(prd);
    requireValue(covers(input.disposition.scope, authority.planPath)
      && covers(input.disposition.scope, "architecture/map/index.md")
      && covers(input.disposition.scope, "architecture/fitness-model.json")
      && covers(input.disposition.scope, "architecture/baseline.json")
      && input.implementationSurface.every(p => covers(input.disposition.scope, p))
      && (!taskScope || covers(input.disposition.scope, taskScope)), "ARCHITECTURE-DESIGN-SCOPE-MISMATCH");
    // Architecture materialization establishes design authority. Physical
    // contracts and tests are authored by their implementation owners later.
    // A materialized design is never proof that those files exist or pass.
    const targets = architectureDesignTargets(input);
    const receipt = { schema: "pipeline.architecture-design-materialization.v1", featureId: state.activeFeature.id,
      planPath: authority.planPath, ...observation, designSha256: hash(json(input)),
      targets: targets.map(target => ({ path: target.path, sha256: hash(target.bytes) })) };
    const receiptPath = "architecture/design-materialization.json";
    if (existsSync(physical(root, receiptPath))) {
      requireValue(bytes(root, receiptPath) === json(receipt), "ARCHITECTURE-DESIGN-RECEIPT-STALE");
      requireValue(targets.every(target => bytes(root, target.path) === target.bytes), "ARCHITECTURE-DESIGN-ARTIFACT-DRIFT");
      const pendingPhysicalSurfaces = [...new Set(input.modules.flatMap(module =>
        [...module.publicContracts, ...module.verificationEntryPoints]))].filter(name => {
        try { return bytes(root, name).trim().length === 0; } catch { return true; }
      });
      return { ok: true, status: "materialized", input, targets, receipt, scope: input.disposition.scope,
        disposition: "approved-scoped", authority: "approved-design-package", pendingPhysicalSurfaces,
        planningSurface: { planPath: authority.planPath, paths: input.implementationSurface } };
    }
    const scaffold = initialGreenfieldMapTargets("fresh");
    requireValue(scaffold.every(target => bytes(root, target.path) === target.bytes), "ARCHITECTURE-DESIGN-BROWNFIELD-PROPOSAL-REQUIRED");
    requireValue(readdirSync(physical(root, "architecture/map")).sort().join("\0") === "index.md\0inventory.json"
      && readdirSync(physical(root, "architecture")).sort().join("\0") === "map", "ARCHITECTURE-DESIGN-EXISTING-ESTATE");
    for (const target of targets) physical(root, target.path);
    return { ok: true, status: "materialization-required", input, targets, receipt, scope: input.disposition.scope };
  } catch (error) {
    return { ok: false, status: "design-required", code: error.message,
      ...(error.field ? { field: error.field, expected: error.expected, rejectedValue: error.rejectedValue } : {}) };
  }
}

function assertLock(root, lock) {
  requireValue(lock?.ok && lock.path === physical(root, "project/pipeline-state.json.lock"), "ARCHITECTURE-DESIGN-LOCK-REQUIRED");
  const current = JSON.parse(readFileSync(lock.path, "utf8"));
  requireValue(current.schema === "pipeline.continuity-lock.v0" && current.token === lock.token
    && current.ownerNonce === lock.ownerNonce, "ARCHITECTURE-DESIGN-LOCK-CHANGED");
}
const identity = path => { const row = lstatSync(path); return `${row.dev}:${row.ino}`; };

/** Transaction primitive. Authority is rechecked under the shared state-writer lock. */
export function publishArchitectureDesignTargets({ rootDir, lock, targets, validateAuthority, io = {} }) {
  const root = resolve(rootDir);
  const applied = [];
  const temporary = [];
  const write = io.writeFileSync ?? writeFileSync;
  try {
    assertLock(root, lock);
    requireValue(validateAuthority(), "ARCHITECTURE-DESIGN-AUTHORITY-CHANGED");
    for (const target of targets) {
      const path = physical(root, target.path);
      const before = existsSync(path) ? readFileSync(path) : null;
      requireValue(before === null || target.path === "architecture/map/index.md", "ARCHITECTURE-DESIGN-EXISTING-TARGET");
      if (before !== null) requireValue(before.toString("utf8") === initialGreenfieldMapTargets("fresh")[0].bytes,
        "ARCHITECTURE-DESIGN-TARGET-CHANGED");
      const beforeIdentity = before === null ? null : identity(path);
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.materializing-${lock.ownerNonce}`;
      const fd = openSync(tmp, "wx", 0o600);
      temporary.push(tmp);
      try { write(fd, target.bytes, "utf8"); fsyncSync(fd); } finally { closeSync(fd); }
      const record = { path, before, after: target.bytes, publishedIdentity: identity(tmp), published: false };
      // Record the exact preimage and staged inode BEFORE publication can mutate a target.
      applied.push(record);
      assertLock(root, lock);
      requireValue(validateAuthority(), "ARCHITECTURE-DESIGN-AUTHORITY-CHANGED");
      if (before === null) linkSync(tmp, path); // atomic create-only; a raced target is preserved
      else {
        requireValue(identity(path) === beforeIdentity && readFileSync(path).equals(before), "ARCHITECTURE-DESIGN-TARGET-CHANGED");
        renameSync(tmp, path);
      }
      record.published = true;
    }
    assertLock(root, lock);
    requireValue(validateAuthority(), "ARCHITECTURE-DESIGN-AUTHORITY-CHANGED");
    requireValue(targets.every(target => bytes(root, target.path) === target.bytes), "ARCHITECTURE-DESIGN-READBACK-FAILED");
    return { ok: true, status: "published" };
  } catch (error) {
    const conflicts = [];
    for (const target of applied.reverse()) {
      if (!target.published) continue;
      try {
        assertLock(root, lock);
        requireValue(identity(target.path) === target.publishedIdentity && readFileSync(target.path, "utf8") === target.after,
          "ARCHITECTURE-DESIGN-ROLLBACK-CONFLICT");
        if (target.before === null) unlinkSync(target.path);
        else {
          const restore = `${target.path}.restoring-${lock.ownerNonce}`;
          const fd = openSync(restore, "wx", 0o600);
          temporary.push(restore);
          try { writeFileSync(fd, target.before); fsyncSync(fd); } finally { closeSync(fd); }
          renameSync(restore, target.path);
        }
      } catch { conflicts.push(target.path); }
    }
    return { ok: false, status: conflicts.length ? "rollback-conflict" : "rolled-back", code: error.message, conflicts };
  } finally {
    for (const tmp of temporary) { try { unlinkSync(tmp); } catch (error) { if (error.code !== "ENOENT") throw error; } }
  }
}

/** Fixed target writer; caller must hold the sanctioned lifecycle writer's project lock. */
export function materializeArchitectureDesign(rootDir, { lock } = {}) {
  const root = resolve(rootDir);
  try {
    assertLock(root, lock);
    const stateBytes = bytes(root, "project/pipeline-state.json");
    const inspected = inspectArchitectureDesign(root);
    if (!inspected.ok || inspected.status === "materialized") return inspected;
    const authority = JSON.parse(stateBytes).planApproval.poGateAuthority;
    const targets = [...inspected.targets, { path: "architecture/design-materialization.json", bytes: json(inspected.receipt) }];
    const result = publishArchitectureDesignTargets({ rootDir: root, lock, targets, validateAuthority: () => {
      if (bytes(root, "project/pipeline-state.json") !== stateBytes) return false;
      const checked = validatePoGateAuthorityForRepository({ repoRoot: root,
        expectedPlanSha256: inspected.receipt.planSha256, expectedSpecSha256: inspected.receipt.specSha256 });
      return checked.ok && Object.entries(authority).every(([key, value]) => checked.value[key] === value)
        && hash(bytes(root, authority.planPath)) === inspected.receipt.planSha256
        && hash(bytes(root, authority.specPath)) === inspected.receipt.specSha256;
    } });
    return result.ok ? inspectArchitectureDesign(root) : result;
  } catch (error) { return { ok: false, status: "blocked", code: error.message }; }
}
