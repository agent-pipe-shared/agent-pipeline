#!/usr/bin/env node
import { validateRouteReceipt } from "./route-receipt.mjs";
import { projectDirectRoutingDefaults, validateDirectRoute } from "./routing-projection.mjs";

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
const DISPATCH_BINDING = Object.freeze({
  dispatchId: FIXTURE.dispatchId,
  queueRevision: FIXTURE.queueRevision,
  candidateCommit: FIXTURE.candidateCommit,
  candidateTree: FIXTURE.candidateTree,
});
const HOST_EVIDENCE = Object.freeze({ source: "host", sha256: FIXTURE.hostDigest });
const CLI_EVIDENCE = Object.freeze({ source: "cli", sha256: FIXTURE.hostDigest });

const routing = projectDirectRoutingDefaults();
const terraRoute = routing.duties.codex_implementation;
const fableRoute = Object.freeze({
  ...terraRoute,
  selector: { kind: "alias", value: "fable" },
});

function receiptFor(route, effectiveModelId, evidence, overrides) {
  return {
    schema: "pipeline.route-receipt.v1",
    dispatchId: FIXTURE.dispatchId,
    queueRevision: FIXTURE.queueRevision,
    candidateCommit: FIXTURE.candidateCommit,
    candidateTree: FIXTURE.candidateTree,
    resultSha256: FIXTURE.hostDigest,
    requestedRunner: route.runner,
    requestedProvider: "openai",
    requestedSelector: { ...route.selector },
    requestedEffort: route.effort,
    effectiveProvider: "openai",
    effectiveModelId,
    effectiveEffort: route.effort,
    resolutionEvidence: { ...evidence },
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

const terraReceipt = receiptFor(terraRoute, "gpt-5.6-terra", HOST_EVIDENCE, {});
check("RR01 Terra/xhigh route itself is valid", validateDirectRoute(terraRoute).ok);
check("RR02 Terra attestation requires the exact caller-held dispatch binding", accepts(terraReceipt, terraRoute, DISPATCH_BINDING, HOST_EVIDENCE));
check("RR03 Terra keeps requested alias separate from observed effective model", terraReceipt.requestedSelector.value === "terra" && terraReceipt.effectiveModelId === "gpt-5.6-terra");

for (const field of ["schema", "dispatchId", "queueRevision", "candidateCommit", "candidateTree", "resultSha256", "requestedRunner", "requestedProvider", "requestedSelector", "requestedEffort", "effectiveProvider", "effectiveModelId", "effectiveEffort", "resolutionEvidence", "attestationAvailable", "effectiveRouteStatus"]) {
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

const fableReceipt = receiptFor(fableRoute, "gpt-5.6-sol", CLI_EVIDENCE, {});
check("RR26 Fable alias route itself is valid", validateDirectRoute(fableRoute).ok);
check("RR27 Fable receipt attests observed Sol at identity effort", accepts(fableReceipt, fableRoute, DISPATCH_BINDING, CLI_EVIDENCE));
check("RR28 Fable receipt rejects non-Sol effective model", rejects({ ...fableReceipt, effectiveModelId: "gpt-5.6-terra" }, fableRoute, DISPATCH_BINDING, CLI_EVIDENCE));

const unknownRoute = Object.freeze({
  ...terraRoute,
  selector: { kind: "alias", value: "unknown-alias" },
});
const unknownReceipt = receiptFor(unknownRoute, "invented-model", HOST_EVIDENCE, {});
const unknownOutcome = outcomeOf(unknownReceipt, unknownRoute, DISPATCH_BINDING, HOST_EVIDENCE);
check("RR29 unknown alias returns an ordinary failed result without throwing", unknownOutcome.threw === false && unknownOutcome.result.ok === false);

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
