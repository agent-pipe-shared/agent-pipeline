#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  renderSdlcMermaidV2,
  validateSdlcRunGraph,
} from "./sdlc-run-graph.mjs";

const SHA256 = (character) => character.repeat(64);
const COMMIT = (character) => character.repeat(40);
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function event(eventId, cycleId, sequence, stage, overrides = {}) {
  return {
    eventId,
    cycleId,
    sequence,
    packageId: "package-alpha",
    actionId: "action-alpha",
    stage,
    sourceEvidenceIds: [`evidence-${eventId}`],
    candidateCommit: COMMIT("a"),
    tree: COMMIT("b"),
    outcome: "succeeded",
    ...overrides,
  };
}

function v2Graph() {
  const events = [
    event("event-001", "cycle-alpha-01", 0, "work"),
    event("event-002", "cycle-alpha-01", 1, "stage-verify"),
    event("event-003", "cycle-alpha-01", 2, "critic"),
    event("event-004", "cycle-alpha-01", 3, "correction", {
      sourceEvidenceIds: ["correction-alpha-01"],
    }),
    event("event-005", "cycle-alpha-01", 4, "delta-regate", {
      sourceEvidenceIds: ["delta-receipt-alpha-01"],
    }),
    event("event-006", "cycle-alpha-01", 5, "intent"),
    event("event-007", "cycle-alpha-01", 6, "state-cas"),
    event("event-008", "cycle-alpha-01", 7, "final-verify"),
    event("event-009", "cycle-alpha-01", 8, "delivery", {
      sourceEvidenceIds: ["push-receipt-alpha-01"],
    }),
    event("event-010", "cycle-alpha-01", 9, "fetch-back", {
      sourceEvidenceIds: ["fetch-receipt-alpha-01"],
    }),
    event("event-011", "cycle-alpha-01", 10, "close", {
      sourceEvidenceIds: ["final-delivery-evidence-01"],
    }),
  ];
  return {
    schemaVersion: "pipeline.sdlc-run-graph.v2",
    featureId: "phase3a-sanitized-fixture",
    completionClaim: "phase-close",
    cycles: [{
      cycleId: "cycle-alpha-01",
      packageId: "package-alpha",
      sequence: 0,
      eventIds: events.map(({ eventId }) => eventId),
    }],
    events,
    loopAggregates: [
      { family: "critic-correction", count: 1, bound: 2 },
      { family: "delta-regate", count: 1, bound: 2 },
      { family: "product-retry", count: 0, bound: 1 },
      { family: "environment-failover", count: 0, bound: 1 },
    ],
  };
}

function legacyV1Graph() {
  const families = [
    ["initial-full-critic", "event"],
    ["critic-correction", "back-edge"],
    ["delta-regate", "back-edge"],
    ["product-retry", "back-edge"],
    ["environment-failover", "reroute"],
    ["scope-course-stop", "gate"],
    ["package-push-fetch-back", "event"],
  ];
  return {
    schemaVersion: "pipeline.sdlc-run-graph.v1",
    featureId: "historical-sanitized-v1",
    graphCutoffEventId: "event-00",
    sourceEventSetSha256: SHA256("a"),
    completionClaim: "candidate-handoff",
    events: [{
      eventId: "event-00",
      sequence: 0,
      eventType: "work",
      outcome: "succeeded",
      packageId: "historic-package",
      actionId: "historic-action",
      originChainId: "historic-origin",
      boundedFamily: null,
      decisionBriefId: null,
      sourceRefs: [{
        collection: "externalEvidence",
        id: "historic-evidence",
        sha256: SHA256("b"),
      }],
    }],
    edges: [],
    boundedFamilies: families.map(([family, kind]) => ({
      family,
      kind,
      count: 0,
      disposition: "not-triggered",
    })),
    loopRecords: [],
  };
}

function check(graph) {
  const outcome = validateSdlcRunGraph(graph);
  assert.equal(typeof outcome, "object");
  assert.equal(Array.isArray(outcome.findings), true);
  return outcome;
}

function assertValid(graph) {
  assert.deepEqual(check(graph), { ok: true, findings: [] });
}

function assertInvalid(graph, expectedFinding) {
  const outcome = check(graph);
  assert.equal(outcome.ok, false);
  assert(outcome.findings.some((finding) => expectedFinding.test(finding)),
    `expected finding ${expectedFinding}, got ${JSON.stringify(outcome.findings)}`);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function resequenceSingleCycle(graph) {
  graph.events.forEach((entry, index) => {
    entry.eventId = `event-${String(index + 1).padStart(3, "0")}`;
    entry.sequence = index;
  });
  graph.cycles[0].eventIds = graph.events.map(({ eventId }) => eventId);
  return graph;
}

function resequenceAllCycles(graph) {
  const nextSequence = new Map(graph.cycles.map(({ cycleId }) => [cycleId, 0]));
  graph.events.forEach((entry, index) => {
    entry.eventId = `event-${String(index + 1).padStart(3, "0")}`;
    entry.sequence = nextSequence.get(entry.cycleId);
    nextSequence.set(entry.cycleId, entry.sequence + 1);
  });
  for (const cycle of graph.cycles) {
    cycle.eventIds = graph.events
      .filter(({ cycleId }) => cycleId === cycle.cycleId)
      .map(({ eventId }) => eventId);
  }
  return graph;
}

function retryGraph({ repeatedFailure = false, includeLaterCourse = false } = {}) {
  const graph = v2Graph();
  const signature = SHA256("f");
  Object.assign(graph.events[0], {
    outcome: "failed",
    faultDomain: "product",
    failureSignature: signature,
  });
  graph.events.splice(1, 0, event("retry-placeholder", "cycle-alpha-01", 1, "work", {
    outcome: repeatedFailure ? "failed" : "succeeded",
    ...(repeatedFailure ? {
      faultDomain: "product",
      failureSignature: signature,
    } : {}),
  }));
  if (includeLaterCourse) {
    graph.events.splice(2, 0, event("course-placeholder", "cycle-alpha-01", 2, "course", {
      sourceEvidenceIds: ["course-decision-alpha-01"],
      faultDomain: "product",
      failureSignature: signature,
    }));
  }
  graph.loopAggregates.find(({ family }) => family === "product-retry").count = 1;
  return resequenceSingleCycle(graph);
}

function retryGraphWithUnrelatedCourse() {
  const graph = retryGraph({ repeatedFailure: true });
  const signature = graph.events[0].failureSignature;
  graph.cycles.push({
    cycleId: "cycle-beta-01",
    packageId: "package-beta",
    sequence: 1,
    eventIds: [],
  });
  graph.events.splice(2, 0, event("course-beta-placeholder", "cycle-beta-01", 0, "course", {
    packageId: "package-beta",
    actionId: "action-beta",
    sourceEvidenceIds: ["course-decision-beta-01"],
    faultDomain: "product",
    failureSignature: signature,
  }));
  return resequenceAllCycles(graph);
}

function failoverGraph(failoverCount) {
  const graph = v2Graph();
  const failovers = Array.from({ length: failoverCount }, (_, index) => event(
    `failover-placeholder-${index}`,
    "cycle-alpha-01",
    index + 1,
    "failover",
    {
      sourceEvidenceIds: [`failover-receipt-alpha-${index + 1}`],
      faultDomain: "execution-environment",
      failureSignature: SHA256(String(index + 1)),
    },
  ));
  graph.events.splice(1, 0, ...failovers);
  graph.loopAggregates.find(({ family }) => family === "environment-failover").count = failoverCount;
  return resequenceSingleCycle(graph);
}

function interleavedGraph() {
  const packages = ["alpha", "beta"];
  const interleavedStages = ["work", "stage-verify", "critic", "intent", "state-cas"];
  const cycles = packages.map((suffix, sequence) => ({
    cycleId: `cycle-${suffix}-01`,
    packageId: `package-${suffix}`,
    sequence,
    eventIds: [],
  }));
  const events = [];
  for (const [sequence, stage] of interleavedStages.entries()) {
    for (const [packageIndex, suffix] of packages.entries()) {
      const eventId = `event-${String(events.length + 1).padStart(3, "0")}`;
      events.push(event(eventId, `cycle-${suffix}-01`, sequence, stage, {
        packageId: `package-${suffix}`,
        actionId: `action-${suffix}`,
      }));
      cycles[packageIndex].eventIds.push(eventId);
    }
  }
  for (const [offset, stage] of ["final-verify", "delivery", "fetch-back", "close"].entries()) {
    const eventId = `event-${String(events.length + 1).padStart(3, "0")}`;
    events.push(event(eventId, "cycle-beta-01", interleavedStages.length + offset, stage, {
      packageId: "package-beta",
      actionId: "action-beta",
    }));
    cycles[1].eventIds.push(eventId);
  }
  return {
    schemaVersion: "pipeline.sdlc-run-graph.v2",
    featureId: "phase3a-interleaved-fixture",
    completionClaim: "candidate-handoff",
    cycles,
    events,
    loopAggregates: [
      { family: "critic-correction", count: 0, bound: 2 },
      { family: "delta-regate", count: 0, bound: 2 },
      { family: "product-retry", count: 0, bound: 1 },
      { family: "environment-failover", count: 0, bound: 1 },
    ],
  };
}

function mermaidNodeIdForEvent(mermaid, eventId) {
  const definition = mermaid.split("\n").find((line) => line.includes(eventId) && line.includes("["));
  assert(definition, `expected a rendered node definition for ${eventId}`);
  const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*\[/.exec(definition);
  assert(match, `expected a stable Mermaid node ID for ${eventId}: ${definition}`);
  return match[1];
}

test("a complete v2 chronological graph validates", () => {
  assertValid(v2Graph());
});

test("v2 loop-family bounds are fixed at 2/2/1/1 and cannot be caller-raised", () => {
  const graph = v2Graph();
  assert.deepEqual(
    graph.loopAggregates.map(({ family, bound }) => [family, bound]),
    [
      ["critic-correction", 2],
      ["delta-regate", 2],
      ["product-retry", 1],
      ["environment-failover", 1],
    ],
  );
  assertValid(graph);

  for (const family of graph.loopAggregates.map(({ family }) => family)) {
    const raised = v2Graph();
    raised.loopAggregates.find((entry) => entry.family === family).bound += 1;
    assertInvalid(raised, new RegExp(`${family}|bound|fixed|2/2/1/1`, "i"));
  }
});

test("product retry count is derived from a second work attempt", () => {
  assertValid(retryGraph());

  const hiddenRetry = retryGraph();
  hiddenRetry.loopAggregates.find(({ family }) => family === "product-retry").count = 0;
  assertInvalid(hiddenRetry, /product-retry|work attempt|count/i);

  const fabricatedRetry = v2Graph();
  fabricatedRetry.loopAggregates.find(({ family }) => family === "product-retry").count = 1;
  assertInvalid(fabricatedRetry, /product-retry|work attempt|count/i);
});

test("a recurring equal product signature requires a later course event", () => {
  assertValid(retryGraph({ repeatedFailure: true, includeLaterCourse: true }));

  const missingCourse = retryGraph({ repeatedFailure: true });
  assertInvalid(missingCourse, /product|signature|course|recurr|second/i);

  const earlyCourse = retryGraph({ repeatedFailure: true, includeLaterCourse: true });
  const courseIndex = earlyCourse.events.findIndex(({ stage }) => stage === "course");
  const [course] = earlyCourse.events.splice(courseIndex, 1);
  earlyCourse.events.unshift(course);
  resequenceSingleCycle(earlyCourse);
  assertInvalid(earlyCourse, /product|signature|course|later|order/i);
});

test("an unrelated package course cannot satisfy alpha's recurring product failure", () => {
  const unrelatedCourse = retryGraphWithUnrelatedCourse();
  assertInvalid(unrelatedCourse, /product|signature|course|package-alpha|action-alpha|cycle-alpha|matching/i);

  const matchingAlphaCourse = retryGraph({ repeatedFailure: true, includeLaterCourse: true });
  assertValid(matchingAlphaCourse);
  const course = matchingAlphaCourse.events.find(({ stage }) => stage === "course");
  assert.deepEqual(
    [course.packageId, course.actionId, course.cycleId],
    ["package-alpha", "action-alpha", "cycle-alpha-01"],
  );
});

test("relabeling the repeated product retry as unknown cannot evade the course gate", () => {
  const relabeledRetry = retryGraph({ repeatedFailure: true });
  const [, secondWorkAttempt] = relabeledRetry.events.filter(({ stage }) => stage === "work");
  assert.equal(secondWorkAttempt.failureSignature, relabeledRetry.events[0].failureSignature);
  secondWorkAttempt.faultDomain = "unknown";
  assertInvalid(relabeledRetry, /product|signature|unknown|course|relabel|recurr/i);

  const sameDomainWithCourse = retryGraph({ repeatedFailure: true, includeLaterCourse: true });
  assertValid(sameDomainWithCourse);
  assert.deepEqual(
    sameDomainWithCourse.events.filter(({ stage }) => stage === "work").map(({ faultDomain }) => faultDomain),
    ["product", "product"],
  );
});

test("environment failover is one-shot and a second failover fails", () => {
  assertValid(failoverGraph(1));
  assertInvalid(failoverGraph(2), /environment-failover|failover|one-shot|bound/i);
});

test("v2 events have a closed shape", () => {
  const graph = v2Graph();
  graph.events[0].rawMessage = "untrusted provider prose";
  assertInvalid(graph, /event|closed|unexpected|additional|rawMessage/i);
});

test("v2 graphs have a closed top-level shape", () => {
  const graph = v2Graph();
  graph.resultNarrative = "close looked fine according to free-form prose";
  assertInvalid(graph, /graph|closed|unexpected|additional|resultNarrative/i);
});

test("executed graph validation rejects empty and malformed v2 envelopes", () => {
  const empty = {
    schemaVersion: "pipeline.sdlc-run-graph.v2",
    featureId: "phase3a-empty-fixture",
    completionClaim: "phase-close",
    cycles: [],
    events: [],
    loopAggregates: [
      { family: "critic-correction", count: 0, bound: 2 },
      { family: "delta-regate", count: 0, bound: 2 },
      { family: "product-retry", count: 0, bound: 1 },
      { family: "environment-failover", count: 0, bound: 1 },
    ],
  };
  assertInvalid(empty, /empty|cycle|event|phase-close|terminal/i);

  const malformed = v2Graph();
  malformed.cycles = "not-a-cycle-array";
  malformed.events = { fabricated: true };
  let outcome;
  assert.doesNotThrow(() => { outcome = validateSdlcRunGraph(malformed); });
  assert.equal(outcome?.ok, false);
  assert.equal(Array.isArray(outcome?.findings), true);
});

test("the stage and outcome vocabularies are closed", () => {
  const badStage = v2Graph();
  badStage.events[0].stage = "invented-stage";
  assertInvalid(badStage, /stage/i);

  const badOutcome = v2Graph();
  badOutcome.events[0].outcome = "probably-passed";
  assertInvalid(badOutcome, /outcome/i);
});

test("event IDs are unique and monotonically ordered", () => {
  const duplicate = v2Graph();
  duplicate.events[1].eventId = duplicate.events[0].eventId;
  duplicate.cycles[0].eventIds[1] = duplicate.events[0].eventId;
  assertInvalid(duplicate, /event.*(?:unique|duplicate|order)|duplicate.*event/i);

  const reversed = v2Graph();
  [reversed.events[0], reversed.events[1]] = [reversed.events[1], reversed.events[0]];
  assertInvalid(reversed, /event.*(?:monotonic|order)|order.*event/i);
});

test("interleaved cycle events validate and render in their exact original global order", () => {
  const graph = interleavedGraph();
  assertValid(graph);
  const mermaid = renderSdlcMermaidV2(graph);
  let previousOffset = -1;
  for (const { eventId } of graph.events) {
    const offset = mermaid.indexOf(eventId);
    assert(offset > previousOffset,
      `${eventId} must render after the preceding global event, not grouped by cycle`);
    previousOffset = offset;
  }
});

test("distinct valid event IDs never collide into one Mermaid node or a self-loop", () => {
  const graph = interleavedGraph();
  const replacements = new Map([
    [graph.events.at(-2).eventId, "event-1"],
    [graph.events.at(-1).eventId, "event.1"],
  ]);
  for (const entry of graph.events.slice(-2)) entry.eventId = replacements.get(entry.eventId);
  for (const cycle of graph.cycles) {
    cycle.eventIds = cycle.eventIds.map((eventId) => replacements.get(eventId) ?? eventId);
  }
  assertValid(graph);
  const mermaid = renderSdlcMermaidV2(graph);
  const hyphenNode = mermaidNodeIdForEvent(mermaid, "event-1");
  const dotNode = mermaidNodeIdForEvent(mermaid, "event.1");
  assert.notEqual(hyphenNode, dotNode, "punctuation-distinct event IDs must not sanitize to one node");
  for (const nodeId of [hyphenNode, dotNode]) {
    const selfLoop = new RegExp(`\\b${nodeId}\\b\\s*(?:-->|---|-.->).*\\b${nodeId}\\b`);
    assert.equal(mermaid.split("\n").some((line) => selfLoop.test(line)), false,
      `${nodeId} must not acquire a renderer-created self-loop`);
  }
});

test("sequences are strict integers ordered within each cycle", () => {
  const duplicateSequence = v2Graph();
  duplicateSequence.events[1].sequence = 0;
  assertInvalid(duplicateSequence, /sequence|order/i);

  const fractionalSequence = v2Graph();
  fractionalSequence.events[1].sequence = 1.5;
  assertInvalid(fractionalSequence, /sequence|integer/i);
});

test("cycle IDs are unique and cannot be reused to reset ordering or a bound", () => {
  const graph = v2Graph();
  graph.cycles.push({
    cycleId: graph.cycles[0].cycleId,
    packageId: "package-beta",
    sequence: 1,
    eventIds: [],
  });
  assertInvalid(graph, /cycle.*(?:unique|duplicate|reuse)|duplicate.*cycle/i);
});

test("cycle inventories exactly preserve their ordered event membership", () => {
  const missing = v2Graph();
  missing.cycles[0].eventIds.splice(3, 1);
  assertInvalid(missing, /cycle.*event|event.*cycle|membership/i);

  const reordered = v2Graph();
  [reordered.cycles[0].eventIds[0], reordered.cycles[0].eventIds[1]] =
    [reordered.cycles[0].eventIds[1], reordered.cycles[0].eventIds[0]];
  assertInvalid(reordered, /cycle.*(?:order|event)|event.*order/i);
});

test("an event cannot claim a missing or different cycle", () => {
  const graph = v2Graph();
  graph.events[2].cycleId = "cycle-fabricated";
  assertInvalid(graph, /cycle/i);
});

test("commit-bound stages require both a candidate commit and tree", () => {
  const commitBoundStages = [
    "work", "stage-verify", "critic", "correction", "delta-regate",
    "intent", "state-cas", "final-verify", "delivery", "fetch-back", "close",
  ];
  for (const stage of commitBoundStages) {
    const withoutCommit = v2Graph();
    delete withoutCommit.events.find((entry) => entry.stage === stage).candidateCommit;
    assertInvalid(withoutCommit, /candidateCommit|commit/i);

    const withoutTree = v2Graph();
    delete withoutTree.events.find((entry) => entry.stage === stage).tree;
    assertInvalid(withoutTree, /tree/i);
  }
});

test("commit and tree bindings reject malformed or half-null values", () => {
  const malformedCommit = v2Graph();
  malformedCommit.events[1].candidateCommit = "HEAD";
  assertInvalid(malformedCommit, /candidateCommit|commit/i);

  const malformedTree = v2Graph();
  malformedTree.events[1].tree = null;
  assertInvalid(malformedTree, /tree/i);
});

test("phase-close cannot be projected from work alone", () => {
  const graph = v2Graph();
  graph.events = graph.events.slice(0, 1);
  graph.cycles[0].eventIds = graph.events.map(({ eventId }) => eventId);
  graph.loopAggregates.forEach((aggregate) => { aggregate.count = 0; });
  assertInvalid(graph, /phase-close|final-verify|delivery|fetch-back|close|terminal/i);
});

test("phase-close requires an ordered successful final-verify/delivery/fetch-back/close tail", () => {
  const outOfOrder = v2Graph();
  const finalVerify = outOfOrder.events.find(({ stage }) => stage === "final-verify");
  const delivery = outOfOrder.events.find(({ stage }) => stage === "delivery");
  [finalVerify.stage, delivery.stage] = [delivery.stage, finalVerify.stage];
  assertInvalid(outOfOrder, /final-verify|delivery|fetch-back|close|order/i);

  for (const stage of ["final-verify", "delivery", "fetch-back", "close"]) {
    const failed = v2Graph();
    failed.events.find((entry) => entry.stage === stage).outcome = "failed";
    assertInvalid(failed, new RegExp(`${stage}|phase-close|succeeded|outcome`, "i"));
  }
});

test("every v2 event carries non-empty, duplicate-free immutable source evidence IDs", () => {
  const empty = v2Graph();
  empty.events[0].sourceEvidenceIds = [];
  assertInvalid(empty, /sourceEvidenceIds|source evidence/i);

  const duplicate = v2Graph();
  duplicate.events[0].sourceEvidenceIds = ["evidence-event-001", "evidence-event-001"];
  assertInvalid(duplicate, /sourceEvidenceIds|source evidence|duplicate/i);

  const rawPayload = v2Graph();
  rawPayload.events[0].sourceEvidenceIds = [{ message: "raw prose" }];
  assertInvalid(rawPayload, /sourceEvidenceIds|source evidence/i);
});

test("fault metadata is digest-bound, paired and permitted only where applicable", () => {
  const incomplete = v2Graph();
  incomplete.events[2].faultDomain = "product";
  assertInvalid(incomplete, /failureSignature|fault/i);

  const rawFailure = v2Graph();
  rawFailure.events[2].faultDomain = "product";
  rawFailure.events[2].failureSignature = "tests failed because secret prose says so";
  rawFailure.events[2].outcome = "failed";
  assertInvalid(rawFailure, /failureSignature|digest|fault/i);

  const inapplicable = v2Graph();
  inapplicable.events.at(-1).faultDomain = "product";
  inapplicable.events.at(-1).failureSignature = SHA256("f");
  assertInvalid(inapplicable, /fault|applicable|close/i);
});

test("Mermaid v2 is byte-deterministic for identical graph bytes", () => {
  const graph = v2Graph();
  const first = renderSdlcMermaidV2(graph);
  const second = renderSdlcMermaidV2(JSON.parse(JSON.stringify(graph)));
  assert.equal(first, second);
  assert.equal(first.endsWith("\n"), true);
  assert.equal(first.includes("\r"), false);
});

test("Mermaid emits one count-and-bound aggregate per loop family", () => {
  const mermaid = renderSdlcMermaidV2(v2Graph());
  const lines = mermaid.split("\n");
  const expected = new Map([
    ["critic-correction", [1, 2]],
    ["delta-regate", [1, 2]],
    ["product-retry", [0, 1]],
    ["environment-failover", [0, 1]],
  ]);
  for (const [family, [count, bound]] of expected) {
    const aggregates = lines.filter((line) => line.includes(family)
      && new RegExp(`count[^0-9]*${count}(?:[^0-9]|$)`, "i").test(line)
      && new RegExp(`bound[^0-9]*${bound}(?:[^0-9]|$)`, "i").test(line));
    assert.equal(aggregates.length, 1, `${family} must have exactly one count/bound aggregate edge`);
  }
});

test("Mermaid keeps product retry, failover, course and terminal stop explicit", () => {
  const mermaid = renderSdlcMermaidV2(v2Graph());
  for (const branch of ["product-retry", "failover", "course", "terminal-stop"]) {
    assert.match(mermaid, new RegExp(branch, "i"));
  }
});

test("Mermaid consumes only the validated graph and never injects Result prose", () => {
  const poison = "POISON_RESULT_PROSE_SHOULD_NEVER_RENDER";
  const mermaid = renderSdlcMermaidV2(v2Graph(), {
    narrative: `${poison}\n  injected[\"fabricated chronology\"]`,
  });
  assert.equal(mermaid.includes(poison), false);
  assert.equal(mermaid.includes("fabricated chronology"), false);
  assert.equal(mermaid.includes("evidence-event-001"), false);
});

test("the renderer fails closed instead of projecting a malformed v2 graph", () => {
  const graph = v2Graph();
  graph.events[0].sourceEvidenceIds = [];
  assert.throws(() => renderSdlcMermaidV2(graph), /source|invalid|graph/i);
});

test("graph validation never throws for null, primitive or malformed collection inputs", () => {
  const malformedInputs = [
    null,
    false,
    7,
    "pipeline.sdlc-run-graph.v2",
    [],
    {},
    { schemaVersion: "pipeline.sdlc-run-graph.v2", cycles: null, events: [], loopAggregates: [] },
    { schemaVersion: "pipeline.sdlc-run-graph.v2", cycles: [], events: null, loopAggregates: [] },
    { schemaVersion: "pipeline.sdlc-run-graph.v2", cycles: [], events: [], loopAggregates: null },
    { ...v2Graph(), cycles: [null] },
    { ...v2Graph(), events: [null] },
  ];
  for (const input of malformedInputs) {
    let outcome;
    assert.doesNotThrow(() => { outcome = validateSdlcRunGraph(input); });
    assert.equal(outcome?.ok, false, `malformed input must fail closed: ${String(input)}`);
    assert.equal(Array.isArray(outcome?.findings), true);
  }
});

test("graph validation fails closed without throwing on malformed sources and non-finite numbers", () => {
  const malformedGraphs = [];
  for (const sources of [null, "evidence-event-001", [null], ["evidence-event-001", Infinity]]) {
    const graph = v2Graph();
    graph.events[0].sourceEvidenceIds = sources;
    malformedGraphs.push(graph);
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    const eventNumber = v2Graph();
    eventNumber.events[0].sequence = value;
    malformedGraphs.push(eventNumber);
    const cycleNumber = v2Graph();
    cycleNumber.cycles[0].sequence = value;
    malformedGraphs.push(cycleNumber);
  }
  for (const graph of malformedGraphs) {
    let outcome;
    assert.doesNotThrow(() => { outcome = validateSdlcRunGraph(graph); });
    assert.equal(outcome?.ok, false);
    assert.equal(Array.isArray(outcome?.findings), true);
  }
});

test("historical v1 remains readable without mutating its object or bytes", () => {
  const graph = legacyV1Graph();
  const sourceBytes = `${JSON.stringify(graph, null, 2)}\n`;
  const frozen = deepFreeze(graph);
  const before = JSON.stringify(frozen);
  const outcome = validateSdlcRunGraph(frozen);
  assert.equal(outcome.ok, true, JSON.stringify(outcome.findings));
  assert.equal(JSON.stringify(frozen), before);
  assert.equal(`${JSON.stringify(frozen, null, 2)}\n`, sourceBytes);
});

test("v1 compatibility does not reinterpret historical counters", () => {
  const graph = legacyV1Graph();
  const criticCorrection = graph.boundedFamilies.find(({ family }) => family === "critic-correction");
  criticCorrection.count = 19;
  criticCorrection.disposition = "executed";
  const deltaRegate = graph.boundedFamilies.find(({ family }) => family === "delta-regate");
  deltaRegate.count = 20;
  deltaRegate.disposition = "executed";
  const before = JSON.stringify(graph.boundedFamilies);
  const outcome = validateSdlcRunGraph(graph);
  assert.equal(outcome.ok, true, JSON.stringify(outcome.findings));
  assert.equal(JSON.stringify(graph.boundedFamilies), before);
  assert.equal(graph.boundedFamilies[1].count, 19);
  assert.equal(graph.boundedFamilies[2].count, 20);
});

process.stdout.write(`1..${passed}\n`);
