#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import {
  DELIVERY_ATTEMPT_LIMIT,
  DELIVERY_COURSE_SCHEMA,
  DELIVERY_IMMEDIATE_GATE_CLASSES,
  decideDeliveryCourse,
  deliveryFailureSignature,
  validateDeliveryCourseGraphAnchor,
} from "./delivery-course.mjs";
import { sha256Canonical } from "./review-economy.mjs";

const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const AUTHORITY = Object.freeze({
  remote: "origin",
  ref: "refs/heads/main",
  force: false,
  credentialAuthority: "configured-push",
  writeRefs: ["refs/heads/main"],
});
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}
function binding(attempt) {
  return sha256Canonical({
    candidateCommit: attempt.candidateCommit,
    tree: attempt.tree,
    authority: attempt.authority,
  });
}
function failedAttempt(sequence, stableCode = `network-${sequence}`, failureClass = "retryable", overrides = {}) {
  const attempt = {
    attemptId: `attempt-${sequence}`,
    sequence,
    candidateCommit: COMMIT,
    tree: TREE,
    authority: structuredClone(AUTHORITY),
    outcome: "failed",
    failure: { class: failureClass, stableCode, bindingSha256: "" },
    ...overrides,
  };
  attempt.failure = { ...attempt.failure, bindingSha256: binding(attempt) };
  return attempt;
}
function succeededAttempt(sequence, overrides = {}) {
  return {
    attemptId: `attempt-${sequence}`,
    sequence,
    candidateCommit: COMMIT,
    tree: TREE,
    authority: structuredClone(AUTHORITY),
    outcome: "succeeded",
    failure: null,
    ...overrides,
  };
}
function course(attempts) {
  return {
    schema: DELIVERY_COURSE_SCHEMA,
    featureId: "storm-delivery",
    candidateCommit: COMMIT,
    tree: TREE,
    authority: structuredClone(AUTHORITY),
    attempts,
  };
}

const first = failedAttempt(1, "transient-network");
const firstDecision = decideDeliveryCourse(course([first]));
check("DC01 first classified retryable delivery failure admits only exact second attempt",
  firstDecision.ok && firstDecision.action === "retry" && firstDecision.nextAttemptSequence === 2
    && firstDecision.remainingAttempts === 2
    && JSON.stringify(firstDecision.authority) === JSON.stringify(AUTHORITY));

const repeated = failedAttempt(2, "transient-network");
const repeatedDecision = decideDeliveryCourse(course([first, repeated]));
check("DC02 second identical normalized failure signature opens a course gate without a blind third attempt",
  repeatedDecision.action === "course-gate" && repeatedDecision.code === "DC-REPEATED-SIGNATURE-COURSE-GATE"
    && repeatedDecision.retryProhibited === true && repeatedDecision.signature === deliveryFailureSignature(repeated.failure));

const different = failedAttempt(2, "different-network");
const secondDecision = decideDeliveryCourse(course([first, different]));
check("DC03 a second different classified failure may use the final bounded third attempt",
  secondDecision.action === "retry" && secondDecision.nextAttemptSequence === 3 && secondDecision.remainingAttempts === 1);

const third = failedAttempt(3, "third-network");
const thirdDecision = decideDeliveryCourse(course([first, different, third]));
check("DC04 three total classified delivery attempts exhaust the budget", 
  DELIVERY_ATTEMPT_LIMIT === 3 && thirdDecision.action === "course-gate" && thirdDecision.code === "DC-ATTEMPT-BUDGET-EXHAUSTED");

for (const failureClass of DELIVERY_IMMEDIATE_GATE_CLASSES) {
  const immediate = decideDeliveryCourse(course([failedAttempt(1, `${failureClass}-code`, failureClass)]));
  check(`DC05 ${failureClass} gates immediately`, immediate.action === "course-gate"
    && immediate.retryProhibited === true && immediate.code.includes("IMMEDIATE-GATE"));
}

for (const [name, mutate] of [
  ["remote", (attempt) => { attempt.authority.remote = "fork"; }],
  ["ref", (attempt) => { attempt.authority.ref = "refs/heads/release"; attempt.authority.writeRefs = ["refs/heads/release"]; }],
  ["force", (attempt) => { attempt.authority.force = true; }],
  ["credential authority", (attempt) => { attempt.authority.credentialAuthority = "broader-push"; }],
  ["write authority", (attempt) => { attempt.authority.writeRefs = ["refs/heads/main", "refs/heads/release"]; }],
]) {
  const changed = failedAttempt(2, `changed-${name.replaceAll(" ", "-")}`);
  mutate(changed);
  changed.failure.bindingSha256 = binding(changed);
  const decision = decideDeliveryCourse(course([first, changed]));
  check(`DC06 retry cannot change ${name}`, decision.action === "course-gate"
    && decision.code === "DC-AUTHORITY-OR-CANDIDATE-CHANGE" && decision.retryProhibited === true);
}

const candidateChanged = failedAttempt(2, "candidate-changed", "retryable", { candidateCommit: "c".repeat(40) });
candidateChanged.failure.bindingSha256 = binding(candidateChanged);
const candidateDecision = decideDeliveryCourse(course([first, candidateChanged]));
check("DC07 delivery retry cannot substitute a different candidate", candidateDecision.action === "course-gate"
  && candidateDecision.code === "DC-AUTHORITY-OR-CANDIDATE-CHANGE");

const success = decideDeliveryCourse(course([first, succeededAttempt(2)]));
check("DC08 a successful exact retry completes the delivery attempt record", success.ok && success.action === "complete" && success.attemptCount === 2);

const afterSuccess = decideDeliveryCourse(course([first, succeededAttempt(2), failedAttempt(3, "post-success")]));
check("DC09 attempts after a success fail closed", afterSuccess.ok === false && afterSuccess.code === "DC-ATTEMPT-AFTER-SUCCESS");

const anchored = validateDeliveryCourseGraphAnchor(course([first, succeededAttempt(2)]), {
  featureId: "storm-delivery", candidateCommit: COMMIT, tree: TREE,
});
const staleAnchor = validateDeliveryCourseGraphAnchor(course([first, succeededAttempt(2)]), {
  featureId: "storm-delivery", candidateCommit: "d".repeat(40), tree: TREE,
});
check("DC10 graph anchor binds the separately recorded delivery history to one graph candidate",
  anchored.ok && !staleAnchor.ok && staleAnchor.code === "DC-GRAPH-ANCHOR-DRIFT");

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
