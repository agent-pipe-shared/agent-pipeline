// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin for original Alfred item
 * pipeline.design-workflow-package-omits-contract (AC-157, slice ALF-C-P15-03).
 *
 * One case group per acceptance point of the item, exercised through the real
 * `validateDesignWorkflowPackage` (no mocks of the behaviour under test; only
 * its documented `verifyReadinessExecution` injection seam is supplied) and,
 * for the self-containment clauses, through the real committed PRD, Spec,
 * design addendum and traceability bytes. Every refusal case is paired with the
 * admitted control it was mutated from, so each rejection is a one-fact flip.
 *
 * Host scope: nothing here needs directory mode bits or directory symlinks, so
 * no case is skipped on the native Windows host.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import test from "node:test";

import { designWorkflowAdvisorExceptionRationale, designWorkflowAdvisorQuestionSha256, validateDesignWorkflowPackage } from "../design-workflow-package.mjs";
import { SOURCE_NAMES } from "../design-advisor-course.mjs";
import { createAdvisoryAttemptTrail } from "../advisory-attempt-trail.mjs";
import { designReadinessReportSha256 } from "../design-readiness-host-evidence.mjs";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (rel) => readFileSync(`${ROOT}${rel}`, "utf8");
const flat = (text) => text.replace(/\s+/gu, " ");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const id = (prefix) => `${prefix}-dispatch`;
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const serialized = (value) => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");

function makeSources() {
  const sourceBytes = {};
  const sources = {};
  for (const [name, path] of Object.entries({
    input: "specs/feature/input.md", prd: "specs/feature/prd.md", spec: "specs/feature/spec.md",
    design: "specs/feature/design.md", traceability: "specs/feature/traceability.md",
  })) {
    const data = Buffer.from(`${name} source\n`, "utf8");
    sources[name] = { path, sha256: sha(data) };
    sourceBytes[name] = { path, bytes: data };
  }
  return { sources, sourceBytes };
}

function fixture({ unavailable = false } = {}) {
  const { sources, sourceBytes } = makeSources();
  const advisorReceipt = {
    schema: "pipeline.advisory-receipt.v1", receiptId: "advisor-receipt-1",
    dispatch: { dispatchId: id("advisor"), queueRevision: 0, candidateCommit: candidate.commit, candidateTree: candidate.tree },
    duty: "advisory", profile: "feature",
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-6-sol" }, effort: "high" },
    adapter: "consult",
    observed: unavailable ? { status: "unavailable", identity: null }
      : { status: "answered", identity: { provider: "openai", modelId: "gpt-6-sol", effort: "high" } },
    questionSha256: designWorkflowAdvisorQuestionSha256(sources),
    answerSha256: unavailable ? null : "c".repeat(64),
    fallback: unavailable ? { reason: "consult-unavailable", redactedErrorClass: "unavailable" } : { reason: "none", redactedErrorClass: null },
    emittedAtMs: 1,
  };
  const advisorReceiptBytes = serialized(advisorReceipt);
  const attemptTrail = unavailable ? createAdvisoryAttemptTrail({ receipt: advisorReceipt, receiptBytes: advisorReceiptBytes,
    attempts: [{ adapter: "consult", kind: "consult", runner: "codex", status: "unavailable" }] }) : null;
  const attemptTrailBytes = attemptTrail === null ? null : serialized(attemptTrail);
  const readinessReport = {
    schema: "pipeline.design-readiness-receipt.v1", dispatchId: id("readiness"), runner: "codex", candidate, sources,
    outcome: "ready-for-po-review",
    findings: [{ code: "TRACE-OK", severity: "non-blocking", summary: "Traceability is complete." }],
    unresolvedChoices: [],
    summary: "All source requirements are mapped.",
  };
  const readinessReceipt = { ...readinessReport, hostExecution: {
    schema: "pipeline.design-readiness-host-execution.v1", runner: "codex", repoFingerprint: "f".repeat(64),
    selectionId: `css_${"a".repeat(25)}e`, selectionSha256: "b".repeat(64), executionReceiptSha256: "c".repeat(64),
    dutyReceiptSha256: designReadinessReportSha256(readinessReport),
    route: { model: "gpt-6-luna", effort: "high", sourceSha256: "8".repeat(64), candidateCommit: candidate.commit },
  } };
  const workflowPackage = {
    schema: "pipeline.design-workflow-package.v1", featureId: "feature-1", authoringDispatchId: id("authoring"),
    candidate, sources,
    advisor: unavailable ? {
      status: "unavailable", runner: "codex", nativeAvailable: false,
      receipt: { path: "specs/feature/evidence/advisor.json", sha256: sha(advisorReceiptBytes) },
      attemptTrail: { path: "specs/feature/evidence/advisor-attempts.json", sha256: sha(attemptTrailBytes) },
      disposition: null,
      exception: { status: "proposed", failureCode: "capacity-unavailable",
        rationale: designWorkflowAdvisorExceptionRationale({ advisorReceipt, attemptTrail }) },
    } : {
      status: "answered", runner: "codex", nativeAvailable: false,
      receipt: { path: "specs/feature/evidence/advisor.json", sha256: sha(advisorReceiptBytes) },
      attemptTrail: null, disposition: { decision: "accept", rationale: "The advice is incorporated in the revised design." }, exception: null,
    },
    readiness: { path: "specs/feature/evidence/readiness.json", sha256: sha(serialized(readinessReceipt)), dispatchId: readinessReceipt.dispatchId },
    createdAt: "2026-09-26T10:11:12.000Z",
  };
  return {
    workflowPackage, packageBytes: serialized(workflowPackage), readinessReceipt, readinessBytes: serialized(readinessReceipt),
    advisorReceipt, advisorReceiptBytes, attemptTrail, attemptTrailBytes, sourceBytes, candidate, repoRoot: "/test/repository",
    verifyReadinessExecution: ({ hostExecution: evidence, readinessReceipt: report }) =>
      evidence?.runner === "codex" && evidence.dutyReceiptSha256 === designReadinessReportSha256(report)
        ? { ok: true } : { ok: false, code: "DWP-TEST-HOST-BINDING" },
  };
}

/** Re-seal a fixture after mutating its readiness receipt (digest, host binding, package ref). */
function resealReadiness(f) {
  f.readinessReceipt.hostExecution.dutyReceiptSha256 = designReadinessReportSha256(f.readinessReceipt);
  f.readinessBytes = serialized(f.readinessReceipt);
  f.workflowPackage.readiness.sha256 = sha(f.readinessBytes);
  f.packageBytes = serialized(f.workflowPackage);
  return f;
}
function resealPackage(f) { f.packageBytes = serialized(f.workflowPackage); return f; }

// ---- Acceptance 1: five selected sources are self-contained, exact hashes -------------------------

test("AC1 control: the five-source package with exact hashes is admitted and is not implementation authority", () => {
  const result = validateDesignWorkflowPackage(fixture());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, "ready-for-single-final-approval");
  assert.equal(result.implementationAuthority, false);
});

test("AC1 the source set is exactly input, prd, spec, design, traceability (no sixth delegated file)", () => {
  assert.deepEqual([...SOURCE_NAMES], ["input", "prd", "spec", "design", "traceability"]);
  const extra = fixture();
  extra.workflowPackage.sources.workflow = { path: "specs/feature/design-advisory-workflow.md", sha256: "d".repeat(64) };
  assert.equal(validateDesignWorkflowPackage(resealPackage(extra)).ok, false, "a sixth source must be refused");
  const missing = fixture();
  delete missing.workflowPackage.sources.traceability;
  assert.equal(validateDesignWorkflowPackage(resealPackage(missing)).ok, false, "a missing source must be refused");
});

test("AC1 a source whose current bytes differ from the bound hash is refused (stale hash)", () => {
  const stale = fixture();
  stale.sourceBytes.spec = { ...stale.sourceBytes.spec, bytes: Buffer.from("spec source edited\n", "utf8") };
  const result = validateDesignWorkflowPackage(stale);
  assert.equal(result.ok, false);
  assert.equal(result.code, "DWP-PACKAGE-INVALID");
});

test("AC1 the committed PRD, Spec and design addendum carry the delegated workflow rules themselves", () => {
  const prd = flat(read("specs/sprint-alfred-epic/prd_sprint-alfred-epic.md"));
  const spec = flat(read("specs/sprint-alfred-epic/spec.md"));
  const design = flat(read("specs/sprint-alfred-epic/design/greenfield-0.7-remediation-2026-09-27.md"));
  // requested sequence + one final approval (PRD)
  assert.match(prd, /One concrete Advisor consultation compares the input and draft/u);
  assert.match(prd, /fresh read-only reviewer then compares the original input, PRD, Spec, final design and traceability/u);
  assert.match(prd, /one final PO approval of that complete package/u);
  // Advisor exception boundary (PRD)
  assert.match(prd, /That exception does not count as Advisor PASS, waive independent readiness, or authorize implementation or publication/u);
  // authority predicate and E1 sequencing (Spec)
  assert.match(spec, /\*\*Implementation-authorized:\*\*.*E1 is the first authorized foundation act and is not a prerequisite for the authority that permits it/u);
  assert.match(spec, /\*\*Work-package implementation-ready:\*\* implementation authorized and E1 freeze artifact committed/u);
  assert.match(spec, /E1 itself does not depend on its own output/u);
  assert.match(spec, /not an additional ordinary PO approval/u);
  // the addendum restates E1 sequencing without relying on the sixth file
  assert.match(design, /E1 remains the first authorized foundation act/u);
  assert.match(design, /permits E1 without depending on its not-yet-created output/u);
});

// ---- Acceptance 2/3: missing, forged, stale, mismatched, failed, replayed evidence rejected -------

test("AC3 forged readiness host evidence is refused, and absent host verification is refused", () => {
  const forged = fixture();
  forged.readinessReceipt.hostExecution.dutyReceiptSha256 = "0".repeat(64);
  forged.readinessBytes = serialized(forged.readinessReceipt);
  forged.workflowPackage.readiness.sha256 = sha(forged.readinessBytes);
  const forgedResult = validateDesignWorkflowPackage(resealPackage(forged));
  assert.equal(forgedResult.ok, false);
  assert.equal(forgedResult.code, "DWP-READINESS-REPORT-DIGEST");

  const unverified = { ...fixture(), verifyReadinessExecution: undefined };
  assert.equal(validateDesignWorkflowPackage(unverified).code, "DWP-READINESS-HOST-VERIFIER-UNAVAILABLE");

  const rejectedByHost = { ...fixture(), verifyReadinessExecution: () => ({ ok: false, code: "DWP-TEST-HOST-REJECT" }) };
  assert.equal(validateDesignWorkflowPackage(rejectedByHost).code, "DWP-TEST-HOST-REJECT");
});

test("AC3 missing readiness bytes are refused", () => {
  const missing = { ...fixture(), readinessBytes: undefined };
  const result = validateDesignWorkflowPackage(missing);
  assert.equal(result.ok, false);
  assert.equal(result.code, "DWP-READINESS-BYTES");
});

test("AC3 stale evidence: a package candidate that no longer matches the current candidate is refused", () => {
  const f = fixture();
  assert.equal(validateDesignWorkflowPackage({ ...f, candidate: { ...candidate } }).ok, true);
  const drifted = validateDesignWorkflowPackage({ ...f, candidate: { commit: "c".repeat(40), tree: candidate.tree } });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.code, "DWP-CANDIDATE-DRIFT");
});

test("AC3 mismatched evidence: readiness bound to other sources or another candidate is refused", () => {
  const otherSources = fixture();
  // the fixture shares one sources object between package and receipt: detach before mutating
  otherSources.readinessReceipt.sources = { ...otherSources.readinessReceipt.sources,
    prd: { ...otherSources.readinessReceipt.sources.prd, sha256: "e".repeat(64) } };
  const r1 = validateDesignWorkflowPackage(resealReadiness(otherSources));
  assert.equal(r1.ok, false);
  assert.equal(r1.code, "DWP-READINESS-BINDING");

  const otherCandidate = fixture();
  otherCandidate.readinessReceipt.candidate = { commit: "d".repeat(40), tree: candidate.tree };
  const r2 = validateDesignWorkflowPackage(resealReadiness(otherCandidate));
  assert.equal(r2.ok, false);
  assert.equal(r2.code, "DWP-READINESS-BINDING");

  const wrongQuestion = fixture();
  wrongQuestion.advisorReceipt.questionSha256 = "9".repeat(64);
  wrongQuestion.advisorReceiptBytes = serialized(wrongQuestion.advisorReceipt);
  wrongQuestion.workflowPackage.advisor.receipt.sha256 = sha(wrongQuestion.advisorReceiptBytes);
  assert.equal(validateDesignWorkflowPackage(resealPackage(wrongQuestion)).code, "DWP-ADVISOR-QUESTION");
});

test("AC3 failed evidence: a readiness outcome other than ready-for-po-review, or a blocking finding, is refused", () => {
  const blocked = fixture();
  blocked.readinessReceipt.outcome = "blocked";
  const r1 = validateDesignWorkflowPackage(resealReadiness(blocked));
  assert.equal(r1.ok, false, JSON.stringify(r1));

  const blocking = fixture();
  blocking.readinessReceipt.findings = [{ code: "GAP", severity: "blocking", summary: "A requirement is unmapped." }];
  const r2 = validateDesignWorkflowPackage(resealReadiness(blocking));
  assert.equal(r2.ok, false, JSON.stringify(r2));

  const failedAdvisor = fixture();
  failedAdvisor.workflowPackage.advisor.disposition = null;
  assert.equal(validateDesignWorkflowPackage(resealPackage(failedAdvisor)).code, "DWP-ADVISOR-DISPOSITION");
});

test("AC3 replayed evidence: readiness or Advisor evidence reusing the authoring dispatch is refused", () => {
  const readinessReplay = fixture();
  readinessReplay.readinessReceipt.dispatchId = readinessReplay.workflowPackage.authoringDispatchId;
  readinessReplay.workflowPackage.readiness.dispatchId = readinessReplay.workflowPackage.authoringDispatchId;
  assert.equal(validateDesignWorkflowPackage(resealReadiness(readinessReplay)).code, "DWP-READINESS-BINDING");

  const advisorReplay = fixture();
  advisorReplay.advisorReceipt.dispatch.dispatchId = advisorReplay.workflowPackage.authoringDispatchId;
  advisorReplay.advisorReceiptBytes = serialized(advisorReplay.advisorReceipt);
  advisorReplay.workflowPackage.advisor.receipt.sha256 = sha(advisorReplay.advisorReceiptBytes);
  assert.equal(validateDesignWorkflowPackage(resealPackage(advisorReplay)).code, "DWP-ADVISOR-RECEIPT-BINDING");

  const sameDispatch = fixture();
  sameDispatch.readinessReceipt.dispatchId = sameDispatch.advisorReceipt.dispatch.dispatchId;
  sameDispatch.workflowPackage.readiness.dispatchId = sameDispatch.advisorReceipt.dispatch.dispatchId;
  assert.equal(validateDesignWorkflowPackage(resealReadiness(sameDispatch)).code, "DWP-READINESS-BINDING");
});

// ---- Acceptance 4: one final decision; exception and signatures create no authority ---------------

test("AC4 a proposed Advisor exception is presented for the single final approval and never authorizes", () => {
  const unavailable = fixture({ unavailable: true });
  const result = validateDesignWorkflowPackage(unavailable);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, "ready-for-single-final-approval");
  assert.equal(result.implementationAuthority, false);

  const invented = fixture({ unavailable: true });
  invented.workflowPackage.advisor.exception.rationale = "Quota for account team-7 was exhausted after silent retries.";
  const refused = validateDesignWorkflowPackage(resealPackage(invented));
  assert.equal(refused.code, "DWP-ADVISOR-EXCEPTION-RATIONALE-UNBACKED");

  const noReadiness = { ...fixture({ unavailable: true }), readinessBytes: undefined };
  assert.equal(validateDesignWorkflowPackage(noReadiness).ok, false, "the exception does not waive independent readiness");
});

test("AC4 PRD and Spec bind the one final decision and keep exact-file signatures separate", () => {
  const prd = flat(read("specs/sprint-alfred-epic/prd_sprint-alfred-epic.md"));
  assert.match(prd, /must bind and read back the package digest, Advisor result or narrow exception, independent readiness and current source bytes/u);
  assert.match(prd, /Exact-file HGO signatures authorize protected writes and are not additional ordinary Advisor or implementation approvals/u);
  assert.match(prd, /Historical intake\/content acknowledgements retain their original scope/u);
});

// ---- Acceptance 5: Critic-before-Full-Verify, plugin readback, chat/signature have owners ---------

test("AC5 the three integration requirements are named in PRD and addendum and have owning modules", () => {
  const prd = flat(read("specs/sprint-alfred-epic/prd_sprint-alfred-epic.md"));
  const design = flat(read("specs/sprint-alfred-epic/design/greenfield-0.7-remediation-2026-09-27.md"));
  assert.match(prd, /integrate the requested Critic-before-Full- Verify ordering, installed-plugin drift readback, and equivalent chat\/signature package binding/u);
  assert.match(design, /Critic-before-Full-Verify repair/u);
  assert.match(design, /plugin-update drift repair/u);
  assert.match(design, /chat\/signature consistency repair/u);
  for (const owner of ["critic-verify-lifecycle.mjs", "installed-plugin-attestation.mjs", "chat-gate-ceremony.mjs"]) {
    assert.ok(existsSync(`${ROOT}plugins/pipeline-core/lib/${owner}`), `${owner} must exist`);
  }
});

// ---- Acceptance 6/7: E1 sequencing and host-verified freshness/read-only ---------------------------

test("AC6 a stale or mismatched E1 freeze is not enough: the Spec predicate says so", () => {
  const spec = flat(read("specs/sprint-alfred-epic/spec.md"));
  assert.match(spec, /A stale or mismatched freeze does not\./u);
  assert.match(spec, /Every dependent WP waits for this predicate/u);
});

test("AC7 freshness and read-only are host evidence, never reviewer self-assertion", () => {
  const spec = flat(read("specs/sprint-alfred-epic/spec.md"));
  assert.match(spec, /Readiness is a fresh comparison by an independent read-only reviewer/u);
  assert.match(spec, /a model-authored claim of freshness or read-only behavior cannot satisfy these facts/u);
  assert.match(spec, /survive an identical second read/u);
  // the validator enforces it: a self-asserting report with no verifiable host execution is refused
  const selfAsserted = { ...fixture(), verifyReadinessExecution: () => null };
  assert.equal(validateDesignWorkflowPackage(selfAsserted).code, "DWP-READINESS-HOST-UNVERIFIED");
  const throwing = { ...fixture(), verifyReadinessExecution: () => { throw new Error("host store unreadable"); } };
  assert.equal(validateDesignWorkflowPackage(throwing).code, "DWP-READINESS-HOST-UNVERIFIED");
});
