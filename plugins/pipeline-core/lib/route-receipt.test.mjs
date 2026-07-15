#!/usr/bin/env node
import { validateRouteReceipt } from "./route-receipt.mjs";
import { projectDirectRoutingDefaults, projectRunnerAssignment, validateDirectRoute } from "./routing-projection.mjs";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const FIXTURE = Object.freeze({
  dispatchId: "p3a-terra-xhigh-host-capture-20260715-03",
  queueRevision: 0,
  candidateCommit: "2f474f4e9f33253be5ea29e86e73f8a655a5ccab",
  candidateTree: "68a0591a44d365523f15371a931123870a3953b6",
  hostDigest: "44a1dc00c872508d453d48a565633970d33177212e45f1e926deeaacf6cb97ea",
});
const REQUESTED_DUTY = "codex_implementation";
const REQUESTED_WORKTYPE = null;
const DISPATCH_BINDING = Object.freeze({
  dispatchId: FIXTURE.dispatchId,
  queueRevision: FIXTURE.queueRevision,
  candidateCommit: FIXTURE.candidateCommit,
  candidateTree: FIXTURE.candidateTree,
  requestedDuty: REQUESTED_DUTY,
  requestedWorktype: REQUESTED_WORKTYPE,
});

const TERRA_OBSERVED = Object.freeze({
  resultSha256: FIXTURE.hostDigest,
  effectiveDuty: "codex_implementation",
  effectiveWorktype: null,
  effectiveRunner: "codex",
  effectiveSelector: Object.freeze({ kind: "model-id", value: "gpt-5.6-terra" }),
  effectiveProvider: "openai",
  effectiveModelId: "gpt-5.6-terra",
  effectiveEffort: "xhigh",
});
const FABLE_OBSERVED = Object.freeze({
  ...TERRA_OBSERVED,
  effectiveSelector: Object.freeze({ kind: "model-id", value: "gpt-5.6-sol" }),
  effectiveModelId: "gpt-5.6-sol",
});

function trustedEvidenceFor(source, sha256, observed) {
  return {
    source,
    sha256,
    resultSha256: observed.resultSha256,
    effectiveDuty: observed.effectiveDuty,
    effectiveWorktype: observed.effectiveWorktype,
    effectiveRunner: observed.effectiveRunner,
    effectiveSelector: { ...observed.effectiveSelector },
    effectiveProvider: observed.effectiveProvider,
    effectiveModelId: observed.effectiveModelId,
    effectiveEffort: observed.effectiveEffort,
  };
}

const HOST_EVIDENCE = Object.freeze(trustedEvidenceFor("host", FIXTURE.hostDigest, TERRA_OBSERVED));
const CLI_EVIDENCE = Object.freeze(trustedEvidenceFor("cli", FIXTURE.hostDigest, TERRA_OBSERVED));
const FABLE_EVIDENCE = Object.freeze(trustedEvidenceFor("cli", FIXTURE.hostDigest, FABLE_OBSERVED));

const routing = projectDirectRoutingDefaults();
const terraRoute = routing.duties.codex_implementation;
const fableRoute = Object.freeze({
  ...terraRoute,
  selector: { kind: "alias", value: "fable" },
});

function receiptFor(route, requestedDuty, requestedWorktype, observed, evidence, overrides) {
  return {
    schema: "pipeline.route-receipt.v1",
    dispatchId: FIXTURE.dispatchId,
    queueRevision: FIXTURE.queueRevision,
    candidateCommit: FIXTURE.candidateCommit,
    candidateTree: FIXTURE.candidateTree,
    resultSha256: observed.resultSha256,
    requestedDuty,
    requestedWorktype,
    requestedRunner: route.runner,
    requestedProvider: "openai",
    requestedSelector: { ...route.selector },
    requestedEffort: route.effort,
    effectiveDuty: observed.effectiveDuty,
    effectiveWorktype: observed.effectiveWorktype,
    effectiveRunner: observed.effectiveRunner,
    effectiveSelector: { ...observed.effectiveSelector },
    effectiveProvider: observed.effectiveProvider,
    effectiveModelId: observed.effectiveModelId,
    effectiveEffort: observed.effectiveEffort,
    resolutionEvidence: { source: evidence.source, sha256: evidence.sha256 },
    attestationAvailable: true,
    effectiveRouteStatus: "attested",
    ...overrides,
  };
}

function outcomeOf(receipt, route, dispatchBinding, trustedEvidence) {
  try {
    return {
      threw: false,
      result: validateRouteReceipt(receipt, route, dispatchBinding, trustedEvidence),
    };
  } catch (error) {
    return { threw: true, error };
  }
}

function accepts(receipt, route, dispatchBinding, trustedEvidence) {
  const outcome = outcomeOf(receipt, route, dispatchBinding, trustedEvidence);
  return outcome.threw === false && outcome.result.ok === true;
}

function rejects(receipt, route, dispatchBinding, trustedEvidence) {
  const outcome = outcomeOf(receipt, route, dispatchBinding, trustedEvidence);
  return outcome.threw === false && outcome.result.ok === false;
}

const terraReceipt = receiptFor(
  terraRoute,
  REQUESTED_DUTY,
  REQUESTED_WORKTYPE,
  TERRA_OBSERVED,
  HOST_EVIDENCE,
  {},
);
check("RR01 Terra/xhigh route itself is valid", validateDirectRoute(terraRoute).ok);
check("RR02 Terra attestation requires the exact caller-held dispatch binding", accepts(terraReceipt, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR03 Terra keeps requested alias separate from observed effective model", terraReceipt.requestedSelector.value === "terra" && terraReceipt.effectiveModelId === "gpt-5.6-terra");

for (const field of ["schema", "dispatchId", "queueRevision", "candidateCommit", "candidateTree", "resultSha256", "requestedDuty", "requestedWorktype", "requestedRunner", "requestedProvider", "requestedSelector", "requestedEffort", "effectiveDuty", "effectiveWorktype", "effectiveRunner", "effectiveSelector", "effectiveProvider", "effectiveModelId", "effectiveEffort", "resolutionEvidence", "attestationAvailable", "effectiveRouteStatus"]) {
  const { [field]: omitted, ...withoutField } = terraReceipt;
  check(`RR04 omitting required receipt field ${field} fails closed`, rejects(withoutField, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
}

check("RR05 missing caller-held dispatch binding fails closed", rejects(terraReceipt, terraRoute, null, HOST_EVIDENCE));
check("RR06 missing caller-held trusted-evidence binding fails closed", rejects(terraReceipt, terraRoute, DISPATCH_BINDING, null));
check("RR07 receipt-contained host evidence cannot attest without both caller-held bindings", rejects(terraReceipt, terraRoute, null, null));
check("RR08 self-reported evidence cannot attest", rejects({ ...terraReceipt, resolutionEvidence: { source: "agent", sha256: FIXTURE.hostDigest } }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR09 requested provider drift fails closed", rejects({ ...terraReceipt, requestedProvider: "anthropic" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR10 effective provider drift fails closed", rejects({ ...terraReceipt, effectiveProvider: "anthropic" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR11 requested selector drift fails closed", rejects({ ...terraReceipt, requestedSelector: { kind: "alias", value: "other" } }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR12 effective model drift fails closed", rejects({ ...terraReceipt, effectiveModelId: "gpt-5.6-sol" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR13 requested effort drift fails closed", rejects({ ...terraReceipt, requestedEffort: "high" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR14 effective effort drift fails closed", rejects({ ...terraReceipt, effectiveEffort: "high" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR15 candidate commit drift fails closed", rejects({ ...terraReceipt, candidateCommit: "b".repeat(40) }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR16 candidate tree drift fails closed", rejects({ ...terraReceipt, candidateTree: "c".repeat(40) }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR17 queue revision drift fails closed", rejects({ ...terraReceipt, queueRevision: 1 }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR18 dispatch identifier drift fails closed", rejects({ ...terraReceipt, dispatchId: "different-dispatch" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR19 trusted evidence digest drift fails closed", rejects({ ...terraReceipt, resolutionEvidence: { source: "host", sha256: "d".repeat(64) } }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR20 Terra requires trusted host evidence rather than trusted CLI evidence", rejects(terraReceipt, terraRoute, DISPATCH_BINDING, CLI_EVIDENCE));
check("RR21 raw output is rejected at the receipt schema boundary", rejects({ ...terraReceipt, rawOutput: "untrusted output" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR22 unresolved status fails closed", rejects({ ...terraReceipt, effectiveRouteStatus: "unresolved-alias", attestationAvailable: false }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR23 unavailable status fails closed", rejects({ ...terraReceipt, effectiveRouteStatus: "unavailable", attestationAvailable: false }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR24 unavailable status cannot be made attested by its flag", rejects({ ...terraReceipt, effectiveRouteStatus: "unavailable" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR25 non-SHA result binding is refused", rejects({ ...terraReceipt, resultSha256: "bad" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));

const fableReceipt = receiptFor(
  fableRoute,
  REQUESTED_DUTY,
  REQUESTED_WORKTYPE,
  FABLE_OBSERVED,
  FABLE_EVIDENCE,
  {},
);
check("RR26 Fable alias route itself is valid", validateDirectRoute(fableRoute).ok);
check("RR27 Fable receipt attests observed Sol at identity effort", accepts(fableReceipt, fableRoute, DISPATCH_BINDING, FABLE_EVIDENCE));
check("RR28 Fable receipt rejects non-Sol effective model", rejects({ ...fableReceipt, effectiveModelId: "gpt-5.6-terra" }, fableRoute, DISPATCH_BINDING, FABLE_EVIDENCE));

const unknownRoute = Object.freeze({
  ...terraRoute,
  selector: { kind: "alias", value: "unknown-alias" },
});
const UNKNOWN_OBSERVED = Object.freeze({
  ...TERRA_OBSERVED,
  effectiveSelector: Object.freeze({ kind: "model-id", value: "invented-model" }),
  effectiveModelId: "invented-model",
});
const UNKNOWN_EVIDENCE = Object.freeze(trustedEvidenceFor("host", FIXTURE.hostDigest, UNKNOWN_OBSERVED));
const unknownReceipt = receiptFor(
  unknownRoute,
  REQUESTED_DUTY,
  REQUESTED_WORKTYPE,
  UNKNOWN_OBSERVED,
  UNKNOWN_EVIDENCE,
  {},
);
const unknownOutcome = outcomeOf(unknownReceipt, unknownRoute, DISPATCH_BINDING, UNKNOWN_EVIDENCE);
check("RR29 unknown alias returns an ordinary failed result without throwing", unknownOutcome.threw === false && unknownOutcome.result.ok === false);

const OBSERVED_MUTATIONS = [
  ["resultSha256", "result digest", "a".repeat(64)],
  ["effectiveDuty", "effective duty", "codex_goldfish"],
  ["effectiveWorktype", "effective worktype", "design_phase"],
  ["effectiveRunner", "effective runner", "claude"],
  ["effectiveSelector", "effective selector", { kind: "model-id", value: "gpt-5.6-alternate" }],
  ["effectiveProvider", "effective provider", "anthropic"],
  ["effectiveModelId", "effective model", "gpt-5.6-alternate"],
  ["effectiveEffort", "effective effort", "high"],
];
let rr = 30;
for (const [field, label, value] of OBSERVED_MUTATIONS) {
  check(`RR${rr} receipt ${label} drift from caller evidence fails closed`, rejects({ ...terraReceipt, [field]: value }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
  rr += 1;
  check(`RR${rr} caller evidence ${label} drift from receipt fails closed`, rejects(terraReceipt, terraRoute, DISPATCH_BINDING, { ...HOST_EVIDENCE, [field]: value }));
  rr += 1;
}

check("RR46 receipt requested duty drift from dispatch binding fails closed", rejects({ ...terraReceipt, requestedDuty: "codex_goldfish" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR47 caller dispatch requested duty drift from receipt fails closed", rejects(terraReceipt, terraRoute, { ...DISPATCH_BINDING, requestedDuty: "codex_goldfish" }, HOST_EVIDENCE));
check("RR48 receipt requested worktype drift from dispatch binding fails closed", rejects({ ...terraReceipt, requestedWorktype: "design_phase" }, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR49 caller dispatch requested worktype drift from receipt fails closed", rejects(terraReceipt, terraRoute, { ...DISPATCH_BINDING, requestedWorktype: "design_phase" }, HOST_EVIDENCE));

rr = 50;
for (const field of ["dispatchId", "queueRevision", "candidateCommit", "candidateTree", "requestedDuty", "requestedWorktype"]) {
  const { [field]: omitted, ...withoutField } = DISPATCH_BINDING;
  check(`RR${rr} missing caller dispatch binding field ${field} fails closed`, rejects(terraReceipt, terraRoute, withoutField, HOST_EVIDENCE));
  rr += 1;
}
check("RR56 extra caller dispatch binding field fails closed", rejects(terraReceipt, terraRoute, { ...DISPATCH_BINDING, unexpected: true }, HOST_EVIDENCE));

rr = 57;
const MALFORMED_DISPATCH_BINDINGS = [
  { ...DISPATCH_BINDING, dispatchId: "not a safe id" },
  { ...DISPATCH_BINDING, queueRevision: -1 },
  { ...DISPATCH_BINDING, candidateCommit: "bad" },
  { ...DISPATCH_BINDING, candidateTree: "bad" },
  { ...DISPATCH_BINDING, requestedDuty: "" },
  { ...DISPATCH_BINDING, requestedWorktype: 1 },
];
for (const binding of MALFORMED_DISPATCH_BINDINGS) {
  check(`RR${rr} malformed caller dispatch binding fails closed`, rejects(terraReceipt, terraRoute, binding, HOST_EVIDENCE));
  rr += 1;
}

for (const field of ["source", "sha256", "resultSha256", "effectiveDuty", "effectiveWorktype", "effectiveRunner", "effectiveSelector", "effectiveProvider", "effectiveModelId", "effectiveEffort"]) {
  const { [field]: omitted, ...withoutField } = HOST_EVIDENCE;
  check(`RR${rr} missing caller trusted evidence field ${field} fails closed`, rejects(terraReceipt, terraRoute, DISPATCH_BINDING, withoutField));
  rr += 1;
}
check("RR73 extra caller trusted evidence field fails closed", rejects(terraReceipt, terraRoute, DISPATCH_BINDING, { ...HOST_EVIDENCE, unexpected: true }));
check("RR74 malformed caller trusted evidence field fails closed", rejects(terraReceipt, terraRoute, DISPATCH_BINDING, { ...HOST_EVIDENCE, effectiveSelector: { kind: "alias" } }));

const ALTERNATE_TERRA_OBSERVED = Object.freeze({
  ...TERRA_OBSERVED,
  effectiveSelector: Object.freeze({ kind: "model-id", value: "gpt-5.6-alternate" }),
  effectiveModelId: "gpt-5.6-alternate",
});
const ALTERNATE_TERRA_EVIDENCE = Object.freeze(trustedEvidenceFor("host", FIXTURE.hostDigest, ALTERNATE_TERRA_OBSERVED));
const alternateTerraReceipt = receiptFor(
  terraRoute,
  REQUESTED_DUTY,
  REQUESTED_WORKTYPE,
  ALTERNATE_TERRA_OBSERVED,
  ALTERNATE_TERRA_EVIDENCE,
  {},
);
check("RR75 Terra accepts an alternate syntactically valid host-observed model when evidence agrees", accepts(alternateTerraReceipt, terraRoute, DISPATCH_BINDING, ALTERNATE_TERRA_EVIDENCE));
check("RR76 Terra receipt matching gpt-5.6-terra still fails when trusted evidence observes another model", rejects(terraReceipt, terraRoute, DISPATCH_BINDING, ALTERNATE_TERRA_EVIDENCE));

const FABLE_NON_SOL_OBSERVED = Object.freeze({
  ...FABLE_OBSERVED,
  effectiveSelector: Object.freeze({ kind: "model-id", value: "gpt-5.6-terra" }),
  effectiveModelId: "gpt-5.6-terra",
});
const FABLE_NON_SOL_EVIDENCE = Object.freeze(trustedEvidenceFor("cli", FIXTURE.hostDigest, FABLE_NON_SOL_OBSERVED));
const fableNonSolReceipt = receiptFor(
  fableRoute,
  REQUESTED_DUTY,
  REQUESTED_WORKTYPE,
  FABLE_NON_SOL_OBSERVED,
  FABLE_NON_SOL_EVIDENCE,
  {},
);
const FABLE_WRONG_EFFORT_OBSERVED = Object.freeze({
  ...FABLE_OBSERVED,
  effectiveEffort: "high",
});
const FABLE_WRONG_EFFORT_EVIDENCE = Object.freeze(trustedEvidenceFor("cli", FIXTURE.hostDigest, FABLE_WRONG_EFFORT_OBSERVED));
const fableWrongEffortReceipt = receiptFor(
  fableRoute,
  REQUESTED_DUTY,
  REQUESTED_WORKTYPE,
  FABLE_WRONG_EFFORT_OBSERVED,
  FABLE_WRONG_EFFORT_EVIDENCE,
  {},
);
check("RR77 Fable mutually agreeing non-Sol observed evidence fails closed", rejects(fableNonSolReceipt, fableRoute, DISPATCH_BINDING, FABLE_NON_SOL_EVIDENCE));
check("RR78 Fable mutually agreeing nonidentity effort fails closed", rejects(fableWrongEffortReceipt, fableRoute, DISPATCH_BINDING, FABLE_WRONG_EFFORT_EVIDENCE));

const JOINT_SEMANTIC_DRIFTS = [
  ["effectiveDuty", "duty", "codex_goldfish"],
  ["effectiveWorktype", "worktype", "design_phase"],
  ["effectiveRunner", "runner", "claude"],
  ["effectiveProvider", "provider", "anthropic"],
  ["effectiveEffort", "effort", "high"],
];
rr = 79;
for (const [field, label, value] of JOINT_SEMANTIC_DRIFTS) {
  const observed = { ...TERRA_OBSERVED, [field]: value };
  const evidence = trustedEvidenceFor("host", FIXTURE.hostDigest, observed);
  const receipt = receiptFor(
    terraRoute,
    REQUESTED_DUTY,
    REQUESTED_WORKTYPE,
    observed,
    evidence,
    {},
  );
  check(`RR${rr} mutually agreeing but semantically wrong effective ${label} fails closed`, rejects(receipt, terraRoute, DISPATCH_BINDING, evidence));
  rr += 1;
}

const directModelCandidate = [
  ...Object.values(routing.duties),
  ...Object.values(routing.worktypes).flatMap((profile) => Object.values(profile)),
].find((route) => route !== "off" && route.selector.kind === "model-id");
const directModelRoute = directModelCandidate ?? Object.freeze({
  ...terraRoute,
  selector: { kind: "model-id", value: "missing-direct-model-route" },
});
const DIRECT_MODEL_DUTY = "direct_model_regression";
const DIRECT_MODEL_BINDING = Object.freeze({
  ...DISPATCH_BINDING,
  requestedDuty: DIRECT_MODEL_DUTY,
});
const DIRECT_MODEL_OBSERVED = Object.freeze({
  ...TERRA_OBSERVED,
  effectiveDuty: DIRECT_MODEL_DUTY,
  effectiveRunner: directModelRoute.runner,
  effectiveSelector: Object.freeze({ kind: "model-id", value: directModelRoute.selector.value }),
  effectiveProvider: directModelRoute.runner === "claude" ? "anthropic" : "openai",
  effectiveModelId: directModelRoute.selector.value,
  effectiveEffort: directModelRoute.effort,
});
const DIRECT_MODEL_EVIDENCE = Object.freeze(trustedEvidenceFor("host", FIXTURE.hostDigest, DIRECT_MODEL_OBSERVED));
const directModelReceipt = receiptFor(
  directModelRoute,
  DIRECT_MODEL_DUTY,
  REQUESTED_WORKTYPE,
  DIRECT_MODEL_OBSERVED,
  DIRECT_MODEL_EVIDENCE,
  {},
);
check("RR84 direct model-id route accepts its exact effective model", directModelCandidate !== undefined && accepts(directModelReceipt, directModelRoute, DIRECT_MODEL_BINDING, DIRECT_MODEL_EVIDENCE));

const differentDirectModelId = directModelRoute.selector.value === "gpt-5.6-alternate"
  ? "gpt-5.6-different"
  : "gpt-5.6-alternate";
const DIFFERENT_DIRECT_MODEL_OBSERVED = Object.freeze({
  ...DIRECT_MODEL_OBSERVED,
  effectiveSelector: Object.freeze({ kind: "model-id", value: differentDirectModelId }),
  effectiveModelId: differentDirectModelId,
});
const DIFFERENT_DIRECT_MODEL_EVIDENCE = Object.freeze(trustedEvidenceFor("host", FIXTURE.hostDigest, DIFFERENT_DIRECT_MODEL_OBSERVED));
const differentDirectModelReceipt = receiptFor(
  directModelRoute,
  DIRECT_MODEL_DUTY,
  REQUESTED_WORKTYPE,
  DIFFERENT_DIRECT_MODEL_OBSERVED,
  DIFFERENT_DIRECT_MODEL_EVIDENCE,
  {},
);
check("RR85 direct model-id route rejects a different mutually attested effective model", directModelCandidate !== undefined && rejects(differentDirectModelReceipt, directModelRoute, DIRECT_MODEL_BINDING, DIFFERENT_DIRECT_MODEL_EVIDENCE));

const INVALID_EFFECTIVE_MODEL_IDENTITIES = [
  ["whitespace", { effectiveSelector: { kind: "model-id", value: " gpt-5.6-terra" }, effectiveModelId: " gpt-5.6-terra" }],
  ["invalid characters", { effectiveSelector: { kind: "model-id", value: "gpt-5.6?terra" }, effectiveModelId: "gpt-5.6?terra" }],
  ["overlength", { effectiveSelector: { kind: "model-id", value: "m".repeat(129) }, effectiveModelId: "m".repeat(129) }],
  ["selector kind alias", { effectiveSelector: { kind: "alias", value: "gpt-5.6-terra" }, effectiveModelId: "gpt-5.6-terra" }],
  ["selector/model disagreement", { effectiveSelector: { kind: "model-id", value: "gpt-5.6-alternate" }, effectiveModelId: "gpt-5.6-terra" }],
];
rr = 86;
for (const [label, overrides] of INVALID_EFFECTIVE_MODEL_IDENTITIES) {
  const observed = { ...TERRA_OBSERVED, ...overrides };
  const evidence = trustedEvidenceFor("host", FIXTURE.hostDigest, observed);
  const receipt = receiptFor(
    terraRoute,
    REQUESTED_DUTY,
    REQUESTED_WORKTYPE,
    observed,
    evidence,
    {},
  );
  check(`RR${rr} mutually agreeing trusted effective model ${label} fails closed`, rejects(receipt, terraRoute, DISPATCH_BINDING, evidence));
  rr += 1;
}

let projectedFable;
try {
  projectedFable = projectRunnerAssignment("codex", {
    model: fableRoute.selector.value,
    effort: fableRoute.effort,
  });
} catch {
  projectedFable = null;
}
check("RR91 Codex Fable quality alias projects to Sol at the same valid effort", projectedFable?.model === "gpt-5.6-sol" && projectedFable?.effort === fableRoute.effort);
check("RR92 Codex Fable quality alias rejects a mutually attested non-Sol model", rejects(fableNonSolReceipt, fableRoute, DISPATCH_BINDING, FABLE_NON_SOL_EVIDENCE));

const fableUnsupportedEffortRoute = Object.freeze({
  ...fableRoute,
  effort: "not-applicable",
});
const FABLE_UNSUPPORTED_EFFORT_OBSERVED = Object.freeze({
  ...FABLE_OBSERVED,
  effectiveEffort: "not-applicable",
});
const FABLE_UNSUPPORTED_EFFORT_EVIDENCE = Object.freeze(trustedEvidenceFor("cli", FIXTURE.hostDigest, FABLE_UNSUPPORTED_EFFORT_OBSERVED));
const fableUnsupportedEffortReceipt = receiptFor(
  fableUnsupportedEffortRoute,
  REQUESTED_DUTY,
  REQUESTED_WORKTYPE,
  FABLE_UNSUPPORTED_EFFORT_OBSERVED,
  FABLE_UNSUPPORTED_EFFORT_EVIDENCE,
  {},
);
check("RR93 Codex Fable quality alias rejects an unsupported effort even when attested", validateDirectRoute(fableUnsupportedEffortRoute).ok && rejects(fableUnsupportedEffortReceipt, fableUnsupportedEffortRoute, DISPATCH_BINDING, FABLE_UNSUPPORTED_EFFORT_EVIDENCE));

const ALTERNATE_TERRA_CLI_EVIDENCE = Object.freeze(trustedEvidenceFor("cli", FIXTURE.hostDigest, ALTERNATE_TERRA_OBSERVED));
const alternateTerraCliReceipt = receiptFor(
  terraRoute,
  REQUESTED_DUTY,
  REQUESTED_WORKTYPE,
  ALTERNATE_TERRA_OBSERVED,
  ALTERNATE_TERRA_CLI_EVIDENCE,
  {},
);
check("RR94 Terra accepts an alternate concrete model ID with matching host attestation", accepts(alternateTerraReceipt, terraRoute, DISPATCH_BINDING, ALTERNATE_TERRA_EVIDENCE));
check("RR95 Terra still rejects matching CLI attestation for an alternate concrete model ID", rejects(alternateTerraCliReceipt, terraRoute, DISPATCH_BINDING, ALTERNATE_TERRA_CLI_EVIDENCE));

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
