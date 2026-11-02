// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { COORDINATOR_PHASES, coordinatorNextPhases } from "../scripts/publication-close-journal.mjs";
import { PUBLICATION_EXECUTOR_RESULT_SCHEMA } from "../scripts/publication-executor.mjs";
import { CLOSE_CHAIN_SCHEMA, CLOSE_STEP_REQUIREMENTS, describeCloseChain, missingCloseInputs } from "./close-chain-guide.mjs";

const COORDINATOR_SOURCE = readFileSync(fileURLToPath(new URL("../scripts/close-coordinator.mjs", import.meta.url)), "utf8");

test("every phase the coordinator can move to has exactly one requirement entry, and nothing else does", () => {
  const reachable = new Set(COORDINATOR_PHASES.flatMap((phase) => coordinatorNextPhases(phase)));
  assert.deepEqual([...reachable].sort(), Object.keys(CLOSE_STEP_REQUIREMENTS).sort());
});

test("a human-gate phase is exactly a phase that needs the explicit authorized flag", () => {
  for (const [phase, need] of Object.entries(CLOSE_STEP_REQUIREMENTS)) {
    assert.equal(need.needsAuthorized, need.humanGate, `${phase}: humanGate and needsAuthorized must agree`);
  }
  assert.deepEqual(Object.entries(CLOSE_STEP_REQUIREMENTS).filter(([, need]) => need.humanGate).map(([phase]) => phase).sort(),
    ["promoted", "publication-authorized", "release-eligible"]);
});

test("the evidence schemas the guide names are the ones the coordinator's transition plan checks", () => {
  for (const [phase, need] of Object.entries(CLOSE_STEP_REQUIREMENTS)) {
    if (need.evidenceSchema === null) continue;
    if (phase === "published" || phase === "readback-confirmed") {
      assert.equal(need.evidenceSchema, PUBLICATION_EXECUTOR_RESULT_SCHEMA, `${phase}: the publication phases read the executor result`);
      continue;
    }
    const templated = /^pipeline\.close-(release-eligible|promoted)-authorization\.v1$/u.test(need.evidenceSchema);
    const needle = templated ? "`pipeline.close-${values.phase}-authorization.v1`" : need.evidenceSchema;
    assert.ok(COORDINATOR_SOURCE.includes(needle), `${phase}: the coordinator source no longer names ${need.evidenceSchema}`);
  }
  assert.ok(COORDINATOR_SOURCE.includes("PUBLICATION_EXECUTOR_RESULT_SCHEMA"), "the publication phases are checked against the executor result schema");
});

test("the chain from a phase lists the remaining transitions in coordinator order and reports the forks", () => {
  const chain = describeCloseChain("candidate-frozen", { root: "/r", lifecycle: "close-x" });
  assert.equal(chain.schema, CLOSE_CHAIN_SCHEMA);
  assert.equal(chain.current, "candidate-frozen");
  assert.equal(chain.remaining[0].phase, "final-verify-green");
  assert.ok(chain.remaining.every((step) => step.plan.includes("--root /r --lifecycle close-x")));
  assert.deepEqual(chain.forks.map((fork) => fork.after), ["final-verify-green", "cleanup-complete"]);
  assert.deepEqual(chain.forks[0].alternatives, ["publication-authorized", "cleanup-complete"]);
  assert.equal(describeCloseChain("promoted").remaining.length, 0);
});

test("the missing inputs of a step are named from the supplied values", () => {
  assert.deepEqual(missingCloseInputs("checkpointed", {}), []);
  assert.deepEqual(missingCloseInputs("feature-close-prepared", {}), ["architectureImpact"]);
  assert.deepEqual(missingCloseInputs("final-verify-green", { evidence: "e.json" }), []);
  assert.deepEqual(missingCloseInputs("final-verify-green", {}), ["evidence"]);
  assert.deepEqual(missingCloseInputs("published", { publication: "p.json" }), []);
  assert.deepEqual(missingCloseInputs("publication-authorized", { evidence: "e.json" }), ["authorized"]);
  assert.deepEqual(missingCloseInputs("not-a-phase", {}), ["unknown phase"]);
});
