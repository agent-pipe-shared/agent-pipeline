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
export function observeArchitectureAdoptionOrientation({ rootDir = process.cwd(), now = new Date(), deps = {} } = {}) {
  const root = resolve(rootDir);
  const adoption = (deps.resolveAdoptionState ?? resolveAdoptionState)(root, now);
  const greenfieldScaffold = (deps.hasExactGreenfieldDesignPendingScaffold ?? hasExactGreenfieldDesignPendingScaffold)({
    rootDir: root,
    read: deps.read ?? readFileSync,
    exists: deps.exists ?? existsSync,
  });
  const indexPresent = (deps.exists ?? existsSync)(resolve(root, "architecture/map/index.md"));
  const physicalMapStatus = greenfieldScaffold ? "design-pending"
    : indexPresent ? "present-unvalidated" : "missing";
  const adoptionRequired = adoption?.state === "adoption-required";
  const status = adoptionRequired
    ? (greenfieldScaffold ? "design-pending" : "adoption-required")
    : "decision-recorded";
  const guidance = status === "design-pending"
    ? "The greenfield navigation scaffold exists but is not an adopted architecture baseline. Complete initial design, then record a scoped architecture disposition before implementation."
    : status === "adoption-required"
      ? "No usable architecture adoption decision exists. Review the staged read-only adoption proposal with the PO before implementation."
      : physicalMapStatus === "missing"
        ? "A durable architecture adoption decision exists, but the physical map index is missing. Preserve that decision; materialize the map before implementation, where map and fitness evidence are verified."
        : "A durable architecture adoption decision was read back. Respect its scope; the present map and fitness evidence are verified only at the implementation boundary.";
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
  };
}
