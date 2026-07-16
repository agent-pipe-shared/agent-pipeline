import {
  COURSE_CATALOG_SHA256,
  COURSE_CATALOG_VERSION,
  COURSE_ELIMINATION_REASONS,
  COURSE_KINDS,
  DIAGNOSTIC_TAIL_MAX_UTF8_BYTES,
  TRUSTED_ENVIRONMENT_CODES,
  admitCapacity,
  admitReviewAttempt,
  buildCourseDecisionBrief,
  canonicalJson,
  classifyFailureEvidence,
  decideFailureAction,
  evaluateProgress,
  failureSignature,
  sha256Canonical,
  validateCourseDecisionBrief,
  validateCourseDecisionIntent,
  validateCourseDecisionReceipt,
  validateWorkflowFallbackReceipt,
} from "./review-economy.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const HOST_DIAGNOSTIC = { exitCode: 1, signal: null, stdoutBytes: 10, stderrBytes: 20, stdoutOverflow: false, stderrOverflow: false, tailSha256: A, capturedTailBytes: 128 };
let checks = 0;
let failures = 0;
const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");

function ok(name, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}`); }
}

function throws(name, fn) {
  let didThrow = false;
  try { fn(); } catch { didThrow = true; }
  ok(name, didThrow);
}

const failure = {
  faultDomain: "product",
  capabilityId: "critic",
  stage: "verify",
  runner: "host-native",
  stableErrorCode: "assertion-failed",
  exitCode: 1,
  signal: null,
  boundedTailSha256: A,
};

ok("RE01 canonical JSON sorts recursively", canonicalJson({ z: 1, a: { y: 2, b: 3 } }) === '{"a":{"b":3,"y":2},"z":1}');
ok("RE02 canonical digest ignores insertion order", sha256Canonical({ b: 1, a: 2 }) === sha256Canonical({ a: 2, b: 1 }));
throws("RE03 canonical JSON rejects unsafe numbers", () => canonicalJson({ unsafe: 0.5 }));
const signature = failureSignature(failure);
ok("RE04 failure signature is deterministic SHA-256", signature === failureSignature({ ...failure }) && /^[a-f0-9]{64}$/.test(signature));
ok("RE05 stable failure field changes signature", signature !== failureSignature({ ...failure, stableErrorCode: "schema-failed" }));
throws("RE06 raw/free-form failure text has no input channel", () => failureSignature({ ...failure, message: "private raw tail" }));
throws("RE07 absolute path has no signature input channel", () => failureSignature({ ...failure, path: "/home/person/project" }));

const noProduct = null;
const productEvidence = { productVerdict: { schemaValid: true, outcome: "failed" }, host: null };
ok("RE08 schema-valid product verdict classifies product", classifyFailureEvidence(productEvidence).faultDomain === "product");
ok("RE08a successful product result is not a failure classification", classifyFailureEvidence({ productVerdict: { schemaValid: true, outcome: "succeeded" }, host: null }).faultDomain === "unknown");
for (const code of TRUSTED_ENVIRONMENT_CODES.slice(0, 3)) {
  const classified = classifyFailureEvidence({
    productVerdict: noProduct,
    host: { structured: true, code, beforeProductStart: true, evidenceSha256: A, diagnostic: HOST_DIAGNOSTIC, calibration: null },
  });
  ok(`RE09 trusted host code ${code} classifies environment`, classified.faultDomain === "execution-environment");
}
const calibratedEvidence = {
  productVerdict: null,
  host: {
    structured: true,
    code: "host-sandbox-calibrated-transport-failure",
    beforeProductStart: true,
    evidenceSha256: A,
    diagnostic: HOST_DIAGNOSTIC,
    calibration: {
      fresh: true,
      exactHostCliVersionPrimitive: true,
      identicalControlDigests: true,
      liveSignatureMatched: true,
      receiptSha256: B,
    },
  },
};
ok("RE10 complete fresh exact calibration classifies environment", classifyFailureEvidence(calibratedEvidence).faultDomain === "execution-environment");
ok("RE11 stale calibration remains unknown", classifyFailureEvidence({ ...calibratedEvidence, host: { ...calibratedEvidence.host, calibration: { ...calibratedEvidence.host.calibration, fresh: false } } }).faultDomain === "unknown");
ok("RE12 product start before host fault remains unknown", classifyFailureEvidence({ productVerdict: null, host: { structured: true, code: TRUSTED_ENVIRONMENT_CODES[0], beforeProductStart: false, evidenceSha256: A, diagnostic: HOST_DIAGNOSTIC, calibration: null } }).faultDomain === "unknown");
ok("RE13 timeout/nonzero/free text alone remain unknown", classifyFailureEvidence({ productVerdict: null, host: { timeout: true, exitCode: 1, stderr: "sandbox failed" } }).faultDomain === "unknown");
ok("RE13a trusted code without bounded diagnostics remains unknown", classifyFailureEvidence({ productVerdict: null, host: { structured: true, code: TRUSTED_ENVIRONMENT_CODES[0], beforeProductStart: true, evidenceSha256: A, calibration: null } }).faultDomain === "unknown");
ok("RE13aa explicit null diagnostics remain unknown", classifyFailureEvidence({ productVerdict: null, host: { structured: true, code: TRUSTED_ENVIRONMENT_CODES[0], beforeProductStart: true, evidenceSha256: A, diagnostic: null, calibration: null } }).faultDomain === "unknown");
ok("RE13b any schema-valid nonfailure product result precludes environment reroute", classifyFailureEvidence({ productVerdict: { schemaValid: true, outcome: "blocked" }, host: { structured: true, code: TRUSTED_ENVIRONMENT_CODES[0], beforeProductStart: true, evidenceSha256: A, diagnostic: HOST_DIAGNOSTIC, calibration: null } }).faultDomain === "unknown");

const pathInvariantMap = { "src/a.mjs": ["INV-02", "INV-01"], "src/b.mjs": ["INV-03"] };
const delta = {
  round: 2,
  correctionCommits: 1,
  requestedMode: "delta",
  base: COMMIT,
  head: "c".repeat(40),
  tree: TREE,
  changedPaths: ["src/a.mjs", "src/b.mjs"],
  changedBehaviorClaims: ["behavior-one"],
  priorReceipt: { id: "receipt-01", sha256: A },
  pathInvariantMap,
  pathInvariantMapSha256: sha256Canonical(pathInvariantMap),
  coordinatorImpactConfirmed: true,
  trustBoundaryChanged: false,
  impactAmbiguous: false,
};
ok("RE14 first round is always full", admitReviewAttempt({ ...delta, round: 1 }).mode === "full");
ok("RE15 explicit later full remains full", admitReviewAttempt({ ...delta, requestedMode: "full" }).mode === "full");
const admittedDelta = admitReviewAttempt(delta);
ok("RE16 complete later evidence admits delta", admittedDelta.ok && admittedDelta.mode === "delta");
ok("RE17 delta derives stable sorted invariant impact", JSON.stringify(admittedDelta.affectedInvariantIds) === JSON.stringify(["INV-01", "INV-02", "INV-03"]));
ok("RE18 unknown changed path forces full", admitReviewAttempt({ ...delta, changedPaths: ["src/unknown.mjs"] }).mode === "full");
ok("RE19 map digest drift forces full", admitReviewAttempt({ ...delta, pathInvariantMapSha256: B }).mode === "full");
ok("RE20 prior receipt omission forces full", admitReviewAttempt({ ...delta, priorReceipt: null }).mode === "full");
ok("RE21 new trust boundary forces full", admitReviewAttempt({ ...delta, trustBoundaryChanged: true }).mode === "full");
ok("RE22 ambiguous impact forces full", admitReviewAttempt({ ...delta, impactAmbiguous: true }).mode === "full");
ok("RE23 fourth Critic round remains within the approved budget", admitReviewAttempt({ ...delta, round: 4 }).courseGateRequired !== true);
ok("RE24 fourth Critic round creates course gate", admitReviewAttempt({ ...delta, round: 5 }).courseGateRequired === true);
ok("RE25 third correction commit remains within the approved budget", admitReviewAttempt({ ...delta, correctionCommits: 3 }).courseGateRequired !== true);
ok("RE26 fourth correction commit creates course gate", admitReviewAttempt({ ...delta, correctionCommits: 4 }).courseGateRequired === true);

const baseAction = {
  failure,
  counters: { productRetryCount: 0, environmentRerouteCount: 0 },
  priorFailureSignatures: [],
  recoveredOriginChain: false,
  classificationEvidence: productEvidence,
  failoverAdmission: null,
};
ok("RE25 first product failure may retry exactly once", decideFailureAction(baseAction).action === "product-retry" && decideFailureAction(baseAction).nextProductRetryCount === 1);
ok("RE25a unproven product label cannot consume retry", decideFailureAction({ ...baseAction, classificationEvidence: { productVerdict: null, host: null } }).code === "RE-PRODUCT-UNPROVEN");
const repeated = decideFailureAction({ ...baseAction, counters: { productRetryCount: 1, environmentRerouteCount: 0 }, priorFailureSignatures: [signature] });
ok("RE26 repeated product signature creates course gate", repeated.action === "course-gate" && repeated.repeatedSignature === true);
ok("RE27 different product signature after consumed budget also gates", decideFailureAction({ ...baseAction, failure: { ...failure, stableErrorCode: "other-failure" }, counters: { productRetryCount: 1, environmentRerouteCount: 0 } }).action === "course-gate");
ok("RE28 fallback product failure blocks without retry", decideFailureAction({ ...baseAction, recoveredOriginChain: true }).action === "product-blocker");
ok("RE29 unknown never retries", decideFailureAction({ ...baseAction, failure: { ...failure, faultDomain: "unknown" } }).action === "unknown-blocker");
const environmentFailure = { ...failure, faultDomain: "execution-environment", stableErrorCode: "sandbox-bootstrap" };
ok("RE30 unproven environment declaration remains unknown", decideFailureAction({ ...baseAction, failure: environmentFailure }).code === "RE-ENVIRONMENT-UNPROVEN");
const failoverAction = {
  ...baseAction,
  failure: environmentFailure,
  counters: { productRetryCount: 1, environmentRerouteCount: 0 },
  classificationEvidence: {
    productVerdict: null,
    host: { structured: true, code: TRUSTED_ENVIRONMENT_CODES[0], beforeProductStart: true, evidenceSha256: A, diagnostic: HOST_DIAGNOSTIC, calibration: null },
  },
  failoverAdmission: {
    recoverySlotAvailable: true,
    narrowRouteAvailable: true,
    frozenBindingsMatch: true,
    permissionsNarrowed: true,
    mayDelegate: false,
    originLaneId: "origin-lane",
    originDispatchId: "dispatch-01",
    revision: 4,
    environmentEvidenceSha256: A,
    narrowingContractSha256: B,
  },
};
const routed = decideFailureAction(failoverAction);
ok("RE31 first trusted environment fault routes once", routed.action === "environment-failover" && routed.nextEnvironmentRerouteCount === 1);
ok("RE32 failover identities are deterministic and distinct", routed.fallbackLaneId !== "origin-lane" && routed.fallbackDispatchId !== "dispatch-01" && routed.fallbackLaneId === decideFailureAction(failoverAction).fallbackLaneId);
ok("RE33 environment failover preserves product retry count", routed.productRetryCount === 1 && routed.sameLaneRetryProhibited === true);
ok("RE34 second environment occurrence gates", decideFailureAction({ ...failoverAction, counters: { productRetryCount: 1, environmentRerouteCount: 1 } }).action === "course-gate");
ok("RE34a proven environment course gate keeps origin lane closed", decideFailureAction({ ...failoverAction, counters: { productRetryCount: 1, environmentRerouteCount: 1 } }).sameLaneRetryProhibited === true);
ok("RE34b mismatched environment evidence cannot reroute", decideFailureAction({ ...failoverAction, failoverAdmission: { ...failoverAction.failoverAdmission, environmentEvidenceSha256: B } }).action === "course-gate");
ok("RE35 missing recovery slot gates", decideFailureAction({ ...failoverAction, failoverAdmission: { ...failoverAction.failoverAdmission, recoverySlotAvailable: false } }).action === "course-gate");
ok("RE36 delegating fallback gates", decideFailureAction({ ...failoverAction, failoverAdmission: { ...failoverAction.failoverAdmission, mayDelegate: true } }).action === "course-gate");

const progress0 = { boundTreeChanges: 0, verifiedOutputBytes: 0, traceBytes: 0, completedTestSteps: 0, deliveredResultBytes: 0 };
const progress1 = { ...progress0, traceBytes: 1 };
ok("RE37 any monotonic component advances lease", evaluateProgress(progress0, progress1, { nowMs: 100, lastProgressAtMs: 10, stagnationIntervalMs: 50 }).lastProgressAtMs === 100);
ok("RE38 unchanged vector before interval is not stagnant", evaluateProgress(progress0, progress0, { nowMs: 40, lastProgressAtMs: 10, stagnationIntervalMs: 50 }).stagnant === false);
const diagnostic = { exitCode: null, signal: null, stdoutBytes: 10, stderrBytes: 20, stdoutOverflow: false, stderrOverflow: true, tailSha256: A, capturedTailBytes: DIAGNOSTIC_TAIL_MAX_UTF8_BYTES };
const stagnant = evaluateProgress(progress0, progress0, { nowMs: 60, lastProgressAtMs: 10, stagnationIntervalMs: 50 }, diagnostic);
ok("RE39 unchanged vector at interval is stagnant with bounded diagnostics", stagnant.stagnant === true && stagnant.diagnostic.tailSha256 === A);
ok("RE40 progress regression fails closed", evaluateProgress(progress1, progress0, { nowMs: 100, lastProgressAtMs: 10, stagnationIntervalMs: 50 }).ok === false);
ok("RE41 heartbeat/running fields have no progress channel", evaluateProgress({ ...progress0, running: true }, progress0, { nowMs: 100, lastProgressAtMs: 10, stagnationIntervalMs: 50 }).ok === false);
ok("RE42 tail above 4096 bytes is rejected", evaluateProgress(progress0, progress0, { nowMs: 60, lastProgressAtMs: 10, stagnationIntervalMs: 50 }, { ...diagnostic, capturedTailBytes: 4097 }).ok === false);

const capacity = { candidateFrozen: false, sandboxedWork: true, availableSlots: 2, criticSlotReserved: true, recoverySlotReserved: true, reviewRouteAvailable: true, unavailabilityPolicy: "defer", preauthorizedFallbackAvailable: false, preauthorizedFallbackEvidenceSha256: null };
ok("RE43 reserved Critic and recovery slots admit work", admitCapacity(capacity).action === "continue");
ok("RE44 missing Critic slot blocks before freeze", admitCapacity({ ...capacity, criticSlotReserved: false }).action === "capacity-blocker");
ok("RE45 missing recovery slot blocks sandboxed work", admitCapacity({ ...capacity, recoverySlotReserved: false }).action === "capacity-blocker");
ok("RE45a Critic and recovery reservations require distinct slots", admitCapacity({ ...capacity, availableSlots: 1 }).code === "RE-DISTINCT-RESERVED-SLOTS-UNAVAILABLE");
ok("RE46 unavailable route defaults to defer", admitCapacity({ ...capacity, reviewRouteAvailable: false }).action === "defer");
ok("RE47 only evidence-bound preauthorized route may substitute", admitCapacity({ ...capacity, reviewRouteAvailable: false, unavailabilityPolicy: "preauthorized-fallback", preauthorizedFallbackAvailable: true, preauthorizedFallbackEvidenceSha256: A }).action === "preauthorized-fallback");
ok("RE47a unbound fallback availability still defers", admitCapacity({ ...capacity, reviewRouteAvailable: false, unavailabilityPolicy: "preauthorized-fallback", preauthorizedFallbackAvailable: true }).action === "defer");
ok("RE48 unavailable mapped fallback still defers", admitCapacity({ ...capacity, reviewRouteAvailable: false, unavailabilityPolicy: "preauthorized-fallback", preauthorizedFallbackAvailable: false }).action === "defer");

function option(kind, index) {
  return {
    optionId: `option-${index}`,
    kind,
    equivalenceKey: `course-${index}`,
    expectedOutcome: `outcome-${index}`,
    scopeDelta: { add: [], modify: [], remove: [] },
    requiredEvidence: [{ id: `evidence-${index}`, sha256: A }],
    timeCost: { minimumMinutes: 0, maximumMinutes: 30, confidence: "medium" },
    residualRisk: `risk-${index}`,
    securityAssuranceClaims: [],
    claimImpact: { addedClaims: [], removedClaims: [], retainedNonClaims: ["os-isolation"] },
    reversibility: "reversible",
    authority: kind === "stop" || kind === "defer" ? "po" : "coordinator",
    permittedOperations: [],
    trustBoundary: "unchanged",
    newTrustBoundaries: [],
    rollbackImpact: `rollback-${index}`,
    resumeImpact: `resume-${index}`,
    resumePredicate: kind === "defer" ? "external-predicate" : null,
    continuationTransitionSha256: kind === "defer" || kind === "stop" ? null : A,
  };
}

const briefInput = {
  briefId: "brief-01",
  featureId: "phase26",
  revision: 4,
  gateId: "gate-01",
  blockerId: "blocker-01",
  commit: COMMIT,
  tree: TREE,
  authorityDigests: { prd: A, spec: B },
  normalizedFailureSignature: signature,
  similarityGroupId: "similar-product-failure",
  triggerEvidence: [
    { attemptId: "attempt-01", attemptSha256: A, resultId: "result-01", resultSha256: B, evidence: [{ id: "evidence-01", sha256: C }] },
    { attemptId: "attempt-02", attemptSha256: B, resultId: "result-02", resultSha256: C, evidence: [{ id: "evidence-02", sha256: D }] }
  ],
  observedCount: 2,
  configuredLimit: 1,
  gateTrigger: { kind: "repeated-signature", budget: null },
  consumedBudgets: { productRetries: 1, environmentReroutes: 0, reviewRounds: 1, correctionCommits: 1 },
  invariants: ["INV-01"],
  nonClaims: ["os-isolation"],
  forbiddenOperations: ["main-merge", "force-push"],
  exactPoDecisionQuestion: "Which evidence-bound course should be selected?",
  alternatives: COURSE_KINDS.map(option),
  eliminated: [],
  recommendation: { optionId: "option-0", evidence: [{ id: "recommendation-evidence", sha256: A }], nonBinding: true },
};
const built = buildCourseDecisionBrief(briefInput);
ok("RE49 builder binds closed catalog and validates", built.brief.catalogVersion === COURSE_CATALOG_VERSION && built.brief.catalogSha256 === COURSE_CATALOG_SHA256 && validateCourseDecisionBrief(built.brief).ok);
ok("RE50 catalog constants are closed and unique", COURSE_KINDS.length === 6 && new Set(COURSE_KINDS).size === 6 && new Set(COURSE_ELIMINATION_REASONS).size === 8);
ok("RE51 missing catalog kind fails", validateCourseDecisionBrief({ ...built.brief, alternatives: built.brief.alternatives.slice(1) }).code === "RE-BRIEF-CATALOG-NOT-EXHAUSTED");
const stopEliminated = { ...built.brief, alternatives: built.brief.alternatives.filter(({ kind }) => kind !== "stop"), eliminated: [{ kind: "stop", reasonCode: "not-applicable", evidence: [{ id: "elim-stop", sha256: A }] }] };
ok("RE52 stop and defer must remain selectable", validateCourseDecisionBrief(stopEliminated).code === "RE-BRIEF-STOP-DEFER-REQUIRED");
const overlap = structuredClone(built.brief);
overlap.alternatives[1].equivalenceKey = overlap.alternatives[0].equivalenceKey;
ok("RE53 materially equivalent selectable courses fail", validateCourseDecisionBrief(overlap).code === "RE-BRIEF-ALTERNATIVE-OVERLAP");
ok("RE54 recommendation cannot self-select unknown option", validateCourseDecisionBrief({ ...built.brief, recommendation: { ...built.brief.recommendation, optionId: "unknown-option" } }).code === "RE-BRIEF-RECOMMENDATION");
ok("RE54a every gate requires one non-binding recommendation", validateCourseDecisionBrief({ ...built.brief, recommendation: null }).code === "RE-BRIEF-RECOMMENDATION");
ok("RE54b observed trigger count must match typed attempts", validateCourseDecisionBrief({ ...built.brief, observedCount: 3 }).ok === false);
ok("RE54c recurrence must exceed configured limit", validateCourseDecisionBrief({ ...built.brief, configuredLimit: 2 }).code === "RE-BRIEF-TRIGGER-NOT-PROVEN");
const budgetGate = { ...built.brief, gateTrigger: { kind: "budget-exhausted", budget: "productRetries" }, configuredLimit: 1 };
ok("RE54d exact consumed budget may independently prove gate", validateCourseDecisionBrief(budgetGate).ok === true);
ok("RE54e unconsumed named budget cannot prove gate", validateCourseDecisionBrief({ ...budgetGate, consumedBudgets: { ...budgetGate.consumedBudgets, productRetries: 0 } }).code === "RE-BRIEF-TRIGGER-NOT-PROVEN");
ok("RE54f contradictory configured budget limit cannot prove gate", validateCourseDecisionBrief({ ...budgetGate, configuredLimit: 2 }).code === "RE-BRIEF-TRIGGER-NOT-PROVEN");
throws("RE55 builder rejects a fabricated custom course", () => buildCourseDecisionBrief({ ...briefInput, alternatives: [...briefInput.alternatives.slice(0, -1), { ...option("stop", 9), kind: "custom-course" }] }));

const intent = {
  schema: "pipeline.course-decision-intent.v1",
  idempotencyKey: "decision-key-01",
  briefId: built.brief.briefId,
  briefSha256: built.sha256,
  blockerSignature: signature,
  optionId: "option-0",
  poEvidenceSha256: D,
  preStateSha256: B,
  selectedTransitionSha256: A,
  expectedRevision: 4,
  selectedRevision: 5,
  dispatchableRevision: 6,
};
const intentBinding = { briefId: built.brief.briefId, briefSha256: built.sha256, blockerSignature: signature, optionIds: built.brief.alternatives.map(({ optionId }) => optionId) };
const intentVerdict = validateCourseDecisionIntent(intent, intentBinding);
ok("RE55a intent binds brief blocker option and consecutive revisions", intentVerdict.ok);
ok("RE55b skipped selected revision fails intent", validateCourseDecisionIntent({ ...intent, selectedRevision: 6 }, intentBinding).ok === false);
const receipt = {
  schema: "pipeline.course-decision-receipt.v1",
  idempotencyKey: intent.idempotencyKey,
  intentSha256: intentVerdict.sha256,
  briefSha256: intent.briefSha256,
  blockerSignature: intent.blockerSignature,
  optionId: intent.optionId,
  preStateSha256: A,
  postStateSha256: B,
  preRevision: 4,
  postRevision: 5,
  casOutcome: "applied",
};
ok("RE55c applied receipt binds intent and advancing state", validateCourseDecisionReceipt(receipt, intent).ok);
ok("RE55d applied receipt cannot retain old revision", validateCourseDecisionReceipt({ ...receipt, postRevision: 4 }, intent).ok === false);
ok("RE55e non-applied receipt must retain exact state", validateCourseDecisionReceipt({ ...receipt, casOutcome: "stale", postRevision: 4, postStateSha256: A }, intent).ok);
ok("RE55f forged brief binding fails receipt", validateCourseDecisionReceipt({ ...receipt, briefSha256: C }, intent).ok === false);

const fallbackReceipt = {
  schema: "pipeline.workflow-fallback-receipt.v1",
  creatorDuty: "Coordinator",
  featureId: "phase26",
  revision: 4,
  packageId: "P2",
  actionId: "review",
  origin: { dispatchId: "dispatch-01", attemptId: "attempt-01", laneId: "origin-lane" },
  fault: { code: TRUSTED_ENVIRONMENT_CODES[0], evidenceSha256: A },
  sameLaneRetryProhibited: true,
  fallback: { laneId: routed.fallbackLaneId, dispatchId: routed.fallbackDispatchId, environmentRerouteCount: 1 },
  bindings: {
    taskSha256: A,
    commit: COMMIT,
    tree: TREE,
    inputSha256: B,
    authorityPaths: { prd: "specs/prd.md", spec: "specs/spec.md", result: "specs/result.md" },
    authorityDigests: { prd: A, spec: B, result: C },
  },
  permissions: { readPaths: ["src/a.mjs"], writePaths: [], tools: ["read-file"] },
  budgets: { walltimeMs: 60000, turns: 1, commands: 2, outputBytes: 8192 },
  outputSchemaSha256: C,
  mayDelegate: false,
  globalWritesProhibited: true,
  outcome: "succeeded",
  resultSha256: D,
  assurance: "normal-contractual-read-only; OS isolation not asserted",
};
ok("RE56 exact Coordinator fallback receipt validates", validateWorkflowFallbackReceipt(fallbackReceipt).ok);
ok("RE57 agent cannot mint fallback receipt", validateWorkflowFallbackReceipt({ ...fallbackReceipt, creatorDuty: "Implementer" }).ok === false);
ok("RE58 same fallback lane fails", validateWorkflowFallbackReceipt({ ...fallbackReceipt, fallback: { ...fallbackReceipt.fallback, laneId: fallbackReceipt.origin.laneId } }).ok === false);
ok("RE59 broader delegation fails", validateWorkflowFallbackReceipt({ ...fallbackReceipt, mayDelegate: true }).ok === false);
ok("RE60 OS-isolation upgrade fails", validateWorkflowFallbackReceipt({ ...fallbackReceipt, assurance: "OS isolated" }).ok === false);
ok("RE61 protected state write path fails", validateWorkflowFallbackReceipt({ ...fallbackReceipt, permissions: { ...fallbackReceipt.permissions, writePaths: [".pipeline/pipeline-state.json"] } }).ok === false);
ok("RE62 authority write path fails", validateWorkflowFallbackReceipt({ ...fallbackReceipt, permissions: { ...fallbackReceipt.permissions, writePaths: ["specs/result.md"] } }).ok === false);
ok("RE63 succeeded receipt requires a result digest", validateWorkflowFallbackReceipt({ ...fallbackReceipt, resultSha256: null }).ok === false);
ok("RE64 docs state write path fails", validateWorkflowFallbackReceipt({ ...fallbackReceipt, permissions: { ...fallbackReceipt.permissions, writePaths: ["docs/state.md"] } }).ok === false);
ok("RE65 dot-segment alias fails before authority comparison", validateWorkflowFallbackReceipt({ ...fallbackReceipt, permissions: { ...fallbackReceipt.permissions, writePaths: ["specs/./result.md"] } }).ok === false);
ok("RE66 dot-segment authority path itself fails", validateWorkflowFallbackReceipt({ ...fallbackReceipt, bindings: { ...fallbackReceipt.bindings, authorityPaths: { ...fallbackReceipt.bindings.authorityPaths, result: "specs/./result.md" } } }).ok === false);

const reviewSchema = JSON.parse(readFileSync(join(scriptsDir, "review-attempt.schema.json"), "utf8"));
const fallbackSchema = JSON.parse(readFileSync(join(scriptsDir, "workflow-fallback-receipt.schema.json"), "utf8"));
const courseSchema = JSON.parse(readFileSync(join(scriptsDir, "course-decision.schema.json"), "utf8"));
ok("RE67 review-attempt schema is a closed v1 root", reviewSchema.additionalProperties === false && reviewSchema.properties.schema.const === "pipeline.review-attempt.v1");
ok("RE68 fallback receipt schema is Coordinator-only and non-delegating", fallbackSchema.properties.creatorDuty.const === "Coordinator" && fallbackSchema.properties.mayDelegate.const === false);
ok("RE69 course schema owns exactly brief intent and receipt forms", Array.isArray(courseSchema.oneOf) && courseSchema.oneOf.length === 3 && courseSchema.$defs.brief.additionalProperties === false);

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) process.exitCode = 1;
