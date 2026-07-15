#!/usr/bin/env node
import { projectDirectRoutingDefaults } from "./routing-projection.mjs";
import { validateRouteReceipt } from "./route-receipt.mjs";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}

const SHA = "a".repeat(64);
const route = projectDirectRoutingDefaults().duties.codex_implementation;
const unresolved = {
  schema: "pipeline.route-receipt.v1",
  dispatchId: "dispatch-01",
  queueRevision: 4,
  resultSha256: SHA,
  requestedRunner: "codex",
  requestedSelector: { kind: "alias", value: "terra" },
  requestedEffort: "xhigh",
  resolvedModelId: null,
  resolutionEvidence: null,
  attestationAvailable: false,
  effectiveRouteStatus: "unresolved-alias",
};

check("RR01 unresolved Terra alias is honest and schema-valid", validateRouteReceipt(unresolved, route).ok);
check("RR02 requested selector drift is refused", !validateRouteReceipt({ ...unresolved, requestedSelector: { kind: "alias", value: "other" } }, route).ok);
check("RR03 self-reported evidence cannot attest", !validateRouteReceipt({ ...unresolved, resolvedModelId: "terra-actual", resolutionEvidence: { source: "agent", sha256: SHA }, attestationAvailable: true, effectiveRouteStatus: "attested" }, route).ok);
check("RR04 host evidence can attest a resolved effective model", validateRouteReceipt({ ...unresolved, resolvedModelId: "terra-actual", resolutionEvidence: { source: "host", sha256: SHA }, attestationAvailable: true, effectiveRouteStatus: "attested" }, route).ok);
check("RR05 unresolved status cannot carry a model id", !validateRouteReceipt({ ...unresolved, resolvedModelId: "terra-actual" }, route).ok);
check("RR06 unavailable remains non-attested", validateRouteReceipt({ ...unresolved, effectiveRouteStatus: "unavailable" }, route).ok);
check("RR07 non-SHA result binding is refused", !validateRouteReceipt({ ...unresolved, resultSha256: "bad" }, route).ok);

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
