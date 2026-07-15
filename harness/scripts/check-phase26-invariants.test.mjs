#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FAMILY_CONTRACT,
  checkPhase26Invariants,
  renderSdlcMermaid,
  resultArg,
  sha256Canonical,
} from "./check-phase26-invariants.mjs";
import { validateAgainstSchema } from "../../plugins/pipeline-core/lib/schema-lite.mjs";

const SHA = (char) => char.repeat(64);
const HISTORIC_COMMIT = "0".repeat(40);
const roots = [];
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function externalRef(id, char = "e") {
  return { collection: "externalEvidence", id, sha256: SHA(char) };
}

function event(eventId, sequence, eventType, outcome = "succeeded", overrides = {}) {
  return {
    eventId, sequence, eventType, outcome,
    packageId: "P2.6-P5", actionId: `action-${sequence}`, originChainId: "origin-main",
    boundedFamily: null, decisionBriefId: null,
    sourceRefs: [externalRef(`evidence-${sequence}`)],
    ...overrides,
  };
}

function edge(edgeId, fromEventId, toEventId, kind = "event", boundedFamily = null, loopStableId = null, sourceRefs = [externalRef(`source-${edgeId}`)]) {
  return { edgeId, fromEventId, toEventId, kind, boundedFamily, loopStableId, sourceRefs };
}

function loop(stableId, family, exitReason) {
  return {
    stableId, family, packageId: "P2.6-P5", actionId: `action-${stableId}`, originChainId: "origin-main",
    triggerEvidence: [{ id: `trigger-${stableId}`, sha256: SHA("a") }],
    attemptResultDigests: [{ attemptId: `attempt-${stableId}`, resultSha256: SHA("b") }],
    normalizedFailureSignature: SHA("c"), similarityGroupId: "similar-review-output",
    observedCount: 1, configuredLimit: family === "product-retry" ? 1 : 2,
    outcome: "succeeded", exitReason, decisionBriefId: null,
  };
}

function measurement(samplesMs, limitMs) {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  return {
    sampleCount: samplesMs.length,
    samplesMs,
    p95Ms: sorted[Math.ceil(samplesMs.length * 0.95) - 1],
    limitMs,
  };
}

function fixture() {
  const packageResult = {
    id: "package-p5-fixture",
    status: "implementation-pass; pushed-and-fetchback-verified",
    sharedCommit: "1".repeat(40),
    fullVerify: { exitCode: 0, boundCommit: "1".repeat(40) },
    publicGate: { pushedOid: "1".repeat(40), fetchBackOid: "1".repeat(40), privacyFindings: 0 },
    loopEconomy: {
      criticCorrection: 1, deltaRegate: 1, productRetry: 1,
      environmentFailover: 0, courseStop: 0, packagePushFetchBack: 1,
    },
  };
  const packageRef = {
    collection: "packageResults",
    id: packageResult.id,
    sha256: sha256Canonical(packageResult),
  };
  const events = [
    event("event-00", 0, "start"),
    event("event-01", 1, "work"),
    event("event-02", 2, "critic", "succeeded", { boundedFamily: "initial-full-critic", sourceRefs: [packageRef] }),
    event("event-03", 3, "correction"),
    event("event-04", 4, "verify"),
    event("event-05", 5, "retry"),
    event("event-06", 6, "push-fetch-back", "succeeded", { boundedFamily: "package-push-fetch-back", sourceRefs: [packageRef] }),
    event("event-07", 7, "handoff"),
  ];
  const edges = [
    edge("edge-00", "event-00", "event-01"),
    edge("edge-01", "event-01", "event-02"),
    edge("edge-02", "event-02", "event-01", "back-edge", "critic-correction", "loop-critic", [packageRef, { collection: "externalEvidence", id: "trigger-loop-critic", sha256: SHA("a") }]),
    edge("edge-03", "event-02", "event-03"),
    edge("edge-04", "event-03", "event-02", "back-edge", "delta-regate", "loop-regate", [packageRef, { collection: "externalEvidence", id: "trigger-loop-regate", sha256: SHA("a") }]),
    edge("edge-05", "event-03", "event-04"),
    edge("edge-06", "event-04", "event-01", "back-edge", "product-retry", "loop-product", [packageRef, { collection: "externalEvidence", id: "trigger-loop-product", sha256: SHA("a") }]),
    edge("edge-07", "event-04", "event-05"),
    edge("edge-08", "event-05", "event-06"),
    edge("edge-09", "event-06", "event-07"),
  ];
  const counts = new Map([
    ["initial-full-critic", 1], ["critic-correction", 1], ["delta-regate", 1],
    ["product-retry", 1], ["environment-failover", 0], ["scope-course-stop", 0],
    ["package-push-fetch-back", 1],
  ]);
  const graph = {
    schemaVersion: "pipeline.sdlc-run-graph.v1",
    featureId: "phase2.6-fixture",
    graphCutoffEventId: "event-07",
    sourceEventSetSha256: "",
    completionClaim: "candidate-handoff",
    events,
    edges,
    boundedFamilies: FAMILY_CONTRACT.map(([family, kind]) => ({
      family, kind, count: counts.get(family), disposition: counts.get(family) === 0 ? "not-triggered" : "executed",
    })),
    loopRecords: [
      loop("loop-critic", "critic-correction", "corrected"),
      loop("loop-product", "product-retry", "retry-pass"),
      loop("loop-regate", "delta-regate", "regate-pass"),
    ],
  };
  const result = {
    packageResults: [packageResult],
    finalIntegrations: [], decisionBriefs: [], courseDecisionIntents: [], courseDecisionReceipts: [],
    externalEvidence: [],
    sdlcRunGraph: graph,
    sdlcRunGraphProjection: null,
    phase26InvariantEvidence: {
      schema: "pipeline.phase26-invariant-evidence.v1", packageId: "P2.6-P5",
      earlySmoke: {
        status: "pass", namedCapabilityId: "continuity-host-transport", elapsedFromImplementationStartMs: 1_800_000,
        cumulativeLiveMs: 600_000, plannedPathCount: 10, changedPathCountBeforeSmoke: 1,
        evidenceId: "smoke-evidence", evidenceSha256: SHA("d"),
      },
      scope: {
        plannedPathCount: 10, actualPathCount: 11,
        plannedAcceptanceCriteriaCount: 10, actualAcceptanceCriteriaCount: 11,
        newTrustBoundaries: [], deltaDisposition: "not-required", decisionBriefId: null,
      },
      performance: {
        method: "repeated-monotonic-wall-clock-ms.v1",
        targetedVerify: measurement([900, 1000, 1100, 1200, 1300], 2_000),
        fullVerify: measurement([10_000, 11_000, 12_000, 13_000, 14_000], 30_000),
        ledgerWriter: measurement([10, 15, 20, 25, 30], 50),
      },
      executionRouting: {
        status: "unattested-nonconformance", requestedDuty: "codex_implementation",
        requiredSelector: "terra", requiredEffort: "xhigh",
        routeReceiptEvidenceId: null, routeReceiptEvidenceSha256: null,
        phase3Disposition: "mandatory-dispatch-attestation",
      },
      legacyLedgerExemptions: [],
    },
  };
  rebuildExternalEvidence(result);
  seal(result);
  return result;
}

function rebuildExternalEvidence(result) {
  const evidence = new Map();
  const add = (entry) => {
    if (entry?.collection === "externalEvidence") evidence.set(entry.id, entry.sha256);
  };
  for (const holder of [...result.sdlcRunGraph.events, ...result.sdlcRunGraph.edges]) holder.sourceRefs.forEach(add);
  result.sdlcRunGraph.loopRecords.flatMap((entry) => entry.triggerEvidence).forEach((entry) => evidence.set(entry.id, entry.sha256));
  const smoke = result.phase26InvariantEvidence.earlySmoke;
  evidence.set(smoke.evidenceId, smoke.evidenceSha256);
  const route = result.phase26InvariantEvidence.executionRouting;
  if (route.routeReceiptEvidenceId !== null) evidence.set(route.routeReceiptEvidenceId, route.routeReceiptEvidenceSha256);
  result.externalEvidence = [...evidence].sort(([left], [right]) => left.localeCompare(right)).map(([id, sha256]) => ({ id, sha256 }));
}

function seal(result) {
  const graph = result.sdlcRunGraph;
  graph.sourceEventSetSha256 = sha256Canonical({
    events: graph.events.map(({ eventId, sequence, sourceRefs }) => ({ eventId, sequence, sourceRefs })),
    edges: graph.edges.map(({ edgeId, sourceRefs }) => ({ edgeId, sourceRefs })),
  });
  const mermaid = renderSdlcMermaid(graph);
  result.sdlcRunGraphProjection = {
    generatorVersion: "pipeline-sdlc-mermaid.v1",
    graphSha256: sha256Canonical(graph),
    mermaidSha256: createHash("sha256").update(mermaid).digest("hex"),
  };
  return mermaid;
}

function refreshPackageRefs(result) {
  for (const packageResult of result.packageResults) {
    const nextDigest = sha256Canonical(packageResult);
    for (const holder of [...result.sdlcRunGraph.events, ...result.sdlcRunGraph.edges]) {
      for (const ref of holder.sourceRefs) {
        if (ref.collection === "packageResults" && ref.id === packageResult.id) ref.sha256 = nextDigest;
      }
    }
  }
}

function bindDecisionBrief(result, loopRecord, outcome, exitReason) {
  const brief = { briefId: `brief-${exitReason}`, dispositionEvidenceSha256: SHA("9") };
  result.decisionBriefs.push(brief);
  loopRecord.outcome = outcome;
  loopRecord.exitReason = exitReason;
  loopRecord.decisionBriefId = brief.briefId;
  const edgeRecord = result.sdlcRunGraph.edges.find((candidate) => candidate.loopStableId === loopRecord.stableId);
  edgeRecord.sourceRefs.push({ collection: "decisionBriefs", id: brief.briefId, sha256: sha256Canonical(brief) });
}

function writeFixture(result, mermaid = seal(result)) {
  const root = mkdtempSync(join(tmpdir(), "phase26-invariants-"));
  roots.push(root);
  const path = join(root, "Result.md");
  const legacyIds = new Set(result.phase26InvariantEvidence.legacyLedgerExemptions.map((entry) => entry.packageId));
  const historicDocument = `# Historic Result\n\n\`\`\`pipeline-result\n${JSON.stringify({
    packageResults: result.packageResults.filter((entry) => legacyIds.has(entry.id)),
  }, null, 2)}\n\`\`\`\n`;
  const document = `# Result\n\n\`\`\`pipeline-result\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\n\`\`\`mermaid\n${mermaid}\`\`\`\n`;
  writeFileSync(path, historicDocument);
  for (const args of [["init", "-q"], ["config", "user.name", "fixture"], ["config", "user.email", "fixture@example.invalid"], ["add", "Result.md"], ["commit", "-qm", "historic pre-p5 result"]]) {
    const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (run.status !== 0) throw new Error(run.stderr || `git ${args.join(" ")} failed`);
  }
  const historicCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  writeFileSync(path, `${historicDocument}\n<!-- authenticated pre-p5 checkpoint -->\n`);
  for (const args of [["add", "Result.md"], ["commit", "-qm", "pre-p5 checkpoint"]]) {
    const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (run.status !== 0) throw new Error(run.stderr || `git ${args.join(" ")} failed`);
  }
  writeFileSync(path, document.replaceAll(HISTORIC_COMMIT, historicCommit));
  return root;
}

function checked(result, mermaid) {
  const root = writeFixture(result, mermaid ?? seal(result));
  return checkPhase26Invariants(root, "Result.md");
}

test("no argument is an explicit generic-repository skip", () => {
  assert.equal(resultArg([]), null);
  assert.equal(resultArg(["--result", "Result.md"]), "Result.md");
});

test("canonical graph, all family dispositions, loop inventory, evidence and Mermaid pass", () => {
  const result = fixture();
  const outcome = checked(result);
  assert.deepEqual(outcome, { ok: true, findings: [] });
});

test("published schema accepts the complete Result envelope that the checker reconciles", () => {
  const schema = JSON.parse(readFileSync(new URL("./sdlc-run-graph.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, true);
  assert.equal(validateAgainstSchema(fixture(), schema).valid, true);
  const malformed = fixture();
  malformed.externalEvidence = "not-an-array";
  assert.equal(validateAgainstSchema(malformed, schema).valid, false);
});

test("renderer is deterministic and exposes similarity grouping and configured loop counts", () => {
  const result = fixture();
  const first = renderSdlcMermaid(result.sdlcRunGraph);
  assert.equal(first, renderSdlcMermaid(structuredClone(result.sdlcRunGraph)));
  assert.match(first, /similar-review-output/);
  assert.match(first, /loop:product-retry:1\/1/);
  assert.match(first, /environment-failover:0:not-triggered/);
});

test("identical failure signatures cannot be split into different similarity groups", () => {
  const result = fixture();
  result.sdlcRunGraph.loopRecords[1].similarityGroupId = "hidden-similar-output";
  const outcome = checked(result);
  assert(outcome.findings.some((finding) => finding.includes("splits an identical failure signature")));
});

test("zero/one reroute and course-gate families reconcile as typed records", () => {
  const result = fixture();
  const brief = { briefId: "brief-course-stop", dispositionEvidenceSha256: SHA("8") };
  result.decisionBriefs.push(brief);
  result.packageResults[0].loopEconomy.environmentFailover = 1;
  result.packageResults[0].loopEconomy.courseStop = 1;
  result.sdlcRunGraph.events.push(
    event("event-08", 8, "failover"),
    event("event-09", 9, "gate", "stopped", {
      boundedFamily: "scope-course-stop", decisionBriefId: brief.briefId,
      sourceRefs: [{ collection: "decisionBriefs", id: brief.briefId, sha256: sha256Canonical(brief) }],
    }),
  );
  result.sdlcRunGraph.edges.push(
    edge("edge-10", "event-07", "event-08", "reroute", "environment-failover", null, [
      { collection: "packageResults", id: result.packageResults[0].id, sha256: "" }, externalRef("reroute-evidence"),
    ]),
    edge("edge-11", "event-08", "event-09", "gate"),
  );
  result.sdlcRunGraph.graphCutoffEventId = "event-09";
  for (const family of result.sdlcRunGraph.boundedFamilies) {
    if (["environment-failover", "scope-course-stop"].includes(family.family)) {
      family.count = 1;
      family.disposition = "executed";
    }
  }
  refreshPackageRefs(result);
  rebuildExternalEvidence(result);
  const outcome = checked(result);
  assert.deepEqual(outcome, { ok: true, findings: [] });
});

test("configured-limit and every closed loop exit disposition remain visible and valid", () => {
  const atLimit = fixture();
  atLimit.sdlcRunGraph.loopRecords[0].attemptResultDigests.push({ attemptId: "attempt-loop-critic-2", resultSha256: SHA("7") });
  atLimit.sdlcRunGraph.loopRecords[0].observedCount = 2;
  assert.equal(checked(atLimit).ok, true);

  for (const [exitReason, outcomeName, loopIndex] of [
    ["retry-failed", "failed", 1],
    ["budget-exhausted", "stopped", 0],
    ["po-stop", "stopped", 0],
    ["po-defer", "deferred", 0],
  ]) {
    const result = fixture();
    bindDecisionBrief(result, result.sdlcRunGraph.loopRecords[loopIndex], outcomeName, exitReason);
    assert.equal(checked(result).ok, true, `${exitReason} should be accepted with its bound brief`);
  }
});

test("back-edge without one matching loop record fails bijection", () => {
  const result = fixture();
  result.sdlcRunGraph.loopRecords.splice(1, 1);
  const outcome = checked(result);
  assert.equal(outcome.ok, false);
  assert(outcome.findings.some((finding) => finding.includes("not bijective")));
});

test("family count and zero-count disposition cannot hide an executed edge", () => {
  const result = fixture();
  const family = result.sdlcRunGraph.boundedFamilies.find((entry) => entry.family === "product-retry");
  family.count = 0;
  family.disposition = "not-triggered";
  const outcome = checked(result);
  assert(outcome.findings.some((finding) => finding.includes("typed graph records")));
  assert(outcome.findings.some((finding) => finding.includes("loopEconomy")));
});

test("legacy package records without a loop ledger do not acquire invented zeroes", () => {
  const result = fixture();
  const legacy = { id: "legacy-record", status: "historic" };
  result.packageResults.push(legacy);
  result.phase26InvariantEvidence.legacyLedgerExemptions.push({
    packageId: legacy.id, packageSha256: sha256Canonical(legacy), historicResultCommit: HISTORIC_COMMIT, reason: "pre-p5-result-schema",
  });
  result.sdlcRunGraph.events[0].sourceRefs.push({
    collection: "packageResults", id: legacy.id, sha256: sha256Canonical(legacy),
  });
  const outcome = checked(result);
  assert.deepEqual(outcome, { ok: true, findings: [] });
});

test("missing or stale legacy-ledger exemptions cannot hide current loop evidence", () => {
  const missing = fixture();
  const unbound = { id: "unbound-legacy", status: "historic" };
  missing.packageResults.push(unbound);
  missing.sdlcRunGraph.events[0].sourceRefs.push({ collection: "packageResults", id: unbound.id, sha256: sha256Canonical(unbound) });
  assert(checked(missing).findings.some((finding) => finding.includes("lacks a bound loopEconomy ledger")));

  const stale = fixture();
  const legacy = { id: "stale-legacy", status: "historic" };
  stale.packageResults.push(legacy);
  stale.phase26InvariantEvidence.legacyLedgerExemptions.push({
    packageId: legacy.id, packageSha256: SHA("f"), historicResultCommit: HISTORIC_COMMIT, reason: "pre-p5-result-schema",
  });
  stale.sdlcRunGraph.events[0].sourceRefs.push({ collection: "packageResults", id: legacy.id, sha256: sha256Canonical(legacy) });
  assert(checked(stale).findings.some((finding) => finding.includes("legacy ledger exemption")));
});

test("Mermaid tamper and stale projection digest both fail", () => {
  const result = fixture();
  const mermaid = renderSdlcMermaid(result.sdlcRunGraph).replace("0:start:succeeded", "0:start:failed");
  const outcome = checked(result, mermaid);
  assert.equal(outcome.ok, false);
  assert(outcome.findings.some((finding) => finding.includes("deterministic graph-only")));
  assert(outcome.findings.some((finding) => finding.includes("mermaidSha256")));
});

test("unsafe label injection is rejected before it can become projection authority", () => {
  const result = fixture();
  result.sdlcRunGraph.events[1].actionId = "bad\"]";
  const outcome = checked(result);
  assert.equal(outcome.ok, false);
  assert(outcome.findings.some((finding) => finding.includes("invalid event")));
});

test("stale package source digest and a new event after cutoff both fail", () => {
  const stale = fixture();
  stale.packageResults[0].status = "new-attempt-after-graph";
  const staleOutcome = checked(stale);
  assert(staleOutcome.findings.some((finding) => finding.includes("stale digest")));

  const postCutoff = fixture();
  postCutoff.sdlcRunGraph.events.push(event("event-08", 8, "work"));
  postCutoff.sdlcRunGraph.edges.push(edge("edge-10", "event-07", "event-08"));
  const cutoffOutcome = checked(postCutoff);
  assert(cutoffOutcome.findings.some((finding) => finding.includes("cutoff")));
});

test("a bounded edge cannot cite a fabricated Result-owned receipt", () => {
  const result = fixture();
  result.sdlcRunGraph.edges[2].sourceRefs.push({
    collection: "courseDecisionReceipts", id: "fabricated-receipt", sha256: SHA("f"),
  });
  const outcome = checked(result);
  assert(outcome.findings.some((finding) => finding.includes("fabricated or stale Result-owned")));
});

test("unreconciled external evidence and a disconnected cycle fail closed", () => {
  const result = fixture();
  result.sdlcRunGraph.edges[2].sourceRefs[1].sha256 = SHA("f");
  assert(checked(result).findings.some((finding) => finding.includes("fabricated or stale Result-owned")));

  const disconnected = fixture();
  disconnected.sdlcRunGraph.events.push(event("event-08", 8, "work"), event("event-09", 9, "verify"));
  disconnected.sdlcRunGraph.edges.push(edge("edge-10", "event-08", "event-09"), edge("edge-11", "event-09", "event-08"));
  disconnected.sdlcRunGraph.graphCutoffEventId = "event-09";
  rebuildExternalEvidence(disconnected);
  assert(checked(disconnected).findings.some((finding) => finding.includes("not reachable from the graph start")));
});

test("a backward edge cannot evade loop accounting as an ordinary event", () => {
  const result = fixture();
  result.sdlcRunGraph.edges[3] = edge("edge-03", "event-03", "event-01");
  assert(checked(result).findings.some((finding) => finding.includes("must point strictly forward or be declared as a bounded back-edge")));
});

test("an ordinary self-loop cannot evade loop accounting", () => {
  const result = fixture();
  result.sdlcRunGraph.edges[3] = edge("edge-03", "event-03", "event-03");
  assert(checked(result).findings.some((finding) => finding.includes("must point strictly forward or be declared as a bounded back-edge")));
});

test("graph cannot add a containing-Result or final-commit self-reference field", () => {
  const result = fixture();
  result.sdlcRunGraph.resultSha256 = SHA("f");
  const outcome = checked(result);
  assert(outcome.findings.some((finding) => finding.includes("closed root contract")));
});

test("scope growth or a new trust boundary requires an actual approved decision brief", () => {
  const result = fixture();
  result.phase26InvariantEvidence.scope.actualPathCount = 12;
  const growth = checked(result);
  assert(growth.findings.some((finding) => finding.includes("approved bound decision brief")));

  const trust = fixture();
  trust.phase26InvariantEvidence.scope.newTrustBoundaries = ["new-network-boundary"];
  const trustOutcome = checked(trust);
  assert(trustOutcome.findings.some((finding) => finding.includes("approved bound decision brief")));
});

test("p95 is recomputed and threshold violations fail", () => {
  const result = fixture();
  result.phase26InvariantEvidence.performance.targetedVerify.p95Ms = 1;
  result.phase26InvariantEvidence.performance.ledgerWriter = measurement([10, 20, 30, 40, 51], 50);
  const outcome = checked(result);
  assert(outcome.findings.some((finding) => finding.includes("declared p95")));
  assert(outcome.findings.some((finding) => finding.includes("exceeds 50ms")));
});

test("early smoke rejects the 20-percent boundary and live-time excess", () => {
  const result = fixture();
  result.phase26InvariantEvidence.earlySmoke.changedPathCountBeforeSmoke = 2;
  result.phase26InvariantEvidence.earlySmoke.cumulativeLiveMs = 900_001;
  const outcome = checked(result);
  assert(outcome.findings.some((finding) => finding.includes("before 20 percent")));
});

test("phase-close cannot precede green exact Verify and matching push fetch-back evidence", () => {
  const result = fixture();
  result.sdlcRunGraph.completionClaim = "phase-close";
  result.phase26InvariantEvidence.executionRouting = {
    status: "attested", requestedDuty: "codex_implementation", requiredSelector: "terra", requiredEffort: "xhigh",
    routeReceiptEvidenceId: "route-receipt", routeReceiptEvidenceSha256: SHA("r"), phase3Disposition: "none",
  };
  rebuildExternalEvidence(result);
  result.packageResults[0].publicGate.fetchBackOid = "2".repeat(40);
  const outcome = checked(result);
  assert(outcome.findings.some((finding) => finding.includes("green Verify/push/fetch-back")));
});

test("phase-close rejects an unattested implementation route even with exact delivery evidence", () => {
  const result = fixture();
  result.sdlcRunGraph.completionClaim = "phase-close";
  assert(checked(result).findings.some((finding) => finding.includes("requires an attested dispatch or an explicit PO-approved Phase-3 routing deferral")));
});

test("phase-close accepts an explicit PO-approved Phase-3 routing deferral", () => {
  const result = fixture();
  result.sdlcRunGraph.completionClaim = "phase-close";
  result.sdlcRunGraph.events[7] = event("event-07", 7, "close");
  result.phase26InvariantEvidence.executionRouting = {
    status: "po-approved-phase3-deferral", requestedDuty: "codex_implementation", requiredSelector: "terra", requiredEffort: "xhigh",
    routeReceiptEvidenceId: null, routeReceiptEvidenceSha256: null, phase3Disposition: "mandatory-dispatch-attestation",
  };
  rebuildExternalEvidence(result);
  assert.deepEqual(checked(result), { ok: true, findings: [] });
});

test("phase-close requires a successful terminal close cutoff", () => {
  const result = fixture();
  result.sdlcRunGraph.completionClaim = "phase-close";
  result.phase26InvariantEvidence.executionRouting = {
    status: "attested", requestedDuty: "codex_implementation", requiredSelector: "terra", requiredEffort: "xhigh",
    routeReceiptEvidenceId: "route-receipt", routeReceiptEvidenceSha256: SHA("r"), phase3Disposition: "none",
  };
  rebuildExternalEvidence(result);
  assert(checked(result).findings.some((finding) => finding.includes("successful terminal close event")));
});

test("phase-close terminal close cannot retain an outgoing back-edge", () => {
  const result = fixture();
  result.sdlcRunGraph.completionClaim = "phase-close";
  result.sdlcRunGraph.events[7] = event("event-07", 7, "close");
  result.phase26InvariantEvidence.executionRouting = {
    status: "attested", requestedDuty: "codex_implementation", requiredSelector: "terra", requiredEffort: "xhigh",
    routeReceiptEvidenceId: "route-receipt", routeReceiptEvidenceSha256: SHA("r"), phase3Disposition: "none",
  };
  result.sdlcRunGraph.edges.push(edge("edge-10", "event-07", "event-01", "back-edge", "critic-correction", "duplicate-loop", [
    { collection: "packageResults", id: result.packageResults[0].id, sha256: sha256Canonical(result.packageResults[0]) }, externalRef("duplicate-trigger"),
  ]));
  rebuildExternalEvidence(result);
  assert(checked(result).findings.some((finding) => finding.includes("terminal close event must have no outgoing edges")));
});

test("a P5-era commit cannot impersonate a pre-P5 legacy ledger snapshot", () => {
  const result = fixture();
  const legacy = { id: "legacy-record", status: "historic" };
  result.packageResults.push(legacy);
  result.phase26InvariantEvidence.legacyLedgerExemptions.push({
    packageId: legacy.id, packageSha256: sha256Canonical(legacy), historicResultCommit: HISTORIC_COMMIT, reason: "pre-p5-result-schema",
  });
  result.sdlcRunGraph.events[0].sourceRefs.push({
    collection: "packageResults", id: legacy.id, sha256: sha256Canonical(legacy),
  });
  const root = writeFixture(result);
  for (const args of [["add", "Result.md"], ["commit", "-qm", "introduce p5 result"]]) {
    const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (run.status !== 0) throw new Error(run.stderr || `git ${args.join(" ")} failed`);
  }
  const p5Commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const source = readFileSync(join(root, "Result.md"), "utf8").replace(/"historicResultCommit": "[a-f0-9]{40}"/, `"historicResultCommit": "${p5Commit}"`);
  writeFileSync(join(root, "Result.md"), source);
  assert(checkPhase26Invariants(root, "Result.md").findings.some((finding) => finding.includes("legacy ledger exemption legacy-record is stale, fabricated or masks a current ledger")));
});

test("duplicate Result JSON keys and a second Mermaid authority block fail", () => {
  const result = fixture();
  const mermaid = seal(result);
  const root = mkdtempSync(join(tmpdir(), "phase26-invariants-duplicate-"));
  roots.push(root);
  const json = JSON.stringify(result, null, 2).replace('"packageResults": [', '"packageResults": [],\n  "packageResults": [');
  writeFileSync(join(root, "Result.md"), `\`\`\`pipeline-result\n${json}\n\`\`\`\n\n\`\`\`mermaid\n${mermaid}\`\`\`\n\n\`\`\`mermaid\n${mermaid}\`\`\`\n`);
  const outcome = checkPhase26Invariants(root, "Result.md");
  assert.equal(outcome.ok, false);
  assert(outcome.findings.some((finding) => finding.includes("duplicate key")));
  assert(outcome.findings.some((finding) => finding.includes("exactly one Mermaid")));
});

for (const root of roots) rmSync(root, { recursive: true, force: true });
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
