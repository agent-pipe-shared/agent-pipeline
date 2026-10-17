// SPDX-License-Identifier: SUL-1.0
/** Explicit architecture content in the PO-approved design, never inferred from a repository. */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";
import { resolveProjectAuthorityPaths } from "./project-authority.mjs";
import { validatePoGateAuthorityForRepository } from "./po-gate-authority.mjs";
import { rereadApprovedDesignWorkflowPackage } from "./design-workflow-package.mjs";
import { verifyStoredDesignWorkflowPackageSignature } from "./design-workflow-approval.mjs";
import { readCriticalHumanProofPolicy } from "./critical-human-proof-policy.mjs";
import { inspectApprovedDesignDecisionBindings, retainApprovedDesignArchitectureReference, prepareApprovedArchitectureMaterialization } from "./design-decision-bindings.mjs";
import { designAdvisoryAdmission } from "./guard-devplan-policy.mjs";
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
  // Generated templates are authoring aids, never a finished design for approval.
  const containsPlaceholder = value => typeof value === "string" ? value.startsWith("REPLACE:")
    : Array.isArray(value) ? value.some(containsPlaceholder)
    : value && typeof value === "object" ? Object.values(value).some(containsPlaceholder) : false;
  requireValue(!prd.includes("<!-- DRAFT TEMPLATE:") && !containsPlaceholder(input), "ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE");
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

/** Read-only pre-presentation check for a fresh scaffold. It binds the bytes
 * to the submitted PRD digest and never treats the scaffold itself as design
 * approval or as a materialized architecture map. */
export function inspectArchitectureDesignDraft({ rootDir, planPath, expectedPlanSha256 } = {}) {
  const root = resolve(rootDir);
  try {
    const prdBytes = readFileSync(physical(root, planPath));
    if (hash(prdBytes) !== expectedPlanSha256) return { ok: false, code: "ARCHITECTURE-DESIGN-PRD-DIGEST-STALE", prdPath: planPath };
    const scaffold = initialGreenfieldMapTargets("fresh");
    // This additional pre-submit check applies to the new greenfield scaffold,
    // not historical repositories that never had that scaffold. Partial or
    // unreadable scaffold state still fails closed through the physical reader.
    if (scaffold.every(target => !existsSync(join(root, target.path)))) return { ok: true, required: false };
    if (!scaffold.every(target => bytes(root, target.path) === target.bytes)) return { ok: true, required: false };
    try {
      return { ok: true, required: true, design: parseArchitectureDesign(prdBytes.toString("utf8")), prdPath: planPath };
    } catch (error) {
      return { ok: false, required: true, code: architectureDesignFailureCode(error), prdPath: planPath };
    }
  } catch (error) {
    // Same closed code contract as inspectArchitectureDesign (AC-174): no exception text in `code`.
    return { ok: false, code: error ? architectureDesignFailureCode(error) : "ARCHITECTURE-DESIGN-PRD-UNAVAILABLE", prdPath: planPath };
  }
}

/** Read-only authority projection: no adoption record or second PO decision is fabricated. */
export function inspectArchitectureDesign(rootDir, taskScope = null, deps = {}) {
  const root = resolve(rootDir);
  let prdPath = null;
  try {
    const selection = selectedArchitectureState(root);
    const state = JSON.parse(bytes(root, selection.state));
    const authority = state.planApproval?.poGateAuthority;
    let prospective = null;
    requireValue(authority?.planPath && authority?.specPath, "ARCHITECTURE-DESIGN-APPROVAL-REQUIRED");
    prdPath = authority.planPath;
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
    const bootstrapAcknowledgementValid = verified.ok
      && Object.entries(authority).every(([key, value]) => verified.value[key] === value);
    if (["pipeline.plan-approval.v8", "pipeline.plan-approval.v9"].includes(state.planApproval?.schema)) {
      // The complete stored v8/v9 binding is authority. Reuse the implementation
      // boundary's current-source, mode and actual proof checks; a bootstrap
      // acknowledgement cannot replace the final design approval.
      const finalDesignApproval = designAdvisoryAdmission(state, root, authority.planPath, authority.specPath);
      requireValue(finalDesignApproval.ok, finalDesignApproval.code ?? "ARCHITECTURE-DESIGN-APPROVAL-REQUIRED");
    const decisionSubset = inspectApprovedDesignDecisionBindings({ rootDir: root, area: "architecture" });
      requireValue(decisionSubset.ok, decisionSubset.code ?? "ARCHITECTURE-DESIGN-DECISION-SUBSET-STALE");
      if (decisionSubset.required) {
        prospective = prepareApprovedArchitectureMaterialization(decisionSubset.handle);
        requireValue(prospective.ok, prospective.code);
      }
    } else {
      const finalWorkflowApproval = verifyFinalDesignWorkflowApproval(root, state, authority, observation, deps);
      requireValue(bootstrapAcknowledgementValid || finalWorkflowApproval.ok,
        finalWorkflowApproval.code ?? (verified.ok ? "ARCHITECTURE-DESIGN-PROFILE-AUTHORITY-STALE" : verified.code));
    }
    // Brownfield and other non-greenfield repositories never carried the fresh
    // greenfield map scaffold, so they cannot hold the greenfield design block
    // either. Apply exactly the applicability predicate that
    // inspectArchitectureDesignDraft applies at draft time, so draft time and
    // implementation entry agree. A repository with a materialization receipt
    // is always validated below, never exempted here.
    if (!existsSync(physical(root, "architecture/design-materialization.json"))) {
      const greenfieldScaffold = initialGreenfieldMapTargets("fresh");
      if (greenfieldScaffold.every(target => !existsSync(join(root, target.path)))
        || !greenfieldScaffold.every(target => bytes(root, target.path) === target.bytes)) {
        return prospective?.required && prospective.targets.length
          ? { ok: true, status: "materialization-required", required: true, scope: null,
            materializationKind: "prospective-adr-only", targets: prospective.targets }
          : { ok: true, status: "not-required", required: false, scope: null };
      }
    }
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
      const pendingPhysicalSurfaces = [...new Set([
        ...input.implementationSurface,
        ...input.modules.flatMap(module => [...module.publicContracts, ...module.verificationEntryPoints]),
      ])].filter(name => {
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
    // A typed environment condition (e.g. a registered worktree this host cannot
    // resolve) keeps its own code and status; it is not architecture evidence failure.
    if (error?.code === "DWP2-ENVIRONMENT-UNAVAILABLE" || error?.message === "DWP2-ENVIRONMENT-UNAVAILABLE") {
      return { ok: false, status: "environment-unavailable", code: "DWP2-ENVIRONMENT-UNAVAILABLE", cause: "foreign-worktree" };
    }
    // AC-174: the `code` field is a closed, typed identifier. Exception text
    // (a system message, a path, a stack fragment) never reaches it.
    const code = architectureDesignFailureCode(error);
    return { ok: false, status: "design-required", code,
      ...(code === "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED" && prdPath ? { prdPath } : {}),
      ...(error?.field && code === error.message ? { field: error.field, expected: error.expected, rejectedValue: error.rejectedValue } : {}) };
  }
}

/** The one code an unexpected (non-typed) exception inspection failure maps to. */
export const ARCHITECTURE_DESIGN_INSPECTION_FAILED = "ARCHITECTURE-DESIGN-INSPECTION-FAILED";
const TYPED_FAILURE_CODE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u;

/** Typed identifiers (ARCHITECTURE-DESIGN-*, DAA-*, DWP-*, ...) pass through unchanged; anything else
 * (exception text, system messages, null) becomes ARCHITECTURE_DESIGN_INSPECTION_FAILED. */
export function architectureDesignFailureCode(error) {
  const message = error?.message;
  if (typeof message === "string" && message.length <= 96 && TYPED_FAILURE_CODE.test(message)) return message;
  // A required file is absent (e.g. a partial greenfield scaffold fails closed): one typed class, never the OS text.
  if (error?.code === "ENOENT") return "ARCHITECTURE-DESIGN-ENOENT";
  return ARCHITECTURE_DESIGN_INSPECTION_FAILED;
}

/** The only typed codes for which reopen-design is the repair: the approved bytes or design evidence are
 * VERIFIED to be stale/drifted, or the approved design block deterministically fails its own contract.
 * Environment, setup/availability, lock, symlink, brownfield-state and unexpected-exception failures are
 * deliberately absent: they never justify discarding a possibly valid approval. */
export const ARCHITECTURE_DESIGN_REOPEN_CODES = Object.freeze([
  // verified stale / drifted approval, source or materialized evidence
  "ARCHITECTURE-DESIGN-APPROVAL-STALE", "ARCHITECTURE-DESIGN-CONTINUITY-STALE", "ARCHITECTURE-DESIGN-RECEIPT-STALE",
  "ARCHITECTURE-DESIGN-ARTIFACT-DRIFT", "ARCHITECTURE-DESIGN-DECISION-SUBSET-STALE", "ARCHITECTURE-DESIGN-PROFILE-AUTHORITY-STALE",
  "DAA-DESIGN-APPROVAL-BINDING-DRIFT", "DAA-DESIGN-SOURCE-DRIFT",
  // approved design-workflow package re-read: PRD/spec source bytes drifted from the approval. Parity with the
  // guard's contentDrift list (guard-devplan-policy.mjs designAdvisoryRemediation); DWP-APPROVAL-DIGEST-DRIFT is
  // deliberately absent because the guard does not route it to reopen-design.
  "DWP-APPROVAL-SOURCE-DRIFT", "DWP-APPROVAL-PLAN-SPEC-MISMATCH",
  // the approved PRD's design block is missing or invalid (deterministic content findings)
  "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED", "ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE", "ARCHITECTURE-DESIGN-PACKAGE-INVALID",
  "ARCHITECTURE-DESIGN-DISPOSITION-INVALID", "ARCHITECTURE-DESIGN-MODULES-REQUIRED", "ARCHITECTURE-DESIGN-MODULE-INVALID",
  "ARCHITECTURE-DESIGN-DEPENDENCY-INVALID", "ARCHITECTURE-DESIGN-SURFACE-INVALID", "ARCHITECTURE-DESIGN-FITNESS-MISMATCH",
  "ARCHITECTURE-DESIGN-GREENFIELD-DEBT-INVALID", "ARCHITECTURE-DESIGN-SCOPE-MISMATCH",
]);
export function isArchitectureDesignReopenCode(code) { return ARCHITECTURE_DESIGN_REOPEN_CODES.includes(code); }

// Stored final approval is portable: reread its exact package and sources, then
// verify the recorded signature against current policy trust anchors. The legacy
// readiness argument remains accepted for caller compatibility.
export function verifyFinalDesignWorkflowApproval(root, state, authority, observation, deps = {}, requireReadinessExecution = true) {
  try {
    if (state.planApproved !== true || !["epic", "feature"].includes(state.planSubmission?.profile)
      || state.planSubmission.featureId !== state.activeFeature?.id) return { ok: false, code: "DWP-FINAL-APPROVAL-STATE" };
    const presentation = state.planPresentation;
    const approval = state.planApproval;
    const workflowApproval = approval?.designWorkflowApproval;
    const packagePath = approval?.designWorkflowPackagePath;
    const packageSha256 = approval?.designWorkflowPackageSha256;
    if (typeof packagePath !== "string" || typeof packageSha256 !== "string"
      || presentation?.designWorkflowPackagePath !== packagePath
      || presentation?.designWorkflowPackageSha256 !== packageSha256
      || workflowApproval?.packageSha256 !== packageSha256
      || !["chat", "signature"].includes(workflowApproval?.mode)) return { ok: false, code: "DWP-FINAL-APPROVAL-PRESENTATION" };
    const packageRead = rereadApprovedDesignWorkflowPackage({
      repoRoot: root, packagePath, packageSha256, featureId: state.activeFeature.id,
      planPath: authority.planPath, planSha256: observation.planSha256,
      specPath: authority.specPath, specSha256: observation.specSha256,
      advisorExceptionBinding: workflowApproval.advisorException ?? null,
    });
    if (!packageRead.ok) return { ok: false, code: packageRead.code ?? "DWP-FINAL-PACKAGE-INVALID" };
    if (packageRead.packageSha256 !== packageSha256
      || packageRead.workflowPackage.featureId !== state.activeFeature.id
      || packageRead.workflowPackage.sources.prd.path !== authority.planPath
      || packageRead.workflowPackage.sources.prd.sha256 !== observation.planSha256
      || packageRead.workflowPackage.sources.spec.path !== authority.specPath
      || packageRead.workflowPackage.sources.spec.sha256 !== observation.specSha256) return { ok: false, code: "DWP-FINAL-PACKAGE-SOURCE-BINDING" };
    if (workflowApproval.mode === "chat") return { ok: true };
    const policy = readCriticalHumanProofPolicy(root);
    if (!policy?.ok) return { ok: false, code: policy?.code ?? "DWP-FINAL-PROOF-POLICY" };
    const anchors = policy.trustAnchors ?? (policy.trustAnchor === null ? [] : [policy.trustAnchor]);
    const signature = verifyStoredDesignWorkflowPackageSignature({
      repoRoot: root, packagePath, packageSha256, featureId: state.activeFeature.id,
      planPath: authority.planPath, planSha256: observation.planSha256,
      specPath: authority.specPath, specSha256: observation.specSha256,
      approval: workflowApproval, anchors,
    });
    return signature.ok === true ? { ok: true } : { ok: false, code: signature.code ?? "DWP-FINAL-SIGNATURE-INVALID" };
  } catch (error) { return { ok: false, code: error?.message ?? "DWP-FINAL-APPROVAL-ERROR" }; }
}

function selectedArchitectureState(root, expected = null) {
  const current = resolveProjectAuthorityPaths({ rootDir: root });
  requireValue(current.status === "ready" && ["neutral", "legacy"].includes(current.source),
    current.code ?? "ARCHITECTURE-DESIGN-AUTHORITY-UNAVAILABLE");
  requireValue(typeof current.state === "string" && /^[a-f0-9]{64}$/u.test(current.stateSha256 ?? "")
    && /^[a-f0-9]{64}$/u.test(current.manifestSha256 ?? ""), "ARCHITECTURE-DESIGN-APPROVAL-REQUIRED");
  const selection = { source: current.source, state: current.state, manifest: current.manifest,
    stateSha256: current.stateSha256, manifestSha256: current.manifestSha256 };
  requireValue(!expected || Object.keys(selection).every(key => selection[key] === expected[key]),
    "ARCHITECTURE-DESIGN-AUTHORITY-CHANGED");
  return selection;
}
function assertLock(root, lock, expectedSelection = null) {
  requireValue(lock?.ok, "ARCHITECTURE-DESIGN-LOCK-REQUIRED");
  const selection = selectedArchitectureState(root, expectedSelection);
  requireValue(lock.path === physical(root, `${selection.state}.lock`), "ARCHITECTURE-DESIGN-LOCK-REQUIRED");
  const current = JSON.parse(readFileSync(lock.path, "utf8"));
  requireValue(current.schema === "pipeline.continuity-lock.v0" && current.token === lock.token
    && current.ownerNonce === lock.ownerNonce, "ARCHITECTURE-DESIGN-LOCK-CHANGED");
  return selection;
}
const identity = path => { const row = lstatSync(path); return `${row.dev}:${row.ino}`; };

/** Transaction primitive. Authority is rechecked under the shared state-writer lock. */
export function publishArchitectureDesignTargets({ rootDir, lock, targets, validateAuthority, io = {} }) {
  const root = resolve(rootDir);
  const applied = [];
  const temporary = [];
  let selection = null;
  const write = io.writeFileSync ?? writeFileSync;
  try {
    selection = assertLock(root, lock);
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
      assertLock(root, lock, selection);
      requireValue(validateAuthority(), "ARCHITECTURE-DESIGN-AUTHORITY-CHANGED");
      if (before === null) { linkSync(tmp, path); unlinkSync(tmp); } // create-only, then release the staging hardlink before DAB readback
      else {
        requireValue(identity(path) === beforeIdentity && readFileSync(path).equals(before), "ARCHITECTURE-DESIGN-TARGET-CHANGED");
        renameSync(tmp, path);
      }
      record.published = true;
    }
    assertLock(root, lock, selection);
    requireValue(validateAuthority(), "ARCHITECTURE-DESIGN-AUTHORITY-CHANGED");
    requireValue(targets.every(target => bytes(root, target.path) === target.bytes), "ARCHITECTURE-DESIGN-READBACK-FAILED");
    return { ok: true, status: "published" };
  } catch (error) {
    const conflicts = [];
    for (const target of applied.reverse()) {
      if (!target.published) continue;
      try {
        assertLock(root, lock, selection);
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

/** Fixed target writer; caller must hold the sanctioned lifecycle writer's selected State lock. */
/** Read-only exact inventory shared by the Source companion and the locked writer. */
export function inspectArchitectureMaterializationTargets(rootDir, deps = {}) {
  const root = resolve(rootDir);
  const inspected = inspectArchitectureDesign(root, null, deps);
  if (!inspected.ok) return inspected;
  const subset = inspectApprovedDesignDecisionBindings({ rootDir: root, area: "architecture" });
  if (!subset.ok) return { ok: false, status: "blocked", code: subset.code };
  const prospective = subset.required ? prepareApprovedArchitectureMaterialization(subset.handle)
    : { ok: true, required: false, targets: [] };
  if (!prospective.ok) return { ok: false, status: "blocked", code: prospective.code };
  const mapTargets = inspected.receipt && inspected.status === "materialization-required"
    ? [...inspected.targets, { path: "architecture/design-materialization.json", bytes: json(inspected.receipt) }] : [];
  // The retained authority is the final publication of the single transaction.
  const targets = [...prospective.targets.filter(target => target.path !== prospective.referencePath),
    ...mapTargets, ...prospective.targets.filter(target => target.path === prospective.referencePath)];
  requireValue(new Set(targets.map(target => target.path)).size === targets.length, "ARCHITECTURE-DESIGN-DUPLICATE-TARGET");
  const mapInventory = inspected.receipt
    ? [...inspected.targets, { path: "architecture/design-materialization.json", bytes: json(inspected.receipt) }] : [];
  const prospectiveInventory = prospective.inventoryTargets ?? [];
  const sealedTargets = [...prospectiveInventory.filter(target => target.path !== prospective.referencePath),
    ...mapInventory, ...prospectiveInventory.filter(target => target.path === prospective.referencePath)];
  return { ok: true, inspected, prospective, approvalBasis: subset.approvalBasis ?? null, targets, sealedTargets };
}

export function materializeArchitectureDesign(rootDir, { lock, ...inspectDeps } = {}) {
  const root = resolve(rootDir);
  try {
    const selection = assertLock(root, lock);
    const stateBytes = bytes(root, selection.state);
    const inventory = inspectArchitectureMaterializationTargets(root, inspectDeps);
    if (!inventory.ok) return inventory;
    const inspected = inventory.inspected;
    const state = JSON.parse(stateBytes);
    const authority = state.planApproval.poGateAuthority;
    const result = inventory.targets.length ? publishArchitectureDesignTargets({ rootDir: root, lock,
      targets: inventory.targets, validateAuthority: () => {
        selectedArchitectureState(root, selection);
        if (bytes(root, selection.state) !== stateBytes) return false;
        const planSha256 = hash(bytes(root, authority.planPath));
        const specSha256 = hash(bytes(root, authority.specPath));
        if (inspected.receipt && (planSha256 !== inspected.receipt.planSha256 || specSha256 !== inspected.receipt.specSha256)) return false;
        if (["pipeline.plan-approval.v8", "pipeline.plan-approval.v9"].includes(state.planApproval?.schema)) {
          const current = inspectApprovedDesignDecisionBindings({ rootDir: root, area: "architecture" });
          return designAdvisoryAdmission(state, root, authority.planPath, authority.specPath).ok && current.ok
            && JSON.stringify(current.approvalBasis ?? null) === JSON.stringify(inventory.approvalBasis);
        }
        const checked = validatePoGateAuthorityForRepository({ repoRoot: root, expectedPlanSha256: planSha256, expectedSpecSha256: specSha256 });
        const bootstrapValid = checked.ok && Object.entries(authority).every(([key, value]) => checked.value[key] === value);
        return bootstrapValid || verifyFinalDesignWorkflowApproval(root, state, authority, { planSha256, specSha256 }, inspectDeps).ok;
      } }) : { ok: true, status: "published" };
    if (!result.ok) return result;
    const readback = inspectArchitectureMaterializationTargets(root, inspectDeps);
    if (!readback.ok || readback.targets.length) return { ok: false, status: "blocked", code: readback.code ?? "ARCHITECTURE-DESIGN-READBACK" };
    const subset = inspectApprovedDesignDecisionBindings({ rootDir: root, area: "architecture" });
    if (!subset.ok) return { ok: false, status: "blocked", code: subset.code };
    if (subset.required) {
      const retained = retainApprovedDesignArchitectureReference(subset.handle);
      if (!retained.ok) return { ok: false, status: "blocked", code: retained.code };
    }
    return inventory.prospective.required && readback.inspected.status === "not-required"
      ? { ...readback.inspected, required: true, status: "materialized", materializationKind: "prospective-adr-only", referencePath: inventory.prospective.referencePath }
      : readback.inspected;
  } catch (error) { return { ok: false, status: "blocked", code: error.message }; }
}
