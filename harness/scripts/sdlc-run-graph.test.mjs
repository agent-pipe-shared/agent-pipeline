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
      { family: "product-retry", count: 1, bound: 1 },
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

test("a complete v2 chronological graph validates", () => {
  assertValid(v2Graph());
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
    ["product-retry", [1, 1]],
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
  graph.boundedFamilies.find(({ family }) => family === "critic-correction").count = 19;
  graph.boundedFamilies.find(({ family }) => family === "delta-regate").count = 20;
  const before = JSON.stringify(graph.boundedFamilies);
  const outcome = validateSdlcRunGraph(graph);
  assert.equal(outcome.ok, true, JSON.stringify(outcome.findings));
  assert.equal(JSON.stringify(graph.boundedFamilies), before);
  assert.equal(graph.boundedFamilies[1].count, 19);
  assert.equal(graph.boundedFamilies[2].count, 20);
});

process.stdout.write(`1..${passed}\n`);
