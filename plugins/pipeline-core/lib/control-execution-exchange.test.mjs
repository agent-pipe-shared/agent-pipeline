// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createControlExecutionExchange, validateControlExecutionExchange, canonicalJson } from "./control-execution-exchange.mjs";

const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), D = "d".repeat(64), E = "e".repeat(64), O = "1".repeat(40);
const dispatch = { featureId:"feature-1", queueRevision:2, packageId:"pkg-1", actionId:"act-1", dispatchId:"dispatch-1", attemptId:"attempt-1", authorityDigests:{prdSha256:A,specSha256:B,resultSha256:C}, routeRequestSha256:D, mayDelegate:false };
const continuityState = { schema:"pipeline.continuity.v0", featureId:"feature-1", revision:2, runtime:{humanFacingLanguage:"en",activeDuty:"Coordinator",sessionCleanup:null}, authority:{prd:{path:"prd.md",sha256:A},spec:{path:"spec.md",sha256:B},result:{path:"result.md",sha256:C}}, queueHead:{packageId:"pkg-1",actionId:"act-1",nextAction:"poll",productRetryCount:0,environmentRerouteCount:0,dispatch}, blocker:null, acknowledgedFinal:null, resume:{mode:"immediate",sourceRevision:2,reasonCode:"active-turn"}, recovery:null, decisionTxn:null, closeTransition:null, capacity:{concurrencyLimit:2,reservedCriticSlots:1,reservedRecoverySlots:1,fallbackPolicy:"defer"} };
const base = { continuityState, gitBinding:{baseCommit:O,candidateCommit:O,candidateTree:O}, orchestrationAssignment:{parentOrchestrationId:"parent-1",workerId:"worker-1",correlationId:"corr-1"}, invalidation:{state:"valid",reasonCode:null,supersededByQueueRevision:null}, event:{class:"admission",status:"admitted",observedAt:"2026-07-23T00:00:00Z",evidenceSha256:A}, extensions:{} };
const exchange = createControlExecutionExchange(base);
const expectedAuthority = (digests, route) => createHash("sha256").update(`pipeline.control-execution-authority.v1\0${canonicalJson({authorityDigests:digests,routeRequestSha256:route})}`).digest("hex");
assert.equal(exchange.package.authoritySha256, expectedAuthority(dispatch.authorityDigests, dispatch.routeRequestSha256));
assert.equal(validateControlExecutionExchange(exchange).ok, true);
assert.equal(Object.isFrozen(exchange), true);
assert.equal(Object.isFrozen(exchange.package), true);
assert.equal(Object.isFrozen(exchange.orchestration), true); assert.equal(Object.isFrozen(exchange.event), true); assert.equal(Object.isFrozen(exchange.extensions), true);
assert.throws(() => createControlExecutionExchange({...base, continuityState:{...continuityState, queueHead:{...continuityState.queueHead,dispatch:{...dispatch,packageId:"wrong"}}}}));
assert.equal(validateControlExecutionExchange({...exchange,event:{...exchange.event,status:"succeeded"}}).ok, false);
assert.equal(validateControlExecutionExchange({...exchange,extensions:{"vendor.bad":{}}}).ok, false);
assert.throws(() => createControlExecutionExchange({...base, extensions:null}));
for (const field of ["packageId","actionId","queueRevision","featureId","routeRequestSha256","mayDelegate"]) {
  const bad = structuredClone(continuityState); if (field === "featureId") bad.featureId = "other"; else if (field === "queueRevision") bad.revision = 9; else if (field === "mayDelegate") bad.queueHead.dispatch.mayDelegate = true; else if (field === "routeRequestSha256") bad.queueHead.dispatch.routeRequestSha256 = "bad"; else bad.queueHead.dispatch[field] = "mismatch";
  assert.throws(() => createControlExecutionExchange({...base, continuityState:bad}));
}
for (const field of ["prdSha256","specSha256","resultSha256"]) { const bad=structuredClone(continuityState); const key = field === "prdSha256" ? "prd" : field === "specSha256" ? "spec" : "result"; bad.authority[key].sha256 = E; assert.throws(() => createControlExecutionExchange({...base,continuityState:bad})); }
const nullResult = structuredClone(continuityState); nullResult.authority.result = null; nullResult.queueHead.dispatch.authorityDigests.resultSha256 = null; assert.doesNotThrow(() => createControlExecutionExchange({...base,continuityState:nullResult}));
const mismatchNull = structuredClone(continuityState); mismatchNull.queueHead.dispatch.authorityDigests.resultSha256 = null; assert.throws(() => createControlExecutionExchange({...base,continuityState:mismatchNull}));
for (const [klass, statuses] of Object.entries({admission:["admitted","rejected","unknown","unavailable"],progress:["running","blocked","unknown","unavailable"],terminal:["succeeded","failed","cancelled","unknown","unavailable"],cancellation:["requested","acknowledged","rejected","unknown","unavailable"],verification:["passed","failed","unknown","unavailable"],"review-handoff":["ready","rejected","unknown","unavailable"]})) for (const status of statuses) assert.equal(validateControlExecutionExchange({...exchange,event:{...exchange.event,class:klass,status}}).ok,true);
assert.equal(validateControlExecutionExchange({...exchange,event:{...exchange.event,class:"admission",status:"succeeded"}}).ok,false);
for (const reason of ["queue-advanced","authority-drift","base-drift","candidate-superseded","cancelled"]) { const inv={state:"invalidated",reasonCode:reason,supersededByQueueRevision:null}; assert.equal(validateControlExecutionExchange({...exchange,package:{...exchange.package,invalidation:inv}}).ok,true); }
assert.equal(validateControlExecutionExchange({...exchange,package:{...exchange.package,invalidation:{state:"invalidated",reasonCode:"queue-advanced",supersededByQueueRevision:3}}}).ok,true);
for (const n of [2,1]) assert.equal(validateControlExecutionExchange({...exchange,package:{...exchange.package,invalidation:{state:"invalidated",reasonCode:"queue-advanced",supersededByQueueRevision:n}}}).ok,false);
for (const reason of ["authority-drift","base-drift","candidate-superseded","cancelled"]) assert.equal(validateControlExecutionExchange({...exchange,package:{...exchange.package,invalidation:{state:"invalidated",reasonCode:reason,supersededByQueueRevision:3}}}).ok,false);
assert.equal(validateControlExecutionExchange({...exchange,package:{...exchange.package,invalidation:{state:"valid",reasonCode:"cancelled",supersededByQueueRevision:null}}}).ok,false);
assert.equal(validateControlExecutionExchange({...exchange,package:{...exchange.package,invalidation:{state:"invalidated",reasonCode:"authority-drift",supersededByQueueRevision:99}}}).ok,false);
for (const bad of [undefined,()=>{},NaN,10n]) assert.throws(() => createControlExecutionExchange({...base,extensions:{"pipeline.isolation":bad}}));
const cyc={};cyc.self=cyc;assert.throws(()=>createControlExecutionExchange({...base,extensions:{"pipeline.isolation":cyc}}));
assert.throws(()=>createControlExecutionExchange({...base,extensions:{"pipeline.isolation":{"__proto__":{}}}}));
assert.throws(()=>createControlExecutionExchange({...base,foo:1})); assert.equal(validateControlExecutionExchange({...exchange,foo:1}).ok,false);
for (const key of ["packageId","actionId","queueRevision","featureId"]) { const bad=structuredClone(continuityState); if(key==="featureId") bad.queueHead.dispatch.featureId="other"; else if(key==="queueRevision") bad.queueHead.dispatch.queueRevision=3; else bad.queueHead.dispatch[key]="other"; assert.throws(()=>createControlExecutionExchange({...base,continuityState:bad})); }
assert.equal(canonicalJson({b:1,a:[2,null]}), '{"a":[2,null],"b":1}');
const nullState = structuredClone(continuityState); nullState.authority.result=null; nullState.queueHead.dispatch.authorityDigests.resultSha256=null;
const nullExchange = createControlExecutionExchange({...base,continuityState:nullState});
assert.equal(nullExchange.package.authoritySha256, expectedAuthority(nullState.queueHead.dispatch.authorityDigests, nullState.queueHead.dispatch.routeRequestSha256));
const registry = JSON.parse(readFileSync(fileURLToPath(new URL("../config/control-execution-extension-namespaces.json", import.meta.url)), "utf8"));
assert.deepEqual(registry, {schema:"pipeline.control-execution-extension-namespaces.v1",namespaces:["pipeline.credentials","pipeline.event-projection","pipeline.isolation","pipeline.messaging","pipeline.remote-execution","pipeline.result-import"]});
for (const key of ["continuityState","gitBinding","orchestrationAssignment","invalidation","event","extensions"]) { const missing={...base}; delete missing[key]; assert.throws(()=>createControlExecutionExchange(missing)); }
for (const name of ["phoenix", "nova"]) {
  const fixture = JSON.parse(readFileSync(fileURLToPath(new URL(`../scripts/fixtures/control-execution-exchange-${name}.json`, import.meta.url)), "utf8"));
  assert.equal(validateControlExecutionExchange(fixture).ok, true);
  assert.deepEqual(Object.keys(fixture).sort(), ["event","extensions","orchestration","package","schema"]);
  assert.deepEqual(Object.keys(fixture.package).sort(), ["authoritySha256","baseCommit","candidateCommit","candidateTree","featureId","invalidation","packageId","queueRevision"]);
  assert.deepEqual(Object.keys(fixture.orchestration).sort(), ["attemptId","correlationId","dispatchId","mayDelegate","parentOrchestrationId","workerId"]);
  assert.deepEqual(Object.keys(fixture.event).sort(), ["class","evidenceSha256","observedAt","status"]);
}
console.log("control-execution-exchange: ok");
