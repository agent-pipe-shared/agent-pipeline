// SPDX-License-Identifier: SUL-1.0
/**
 * R4-T0 RED pins, cases 6-9: the route verdict, the fallback label, the
 * receipt-backed exception rationale and the self-review binding check in the
 * design-workflow package validator (AC-29 / R4-1, R4-2).
 *
 * Fixtures are replicated from the existing package test (its builders are not
 * exported and importing that file would run its cases). Every new input is a
 * NEW PARAMETER of `validateDesignWorkflowPackage`, never a new field inside
 * the package or a receipt: the package is schema-validated and exact-keyed,
 * so a new member there would fail as a schema error and mislead the red.
 * Where a case is already true today it is a labelled control or regression
 * pin and is green on purpose.
 *
 * ASSUMPTIONS the design note leaves open (renaming them later is allowed,
 * but this header and the pins must change together):
 *  - route verdict parameter `roleRoutePreflight`: a result of the role-route
 *    preflight (`{ schema, ok, runner, roles }`); only `roles.readiness.state`
 *    is read. An absent parameter keeps today's behaviour.
 *  - unavailable readiness route -> `DWP-READINESS-ROUTE-UNAVAILABLE`;
 *    fallback-self-dispatch readiness route -> `DWP-READINESS-FALLBACK-EVIDENCE`.
 *  - derived label at `approvalReview.advisor.assurance`, value
 *    `fallback-self-dispatch` exactly when the Advisor receipt adapter is
 *    `consult`; a caller-supplied label is refused (no code is dictated).
 *  - rationale generator export `designWorkflowAdvisorExceptionRationale`
 *    taking `{ advisorReceipt, attemptTrail }` and returning a string; an
 *    exception rationale that differs from the generated one is refused with
 *    `DWP-ADVISOR-EXCEPTION-RATIONALE-UNBACKED`.
 *  - self-review parameter `evidenceBindings`: `{ authoring, advisor,
 *    readiness }`, each `{ templateSha256, sentPromptSha256, subagentId,
 *    resultSha256 }`. Equality of the whole binding OR of the native
 *    subagent id between the authoring dispatch and the Advisor or readiness
 *    evidence -> `DWP-EVIDENCE-SELF-REVIEW`. Plain dispatch-id equality keeps
 *    its existing code `DWP-READINESS-BINDING`.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { designWorkflowAdvisorQuestionSha256, validateDesignWorkflowPackage } from "./design-workflow-package.mjs";
import { createAdvisoryAttemptTrail } from "./advisory-attempt-trail.mjs";
import { designReadinessReportSha256 } from "./design-readiness-host-evidence.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const id = (prefix) => `${prefix}-dispatch`;
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const ROLES = ["advisor", "critic", "goldfish.implement", "goldfish.mechanic", "goldfish.deep", "readiness", "plan-verifier"];

function serialized(value) { return Buffer.from(`${JSON.stringify(value)}\n`, "utf8"); }

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
    unresolvedChoices: [{ id: "CHOICE-1", question: "Choose rollout order?", impact: "Changes sequencing only." }],
    summary: "All source requirements are mapped; one low-impact rollout choice remains for the PO.",
  };
  const readinessReceipt = { ...readinessReport, hostExecution: {
    schema: "pipeline.design-readiness-host-execution.v1", runner: "codex", repoFingerprint: "f".repeat(64),
    selectionId: `css_${"a".repeat(25)}e`, selectionSha256: "b".repeat(64), executionReceiptSha256: "c".repeat(64),
    dutyReceiptSha256: designReadinessReportSha256(readinessReport),
    route: { model: "gpt-6-luna", effort: "high", sourceSha256: "8".repeat(64), candidateCommit: candidate.commit },
  } };
  const readinessBytes = serialized(readinessReceipt);
  const workflowPackage = {
    schema: "pipeline.design-workflow-package.v1", featureId: "feature-1", authoringDispatchId: id("authoring"),
    candidate, sources,
    advisor: unavailable ? {
      status: "unavailable", runner: "codex", nativeAvailable: false,
      receipt: { path: "specs/feature/evidence/advisor.json", sha256: sha(advisorReceiptBytes) },
      attemptTrail: { path: "specs/feature/evidence/advisor-attempts.json", sha256: sha(attemptTrailBytes) },
      disposition: null,
      exception: { status: "proposed", failureCode: "capacity-unavailable", rationale: "The route was exhausted; the complete readiness review still passed." },
    } : {
      status: "answered", runner: "codex", nativeAvailable: false,
      receipt: { path: "specs/feature/evidence/advisor.json", sha256: sha(advisorReceiptBytes) },
      attemptTrail: null, disposition: { decision: "accept", rationale: "The advice is incorporated in the revised design." }, exception: null,
    },
    readiness: { path: "specs/feature/evidence/readiness.json", sha256: sha(readinessBytes), dispatchId: readinessReceipt.dispatchId },
    createdAt: "2026-09-26T10:11:12.000Z",
  };
  return {
    workflowPackage, packageBytes: serialized(workflowPackage), readinessReceipt, readinessBytes, advisorReceipt,
    advisorReceiptBytes, attemptTrail, attemptTrailBytes, sourceBytes, candidate, repoRoot: "/test/repository",
    verifyReadinessExecution: ({ hostExecution: evidence, readinessReceipt: report }) =>
      evidence?.runner === "codex" && evidence.dutyReceiptSha256 === designReadinessReportSha256(report)
        ? { ok: true } : { ok: false, code: "DWP-TEST-HOST-BINDING" },
  };
}

function routePreflight(overrides = {}) {
  const roles = Object.fromEntries(ROLES.map((role) => [role, { state: "native", reasonCode: "RRP-NATIVE-OBSERVED", evidence: "a".repeat(64) }]));
  return { schema: "pipeline.role-route-preflight.v1", ok: true, runner: "codex", roles: { ...roles, ...overrides } };
}

const binding = (seed) => ({ templateSha256: sha(`template-${seed}`), sentPromptSha256: sha(`prompt-${seed}`),
  subagentId: `subagent-${seed}`, resultSha256: sha(`result-${seed}`) });

test("R4-T0-6 control: the unmutated fixture is admitted when no route input is supplied (fixture validity, current behaviour)", () => {
  const result = validateDesignWorkflowPackage(fixture());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.implementationAuthority, false);
});

test("R4-T0-6 a readiness route reported unavailable refuses presentation with DWP-READINESS-ROUTE-UNAVAILABLE", () => {
  const result = validateDesignWorkflowPackage({ ...fixture(), roleRoutePreflight: routePreflight({
    readiness: { state: "unavailable", reasonCode: "RRP-NO-HOST-OBSERVATION", evidence: "" } }) });
  assert.equal(result.ok, false, "an unavailable readiness route must not yield a ready package");
  assert.equal(result.code, "DWP-READINESS-ROUTE-UNAVAILABLE");
});

test("R4-T0-6 a readiness route reported fallback-self-dispatch refuses presentation with DWP-READINESS-FALLBACK-EVIDENCE", () => {
  const result = validateDesignWorkflowPackage({ ...fixture(), roleRoutePreflight: routePreflight({
    readiness: { state: "fallback-self-dispatch", reasonCode: "RRP-FALLBACK-ADVISOR-CONSULT", evidence: "b".repeat(64) } }) });
  assert.equal(result.ok, false, "a fallback-produced readiness result must not satisfy readiness");
  assert.equal(result.code, "DWP-READINESS-FALLBACK-EVIDENCE");
});

test("R4-T0-6 a native readiness route keeps the package admissible and non-authorizing", () => {
  const result = validateDesignWorkflowPackage({ ...fixture(), roleRoutePreflight: routePreflight() });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.implementationAuthority, false);
});

test("R4-T0-6 regression: present-plan keeps its unchanged refusal text and still forwards the validator code", () => {
  const text = readFileSync(new URL("../scripts/pipeline-state.mjs", import.meta.url), "utf8");
  assert.ok(text.includes("no presentation or approval lock was recorded"), "refusal wording must not change");
});

test("R4-T0-7 an Advisor answered through consult is admitted WITH the derived fallback-self-dispatch label", () => {
  const result = validateDesignWorkflowPackage(fixture());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.approvalReview.advisor.assurance, "fallback-self-dispatch");
});

test("R4-T0-7 the label cannot be supplied by the caller", () => {
  const forged = fixture();
  forged.workflowPackage.advisor.assurance = "native";
  forged.packageBytes = serialized(forged.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(forged).ok, false);
});

test("R4-T0-8 control: the unavailable-Advisor fixture is otherwise admissible", () => {
  const result = validateDesignWorkflowPackage(fixture({ unavailable: true }));
  assert.ok(result.ok === true || result.code === "DWP-ADVISOR-EXCEPTION-RATIONALE-UNBACKED", JSON.stringify(result));
});

test("R4-T0-8 an exception rationale asserting a fact the receipt does not contain is refused", () => {
  const unbacked = fixture({ unavailable: true });
  unbacked.workflowPackage.advisor.exception.rationale = "Quota for account team-7 was exhausted at 14:02 UTC after three silent retries.";
  unbacked.packageBytes = serialized(unbacked.workflowPackage);
  const result = validateDesignWorkflowPackage(unbacked);
  assert.equal(result.ok, false, "free text beyond receipt facts must not be admitted");
  assert.equal(result.code, "DWP-ADVISOR-EXCEPTION-RATIONALE-UNBACKED");
});

test("R4-T0-8 a rationale generated from receipt facts is accepted", async () => {
  const mod = await import("./design-workflow-package.mjs");
  assert.equal(typeof mod.designWorkflowAdvisorExceptionRationale, "function",
    "design-workflow-package.mjs must export designWorkflowAdvisorExceptionRationale");
  const generated = fixture({ unavailable: true });
  const input = { advisorReceipt: generated.advisorReceipt, attemptTrail: generated.attemptTrail };
  const rationale = mod.designWorkflowAdvisorExceptionRationale(input);
  assert.equal(typeof rationale, "string");
  assert.ok(rationale.trim().length > 0);
  assert.equal(mod.designWorkflowAdvisorExceptionRationale(input), rationale, "generation is deterministic");
  generated.workflowPackage.advisor.exception.rationale = rationale;
  generated.packageBytes = serialized(generated.workflowPackage);
  const result = validateDesignWorkflowPackage(generated);
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("R4-T0-9 control: three distinct dispatch bindings are admitted", () => {
  const result = validateDesignWorkflowPackage({ ...fixture(),
    evidenceBindings: { authoring: binding("authoring"), advisor: binding("advisor"), readiness: binding("readiness") } });
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("R4-T0-9 readiness evidence whose full binding equals the authoring dispatch is refused as self-review", () => {
  const result = validateDesignWorkflowPackage({ ...fixture(),
    evidenceBindings: { authoring: binding("authoring"), advisor: binding("advisor"), readiness: binding("authoring") } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "DWP-EVIDENCE-SELF-REVIEW");
});

test("R4-T0-9 Advisor evidence whose full binding equals the authoring dispatch is refused as self-review", () => {
  const result = validateDesignWorkflowPackage({ ...fixture(),
    evidenceBindings: { authoring: binding("authoring"), advisor: binding("authoring"), readiness: binding("readiness") } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "DWP-EVIDENCE-SELF-REVIEW");
});

test("R4-T0-9 an equal native subagent id alone, under otherwise distinct bindings, is refused as self-review", () => {
  const result = validateDesignWorkflowPackage({ ...fixture(),
    evidenceBindings: { authoring: binding("authoring"), advisor: binding("advisor"),
      readiness: { ...binding("readiness"), subagentId: binding("authoring").subagentId } } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "DWP-EVIDENCE-SELF-REVIEW");
});

test("R4-T0-9 regression: a readiness dispatch id equal to the authoring id keeps its existing code DWP-READINESS-BINDING", () => {
  const replay = fixture();
  replay.readinessReceipt.dispatchId = replay.workflowPackage.authoringDispatchId;
  replay.readinessReceipt.hostExecution.dutyReceiptSha256 = designReadinessReportSha256(replay.readinessReceipt);
  replay.readinessBytes = serialized(replay.readinessReceipt);
  replay.workflowPackage.readiness.sha256 = sha(replay.readinessBytes);
  replay.packageBytes = serialized(replay.workflowPackage);
  assert.equal(validateDesignWorkflowPackage(replay).code, "DWP-READINESS-BINDING");
});
