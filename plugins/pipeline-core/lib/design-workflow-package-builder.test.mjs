// SPDX-License-Identifier: SUL-1.0
// Canonical v2 package builder fixtures use a synthetic managed host only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { openSync } from "node:fs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { advisorHostFixture } from "./codex-advisor-host.fixture.mjs";
import { readinessFixture } from "./codex-readiness-finalization.fixture.mjs";
import { coordinateInitialDesignAdvisory } from "./design-advisory-coordinator-v2.mjs";
import { readDesignReadinessPreparationFromRepository } from "./design-workflow-package-v2.mjs";
import { readDesignWorkflowPackageV2FromRepository } from "./design-workflow-package-v2.mjs";
import { observeAdvisorCandidate, observeInitialAdvisorSources } from "./design-advisor-provenance.mjs";
import { designAdvisorValueSha256 } from "./design-advisor-course.mjs";
import { canonicalJson } from "./codex-sandbox-compatibility.mjs";
import { runCodexToolFreeDesignReadiness } from "./codex-tool-free-design-readiness.mjs";
import { runIsolatedStructuredHost } from "./codex-isolated-structured-host.mjs";
import { verifyDesignReadinessHostExecution } from "./design-readiness-host-evidence.mjs";
import { buildDesignWorkflowPackageV2 } from "./design-workflow-package-builder.mjs";
import { createNativeInitialAdvisorExecution } from "./native-initial-advisor-execution.mjs";
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";
import { exportCodexDesignAdvisorArtifacts } from "../scripts/codex-design-advisor-bootstrap.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cases = [];
function test(name, run) {
  cases.push({ id: `DWPB${String(cases.length + 1).padStart(3, "0")}`, name, run });
}

async function preparedFixture(t) {
  const f = advisorHostFixture(t);
  const readinessHost = readinessFixture(t);
  const git = (args) => execFileSync("git", ["-C", f.root, ...args], { encoding: "utf8", timeout: 10000 }).trim();
  const consultation = await coordinateInitialDesignAdvisory({
    repoRoot: f.root, featureId: "advisor-feature", authoringDispatchId: "elephant-author",
    sources: f.sources, reason: "risk-review", profile: "feature", dispatch: f.args.dispatch,
    route: f.route, hostExecution: f.execution,
  });
  assert.equal(consultation.ok, true, JSON.stringify(consultation));
  const candidate = observeAdvisorCandidate(f.root);
  const sources = observeInitialAdvisorSources({
    repoRoot: f.root, candidate,
    sourcePaths: Object.fromEntries(Object.entries(f.sources).map(([name, source]) => [name, source.path])),
  });
  assert.equal(sources.ok, true, JSON.stringify(sources));
  mkdirSync(join(f.root, "evidence"));
  // In the fixture only: evidence is ignored exactly as a local package path must be.
  writeFileSync(join(f.root, ".git", "info", "exclude"), "\n/evidence/\n");
  const publish = (name, bytes) => {
    const path = `evidence/${name}`;
    writeFileSync(join(f.root, path), bytes);
    return { path, sha256: hash(bytes) };
  };
  const initial = publish("initial.json", Buffer.from(`${canonicalJson(consultation.initialContext)}\n`));
  const receipt = publish("advisor.json", consultation.receiptBytes);
  const report = publish("advisor-report.json", Buffer.from(canonicalJson(consultation.report)));
  const disposition = {
    schema: "pipeline.design-advisor-disposition.v1", courseId: consultation.courseBinding.courseId,
    consultationSha256: designAdvisorValueSha256(consultation.consultation),
    proposalSetSha256: consultation.consultation.proposalSetSha256,
    items: [{ proposalId: "proposal-1", decision: "reject", rationale: "Retain the current synthetic design.", revisionCommit: null }],
    ownerDispatchId: "author-revision", createdAt: new Date().toISOString(),
  };
  const preparation = {
    schema: "pipeline.design-readiness-preparation.v2", featureId: "advisor-feature",
    authoringDispatchId: "elephant-author", candidate, sources: sources.sources,
    advisor: {
      status: "answered", runner: "codex", profile: "feature", route: f.route,
      initialContext: initial, courseBinding: consultation.courseBinding,
      consultation: consultation.consultation, hostReceipt: consultation.hostReceipt,
      receipt, report, disposition, revisions: [],
    },
    createdAt: new Date().toISOString(),
  };
  publish("preparation.json", Buffer.from(canonicalJson(preparation)));
  const prepRead = readDesignReadinessPreparationFromRepository({
    repoRoot: f.root, packagePath: "evidence/preparation.json", trustedAdvisorExecutablePath: process.execPath,
  });
  assert.equal(prepRead.ok, true, JSON.stringify(prepRead));
  const route = { ...f.route, candidateCommit: candidate.commit };
  const ready = await runCodexToolFreeDesignReadiness({
    repoRoot: f.root, repoFingerprint: f.repoFingerprint, codexPath: process.execPath,
    store: f.store, dispatchId: "final-readiness", candidate, sources: sources.sources,
    route, inputDirectory: readinessHost.input, advisorObservation: prepRead.advisorObservation,
    invokeHost: (input) => runIsolatedStructuredHost(input),
    readCandidate: () => observeAdvisorCandidate(f.root),
    readCommittedSource: (_root, commit, path) => execFileSync("git", ["-C", f.root, "show", `${commit}:${path}`], { timeout: 10000 }),
  });
  assert.equal(ready.status, "reviewed", JSON.stringify(ready));
  publish("readiness.json", Buffer.from(canonicalJson(ready.report)));
  const verifyReadinessExecution = (input) => verifyDesignReadinessHostExecution({
    ...input,
    resolveRoute: () => ({ state: "default", runner: "codex", ...route }),
    resolveCodexExecutable: () => process.execPath,
  });
  return { f, candidate, sources: sources.sources, verifyReadinessExecution };
}

test("builder publishes one canonical ignored v2 package and refuses overwrite", async (t) => {
  const fixture = await preparedFixture(t);
  const args = {
    repoRoot: fixture.f.root,
    packagePath: "evidence/design-workflow-package.json",
    preparationPath: "evidence/preparation.json",
    readinessPath: "evidence/readiness.json",
    readinessDispatchId: "final-readiness",
    featureId: "advisor-feature",
    authoringDispatchId: "elephant-author",
    expectedCandidate: fixture.candidate,
    expectedSources: fixture.sources,
    trustedAdvisorExecutablePath: process.execPath,
    verifyReadinessExecution: fixture.verifyReadinessExecution,
  };
  const built = buildDesignWorkflowPackageV2(args);
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.equal(built.code, "DWP2-PACKAGE-BUILT");
  assert.equal(built.advisorExceptionRequired, false);
  assert.equal(built.packageRead.implementationAuthority, false);
  assert.equal(built.packageRead.approvalReview.approvalStatus, "pending-po-approval");
  assert.equal(built.packageSha256, hash(readFileSync(join(fixture.f.root, args.packagePath))));
  assert.equal(readDesignWorkflowPackageV2FromRepository({
    repoRoot: fixture.f.root, packagePath: args.packagePath,
    trustedAdvisorExecutablePath: process.execPath, verifyReadinessExecution: fixture.verifyReadinessExecution,
  }).ok, true);
  assert.equal(buildDesignWorkflowPackageV2(args).code, "DWP2-BUILDER-OUTPUT-EXISTS");
});

test("builder rejects stale candidate bindings and unsafe destinations without publishing", async (t) => {
  const fixture = await preparedFixture(t);
  const args = {
    repoRoot: fixture.f.root, packagePath: "evidence/stale.json",
    preparationPath: "evidence/preparation.json", readinessPath: "evidence/readiness.json",
    readinessDispatchId: "final-readiness", featureId: "advisor-feature",
    authoringDispatchId: "elephant-author", expectedCandidate: { ...fixture.candidate, commit: "0".repeat(40) },
    expectedSources: fixture.sources, trustedAdvisorExecutablePath: process.execPath,
    verifyReadinessExecution: fixture.verifyReadinessExecution,
  };
  assert.equal(buildDesignWorkflowPackageV2(args).code, "DWP2-BUILDER-CANDIDATE");
  assert.equal(buildDesignWorkflowPackageV2({ ...args, packagePath: "scratch/not-allowed.json", expectedCandidate: fixture.candidate }).code, "DWP2-BUILDER-INPUT");
  assert.equal(buildDesignWorkflowPackageV2({ ...args, packagePath: "unignored-package.json", expectedCandidate: fixture.candidate }).code, "DWP2-BUILDER-OUTPUT-NOT-IGNORED");
});

test("builder retains a canonical no-child Advisor exception as pending PO approval", async (t) => {
  const f = advisorHostFixture(t, "cross-citation");
  const readinessHost = readinessFixture(t);
  const registry = loadRunnerProfilesV3Registry();
  const advisorRoute = {
    model: null, effort: null, sourceSha256: designAdvisorValueSha256(registry),
    candidateCommit: f.candidate.commit,
  };
  const failure = await coordinateInitialDesignAdvisory({
    repoRoot: f.root, runner: "claude", featureId: "advisor-feature",
    authoringDispatchId: "elephant-author", sources: f.sources, reason: "risk-review",
    profile: "feature", dispatch: f.args.dispatch, route: advisorRoute,
    hostExecution: createNativeInitialAdvisorExecution({ runner: "claude" }),
  });
  assert.equal(failure.status, "unavailable-pending-final-approval", JSON.stringify(failure));
  const candidate = observeAdvisorCandidate(f.root);
  const sources = observeInitialAdvisorSources({
    repoRoot: f.root, candidate,
    sourcePaths: Object.fromEntries(Object.entries(f.sources).map(([name, source]) => [name, source.path])),
  });
  assert.equal(sources.ok, true, JSON.stringify(sources));
  mkdirSync(join(f.root, "evidence"));
  writeFileSync(join(f.root, ".git", "info", "exclude"), "\n/evidence/\n");
  const artifacts = exportCodexDesignAdvisorArtifacts(f.root, "evidence/failure", failure);
  assert.ok(artifacts.initial && artifacts.failure);
  assert.equal(artifacts.receipt, undefined);
  assert.equal(artifacts.report, undefined);
  const publish = (name, value) => {
    const bytes = Buffer.from(canonicalJson(value));
    writeFileSync(join(f.root, `evidence/${name}`), bytes);
    return { path: `evidence/${name}`, sha256: hash(bytes) };
  };
  const preparation = {
    schema: "pipeline.design-readiness-preparation.v2", featureId: "advisor-feature",
    authoringDispatchId: "elephant-author", candidate, sources: sources.sources,
    advisor: {
      status: "unavailable", runner: "claude", profile: "feature", route: advisorRoute,
      initialContext: artifacts.initial, courseBinding: failure.courseBinding, consultation: null,
      hostReceipt: null, receipt: null, report: null, disposition: null, revisions: [],
      failureEvidence: artifacts.failure,
      proposedException: {
        kind: "advisor-unavailable", approval: "final", oneTime: true,
        rationale: "Review the final design with the recorded Advisor failure.",
      },
    },
    createdAt: new Date().toISOString(),
  };
  publish("preparation.json", preparation);
  const prepared = readDesignReadinessPreparationFromRepository({
    repoRoot: f.root, packagePath: "evidence/preparation.json", trustedAdvisorExecutablePath: process.execPath,
  });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const ready = await runCodexToolFreeDesignReadiness({
    repoRoot: f.root, repoFingerprint: f.repoFingerprint, codexPath: process.execPath,
    store: f.store, dispatchId: "exception-readiness", candidate, sources: sources.sources,
    route: { ...f.route, candidateCommit: candidate.commit }, inputDirectory: readinessHost.input,
    advisorObservation: prepared.advisorObservation, invokeHost: (input) => runIsolatedStructuredHost(input),
    readCandidate: () => observeAdvisorCandidate(f.root),
    readCommittedSource: (_root, commit, path) => execFileSync("git", ["-C", f.root, "show", `${commit}:${path}`], { timeout: 10000 }),
  });
  assert.equal(ready.status, "reviewed", JSON.stringify(ready));
  publish("readiness.json", ready.report);
  const verifyReadinessExecution = (input) => verifyDesignReadinessHostExecution({
    ...input,
    resolveRoute: () => ({ state: "default", runner: "codex", ...f.route, candidateCommit: candidate.commit }),
    resolveCodexExecutable: () => process.execPath,
  });
  const built = buildDesignWorkflowPackageV2({
    repoRoot: f.root, packagePath: "evidence/unavailable-package.json",
    preparationPath: "evidence/preparation.json", readinessPath: "evidence/readiness.json",
    readinessDispatchId: "exception-readiness", featureId: "advisor-feature",
    authoringDispatchId: "elephant-author", expectedCandidate: candidate,
    expectedSources: sources.sources, trustedAdvisorExecutablePath: process.execPath,
    verifyReadinessExecution,
  });
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.equal(built.advisorExceptionRequired, true);
  assert.equal(built.packageRead.advisorStatus, "unavailable");
  assert.equal(built.packageRead.approvalReview.approvalStatus, "pending-po-approval");
  assert.equal(built.packageRead.implementationAuthority, false);
  assert.equal(built.packageRead.approvalReview.initialConsultation.report, null);
});

const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync("/dev/null", "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd: completionFd, maxBytes: 65536 });
