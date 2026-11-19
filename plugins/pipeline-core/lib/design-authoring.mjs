// SPDX-License-Identifier: SUL-1.0
/** Draft authoring aids. These create no receipt, approval or implementation. */
import { scanAcceptedCriterionRows } from "./critic-accepted-contract.mjs";
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
  return "<!-- DRAFT TEMPLATE: replace every REPLACE value and all example paths. Split modules as needed: cut one module per separable responsibility, a part that two people could build without talking to each other, each with its own ownedPaths, publicContracts and verificationEntryPoints; a single module means no slice can run in parallel. The disposition records a proposal for the final signed design; this template grants no approval. Decisions to record: for every decision that needs an ADR, name its title, trigger and ADR path (docs/adr/NNNN-title.md) in the adrReferences of the module it concerns; classic triggers are module boundaries, data keeping, offline and error strategy, and a security trade-off. -->\n"
    + "```pipeline-architecture-design\n" + JSON.stringify(design, null, 2) + "\n```\n";
}

export function renderDesignTraceabilitySkeleton() {
  return "## Acceptance criteria\n\n"
    + "| # | Criterion | Evidence |\n"
    + "|---|---|---|\n"
    + "| AC-1 | WHEN <trigger>, the system SHALL <observable result>. | REPLACE: test path and case |\n\n"
    + "## Traceability\n\n| Design input | Requirement | Acceptance criterion | Verification entry point |\n"
    + "|---|---|---|---|\n| REPLACE: input reference | REPLACE: requirement | AC-1 | REPLACE: test path and case |\n";
}

/** Use the accepted parser's section context; normalize only the legacy unsupported bullet shape. */
export function hasGeneratedCriterionPlaceholder(text) {
  if (typeof text !== "string") return false;
  const placeholder = "WHEN <trigger>, the system SHALL <observable result>.";
  const matches = source => scanAcceptedCriterionRows(source).some(row => row.normative && row.valid !== false
    && row.id === "AC-1" && row.text === placeholder);
  if (matches(text)) return true;
  const legacy = /^- AC-01: WHEN <trigger>, the system SHALL <observable result>\.[ \t]*$/gmu;
  return matches(text.replace(legacy, `- **AC-1:** ${placeholder}`));
}

/**
 * The draft markers one generated document still holds, as short labels (C32 F10: two runners searched the plugin source to learn which marker keeps the bind blocked).
 * Derived from the file bytes on every call, nothing stored. `stagingDesignNeedsAuthoring` is exactly "some marker is left", so the labels cannot drift from the signal.
 */
function draftMarkers(text) {
  if (typeof text !== "string") return [];
  const markers = [];
  if (text.includes("<!-- DRAFT TEMPLATE: replace every REPLACE value and all example paths.")) markers.push("the `<!-- DRAFT TEMPLATE: replace every REPLACE value ... -->` comment");
  if (/^\s*[-|].*REPLACE: (?:input reference|requirement|test path and case)/mu.test(text)) markers.push("a table row that still says `REPLACE: input reference`, `REPLACE: requirement` or `REPLACE: test path and case`");
  if (/"(?:responsibility|rationale|profileId)"\s*:\s*"REPLACE: /u.test(text)) markers.push("an architecture block value (responsibility, rationale or profileId) that still starts with `REPLACE: `");
  if (hasGeneratedCriterionPlaceholder(text)) markers.push("the generated placeholder criterion `AC-1: WHEN <trigger>, the system SHALL <observable result>.`");
  return markers;
}

/** The labels of the draft markers still present in the generated PRD and Spec, per document; `[]` when both are authored. */
export function stagingDesignAuthoringMarkers(prdText, specText) {
  return [["PRD", draftMarkers(prdText)], ["Spec", draftMarkers(specText)]].flatMap(([label, markers]) => markers.map(marker => `${label}: ${marker}`));
}

/** Read-only draft signal for the coordinator; binding still validates the exact source bytes. */
export function stagingDesignNeedsAuthoring(prdText, specText) {
  return draftMarkers(prdText).length > 0 || draftMarkers(specText).length > 0;
}

/** Keep full evidence on disk; avoid repeating document payloads in the action readback. */
export function compactActionReadback(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const retained = ["schema", "ok", "status", "code", "intentSha256", "planSha256", "specSha256", "requestPath",
    "packagePath", "receiptPath", "nextAction", "action", "pendingAsks", "guidance", "error", "recovery"];
  return Object.fromEntries(retained.filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]]));
}
