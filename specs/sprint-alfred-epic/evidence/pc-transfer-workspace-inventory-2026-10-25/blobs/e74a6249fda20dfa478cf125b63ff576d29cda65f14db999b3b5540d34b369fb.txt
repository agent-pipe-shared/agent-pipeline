import { registerTestCaseCompletion } from "../../plugins/pipeline-core/lib/test-case-completion.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectArchitectureEntryReadiness, ARCHITECTURE_ENTRY_SCOPE } from "../../plugins/pipeline-core/lib/architecture-entry-readiness.mjs";
import { inspectArchitectureDecisionContinuity } from "../../plugins/pipeline-core/lib/architecture-decision-continuity.mjs";
import { inspectArchitectureDecisionAuthoringSources } from "../../plugins/pipeline-core/lib/architecture-effective-decisions.mjs";
import { resolveOrganizationArchitectureSources } from "../../plugins/pipeline-core/lib/organization-architecture-source.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const main = resolve(testDirectory, "../..");
const owned = join(main, "scratch", "architecture-entry-required-source-fixtures");
mkdirSync(owned, { recursive: true });
const cases = [];
const register = (id, name, run) => cases.push({ id, name, run });
const now = "2026-10-09T12:00:00.000Z";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const surface = { planPath: "specs/repro.md", paths: ["plugins/pipeline-core/lib/architecture-entry-readiness.mjs"] };
const resolvedInherited = {
  schema: "pipeline.effective-organization-architecture-sources.v1",
  status: "ready", code: "ORG-ARCH-SOURCES-READY", decisions: [],
  sourceBindings: [{ sourceId: "org-required", layer: "organization", required: true,
    status: "consumed", sourceSha256: sha("injected resolved owner output"), expiresAt: "2026-10-10T12:00:00.000Z" }],
  findings: [],
};
const unavailableInherited = resolveOrganizationArchitectureSources({
  configured: [{ sourceId: "org-required", layer: "organization", required: true,
    source: null, proof: null, trustAnchors: [] }], now,
});

function observe(inherited) {
  const root = mkdtempSync(join(owned, "fixture-"));
  try {
    cpSync(join(main, "architecture"), join(root, "architecture"), { recursive: true });
    cpSync(join(main, "AGENTS.md"), join(root, "AGENTS.md"));
    mkdirSync(join(root, "docs", "adr"), { recursive: true });
    const body = "# Reproduction project constraint\n";
    writeFileSync(join(root, "docs", "adr", "REPRO.md"), body);
    writeFileSync(join(root, "docs", "adr", "REPRO.json"), JSON.stringify({
      schema: "pipeline.architecture-decision.v1", id: "ADR-REPRO", title: "Reproduction",
      status: "accepted", digest: sha(body), scope: "project", date: "2026-10-09",
    }) + "\n");
    const local = inspectArchitectureDecisionAuthoringSources({ rootDir: root, area: "pipeline-core", now });
    assert.equal(local.status, "ready", JSON.stringify(local));
    const readerCalls = [];
    const result = inspectArchitectureEntryReadiness({
      rootDir: root, planningSurface: surface, now: new Date(now),
      deps: {
        resolveAdoptionState: () => ({ state: "adoption-approved-scoped", coverageClass: "complete", confidence: "injected-unit-control" }),
        inspectArchitectureDesign: () => ({ ok: false, status: "not-required", code: "ARCHITECTURE-DESIGN-NOT-REQUIRED" }),
        checkPlanningAdoptionDisposition: () => ({ ok: true, disposition: "approved-scoped",
          scope: [ARCHITECTURE_ENTRY_SCOPE], expiresAt: "2099-01-01" }),
        readCheckpointArchitectureDebt: () => ({ ok: true, debt: [], resolvedDebt: [] }),
        evaluateArchitectureFitness: () => ({ overallStatus: "pass",
          summary: { passCount: 10, findingCount: 0, exceptedCount: 0, unavailableCount: 0,
            unsupportedCount: 0, unknownCount: 0, totalClasses: 10 },
          outcomes: Array.from({ length: 10 }, (_, index) => ({ classId: index + 1, outcome: "pass" })) }),
        inspectDecisions: (input) => {
          readerCalls.push({ area: input.area, now: input.now });
          return inspectArchitectureDecisionContinuity(input, {
            inspectLocal: () => local,
            inspectInherited: () => inherited,
            inspectWaivers: () => ({ status: "ready", waivers: [], findings: [] }),
          });
        },
      },
    });
    assert.equal(result.artifacts.map.status, "current", JSON.stringify(result));
    assert.equal(result.artifacts.fitnessModel.status, "current", JSON.stringify(result));
    assert.equal(result.artifacts.baseline.status, "current", JSON.stringify(result));
    assert.equal(result.disposition.disposition, "approved-scoped");
    assert.deepEqual(readerCalls, [{ area: "pipeline-core", now }]);
    console.log("OBSERVATION " + JSON.stringify({
      inheritedStatus: inherited.status, inheritedCode: inherited.code,
      inheritedFindings: inherited.findings,
      entryStatus: result.status, entryCode: result.code,
      applicability: result.artifacts.decisionApplicability,
      fitnessBlocking: result.fitness?.blockingOverallStatus,
      mapStatus: result.artifacts.map.status, adoption: result.disposition.disposition,
    }));
    return result;
  } finally { rmSync(root, { recursive: true, force: true }); }
}

register("AC19REQ001", "resolved decision applicability preserves approved-scoped ready entry (positive control)", () => {
  const result = observe(resolvedInherited);
  assert.equal(result.artifacts.decisionApplicability.status, "ready");
  assert.equal(result.status, "ready", JSON.stringify(result));
});

register("AC19REQ002", "mandatory inherited source unavailable blocks approved-scoped entry (required negative contract)", () => {
  assert.equal(unavailableInherited.status, "blocked");
  assert.equal(unavailableInherited.findings[0].code, "mandatory-source-unavailable");
  const result = observe(unavailableInherited);
  assert.equal(result.artifacts.decisionApplicability.status, "blocked");
  assert.equal(result.artifacts.decisionApplicability.areas[0].code, "ARCH-CONTINUITY-SOURCE-UNRESOLVED");
  assert.equal(result.status, "blocked", "Mandatory inherited source is unresolved; approved-scoped entry must fail closed");
});

registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"),
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "8192") });
