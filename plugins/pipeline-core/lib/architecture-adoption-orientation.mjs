// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only bootstrap orientation for the repository architecture estate.
 *
 * This deliberately does not decide lifecycle readiness.  A session may
 * orient a PO to an adoption choice before a design/implementation boundary;
 * the existing architecture-entry readiness and lifecycle guard remain the
 * authority gates that refuse implementation without physical evidence and a
 * scoped, PO-owned disposition.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveAdoptionState } from "../scripts/architecture-adoption.mjs";
import { architectureVerdictLabel, currentArchitectureProjection, fitnessObservationVerdictLabel } from "./architecture-verdict-label.mjs";
import { readRecordedFitnessObservation } from "./rigor-lifecycle.mjs";

export const ARCHITECTURE_ADOPTION_ORIENTATION_SCHEMA = "pipeline.architecture-adoption-orientation.v1";

function readJson(path, read) {
  try {
    const value = JSON.parse(read(path, "utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * A greenfield scaffold is a deliberately narrow physical marker, not an
 * architecture baseline.  Treating a merely similarly named index as one
 * would let a brownfield repository evade the actionable adoption route.
 */
export function hasExactGreenfieldDesignPendingScaffold({ rootDir = process.cwd(), read = readFileSync, exists = existsSync } = {}) {
  const root = resolve(rootDir);
  const indexPath = resolve(root, "architecture/map/index.md");
  const inventoryPath = resolve(root, "architecture/map/inventory.json");
  if (!exists(indexPath) || !exists(inventoryPath)) return false;
  let index;
  try { index = read(indexPath, "utf8"); } catch { return false; }
  const inventory = readJson(inventoryPath, read);
  return index === "# Architecture Map\n\nStatus: design-pending. Coverage: unknown.\n\nThe project has no designed modules yet. Define bounded module responsibilities,\nowned paths and contracts in the initial design before implementation.\n\n[Machine inventory](inventory.json)\n\nThis scaffold is neither architecture adoption nor measured fitness evidence.\n"
    && inventory?.schema === "pipeline.architecture-map-scaffold.v1"
    && inventory.origin === "greenfield-bootstrap"
    && inventory.status === "design-pending"
    && inventory.coverage === "unknown"
    && Array.isArray(inventory.modules)
    && inventory.modules.length === 0
    && inventory.designSource === null
    && Object.keys(inventory).sort().join(",") === "coverage,designSource,modules,origin,schema,status";
}

/**
 * Produces one compact readback that every runner's normal bootstrap can
 * surface.  It contains no mutation and does not make an adoption decision.
 */
export function observeArchitectureAdoptionOrientation({ rootDir = process.cwd(), now, deps = {} } = {}) {
  const root = resolve(rootDir);
  const adoption = (deps.resolveAdoptionState ?? resolveAdoptionState)(root, now ?? new Date());
  const greenfieldScaffold = (deps.hasExactGreenfieldDesignPendingScaffold ?? hasExactGreenfieldDesignPendingScaffold)({
    rootDir: root,
    read: deps.read ?? readFileSync,
    exists: deps.exists ?? existsSync,
  });
  const indexPresent = (deps.exists ?? existsSync)(resolve(root, "architecture/map/index.md"));
  const physicalMapStatus = greenfieldScaffold ? "design-pending"
    : indexPresent ? "present-unvalidated" : "missing";
  const adoptionRequired = adoption?.state === "adoption-required";
  const migrationRequired = adoption?.state === "deferred";
  const status = adoptionRequired
    ? (greenfieldScaffold ? "design-pending" : "adoption-required")
    : migrationRequired ? "migration-required" : "decision-recorded";
  const guidance = status === "design-pending"
    ? "The greenfield navigation scaffold exists but is not an adopted architecture baseline. Put the architecture design block in the PRD; it is approved with the plan. After approve-plan, run pipeline-state.mjs materialize-architecture (an agent step, no separate PO decision) before set-phase implementation. Do not use architecture-adoption.mjs prepare/apply: that route is for existing repositories."
    : status === "adoption-required"
      ? "No usable architecture adoption decision exists. Review the staged read-only adoption proposal with the PO before implementation."
      : status === "migration-required"
        ? "A legacy deferred architecture adoption exists. Before implementation it must be migrated to an approved-scoped adoption over a measured baseline (D162): review the read-only proposal's migration block with the PO, who confirms it through the same route as a fresh adoption."
      : physicalMapStatus === "missing"
        ? "A durable architecture adoption decision exists, but the physical map index is missing. Preserve that decision; materialize the map before implementation, where map and fitness evidence are verified."
        : "A durable architecture adoption decision was read back. Respect its scope; the present map and fitness evidence are verified only at the implementation boundary.";
  // CGF-08: the one architecture projection, from STORED observations only (AC-245 byte-compares two bootstrap envelopes: no boundary run, no
  // clock here). No blocking result is stored anywhere the bootstrap may read, so the gate part is typed "no-blocking-result"; the latest
  // recorded fitness observation (any feature) stays beside it as report-only with its own observation date. An unreadable store is typed absent.
  let fitnessLabel = null;
  try {
    const recorded = (deps.readFitnessObservation ?? readRecordedFitnessObservation)(root);
    if (recorded) fitnessLabel = architectureVerdictLabel({ ...fitnessObservationVerdictLabel(recorded), scope: "fitness property classes, latest recorded observation in the repository" });
  } catch { fitnessLabel = null; }
  return {
    schema: ARCHITECTURE_ADOPTION_ORIENTATION_SCHEMA,
    status,
    root,
    adoption: {
      state: typeof adoption?.state === "string" ? adoption.state : "adoption-required",
      scope: adoption?.scope ?? null,
      decisionRef: adoption?.decisionRef ?? null,
      coverageClass: adoption?.coverageClass ?? "unavailable",
      confidence: adoption?.confidence ?? "estimated",
      ...(typeof adoption?.authorityError === "string" ? { authorityError: adoption.authorityError } : {}),
    },
    physicalMap: {
      greenfieldScaffold,
      status: physicalMapStatus,
    },
    guidance,
    // CGF-08/CGF-23: this orientation only reports; it is not bound to a candidate commit and never decides readiness.
    verdict: architectureVerdictLabel({
      source: "architecture-adoption-orientation", verdict: status, candidate: null,
      // The bootstrap envelope is byte-compared (AC-245), so no wall clock enters it: the date is named only when the caller supplies the clock.
      observedAt: now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : null,
      scope: (Array.isArray(adoption?.scope) ? adoption.scope.filter((entry) => typeof entry === "string").join(", ")
        : typeof adoption?.scope === "string" ? adoption.scope : "") || "repository (no scope recorded)",
      effect: "report-only", currency: "current",
    }),
    architectureProjection: currentArchitectureProjection({ boundaryVerdict: null, fitnessLabel }),
  };
}
