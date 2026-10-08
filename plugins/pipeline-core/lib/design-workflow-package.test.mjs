// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir, devNull } from "node:os";
import { spawnSync } from "node:child_process";

import {
  designWorkflowAdvisorExceptionRationale,
  designWorkflowAdvisorQuestionSha256,
  readApprovedDesignWorkflowPackage,
  readDesignWorkflowPackageFromRepository,
  validateDesignWorkflowPackage,
} from "./design-workflow-package.mjs";
import {
  createDesignWorkflowPackageApprovalRequest,
  verifyDesignWorkflowPackageApproval,
  verifyStoredDesignWorkflowPackageSignature,
} from "./design-workflow-approval.mjs";
import { createAdvisoryAttemptTrail } from "./advisory-attempt-trail.mjs";
import { createAdvisoryRouteSelection } from "./advisory-route-selection.mjs";
import { advisoryEvidenceBundleSha256, ADVISORY_EVIDENCE_BUNDLE_SCHEMA } from "./advisory-lifecycle-v2.mjs";
import { designReadinessReportSha256, verifyDesignReadinessHostExecution } from "./design-readiness-host-evidence.mjs";
import { canonicalJson } from "./codex-sandbox-compatibility.mjs";
import { buildSandboxedReadonlyRequest } from "./sandboxed-readonly-duty.mjs";
import { sandboxSelectionDigest } from "../scripts/codex-sandbox-select.mjs";
import { designAdvisoryAdmission } from "./guard-devplan-policy.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const id = (prefix) => `${prefix}-dispatch`;
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const cases = [];
const check = (name, run) => cases.push({ id: `DWP${String(cases.length + 1).padStart(2, "0")}`, name, run });

function makeSources() {
  const sourceBytes = {};
  const sources = {};
  for (const [name, path] of Object.entries({
    input: "specs/feature/input.md",
    prd: "specs/feature/prd.md",
    spec: "specs/feature/spec.md",
    design: "specs/feature/design.md",
    traceability: "specs/feature/traceability.md",
  })) {
    const data = Buffer.from(`${name} source\n`, "utf8");
    sources[name] = { path, sha256: sha(data) };
    sourceBytes[name] = { path, bytes: data };
  }
  return { sources, sourceBytes };
}

function serialized(value) { return Buffer.from(`${JSON.stringify(value)}\n`, "utf8"); }

function materializeFixture(root, fixture) {
  const packagePath = "specs/feature/evidence/design-workflow-package.json";
  const files = [
    ...Object.values(fixture.sourceBytes).map((entry) => [entry.path, entry.bytes]),
    [fixture.workflowPackage.advisor.receipt.path, fixture.advisorReceiptBytes],
    [fixture.workflowPackage.readiness.path, fixture.readinessBytes],
    ...(fixture.attemptTrailBytes === null ? [] : [[fixture.workflowPackage.advisor.attemptTrail.path, fixture.attemptTrailBytes]]),
    [packagePath, fixture.packageBytes],
  ];
  for (const [path, data] of files) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
  return packagePath;
}

function physicalReadbackMutationControl({ mutation, accepted }) {
  const root = mkdtempSync(join(tmpdir(), "design-workflow-package-parent-control-"));
  const nativeRead = fs.readFileSync;
  try {
    const fixture = baseFixture();
    const packagePath = materializeFixture(root, fixture);
    const artifactPaths = [packagePath, ...Object.values(fixture.workflowPackage.sources).map(entry => entry.path),
      fixture.workflowPackage.advisor.receipt.path, fixture.workflowPackage.readiness.path];
    const before = artifactPaths.map(path => nativeRead(join(root, path)));
    let descriptorReads = 0;
    let mutationCalls = 0;
    fs.readFileSync = function (...args) {
      const bytes = nativeRead(...args);
      if (typeof args[0] === "number" && ++descriptorReads === artifactPaths.length + 1) {
        mutationCalls++;
        mutation({ root, packagePath, artifactPaths, before });
      }
      return bytes;
    };
    syncBuiltinESMExports();
    const result = readApprovedDesignWorkflowPackage({
      repoRoot: root, packagePath, packageSha256: sha(fixture.packageBytes),
      featureId: fixture.workflowPackage.featureId,
      planPath: fixture.workflowPackage.sources.prd.path, planSha256: fixture.workflowPackage.sources.prd.sha256,
      specPath: fixture.workflowPackage.sources.spec.path, specSha256: fixture.workflowPackage.sources.spec.sha256,
      readCandidate: () => candidate,
    });
    assert.equal(mutationCalls, 1, "mutation happens exactly within the first final physical reopen");
    assert.equal(result.ok, accepted, JSON.stringify(result));
    if (!accepted) assert.equal(result.code, "DWP-PHYSICAL-DRIFT");
    if (accepted) {
      assert.deepEqual(artifactPaths.map(path => nativeRead(join(root, path))), before,
        "unrelated directory entries must not change any admitted artifact bytes");
      assert.equal(result.approvedBinding, true);
    }
  } finally {
    fs.readFileSync = nativeRead;
    syncBuiltinESMExports();
    fs.chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
}

function baseFixture({ unavailable = false, selectedCandidate = candidate } = {}) {
  const { sources, sourceBytes } = makeSources();
  const advisorReceipt = {
    schema: "pipeline.advisory-receipt.v1",
    receiptId: "advisor-receipt-1",
    dispatch: {
      dispatchId: id("advisor"), queueRevision: 0,
      candidateCommit: selectedCandidate.commit, candidateTree: selectedCandidate.tree,
    },
    duty: "advisory",
    profile: "feature",
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-6-sol" }, effort: "high" },
    adapter: "consult",
    observed: unavailable
      ? { status: "unavailable", identity: null }
      : { status: "answered", identity: { provider: "openai", modelId: "gpt-6-sol", effort: "high" } },
    questionSha256: designWorkflowAdvisorQuestionSha256(sources),
    answerSha256: unavailable ? null : "c".repeat(64),
    fallback: unavailable
      ? { reason: "consult-unavailable", redactedErrorClass: "unavailable" }
      : { reason: "none", redactedErrorClass: null },
    emittedAtMs: 1,
  };
  const advisorReceiptBytes = serialized(advisorReceipt);
  const attemptTrail = unavailable ? createAdvisoryAttemptTrail({
    receipt: advisorReceipt,
    receiptBytes: advisorReceiptBytes,
    attempts: [{ adapter: "consult", kind: "consult", runner: "codex", status: "unavailable" }],
  }) : null;
  const attemptTrailBytes = attemptTrail === null ? null : serialized(attemptTrail);
  const readinessReport = {
    schema: "pipeline.design-readiness-receipt.v1",
    dispatchId: id("readiness"),
    runner: "codex",
    candidate: selectedCandidate,
    sources,
    outcome: "ready-for-po-review",
    findings: [{ code: "TRACE-OK", severity: "non-blocking", summary: "Traceability is complete." }],
    unresolvedChoices: [{ id: "CHOICE-1", question: "Choose rollout order?", impact: "Changes sequencing only." }],
    summary: "All source requirements are mapped; one low-impact rollout choice remains for the PO.",
  };
  const readinessReceipt = {
    ...readinessReport,
    hostExecution: {
      schema: "pipeline.design-readiness-host-execution.v1",
      runner: "codex",
      repoFingerprint: "f".repeat(64),
      selectionId: `css_${"a".repeat(25)}e`,
      selectionSha256: "b".repeat(64),
      executionReceiptSha256: "c".repeat(64),
      dutyReceiptSha256: designReadinessReportSha256(readinessReport),
      route: { model: "gpt-6-luna", effort: "high", sourceSha256: "8".repeat(64), candidateCommit: selectedCandidate.commit },
    },
  };
  const readinessBytes = serialized(readinessReceipt);
  const workflowPackage = {
    schema: "pipeline.design-workflow-package.v1",
    featureId: "feature-1",
    authoringDispatchId: id("authoring"),
    candidate: selectedCandidate,
    sources,
    advisor: unavailable ? {
      status: "unavailable",
      runner: "codex",
      nativeAvailable: false,
      receipt: { path: "specs/feature/evidence/advisor.json", sha256: sha(advisorReceiptBytes) },
      attemptTrail: { path: "specs/feature/evidence/advisor-attempts.json", sha256: sha(attemptTrailBytes) },
      disposition: null,
      exception: { status: "proposed", failureCode: "capacity-unavailable", rationale: designWorkflowAdvisorExceptionRationale({ advisorReceipt, attemptTrail }) },
    } : {
      status: "answered",
      runner: "codex",
      nativeAvailable: false,
      receipt: { path: "specs/feature/evidence/advisor.json", sha256: sha(advisorReceiptBytes) },
      attemptTrail: null,
      disposition: { decision: "accept", rationale: "The advice is incorporated in the revised design." },
      exception: null,
    },
    readiness: { path: "specs/feature/evidence/readiness.json", sha256: sha(readinessBytes), dispatchId: readinessReceipt.dispatchId },
    createdAt: "2026-09-26T10:11:12.000Z",
  };
  const packageBytes = serialized(workflowPackage);
  return {
    workflowPackage,
    packageBytes,
    readinessReceipt,
    readinessBytes,
    advisorReceipt,
    advisorReceiptBytes,
    attemptTrail,
    attemptTrailBytes,
    sourceBytes,
    candidate,
    repoRoot: "/test/repository",
    verifyReadinessExecution: ({ hostExecution: evidence, readinessReceipt: report }) =>
      evidence?.runner === "codex" && evidence.dutyReceiptSha256 === designReadinessReportSha256(report)
        ? { ok: true } : { ok: false, code: "DWP-TEST-HOST-BINDING" },
  };
}

function readinessHostStoreFixture(fixture) {
  const repoFingerprint = "f".repeat(64);
  const selectionId = `css_${"a".repeat(25)}e`;
  const references = Object.values(fixture.workflowPackage.sources).map((source) => {
    const entry = Object.values(fixture.sourceBytes).find((candidateEntry) => candidateEntry.path === source.path);
    return { path: source.path, sha256: source.sha256, bytes: entry.bytes.length, content: entry.bytes.toString("utf8") };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const referenceSetSha256 = advisoryEvidenceBundleSha256({ schema: ADVISORY_EVIDENCE_BUNDLE_SCHEMA, references });
  const dispatch = {
    queueRevision: 9,
    candidateCommit: fixture.workflowPackage.candidate.commit,
    candidateTree: fixture.workflowPackage.candidate.tree,
    referenceSetSha256,
  };
  const request = buildSandboxedReadonlyRequest({
    duty: "readiness", repoFingerprint, dispatch,
    requested: { runner: "codex", model: "gpt-6-luna" },
  });
  const selection = {
    schema: "pipeline.codex-sandbox-selection.v1", selectionId, repoFingerprint, duty: "readiness",
    dispatch: { ...dispatch, requestSha256: request.requestSha256 },
    toolchain: { cliVersion: "0.146.0", cliSha256: "0".repeat(64), observedHelperSha256: "1".repeat(64), selectionSchemaSha256: "2".repeat(64) },
    host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
    profile: { id: "codex-critic-intermediate.v1", sha256: "4".repeat(64), base: ":read-only", network: { enabled: true }, writableRootClass: "coordinator-scratch-only", scratchRootSha256: "5".repeat(64) },
    preflight: { receiptSha256: "6".repeat(64), eligibility: "intermediate", terminalCode: "eligible", observedAt: "2026-07-19T00:00:00.000Z" },
    compatibilityReceiptSha256: "7".repeat(64),
    assurance: { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted" },
    status: "selected", failureClass: null, observedAt: "2026-07-19T00:00:00.000Z",
  };
  const execution = {
    schema: "pipeline.codex-sandbox-execution-receipt.v1",
    selectionId, selectionSha256: sandboxSelectionDigest(selection), repoFingerprint, duty: "readiness",
    dispatch: selection.dispatch,
    requested: { runner: "codex", model: "gpt-6-luna" },
    observed: { cliSha256: selection.toolchain.cliSha256, profileSha256: selection.profile.sha256, networkEnabled: true, scratchRootSha256: selection.profile.scratchRootSha256 },
    terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
    assurance: selection.assurance,
    dutyReceipt: { schema: "pipeline.readiness-receipt.v1", sha256: fixture.readinessReceipt.hostExecution.dutyReceiptSha256, status: "reviewed" },
    createdAt: "2026-07-19T00:00:00.000Z",
  };
  const journal = {
    phase: "duty-bound", selectionSha256: sandboxSelectionDigest(selection),
    dutyReceiptSchema: execution.dutyReceipt.schema, dutyReceiptSha256: execution.dutyReceipt.sha256,
  };
  const route = fixture.readinessReceipt.hostExecution.route;
  const hostExecution = {
    schema: "pipeline.design-readiness-host-execution.v1", runner: "codex", repoFingerprint, selectionId,
    selectionSha256: sandboxSelectionDigest(selection),
    executionReceiptSha256: sha(Buffer.from(canonicalJson(execution), "utf8")),
    dutyReceiptSha256: execution.dutyReceipt.sha256,
    route,
  };
  return {
    hostExecution,
    resolveRoute: () => ({ dutyId: "readiness", runner: "codex", state: "default", ...route }),
    storeFactory: () => ({
      readSelection: () => selection,
      readExecution: () => execution,
      readJournal: () => journal,
    }),
  };
}

check("admits a complete pre-approval package without granting implementation authority", () => {
  const result = validateDesignWorkflowPackage(baseFixture());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, "ready-for-single-final-approval");
  assert.match(result.packageSha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.implementationAuthority, false);
});

check("requires fresh independent readiness over the exact source set and candidate", () => {
  const notReady = baseFixture();
  notReady.readinessReceipt.findings.push({ code: "MISSING-REQ", severity: "blocking", summary: "Requirement lacks coverage." });
  notReady.readinessReceipt.outcome = "not-ready";
  notReady.readinessReceipt.hostExecution.dutyReceiptSha256 = designReadinessReportSha256(notReady.readinessReceipt);
  notReady.readinessBytes = serialized(notReady.readinessReceipt);
  notReady.workflowPackage.readiness.sha256 = sha(notReady.readinessBytes);
  notReady.packageBytes = serialized(notReady.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(notReady).code, "DWP-READINESS-BINDING");

  const replay = baseFixture();
  replay.readinessReceipt.dispatchId = replay.workflowPackage.authoringDispatchId;
  replay.readinessReceipt.hostExecution.dutyReceiptSha256 = designReadinessReportSha256(replay.readinessReceipt);
  replay.readinessBytes = serialized(replay.readinessReceipt);
  replay.workflowPackage.readiness.sha256 = sha(replay.readinessBytes);
  replay.packageBytes = serialized(replay.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(replay).code, "DWP-READINESS-BINDING");

  const callerClaim = baseFixture();
  callerClaim.readinessReceipt.freshReadOnly = true;
  callerClaim.readinessBytes = serialized(callerClaim.readinessReceipt);
  callerClaim.workflowPackage.readiness.sha256 = sha(callerClaim.readinessBytes);
  callerClaim.packageBytes = serialized(callerClaim.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(callerClaim).code, "DWP-READINESS-SCHEMA");

  const reportDrift = baseFixture();
  reportDrift.readinessReceipt.summary = "A different report with the original host digest.";
  reportDrift.readinessBytes = serialized(reportDrift.readinessReceipt);
  reportDrift.workflowPackage.readiness.sha256 = sha(reportDrift.readinessBytes);
  reportDrift.packageBytes = serialized(reportDrift.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(reportDrift).code, "DWP-READINESS-REPORT-DIGEST");
});

check("rejects source-byte drift, substituted readiness bytes, and candidate mismatch", () => {
  const drift = baseFixture();
  drift.sourceBytes.input.bytes = Buffer.from("changed after review\n");
  assert.equal(validateDesignWorkflowPackage(drift).code, "DWP-PACKAGE-INVALID");

  const substituted = baseFixture();
  substituted.readinessBytes = serialized({ ...substituted.readinessReceipt, summary: "different bytes" });
  assert.equal(validateDesignWorkflowPackage(substituted).code, "DWP-READINESS-BYTES");

  const moved = baseFixture();
  moved.candidate = { commit: "d".repeat(40), tree: "e".repeat(40) };
  assert.equal(validateDesignWorkflowPackage(moved).code, "DWP-CANDIDATE-DRIFT");
});

check("rejects duplicate JSON keys, aliased source paths, and oversized source bytes", () => {
  const duplicate = baseFixture();
  const duplicateBytes = Buffer.from(duplicate.packageBytes.toString("utf8").replace(
    '"featureId":"feature-1"', '"featureId":"shadow","featureId":"feature-1"'), "utf8");
  assert.equal(validateDesignWorkflowPackage({ ...duplicate, packageBytes: duplicateBytes }).code, "DWP-PACKAGE-INVALID");

  const alias = baseFixture();
  alias.workflowPackage.sources.spec.path = alias.workflowPackage.sources.prd.path;
  alias.sourceBytes.spec.path = alias.workflowPackage.sources.prd.path;
  alias.packageBytes = serialized(alias.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(alias).code, "DWP-PACKAGE-INVALID");

  const oversized = baseFixture();
  oversized.sourceBytes.input.bytes = Buffer.alloc(1024 * 1024 + 1, 0x61);
  oversized.workflowPackage.sources.input.sha256 = sha(oversized.sourceBytes.input.bytes);
  oversized.readinessReceipt.sources.input.sha256 = oversized.workflowPackage.sources.input.sha256;
  oversized.readinessBytes = serialized(oversized.readinessReceipt);
  oversized.workflowPackage.readiness.sha256 = sha(oversized.readinessBytes);
  oversized.packageBytes = serialized(oversized.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(oversized).code, "DWP-PACKAGE-INVALID");
});

check("rejects noncanonical separators and repository path aliases before reading evidence", () => {
  const repeatedSeparator = baseFixture();
  repeatedSeparator.workflowPackage.sources.input.path = "specs//feature/input.md";
  repeatedSeparator.sourceBytes.input.path = "specs//feature/input.md";
  repeatedSeparator.readinessReceipt.sources.input.path = "specs//feature/input.md";
  repeatedSeparator.packageBytes = serialized(repeatedSeparator.workflowPackage);
  repeatedSeparator.readinessBytes = serialized(repeatedSeparator.readinessReceipt);
  repeatedSeparator.workflowPackage.readiness.sha256 = sha(repeatedSeparator.readinessBytes);
  repeatedSeparator.packageBytes = serialized(repeatedSeparator.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(repeatedSeparator).code, "DWP-PACKAGE-INVALID");

  const evidenceAliasesSource = baseFixture();
  const inputPath = evidenceAliasesSource.workflowPackage.sources.input.path;
  evidenceAliasesSource.workflowPackage.advisor.receipt.path = process.platform === "win32"
    ? inputPath.toLocaleUpperCase("en-US") : inputPath;
  evidenceAliasesSource.packageBytes = serialized(evidenceAliasesSource.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(evidenceAliasesSource).code, "DWP-PATH-ALIASES");

  const repeatedEvidenceSeparator = baseFixture();
  repeatedEvidenceSeparator.workflowPackage.advisor.receipt.path = "specs//feature/evidence/advisor.json";
  repeatedEvidenceSeparator.packageBytes = serialized(repeatedEvidenceSeparator.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(repeatedEvidenceSeparator).code, "DWP-ADVISOR-SHAPE");
});

check("a completed Advisor result requires a bound disposition and forbids an exception", () => {
  const missingDisposition = baseFixture();
  missingDisposition.workflowPackage.advisor.disposition = null;
  missingDisposition.packageBytes = serialized(missingDisposition.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(missingDisposition).code, "DWP-ADVISOR-DISPOSITION");

  const exception = baseFixture();
  exception.workflowPackage.advisor.exception = { status: "proposed", failureCode: "timeout", rationale: "not needed" };
  exception.packageBytes = serialized(exception.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(exception).code, "DWP-ADVISOR-DISPOSITION");
});

check("an unavailable Advisor route requires an exact attempt trail and proposed narrow exception", () => {
  const complete = baseFixture({ unavailable: true });
  const result = validateDesignWorkflowPackage(complete);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.implementationAuthority, false);

  const noTrail = baseFixture({ unavailable: true });
  noTrail.workflowPackage.advisor.attemptTrail = null;
  noTrail.packageBytes = serialized(noTrail.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(noTrail).code, "DWP-ADVISOR-EXCEPTION");

  const wrongFailure = baseFixture({ unavailable: true });
  wrongFailure.workflowPackage.advisor.exception.failureCode = "timeout";
  wrongFailure.packageBytes = serialized(wrongFailure.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(wrongFailure).code, "DWP-ADVISOR-FAILURE-CODE");

  const mutateTrail = baseFixture({ unavailable: true });
  mutateTrail.attemptTrail.attempts[0].status = "answered";
  mutateTrail.attemptTrailBytes = serialized(mutateTrail.attemptTrail);
  mutateTrail.workflowPackage.advisor.attemptTrail.sha256 = sha(mutateTrail.attemptTrailBytes);
  mutateTrail.packageBytes = serialized(mutateTrail.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(mutateTrail).code, "DWP-ADVISOR-ATTEMPTS");
});

check("no-child Codex route selection is a narrow PO exception input, never an invented attempt", () => {
  const fixture = baseFixture({ unavailable: true });
  fixture.advisorReceipt.questionSha256 = fixture.workflowPackage.sources.design.sha256;
  fixture.advisorReceiptBytes = serialized(fixture.advisorReceipt);
  fixture.attemptTrail = createAdvisoryRouteSelection({
    receipt: fixture.advisorReceipt,
    receiptBytes: fixture.advisorReceiptBytes,
    code: "ordinary-consult-host-callback-unavailable",
  });
  fixture.attemptTrailBytes = serialized(fixture.attemptTrail);
  fixture.workflowPackage.advisor.receipt.sha256 = sha(fixture.advisorReceiptBytes);
  fixture.workflowPackage.advisor.attemptTrail.sha256 = sha(fixture.attemptTrailBytes);
  fixture.workflowPackage.advisor.exception.failureCode = "route-unavailable";
  fixture.workflowPackage.advisor.exception.rationale = designWorkflowAdvisorExceptionRationale({
    advisorReceipt: fixture.advisorReceipt,
    attemptTrail: fixture.attemptTrail,
  });
  fixture.packageBytes = serialized(fixture.workflowPackage);
  const validated = validateDesignWorkflowPackage(fixture);
  assert.equal(validated.ok, true, JSON.stringify(validated));
  assert.equal(validated.approvalReview.advisor.attempts.length, 0);
  assert.equal(validated.approvalReview.advisor.routeSelection.childStarted, false);
  assert.equal(validated.implementationAuthority, false);

  const forged = { ...fixture,
    workflowPackage: structuredClone(fixture.workflowPackage),
    attemptTrail: structuredClone(fixture.attemptTrail) };
  forged.attemptTrail.childStarted = true;
  forged.attemptTrailBytes = serialized(forged.attemptTrail);
  forged.workflowPackage.advisor.attemptTrail.sha256 = sha(forged.attemptTrailBytes);
  forged.packageBytes = serialized(forged.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(forged).code, "DWP-ADVISOR-ATTEMPTS");
});

check("rejects package fields that could masquerade as an embedded approval", () => {
  const forged = baseFixture();
  forged.workflowPackage.approved = true;
  forged.packageBytes = serialized(forged.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(forged).code, "DWP-PACKAGE-SCHEMA");
});

check("ships plugin-local validation schemas byte-equivalent to the canonical root schemas", () => {
  for (const name of ["pipeline.design-readiness-receipt.v1.json", "pipeline.design-workflow-package.v1.json"]) {
    const canonicalUrl = new URL(`../../../schemas/${name}`, import.meta.url);
    const bundled = JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf8"));
    if (existsSync(canonicalUrl)) {
      const canonical = JSON.parse(readFileSync(canonicalUrl, "utf8"));
      assert.deepEqual(bundled, canonical, `${name} plugin mirror must match canonical source`);
    } else {
      assert.equal(bundled.$id, name.slice(0, -5), `${name} must be self-contained in an installed plugin`);
    }
  }
});

check("reads and validates every package artifact from the physical repository files", () => {
  const root = mkdtempSync(join(tmpdir(), "design-workflow-package-reader-"));
  try {
    const fixture = baseFixture();
    const packagePath = materializeFixture(root, fixture);
    const result = readDesignWorkflowPackageFromRepository({ repoRoot: root, packagePath, readCandidate: () => candidate,
      verifyReadinessExecution: fixture.verifyReadinessExecution });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.packageSha256, sha(fixture.packageBytes));
    assert.equal(result.implementationAuthority, false);
    const unverified = readDesignWorkflowPackageFromRepository({ repoRoot: root, packagePath, readCandidate: () => candidate });
    assert.equal(unverified.code, "DWP-READINESS-HOST-RECEIPT-UNAVAILABLE",
      "a caller-authored readiness receipt cannot pass the production host verifier");
    const evidence = readinessHostStoreFixture(fixture);
    fixture.readinessReceipt.hostExecution = evidence.hostExecution;
    const hostReadback = verifyDesignReadinessHostExecution({
      repoRoot: root,
      hostExecution: evidence.hostExecution,
      readinessReceipt: fixture.readinessReceipt,
      candidate: fixture.workflowPackage.candidate,
      sources: fixture.workflowPackage.sources,
      sourceBytes: fixture.sourceBytes,
      storeFactory: evidence.storeFactory,
      resolveRoute: evidence.resolveRoute,
    });
    assert.equal(hostReadback.ok, true, JSON.stringify(hostReadback));
    const lostJournal = verifyDesignReadinessHostExecution({
      repoRoot: root,
      hostExecution: evidence.hostExecution,
      readinessReceipt: fixture.readinessReceipt,
      candidate: fixture.workflowPackage.candidate,
      sources: fixture.workflowPackage.sources,
      sourceBytes: fixture.sourceBytes,
      storeFactory: () => ({ ...evidence.storeFactory(), readJournal: () => ({ phase: "executed" }) }),
      resolveRoute: evidence.resolveRoute,
    });
    assert.equal(lostJournal.code, "DWP-READINESS-HOST-RECEIPT-MISMATCH");

    const colonSources = structuredClone(fixture.workflowPackage.sources);
    const colonSourceBytes = Object.fromEntries(Object.entries(fixture.sourceBytes).map(([name, entry]) => [name, {
      path: name === "input" ? "specs/feature/input:alternate.md" : entry.path,
      bytes: Buffer.from(entry.bytes),
    }]));
    colonSources.input.path = colonSourceBytes.input.path;
    const colonPath = verifyDesignReadinessHostExecution({
      repoRoot: root,
      hostExecution: evidence.hostExecution,
      readinessReceipt: fixture.readinessReceipt,
      candidate: fixture.workflowPackage.candidate,
      sources: colonSources,
      sourceBytes: colonSourceBytes,
      storeFactory: evidence.storeFactory,
      resolveRoute: evidence.resolveRoute,
    });
    assert.equal(colonPath.code, "DWP-READINESS-HOST-RECEIPT-INVALID");

    const oversizedSourceBytes = Object.fromEntries(Object.entries(fixture.sourceBytes).map(([name, entry]) => [name, {
      path: entry.path,
      bytes: Buffer.from(entry.bytes),
    }]));
    oversizedSourceBytes.input.bytes = Buffer.alloc(262_145, 0x61);
    const oversizedReadinessReference = verifyDesignReadinessHostExecution({
      repoRoot: root,
      hostExecution: evidence.hostExecution,
      readinessReceipt: fixture.readinessReceipt,
      candidate: fixture.workflowPackage.candidate,
      sources: fixture.workflowPackage.sources,
      sourceBytes: oversizedSourceBytes,
      storeFactory: evidence.storeFactory,
      resolveRoute: evidence.resolveRoute,
    });
    assert.equal(oversizedReadinessReference.code, "DWP-READINESS-HOST-RECEIPT-INVALID");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("implementation readback requires the exact approved digest, feature, PRD and Spec", () => {
  const root = mkdtempSync(join(tmpdir(), "design-workflow-package-approval-readback-"));
  try {
    const fixture = baseFixture();
    const packagePath = materializeFixture(root, fixture);
    const args = {
      repoRoot: root,
      packagePath,
      packageSha256: sha(fixture.packageBytes),
      featureId: fixture.workflowPackage.featureId,
      planPath: fixture.workflowPackage.sources.prd.path,
      planSha256: fixture.workflowPackage.sources.prd.sha256,
      specPath: fixture.workflowPackage.sources.spec.path,
      specSha256: fixture.workflowPackage.sources.spec.sha256,
      readCandidate: () => candidate,
    };
    const result = readApprovedDesignWorkflowPackage(args);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.approvedBinding, true);
    assert.equal(result.workflowPackage.featureId, args.featureId);

    assert.equal(readApprovedDesignWorkflowPackage({ ...args, packageSha256: "f".repeat(64) }).code,
      "DWP-APPROVAL-DIGEST-DRIFT");
    assert.equal(readApprovedDesignWorkflowPackage({ ...args, featureId: "other-feature" }).code,
      "DWP-APPROVAL-FEATURE-MISMATCH");
    assert.equal(readApprovedDesignWorkflowPackage({ ...args, planPath: "specs/other/prd.md" }).code,
      "DWP-APPROVAL-PLAN-SPEC-MISMATCH");
    assert.equal(readApprovedDesignWorkflowPackage({ ...args, specSha256: "e".repeat(64) }).code,
      "DWP-APPROVAL-PLAN-SPEC-MISMATCH");

    physicalReadbackMutationControl({ accepted: true, mutation({ root }) {
      mkdirSync(join(root, "unrelated-sibling-directory"));
    } });
    physicalReadbackMutationControl({ accepted: true, mutation({ root }) {
      writeFileSync(join(root, "unrelated-sibling-file"), "unrelated content\n");
    } });
    physicalReadbackMutationControl({ accepted: false, mutation({ root }) {
      fs.chmodSync(root, 0o500);
    } });
    physicalReadbackMutationControl({ accepted: false, mutation({ root, artifactPaths, before }) {
      fs.renameSync(join(root, "specs"), join(root, "displaced-specs"));
      for (const [index, path] of artifactPaths.entries()) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), before[index]);
      }
    } });
    physicalReadbackMutationControl({ accepted: false, mutation({ root }) {
      fs.renameSync(join(root, "specs"), join(root, "displaced-specs"));
      symlinkSync(join(root, "displaced-specs"), join(root, "specs"));
    } });
    physicalReadbackMutationControl({ accepted: false, mutation({ root, packagePath }) {
      writeFileSync(join(root, packagePath), "changed admitted package bytes\n");
    } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("rejects changed source bytes and symlinked or missing source files", () => {
  const changedRoot = mkdtempSync(join(tmpdir(), "design-workflow-package-reader-drift-"));
  try {
    const fixture = baseFixture();
    const packagePath = materializeFixture(changedRoot, fixture);
    writeFileSync(join(changedRoot, fixture.workflowPackage.sources.input.path), "changed after review\n");
    assert.equal(readDesignWorkflowPackageFromRepository({ repoRoot: changedRoot, packagePath, readCandidate: () => candidate,
      verifyReadinessExecution: fixture.verifyReadinessExecution }).code, "DWP-PACKAGE-INVALID");
  } finally {
    rmSync(changedRoot, { recursive: true, force: true });
  }

  const linkedRoot = mkdtempSync(join(tmpdir(), "design-workflow-package-reader-link-"));
  try {
    const fixture = baseFixture();
    const packagePath = materializeFixture(linkedRoot, fixture);
    const sourcePath = fixture.workflowPackage.sources.input.path;
    const sourceTarget = join(linkedRoot, sourcePath);
    const linkTarget = join(linkedRoot, "linked-input.md");
    writeFileSync(linkTarget, fixture.sourceBytes.input.bytes);
    rmSync(sourceTarget);
    try { symlinkSync(linkTarget, sourceTarget); } catch { /* unsupported host: the missing-file negative remains effective */ }
    assert.equal(readDesignWorkflowPackageFromRepository({ repoRoot: linkedRoot, packagePath, readCandidate: () => candidate,
      verifyReadinessExecution: fixture.verifyReadinessExecution }).code, "DWP-SOURCE-PHYSICAL");
  } finally {
    rmSync(linkedRoot, { recursive: true, force: true });
  }
});

check("rechecks Git candidate identity after reading the package", () => {
  const root = mkdtempSync(join(tmpdir(), "design-workflow-package-reader-candidate-"));
  try {
    const fixture = baseFixture();
    const packagePath = materializeFixture(root, fixture);
    let calls = 0;
    const readCandidate = () => (++calls === 1 ? candidate : { commit: "d".repeat(40), tree: "e".repeat(40) });
    assert.equal(readDesignWorkflowPackageFromRepository({ repoRoot: root, packagePath, readCandidate,
      verifyReadinessExecution: fixture.verifyReadinessExecution }).code, "DWP-CANDIDATE-DRIFT");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("re-reads the same immutable package after unrelated commits without changing its provenance", () => {
  const root = mkdtempSync(join(tmpdir(), "design-workflow-package-reader-later-head-"));
  try {
    const fixture = baseFixture();
    const packagePath = materializeFixture(root, fixture);
    const laterCandidate = { commit: "d".repeat(40), tree: "e".repeat(40) };
    assert.equal(readDesignWorkflowPackageFromRepository({
      repoRoot: root,
      packagePath,
      readCandidate: () => laterCandidate,
      verifyReadinessExecution: fixture.verifyReadinessExecution,
    }).code, "DWP-CANDIDATE-DRIFT");

    const result = readDesignWorkflowPackageFromRepository({
      repoRoot: root,
      packagePath,
      readCandidate: () => laterCandidate,
      requireCurrentCandidate: false,
      verifyReadinessExecution: fixture.verifyReadinessExecution,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.packageSha256, sha(fixture.packageBytes));
    assert.equal(result.candidate.commit, fixture.workflowPackage.candidate.commit,
      "the recorded design commit remains provenance; later HEAD is not substituted into it");
    assert.equal(result.candidate.tree, fixture.workflowPackage.candidate.tree,
      "the recorded design tree remains provenance; later HEAD is not substituted into it");
    assert.equal(result.implementationAuthority, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("returns a complete human-review projection without converting evidence into approval", () => {
  const fixture = baseFixture();
  const result = validateDesignWorkflowPackage(fixture);
  assert.equal(result.ok, true);
  const review = result.approvalReview;
  assert.equal(review.schema, "pipeline.design-workflow-approval-review.v1");
  assert.equal(review.packageSha256, sha(fixture.packageBytes));
  assert.deepEqual(review.sources.map((source) => source.name), ["input", "prd", "spec", "design", "traceability"]);
  for (const source of review.sources) {
    const expected = fixture.sourceBytes[source.name];
    assert.equal(source.path, expected.path);
    assert.equal(source.sha256, sha(expected.bytes));
    assert.equal(source.content, expected.bytes.toString("utf8"));
  }
  assert.equal(review.advisor.receipt.dispatchId, fixture.advisorReceipt.dispatch.dispatchId);
  assert.equal(review.advisor.disposition.decision, "accept");
  assert.equal(review.readiness.summary, fixture.readinessReceipt.summary);
  assert.deepEqual(review.readiness.findings, fixture.readinessReceipt.findings);
  assert.deepEqual(review.readiness.unresolvedChoices, fixture.readinessReceipt.unresolvedChoices);
  assert.equal(review.approvalStatus, "pending-po-approval");
  assert.equal(review.implementationAuthority, false);
  assert.equal(JSON.stringify(review).includes("answerSha256"), false);
  assert.equal(JSON.stringify(review).includes("implementationAuthority\":true"), false);
});

check("labels unavailable Advisor evidence as a proposed exception in the same pending review", () => {
  const fixture = baseFixture({ unavailable: true });
  const result = validateDesignWorkflowPackage(fixture);
  assert.equal(result.ok, true, JSON.stringify(result));
  const review = result.approvalReview;
  assert.equal(review.advisor.status, "unavailable");
  assert.equal(review.advisor.attempts.length, 1);
  assert.equal(review.advisor.attempts[0].status, "unavailable");
  assert.equal(review.advisor.exception.status, "proposed");
  assert.equal(review.approvalStatus, "pending-po-approval");
  assert.equal(review.implementationAuthority, false);
});

check("detaches and deeply freezes the bounded PO review from validator inputs", () => {
  const fixture = baseFixture();
  const result = validateDesignWorkflowPackage(fixture);
  assert.equal(result.ok, true);
  const review = result.approvalReview;
  assert.equal(Object.isFrozen(review), true);
  assert.equal(Object.isFrozen(review.sources), true);
  assert.equal(Object.isFrozen(review.sources[0]), true);
  assert.equal(Object.isFrozen(review.readiness), true);
  assert.equal(Object.isFrozen(review.readiness.findings), true);
  assert.equal(Object.isFrozen(review.readiness.findings[0]), true);
  assert.equal(Object.isFrozen(review.advisor.disposition), true);
  assert.notEqual(review.readiness.findings, fixture.readinessReceipt.findings);
  assert.notEqual(review.advisor.disposition, fixture.workflowPackage.advisor.disposition);
  const inputSnapshot = review.sources[0].content;
  fixture.sourceBytes.input.bytes[0] ^= 0xff;
  assert.equal(review.sources[0].content, inputSnapshot, "the review owns a detached text snapshot");
  assert.throws(() => { review.sources[0].content = "rewritten after review"; }, TypeError);
  assert.throws(() => { review.readiness.findings[0].summary = "rewritten after review"; }, TypeError);
  assert.throws(() => { review.advisor.disposition.rationale = "rewritten after review"; }, TypeError);
  assert.equal(fixture.readinessReceipt.findings[0].summary, "Traceability is complete.");
  assert.equal(fixture.workflowPackage.advisor.disposition.rationale, "The advice is incorporated in the revised design.");
});

check("one final PO proof binds the exact complete package, feature, PRD, Spec and original candidate", () => {
  const root = mkdtempSync(join(tmpdir(), "design-workflow-final-approval-"));
  try {
    const fixture = baseFixture();
    const packagePath = materializeFixture(root, fixture);
    const binding = {
      repoRoot: root,
      packagePath,
      featureId: fixture.workflowPackage.featureId,
      planPath: fixture.workflowPackage.sources.prd.path,
      planSha256: fixture.workflowPackage.sources.prd.sha256,
      specPath: fixture.workflowPackage.sources.spec.path,
      specSha256: fixture.workflowPackage.sources.spec.sha256,
      readCandidate: () => candidate,
      verifyReadinessExecution: fixture.verifyReadinessExecution,
    };
    const prepared = createDesignWorkflowPackageApprovalRequest(binding);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const proof = {
      schema: "pipeline.po-approval-proof.v1",
      intentSha256: prepared.request.approvalIntent.sha256,
      keyReference: "po-test-key",
      publicKey: pem,
      signatureBase64: sign(null, Buffer.from(prepared.request.approvalIntent.sha256), privateKey).toString("base64"),
    };
    const keySha256 = sha(Buffer.from(pem));
    const verified = verifyDesignWorkflowPackageApproval({
      ...binding,
      request: prepared.request,
      proof,
      anchors: [{ keyReference: "po-test-key", publicKeySha256: keySha256 }],
    });
    assert.equal(verified.ok, true, JSON.stringify(verified));
    assert.equal(verified.code, "DWP-APPROVAL-VERIFIED");
    assert.equal(verified.packageSha256, prepared.packageRead.packageSha256);
    assert.equal(verified.packageRead.approvalReview.approvalStatus, "pending-po-approval");

    const altered = structuredClone(prepared.request);
    altered.approvalIntent.value.subjectSha256 = "f".repeat(64);
    assert.equal(verifyDesignWorkflowPackageApproval({ ...binding, request: altered, proof, anchors: [] }).code,
      "DWP-APPROVAL-INTENT-DRIFT");
    assert.equal(verifyDesignWorkflowPackageApproval({ ...binding, request: prepared.request,
      proof: { ...proof, signatureBase64: Buffer.from("forged").toString("base64") }, anchors: [] }).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("implementation re-verifies the stored signature against the immutable package after unrelated commits", () => {
  const root = mkdtempSync(join(tmpdir(), "design-workflow-stored-approval-"));
  try {
    const fixture = baseFixture();
    const packagePath = materializeFixture(root, fixture);
    const binding = {
      repoRoot: root,
      packagePath,
      featureId: fixture.workflowPackage.featureId,
      planPath: fixture.workflowPackage.sources.prd.path,
      planSha256: fixture.workflowPackage.sources.prd.sha256,
      specPath: fixture.workflowPackage.sources.spec.path,
      specSha256: fixture.workflowPackage.sources.spec.sha256,
      readCandidate: () => candidate,
      verifyReadinessExecution: fixture.verifyReadinessExecution,
    };
    const prepared = createDesignWorkflowPackageApprovalRequest(binding);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const proof = {
      schema: "pipeline.po-approval-proof.v1",
      intentSha256: prepared.request.approvalIntent.sha256,
      keyReference: "po-test-key",
      publicKey: pem,
      signatureBase64: sign(null, Buffer.from(prepared.request.approvalIntent.sha256), privateKey).toString("base64"),
    };
    const anchors = [{ keyReference: "po-test-key", publicKeySha256: sha(Buffer.from(pem)) }];
    const first = verifyDesignWorkflowPackageApproval({ ...binding, request: prepared.request, proof, anchors });
    assert.equal(first.ok, true, JSON.stringify(first));
    const approval = {
      schema: "pipeline.design-workflow-package-approval.v1",
      mode: "signature",
      approvedBy: "verified:po-test-key",
      approvedAt: "2026-09-26T10:15:00.000Z",
      packageSha256: prepared.request.packageSha256,
      intentSha256: first.intentSha256,
      proofSha256: first.proofSha256,
      proof,
    };
    const laterCandidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
    const rechecked = verifyStoredDesignWorkflowPackageSignature({
      ...binding,
      packageSha256: approval.packageSha256,
      approval,
      anchors,
      readCandidate: () => laterCandidate,
    });
    assert.equal(rechecked.ok, true, JSON.stringify(rechecked));
    assert.equal(rechecked.code, "DWP-APPROVAL-STORED-SIGNATURE-VERIFIED");

    assert.equal(verifyStoredDesignWorkflowPackageSignature({
      ...binding, packageSha256: approval.packageSha256,
      approval: { ...approval, approvedBy: "verified:other-key" }, anchors,
    }).code, "DWP-APPROVAL-RECORD-DRIFT");
    assert.equal(verifyStoredDesignWorkflowPackageSignature({
      ...binding, packageSha256: approval.packageSha256,
      approval: { ...approval, proofSha256: "f".repeat(64) }, anchors,
    }).code, "DWP-APPROVAL-RECORD-DRIFT");
    assert.equal(verifyStoredDesignWorkflowPackageSignature({
      ...binding, packageSha256: approval.packageSha256,
      approval, anchors: [{ keyReference: "wrong-key", publicKeySha256: "e".repeat(64) }],
    }).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("the implementation guard verifies the package signature and admits the explicit chat posture", () => {
  const root = mkdtempSync(join(tmpdir(), "design-workflow-guard-admission-"));
  const git = (args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false });
  try {
    assert.equal(git(["init", "--quiet"]).status, 0);
    assert.equal(git(["config", "user.name", "DWP test"]).status, 0);
    assert.equal(git(["config", "user.email", "dwp-test@example.invalid"]).status, 0);
    writeFileSync(join(root, "seed.txt"), "seed\n");
    assert.equal(git(["add", "seed.txt"]).status, 0);
    assert.equal(git(["commit", "--quiet", "-m", "fixture"]).status, 0);
    const liveCandidate = {
      commit: git(["rev-parse", "HEAD"]).stdout.trim(),
      tree: git(["rev-parse", "HEAD^{tree}"]).stdout.trim(),
    };
    const fixture = baseFixture({ selectedCandidate: liveCandidate });
    const packagePath = materializeFixture(root, fixture);
    // The package path is digest-bound, so a realistic fixture commits it (tracked and clean) before asking for approval.
    assert.equal(git(["add", "-A"]).status, 0);
    assert.equal(git(["commit", "--quiet", "-m", "design workflow package"]).status, 0);
    const binding = {
      repoRoot: root,
      packagePath,
      featureId: fixture.workflowPackage.featureId,
      planPath: fixture.workflowPackage.sources.prd.path,
      planSha256: fixture.workflowPackage.sources.prd.sha256,
      specPath: fixture.workflowPackage.sources.spec.path,
      specSha256: fixture.workflowPackage.sources.spec.sha256,
      readCandidate: () => liveCandidate,
      verifyReadinessExecution: fixture.verifyReadinessExecution,
    };
    const prepared = createDesignWorkflowPackageApprovalRequest(binding);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const proof = {
      schema: "pipeline.po-approval-proof.v1",
      intentSha256: prepared.request.approvalIntent.sha256,
      keyReference: "po-test-key",
      publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(prepared.request.approvalIntent.sha256), privateKey).toString("base64"),
    };
    const anchors = [{ keyReference: "po-test-key", publicKeySha256: sha(Buffer.from(publicPem)) }];
    const checked = verifyDesignWorkflowPackageApproval({ ...binding, request: prepared.request, proof, anchors });
    assert.equal(checked.ok, true, JSON.stringify(checked));
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v3",
      requiredKinds: ["push"],
      waivedKinds: [],
      trustAnchors: anchors,
    })}\n`);
    const packageApproval = {
      schema: "pipeline.design-workflow-package-approval.v1",
      mode: "signature",
      approvedBy: "verified:po-test-key",
      approvedAt: "2026-09-26T10:15:00.000Z",
      packageSha256: prepared.request.packageSha256,
      intentSha256: checked.intentSha256,
      proofSha256: checked.proofSha256,
      proof,
    };
    const state = {
      activeFeature: { id: fixture.workflowPackage.featureId, planPath: binding.planPath, phase: "implementation" },
      planApproved: true,
      planSubmission: { profile: "feature" },
      planApproval: {
        schema: "pipeline.plan-approval.v7",
        approvedBy: packageApproval.approvedBy,
        designWorkflowPackagePath: packagePath,
        designWorkflowPackageSha256: prepared.request.packageSha256,
        designWorkflowApproval: packageApproval,
      },
    };
    const accepted = designAdvisoryAdmission(state, root, binding.planPath, binding.specPath);
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    assert.equal(accepted.mode, "approved-workflow-package-signature");

    const forged = structuredClone(state);
    forged.planApproval.designWorkflowApproval.proof.signatureBase64 = Buffer.from("forged").toString("base64");
    assert.equal(designAdvisoryAdmission(forged, root, binding.planPath, binding.specPath).ok, false);

    const chatState = structuredClone(state);
    chatState.planApproval.approvedBy = "André";
    chatState.planApproval.designWorkflowApproval = {
      schema: "pipeline.design-workflow-package-approval.v1",
      mode: "chat",
      approvedBy: "André",
      approvedAt: "2026-09-26T10:15:00.000Z",
      packageSha256: prepared.request.packageSha256,
      intentSha256: null,
      proofSha256: null,
      proof: null,
    };
    const chatAccepted = designAdvisoryAdmission(chatState, root, binding.planPath, binding.specPath);
    assert.equal(chatAccepted.ok, true, JSON.stringify(chatAccepted));
    assert.equal(chatAccepted.mode, "approved-workflow-package-chat");

    const miniState = {
      activeFeature: { id: "mini-feature", planPath: binding.planPath, phase: "implementation" },
      planApproved: true,
      planSubmission: { profile: "mini" },
      planApproval: {
        schema: "pipeline.plan-approval.v7",
        designWorkflowPackagePath: null,
        designWorkflowPackageSha256: null,
        designWorkflowApproval: null,
      },
    };
    assert.equal(designAdvisoryAdmission(miniState, root, binding.planPath, binding.specPath).mode, "not-required");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

assert.equal(cases.length, 21, "the complete design workflow package corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
