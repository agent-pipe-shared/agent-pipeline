// SPDX-License-Identifier: SUL-1.0
/** Draft authoring aids. These create no receipt, approval or implementation. */
export function renderArchitectureDesignSkeleton() {
  const module = { id: "application", responsibility: "REPLACE: application responsibility",
    nonResponsibilities: ["REPLACE: excluded responsibility"], ownedPaths: ["src/**", "tests/**", "docs/contracts/application.md"],
    publicContracts: ["docs/contracts/application.md"], allowedDependencies: [], authorityEffects: [],
    verificationEntryPoints: ["tests/application.test.mjs"], adrReferences: [] };
  const design = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield",
    disposition: { decision: "approved-scoped", scope: ["src/", "tests/", "docs/contracts/", "architecture/", "specs/"],
      rationale: "REPLACE: why the proposed module boundaries fit this design" }, modules: [module],
    implementationSurface: ["src/application.mjs"], fitnessModel: { schema: "pipeline.fitness-model.v1",
      profileId: "REPLACE: project fitness profile", revision: 1, allowedBoundaryCrossings: [],
      antiFragmentationPolicy: { rejectTrivialFacades: true } } };
  return "<!-- DRAFT TEMPLATE: replace every REPLACE value and all example paths. Split modules as needed. The disposition records a proposal for the final signed design; this template grants no approval. -->\n"
    + "```pipeline-architecture-design\n" + JSON.stringify(design, null, 2) + "\n```\n";
}

export function renderDesignTraceabilitySkeleton() {
  return "## Acceptance criteria\n\n"
    + "- AC-01: WHEN <trigger>, the system SHALL <observable result>.\n\n"
    + "## Traceability\n\n| Design input | Requirement | Acceptance criterion | Verification entry point |\n"
    + "|---|---|---|---|\n| REPLACE: input reference | REPLACE: requirement | AC-01 | REPLACE: test path and case |\n";
}

/** Keep full evidence on disk; avoid repeating document payloads in the action readback. */
export function compactActionReadback(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const retained = ["schema", "ok", "status", "code", "intentSha256", "planSha256", "specSha256", "requestPath",
    "packagePath", "receiptPath", "nextAction", "action", "pendingAsks", "guidance", "error", "recovery"];
  return Object.fromEntries(retained.filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]]));
}
