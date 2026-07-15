#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { checkPhase3SdlcCoherence } from "./check-phase3-sdlc-coherence.mjs";
import { validateAgainstSchema } from "../../plugins/pipeline-core/lib/schema-lite.mjs";

const SHA256 = (character) => character.repeat(64);
const COMMIT = (character) => character.repeat(40);
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function event(eventId, cycleId, sequence, packageId, actionId, stage, sourceEvidenceIds) {
  return {
    eventId,
    cycleId,
    sequence,
    packageId,
    actionId,
    stage,
    sourceEvidenceIds,
    candidateCommit: COMMIT("a"),
    tree: COMMIT("b"),
    outcome: "succeeded",
  };
}

function packageResult(suffix, { correction = false } = {}) {
  const packageId = `package-${suffix}`;
  const actionId = `action-${suffix}`;
  return {
    id: packageId,
    actionId,
    status: "implementation-pass; pushed-and-fetchback-verified",
    candidateCommit: COMMIT("a"),
    tree: COMMIT("b"),
    resultEvidenceId: `package-result-${suffix}`,
    correctionRecords: correction ? [{
      correctionId: `correction-${suffix}-01`,
      actionId,
      outcome: "succeeded",
    }] : [],
    deltaReceipts: correction ? [{
      receiptId: `delta-receipt-${suffix}-01`,
      correctionId: `correction-${suffix}-01`,
      actionId,
      outcome: "succeeded",
    }] : [],
    delivery: {
      deliveryReceiptId: `push-receipt-${suffix}-01`,
      fetchBackReceiptId: `fetch-receipt-${suffix}-01`,
      outcome: "succeeded",
      pushedOid: COMMIT("a"),
      fetchedOid: COMMIT("a"),
    },
  };
}

function packageCycle(result, cycleSequence, firstEventNumber) {
  const suffix = result.id.replace("package-", "");
  const cycleId = `cycle-${suffix}-01`;
  const stages = [
    ["work", [result.resultEvidenceId]],
    ["stage-verify", [result.resultEvidenceId]],
    ["critic", [result.resultEvidenceId]],
    ...result.correctionRecords.flatMap((record, index) => [
      ["correction", [record.correctionId]],
      ["delta-regate", [result.deltaReceipts[index].receiptId]],
    ]),
    ["intent", [result.resultEvidenceId]],
    ["state-cas", [result.resultEvidenceId]],
    ["final-verify", ["final-delivery-evidence-01"]],
    ["delivery", [result.delivery.deliveryReceiptId]],
    ["fetch-back", [result.delivery.fetchBackReceiptId]],
    ["close", ["final-delivery-evidence-01"]],
  ];
  const events = stages.map(([stage, sources], sequence) => event(
    `event-${String(firstEventNumber + sequence).padStart(3, "0")}`,
    cycleId,
    sequence,
    result.id,
    result.actionId,
    stage,
    sources,
  ));
  return {
    cycle: {
      cycleId,
      packageId: result.id,
      sequence: cycleSequence,
      eventIds: events.map(({ eventId }) => eventId),
    },
    events,
  };
}

function finalDeliveryEvidence() {
  return {
    finalDeliveryEvidenceId: "final-delivery-evidence-01",
    candidateCommit: COMMIT("a"),
    tree: COMMIT("b"),
    verifyCommand: "node harness/scripts/verify.mjs",
    verifyResultDigest: SHA256("e"),
    privacyDisposition: "pass",
    securityDisposition: "skipped-no-positive-claim",
    approvedTarget: "shared-feature-ref",
    pushedOid: COMMIT("a"),
    fetchedOid: COMMIT("a"),
  };
}

function resultOwnedEvidence(result) {
  const evidence = new Map();
  if (result.finalDeliveryEvidence?.finalDeliveryEvidenceId) {
    evidence.set(result.finalDeliveryEvidence.finalDeliveryEvidenceId, result.finalDeliveryEvidence);
  }
  for (const packageEntry of result.packageResults ?? []) {
    if (packageEntry?.resultEvidenceId) evidence.set(packageEntry.resultEvidenceId, packageEntry);
    for (const correction of packageEntry?.correctionRecords ?? []) {
      if (correction?.correctionId) evidence.set(correction.correctionId, correction);
    }
    for (const receipt of packageEntry?.deltaReceipts ?? []) {
      if (receipt?.receiptId) evidence.set(receipt.receiptId, receipt);
    }
  }
  return evidence;
}

function boundStatusProjections(result, status = "phase-close") {
  const projectionNames = ["result", "state", "human", "package", "handoff"];
  const ownedEvidence = [...resultOwnedEvidence(result)];
  assert(ownedEvidence.length >= projectionNames.length,
    "the fixture must own at least five immutable evidence records for status projection bindings");
  return projectionNames.map((projection, index) => {
    const [sourceEvidenceId, source] = ownedEvidence[index];
    return {
      projection,
      status,
      sourceEvidenceId,
      sha256: sha256Canonical(source),
    };
  });
}

function sealBindings(result) {
  const eventByCycle = new Map(result.sdlcRunGraph.cycles.map((cycle) => [cycle.cycleId, cycle.eventIds]));
  result.packageBindings = result.packageResults.map((packageEntry) => {
    const cycle = result.sdlcRunGraph.cycles.find(({ packageId }) => packageId === packageEntry.id);
    const eventIds = eventByCycle.get(cycle.cycleId);
    return {
      packageId: packageEntry.id,
      packageSha256: sha256Canonical(packageEntry),
      terminalCycleId: cycle.cycleId,
      terminalEventId: eventIds.at(-1),
      finalDeliveryEvidenceId: result.finalDeliveryEvidence.finalDeliveryEvidenceId,
    };
  });
  return result;
}

function coherenceFixture({ correctionPackage = "alpha" } = {}) {
  const packageResults = [
    packageResult("alpha", { correction: correctionPackage === "alpha" }),
    packageResult("beta", { correction: correctionPackage === "beta" }),
  ];
  let nextEvent = 1;
  const builtCycles = packageResults.map((entry, index) => {
    const built = packageCycle(entry, index, nextEvent);
    nextEvent += built.events.length;
    return built;
  });
  const result = {
    status: "phase-close",
    statusProjections: [],
    packageResults,
    sdlcRunGraph: {
      schemaVersion: "pipeline.sdlc-run-graph.v2",
      featureId: "phase3a-sanitized-coherence-fixture",
      completionClaim: "phase-close",
      cycles: builtCycles.map(({ cycle }) => cycle),
      events: builtCycles.flatMap(({ events }) => events),
      loopAggregates: [
        { family: "critic-correction", count: 1, bound: 2 },
        { family: "delta-regate", count: 1, bound: 2 },
        { family: "product-retry", count: 0, bound: 1 },
        { family: "environment-failover", count: 0, bound: 1 },
      ],
    },
    finalDeliveryEvidence: finalDeliveryEvidence(),
    packageBindings: [],
  };
  result.statusProjections = boundStatusProjections(result);
  return sealBindings(result);
}

function incompleteAlphaCloseFixture({ failedDeliveryEvent }) {
  const result = coherenceFixture({ correctionPackage: "beta" });
  const alphaCycle = result.sdlcRunGraph.cycles.find(({ packageId }) => packageId === "package-alpha");
  const alphaWork = findEvent(result, "package-alpha", "work");
  const alphaDelivery = findEvent(result, "package-alpha", "delivery");
  alphaDelivery.outcome = "failed";
  alphaDelivery.sequence = 1;
  const retainedAlphaEvents = failedDeliveryEvent ? [alphaWork, alphaDelivery] : [alphaWork];
  const retainedIds = new Set(retainedAlphaEvents.map(({ eventId }) => eventId));
  result.sdlcRunGraph.events = result.sdlcRunGraph.events.filter(
    (entry) => entry.packageId !== "package-alpha" || retainedIds.has(entry.eventId),
  );
  alphaCycle.eventIds = retainedAlphaEvents.map(({ eventId }) => eventId);
  result.packageResults.find(({ id }) => id === "package-alpha").delivery.outcome = "failed";
  sealBindings(result);
  result.statusProjections = boundStatusProjections(result);
  return result;
}

function check(result) {
  const outcome = checkPhase3SdlcCoherence(result);
  assert.equal(typeof outcome, "object");
  assert.equal(Array.isArray(outcome.findings), true);
  return outcome;
}

function assertValid(result) {
  assert.deepEqual(check(result), { ok: true, findings: [] });
}

function assertInvalid(result, expectedFinding) {
  const outcome = check(result);
  assert.equal(outcome.ok, false);
  assert(outcome.findings.some((finding) => expectedFinding.test(finding)),
    `expected finding ${expectedFinding}, got ${JSON.stringify(outcome.findings)}`);
}

function findEvent(result, packageId, stage) {
  return result.sdlcRunGraph.events.find((entry) => entry.packageId === packageId && entry.stage === stage);
}

function replaceEventSource(eventEntry, sourceEvidenceIds) {
  eventEntry.sourceEvidenceIds = sourceEvidenceIds;
}

function deliveryCardinalityFixture(packageCount, mappedDeliveryCount) {
  const packageResults = Array.from({ length: packageCount }, (_, index) => packageResult(`p${index + 1}`));
  let eventNumber = 1;
  const cycles = [];
  const events = [];
  for (const [index, entry] of packageResults.entries()) {
    const cycleId = `cycle-p${index + 1}-01`;
    const cycleEvents = [event(
      `event-${String(eventNumber++).padStart(3, "0")}`,
      cycleId,
      0,
      entry.id,
      entry.actionId,
      "work",
      [entry.resultEvidenceId],
    )];
    if (index < mappedDeliveryCount) {
      cycleEvents.push(
        event(
          `event-${String(eventNumber++).padStart(3, "0")}`,
          cycleId,
          1,
          entry.id,
          entry.actionId,
          "delivery",
          [entry.delivery.deliveryReceiptId],
        ),
        event(
          `event-${String(eventNumber++).padStart(3, "0")}`,
          cycleId,
          2,
          entry.id,
          entry.actionId,
          "fetch-back",
          [entry.delivery.fetchBackReceiptId],
        ),
      );
    }
    cycles.push({
      cycleId,
      packageId: entry.id,
      sequence: index,
      eventIds: cycleEvents.map(({ eventId }) => eventId),
    });
    events.push(...cycleEvents);
  }
  const result = {
    status: "phase-close",
    statusProjections: [],
    packageResults,
    sdlcRunGraph: {
      schemaVersion: "pipeline.sdlc-run-graph.v2",
      featureId: "phase26-seven-vs-ten-sanitized",
      completionClaim: "phase-close",
      cycles,
      events,
      loopAggregates: [
        { family: "critic-correction", count: 0, bound: 2 },
        { family: "delta-regate", count: 0, bound: 2 },
        { family: "product-retry", count: 0, bound: 1 },
        { family: "environment-failover", count: 0, bound: 1 },
      ],
    },
    finalDeliveryEvidence: finalDeliveryEvidence(),
    packageBindings: [],
  };
  result.statusProjections = boundStatusProjections(result);
  return sealBindings(result);
}

test("the complete sanitized v2 Result is coherent", () => {
  assertValid(coherenceFixture());
});

test("schema-lite demonstrates its documented keyword limit and non-authoritative role", () => {
  const schema = JSON.parse(readFileSync(new URL("./sdlc-run-graph.schema.json", import.meta.url), "utf8"));
  const valid = validateAgainstSchema(coherenceFixture(), schema);
  assert.equal(valid.valid, true, JSON.stringify(valid.errors));

  const malformed = coherenceFixture();
  malformed.sdlcRunGraph.events[0].untrustedProse = "not in the closed event contract";
  const schemaLiteGap = validateAgainstSchema(malformed, schema);
  assert.equal(schemaLiteGap.valid, true,
    "schema-lite does not execute the published schema's $ref/oneOf nested event contract");
  assertInvalid(malformed, /event|closed|unexpected|additional|untrustedProse/i);

  const unsupportedFormalKeywords = {
    type: "object",
    required: ["ids", "digest"],
    properties: {
      ids: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", pattern: "^event-[0-9]+$" },
      },
      digest: { type: "string", pattern: "^[a-f0-9]{64}$", minLength: 64 },
    },
    additionalProperties: false,
  };
  const formallyInvalidButSchemaLiteAccepted = validateAgainstSchema(
    { ids: [], digest: "not-a-digest" },
    unsupportedFormalKeywords,
  );
  assert.equal(formallyInvalidButSchemaLiteAccepted.valid, true,
    "schema-lite intentionally ignores minItems, uniqueItems, pattern and minLength");
});

test("executed runtime validation rejects empty and malformed v2 Result envelopes", () => {
  const empty = coherenceFixture();
  empty.packageResults = [];
  empty.sdlcRunGraph.cycles = [];
  empty.sdlcRunGraph.events = [];
  empty.packageBindings = [];
  assertInvalid(empty, /empty|PackageResult|cycle|event|phase-close|delivery/i);

  const malformed = coherenceFixture();
  malformed.sdlcRunGraph.cycles = null;
  malformed.sdlcRunGraph.events = "not-an-event-array";
  let outcome;
  assert.doesNotThrow(() => { outcome = checkPhase3SdlcCoherence(malformed); });
  assert.equal(outcome?.ok, false);
  assert.equal(Array.isArray(outcome?.findings), true);
});

test("every PackageResult maps to one or more ordered events in exactly one cycle", () => {
  const missing = coherenceFixture();
  const packageId = "package-beta";
  const cycle = missing.sdlcRunGraph.cycles.find((entry) => entry.packageId === packageId);
  missing.sdlcRunGraph.cycles = missing.sdlcRunGraph.cycles.filter((entry) => entry !== cycle);
  missing.sdlcRunGraph.events = missing.sdlcRunGraph.events.filter((entry) => entry.packageId !== packageId);
  assertInvalid(missing, /PackageResult|package-beta|cycle|mapping/i);

  const split = coherenceFixture();
  const betaEvent = findEvent(split, packageId, "delivery");
  betaEvent.cycleId = "cycle-alpha-01";
  assertInvalid(split, /PackageResult|package-beta|cycle|mapping/i);
});

test("PackageResult action IDs must match their graph dispatch identity", () => {
  const result = coherenceFixture();
  findEvent(result, "package-beta", "work").actionId = "action-fabricated";
  assertInvalid(result, /action|dispatch|package-beta/i);
});

test("cycle package ownership cannot be contradicted by an event", () => {
  const result = coherenceFixture();
  const work = findEvent(result, "package-beta", "work");
  work.packageId = "package-alpha";
  assertInvalid(result, /cycle|package|ownership|mapping/i);
});

test("each correction record has exactly one typed correction event", () => {
  const missing = coherenceFixture();
  findEvent(missing, "package-alpha", "correction").stage = "critic";
  assertInvalid(missing, /correction.*(?:bijection|event|exact)|correction-alpha/i);

  const duplicate = coherenceFixture();
  const spare = findEvent(duplicate, "package-alpha", "intent");
  spare.stage = "correction";
  replaceEventSource(spare, ["correction-alpha-01"]);
  assertInvalid(duplicate, /correction.*(?:bijection|duplicate|exact)|correction-alpha/i);
});

test("a correction event cannot fabricate or borrow another correction record", () => {
  const result = coherenceFixture();
  replaceEventSource(findEvent(result, "package-alpha", "correction"), ["correction-does-not-exist"]);
  assertInvalid(result, /correction|sourceEvidence|resolve|fabricat/i);
});

test("each delta receipt has exactly one typed delta-regate event", () => {
  const missing = coherenceFixture();
  findEvent(missing, "package-alpha", "delta-regate").stage = "critic";
  assertInvalid(missing, /delta.*(?:bijection|receipt|event|exact)|delta-receipt-alpha/i);

  const duplicate = coherenceFixture();
  const spare = findEvent(duplicate, "package-alpha", "state-cas");
  spare.stage = "delta-regate";
  replaceEventSource(spare, ["delta-receipt-alpha-01"]);
  assertInvalid(duplicate, /delta.*(?:bijection|duplicate|receipt|exact)|delta-receipt-alpha/i);
});

test("delta events and receipts cannot cross package or action boundaries", () => {
  const result = coherenceFixture();
  const delta = findEvent(result, "package-alpha", "delta-regate");
  delta.packageId = "package-beta";
  delta.actionId = "action-beta";
  assertInvalid(result, /delta|package|action|cycle/i);
});

test("every successful delivery requires exactly one delivery and exact fetch-back pair", () => {
  const missingFetchBack = coherenceFixture();
  findEvent(missingFetchBack, "package-beta", "fetch-back").stage = "close";
  assertInvalid(missingFetchBack, /fetch-back|delivery.*pair|readback/i);

  const missingPush = coherenceFixture();
  findEvent(missingPush, "package-beta", "delivery").stage = "intent";
  assertInvalid(missingPush, /delivery|push|fetch-back.*pair/i);
});

test("phase-close requires each package to finish an ordered successful final delivery tail", () => {
  const complete = coherenceFixture();
  const eventById = new Map(complete.sdlcRunGraph.events.map((entry) => [entry.eventId, entry]));
  for (const packageEntry of complete.packageResults) {
    const cycle = complete.sdlcRunGraph.cycles.find(({ packageId }) => packageId === packageEntry.id);
    const chronology = cycle.eventIds.map((eventId) => eventById.get(eventId));
    const tail = chronology.slice(-4);
    assert.deepEqual(tail.map(({ stage }) => stage),
      ["final-verify", "delivery", "fetch-back", "close"]);
    assert(tail.every(({ outcome }) => outcome === "succeeded"));
    const binding = complete.packageBindings.find(({ packageId }) => packageId === packageEntry.id);
    assert.equal(binding.terminalCycleId, cycle.cycleId);
    assert.equal(binding.terminalEventId, tail.at(-1).eventId);
  }
  assertValid(complete);

  for (const failedDeliveryEvent of [false, true]) {
    const incompleteAlpha = incompleteAlphaCloseFixture({ failedDeliveryEvent });
    const alphaCycle = incompleteAlpha.sdlcRunGraph.cycles.find(({ packageId }) => packageId === "package-alpha");
    const alphaBinding = incompleteAlpha.packageBindings.find(({ packageId }) => packageId === "package-alpha");
    assert.equal(alphaBinding.terminalCycleId, alphaCycle.cycleId);
    assert.equal(alphaBinding.terminalEventId, alphaCycle.eventIds.at(-1));
    const betaCycle = incompleteAlpha.sdlcRunGraph.cycles.find(({ packageId }) => packageId === "package-beta");
    const betaEvents = betaCycle.eventIds.map((eventId) =>
      incompleteAlpha.sdlcRunGraph.events.find((entry) => entry.eventId === eventId));
    assert.deepEqual(betaEvents.slice(-4).map(({ stage }) => stage),
      ["final-verify", "delivery", "fetch-back", "close"]);
    assert(betaEvents.slice(-4).every(({ outcome }) => outcome === "succeeded"));
    assertInvalid(incompleteAlpha,
      /package-alpha.*(?:final-verify|delivery|fetch-back|close|tail)|(?:tail|final-verify|delivery|fetch-back|close).*package-alpha/i);
  }

  const outOfOrder = coherenceFixture();
  const betaFinalVerify = findEvent(outOfOrder, "package-beta", "final-verify");
  const betaDelivery = findEvent(outOfOrder, "package-beta", "delivery");
  [betaFinalVerify.stage, betaDelivery.stage] = [betaDelivery.stage, betaFinalVerify.stage];
  assertInvalid(outOfOrder, /package-beta|final-verify|delivery|fetch-back|close|order/i);

  for (const stage of ["final-verify", "delivery", "fetch-back", "close"]) {
    const failed = coherenceFixture();
    findEvent(failed, "package-beta", stage).outcome = "failed";
    assertInvalid(failed, new RegExp(`package-beta|${stage}|phase-close|succeeded|outcome`, "i"));
  }
});

test("delivery and fetch-back event bindings must match the successful PackageResult", () => {
  const failedDelivery = coherenceFixture();
  failedDelivery.packageResults[1].delivery.outcome = "failed";
  sealBindings(failedDelivery);
  assertInvalid(failedDelivery, /package-beta|delivery|failed|phase-close/i);

  const fetchCommitMismatch = coherenceFixture();
  findEvent(fetchCommitMismatch, "package-beta", "fetch-back").candidateCommit = COMMIT("c");
  assertInvalid(fetchCommitMismatch, /package-beta|fetch-back|commit|candidate|mismatch/i);

  const fetchReceiptMismatch = coherenceFixture();
  replaceEventSource(findEvent(fetchReceiptMismatch, "package-beta", "fetch-back"),
    ["fetch-receipt-alpha-01"]);
  assertInvalid(fetchReceiptMismatch, /package-beta|fetch-back|receipt|sourceEvidence|mismatch/i);
});

test("delivery and fetch-back receipts are each bijective", () => {
  const duplicateDelivery = coherenceFixture();
  const spareDelivery = findEvent(duplicateDelivery, "package-beta", "intent");
  spareDelivery.stage = "delivery";
  replaceEventSource(spareDelivery, ["push-receipt-beta-01"]);
  assertInvalid(duplicateDelivery, /delivery|push|duplicate|bijection|exact/i);

  const duplicateFetch = coherenceFixture();
  const spareFetch = findEvent(duplicateFetch, "package-beta", "state-cas");
  spareFetch.stage = "fetch-back";
  replaceEventSource(spareFetch, ["fetch-receipt-beta-01"]);
  assertInvalid(duplicateFetch, /fetch-back|readback|duplicate|bijection|exact/i);
});

test("a successful package cannot claim a non-exact remote readback", () => {
  const result = coherenceFixture();
  result.packageResults[1].delivery.fetchedOid = COMMIT("c");
  sealBindings(result);
  assertInvalid(result, /fetch|readback|pushedOid|exact|OID/i);
});

test("delivery/fetch source evidence must resolve to the owning PackageResult receipts", () => {
  const result = coherenceFixture();
  replaceEventSource(findEvent(result, "package-beta", "fetch-back"), ["fetch-receipt-fabricated"]);
  assertInvalid(result, /fetch|sourceEvidence|receipt|resolve|fabricat/i);
});

test("a closed v2 Result contains exactly one finalDeliveryEvidence object", () => {
  const missing = coherenceFixture();
  delete missing.finalDeliveryEvidence;
  assertInvalid(missing, /finalDeliveryEvidence|final delivery/i);

  const duplicated = coherenceFixture();
  duplicated.finalDeliveryEvidence = [
    duplicated.finalDeliveryEvidence,
    { ...duplicated.finalDeliveryEvidence, finalDeliveryEvidenceId: "final-delivery-evidence-02" },
  ];
  assertInvalid(duplicated, /finalDeliveryEvidence|exactly one|object/i);
});

test("final evidence binds one internally exact final commit, tree, verify and readback", () => {
  const staleVerify = coherenceFixture();
  staleVerify.finalDeliveryEvidence.candidateCommit = COMMIT("c");
  assertInvalid(staleVerify, /final|candidate|commit|verify|binding/i);

  const conflictingReadback = coherenceFixture();
  conflictingReadback.finalDeliveryEvidence.fetchedOid = COMMIT("d");
  assertInvalid(conflictingReadback, /final|fetch|readback|pushedOid|exact/i);

  const missingDigest = coherenceFixture();
  delete missingDigest.finalDeliveryEvidence.verifyResultDigest;
  assertInvalid(missingDigest, /verifyResultDigest|verify.*digest|final/i);

  const wrongCommand = coherenceFixture();
  wrongCommand.finalDeliveryEvidence.verifyCommand = "npm test";
  assertInvalid(wrongCommand, /verifyCommand|authoritative|node harness\/scripts\/verify\.mjs|exact/i);
});

test("package bindings provide complete duplicate-free package-ID coverage", () => {
  const missing = coherenceFixture();
  missing.packageBindings.pop();
  assertInvalid(missing, /packageBindings|coverage|package-beta|missing/i);

  const duplicate = coherenceFixture();
  duplicate.packageBindings.push({ ...duplicate.packageBindings[0] });
  assertInvalid(duplicate, /packageBindings|duplicate|coverage|package-alpha/i);

  const extra = coherenceFixture();
  extra.packageBindings.push({
    ...extra.packageBindings[0],
    packageId: "package-fabricated",
    packageSha256: SHA256("f"),
  });
  assertInvalid(extra, /packageBindings|coverage|fabricat|extra/i);
});

test("package IDs remain distinct from their package digests", () => {
  const result = coherenceFixture();
  const binding = result.packageBindings[0];
  [binding.packageId, binding.packageSha256] = [binding.packageSha256, SHA256("a")];
  assertInvalid(result, /packageId|packageSha256|digest|coverage/i);
});

test("each package binding retains the exact immutable PackageResult digest", () => {
  const result = coherenceFixture();
  result.packageBindings[0].packageSha256 = SHA256("f");
  assertInvalid(result, /packageSha256|digest|stale|package-alpha/i);
});

test("every binding resolves to the one shared final evidence object", () => {
  const result = coherenceFixture();
  result.packageBindings[1].finalDeliveryEvidenceId = "final-delivery-evidence-02";
  assertInvalid(result, /finalDeliveryEvidenceId|final evidence|resolve|package-beta/i);
});

test("terminal cycle and event references resolve to the owning package chronology", () => {
  const wrongCycle = coherenceFixture();
  wrongCycle.packageBindings[1].terminalCycleId = "cycle-alpha-01";
  assertInvalid(wrongCycle, /terminalCycleId|terminal cycle|package-beta/i);

  const nonTerminalEvent = coherenceFixture();
  nonTerminalEvent.packageBindings[1].terminalEventId = findEvent(nonTerminalEvent, "package-beta", "work").eventId;
  assertInvalid(nonTerminalEvent, /terminalEventId|terminal event|package-beta/i);

  const fetchBackIsNotTerminalClose = coherenceFixture();
  fetchBackIsNotTerminalClose.packageBindings[1].terminalEventId =
    findEvent(fetchBackIsNotTerminalClose, "package-beta", "fetch-back").eventId;
  assertInvalid(fetchBackIsNotTerminalClose, /terminalEventId|terminal|close|package-beta/i);
});

test("all graph source evidence IDs resolve without prose-based inference", () => {
  const result = coherenceFixture();
  replaceEventSource(findEvent(result, "package-alpha", "work"), ["fabricated-package-evidence"]);
  assertInvalid(result, /sourceEvidence|resolve|fabricat|package/i);
});

test("the sanitized Phase-2.6 seven-vs-ten delivery regression fails closed", () => {
  const result = deliveryCardinalityFixture(10, 7);
  const outcome = check(result);
  assert.equal(outcome.ok, false);
  assert(outcome.findings.some((finding) => /delivery|push|fetch|readback/i.test(finding)),
    JSON.stringify(outcome.findings));
  assert(outcome.findings.some((finding) => /7\D+10|10\D+7|three|3\D+(?:missing|unmapped)/i.test(finding)),
    `the cardinality gap must stay visible: ${JSON.stringify(outcome.findings)}`);
});

test("the sanitized contradictory close-status regression fails closed", () => {
  const result = coherenceFixture();
  result.status = "implementation-active";
  result.statusProjections[0].status = "implementation-active";
  result.statusProjections[1].status = "phase-close";
  result.statusProjections[2].status = "PO-closed";
  result.statusProjections[3].status = "phase-close";
  result.statusProjections[4].status = "candidate-handoff";
  const outcome = check(result);
  assert.equal(outcome.ok, false);
  assert(outcome.findings.some((finding) => /status|implementation-active|phase-close|PO-closed|candidate-handoff/i.test(finding)),
    JSON.stringify(outcome.findings));
});

test("status projection inventory is exactly result/state/human/package/handoff", () => {
  const result = coherenceFixture();
  assert.deepEqual(result.statusProjections.map(({ projection }) => projection),
    ["result", "state", "human", "package", "handoff"]);
  assertValid(result);

  const missing = coherenceFixture();
  missing.statusProjections.pop();
  assertInvalid(missing, /status|projection|handoff|inventory|missing/i);

  const duplicate = coherenceFixture();
  duplicate.statusProjections.push({ ...duplicate.statusProjections[0] });
  assertInvalid(duplicate, /status|projection|result|duplicate|inventory/i);

  const extra = coherenceFixture();
  extra.statusProjections.push({
    ...extra.statusProjections[0],
    projection: "graph",
  });
  assertInvalid(extra, /status|projection|graph|extra|inventory/i);
});

test("every status projection resolves to immutable Result-owned evidence at its exact digest", () => {
  const result = coherenceFixture();
  const ownedEvidence = resultOwnedEvidence(result);
  for (const projection of result.statusProjections) {
    assert.equal(typeof projection.sourceEvidenceId, "string");
    assert.match(projection.sha256, /^[a-f0-9]{64}$/);
    assert.equal(ownedEvidence.has(projection.sourceEvidenceId), true,
      `${projection.projection} must reference existing Result-owned evidence`);
    assert.equal(projection.sha256, sha256Canonical(ownedEvidence.get(projection.sourceEvidenceId)),
      `${projection.projection} must bind the exact immutable evidence digest`);
  }
  assertValid(result);

  const missingSource = coherenceFixture();
  delete missingSource.statusProjections[0].sourceEvidenceId;
  assertInvalid(missingSource, /status|projection|sourceEvidenceId|binding/i);

  const missingDigest = coherenceFixture();
  delete missingDigest.statusProjections[1].sha256;
  assertInvalid(missingDigest, /status|projection|sha256|digest|binding/i);

  const malformedDigest = coherenceFixture();
  malformedDigest.statusProjections[2].sha256 = "not-a-sha256";
  assertInvalid(malformedDigest, /status|projection|sha256|digest|binding/i);

  const fabricatedSource = coherenceFixture();
  fabricatedSource.statusProjections[2].sourceEvidenceId = "fabricated-result-evidence";
  fabricatedSource.statusProjections[2].sha256 = SHA256("f");
  assertInvalid(fabricatedSource, /status|projection|sourceEvidence|resolve|fabricat|binding/i);

  const staleDigest = coherenceFixture();
  const correctDigest = staleDigest.statusProjections[3].sha256;
  staleDigest.statusProjections[3].sha256 = SHA256(correctDigest[0] === "f" ? "e" : "f");
  assertInvalid(staleDigest, /status|projection|sha256|digest|stale|binding/i);

  const unboundSource = coherenceFixture();
  unboundSource.statusProjections[3].sourceEvidenceId = "";
  assertInvalid(unboundSource, /status|projection|sourceEvidence|unbound|empty|binding/i);

  const unboundDigest = coherenceFixture();
  unboundDigest.statusProjections[4].sha256 = "";
  assertInvalid(unboundDigest, /status|projection|sha256|digest|unbound|empty|binding/i);
});

test("Result coherence checking never throws for null, primitive or malformed collection inputs", () => {
  const malformedInputs = [
    null,
    false,
    7,
    "phase-close",
    [],
    {},
    { status: "phase-close", packageResults: null, sdlcRunGraph: null },
    { ...coherenceFixture(), packageResults: "not-an-array" },
    { ...coherenceFixture(), packageBindings: [null] },
    { ...coherenceFixture(), statusProjections: [null] },
    { ...coherenceFixture(), sdlcRunGraph: { ...coherenceFixture().sdlcRunGraph, cycles: [null] } },
    { ...coherenceFixture(), sdlcRunGraph: { ...coherenceFixture().sdlcRunGraph, events: [null] } },
  ];
  for (const input of malformedInputs) {
    let outcome;
    assert.doesNotThrow(() => { outcome = checkPhase3SdlcCoherence(input); });
    assert.equal(outcome?.ok, false, `malformed Result input must fail closed: ${String(input)}`);
    assert.equal(Array.isArray(outcome?.findings), true);
  }
});

test("Result coherence checking fails closed without throwing on malformed sources and non-finite numbers", () => {
  const malformedResults = [];
  for (const sources of [null, "package-result-alpha", [null], ["package-result-alpha", Infinity]]) {
    const result = coherenceFixture();
    result.sdlcRunGraph.events[0].sourceEvidenceIds = sources;
    malformedResults.push(result);
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    const eventNumber = coherenceFixture();
    eventNumber.sdlcRunGraph.events[0].sequence = value;
    malformedResults.push(eventNumber);
    const cycleNumber = coherenceFixture();
    cycleNumber.sdlcRunGraph.cycles[0].sequence = value;
    malformedResults.push(cycleNumber);
  }
  for (const result of malformedResults) {
    let outcome;
    assert.doesNotThrow(() => { outcome = checkPhase3SdlcCoherence(result); });
    assert.equal(outcome?.ok, false);
    assert.equal(Array.isArray(outcome?.findings), true);
  }
});

test("checker invocation without --result is an explicit successful SKIP", () => {
  const checkerPath = new URL("./check-phase3-sdlc-coherence.mjs", import.meta.url);
  const run = spawnSync(process.execPath, [checkerPath.pathname], {
    encoding: "utf8",
    timeout: 5_000,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^SKIP\b/m);
  assert.equal(run.stderr, "");
});

process.stdout.write(`1..${passed}\n`);
