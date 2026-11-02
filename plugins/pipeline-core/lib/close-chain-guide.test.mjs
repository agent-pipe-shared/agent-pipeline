// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { COORDINATOR_PHASES, coordinatorNextPhases } from "../scripts/publication-close-journal.mjs";
import { PUBLICATION_EXECUTOR_RESULT_SCHEMA } from "../scripts/publication-executor.mjs";
import { CLOSE_ACTIONS_SCHEMA, CLOSE_CHAIN_SCHEMA, CLOSE_STEP_REQUIREMENTS, describeCloseActions, describeCloseChain, missingCloseInputs } from "./close-chain-guide.mjs";

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

test("AC-264: the action list names the Result bootstrap and the reconcile signature, each classified, and ends at the next human gate", () => {
  const list = describeCloseActions("checkpointed", { root: "/r", lifecycle: "close-x" });
  assert.equal(list.schema, CLOSE_ACTIONS_SCHEMA);
  const ids = list.actions.map((a) => a.id);
  const at = (id) => ids.indexOf(id);
  assert.ok(at("result-bootstrap-plan") >= 0 && at("result-bootstrap-apply") > at("result-bootstrap-plan"));
  assert.ok(at("reconcile-signature") > at("result-bootstrap-apply") && at("reconcile") > at("reconcile-signature"));
  assert.ok(at("feature-close-prepared") > at("reconcile"), "the Result and reconcile steps stand before feature-close-prepared");
  assert.equal(list.actions[at("reconcile-signature")].who, "po-only");
  assert.equal(list.actions[at("result-bootstrap-apply")].who, "agent");
  assert.ok(list.actions[at("result-bootstrap-apply")].mayRefuseWith.includes("SDC-AUTHORITY-UNAVAILABLE"));
  assert.ok(list.actions.every((a) => ["agent", "po-only", "unclassified"].includes(a.who) && typeof a.command === "string" && a.command !== ""));
  assert.ok(list.actions.every((a, i) => a.order === i + 1));
  assert.equal(list.nextHumanGate, "reconcile-signature");
  assert.match(list.resumeCommand, /close-coordinator\.mjs drive --root \/r --lifecycle close-x/u);
  const later = describeCloseActions("candidate-frozen", { root: "/r", lifecycle: "close-x" });
  assert.equal(later.actions.some((a) => a.id === "reconcile-signature"), false, "the Result steps are not listed once past checkpointed");
  assert.equal(later.nextHumanGate, "publication-authorized");
  assert.equal(later.actions.find((a) => a.id === "publication-authorized").who, "po-only");
  assert.equal(describeCloseActions("promoted").nextHumanGate, null);
});

test("AC-264: a required, missing push threat model is an agent action before the step that freezes the Close commit, with a commitWith marker", () => {
  const MATERIALIZE = "node <plugin-root>/scripts/pipeline-state.mjs materialize-push-threat-model";
  for (const phase of ["active", "checkpointed", "feature-close-prepared", "tracked-close-finalized"]) {
    const list = describeCloseActions(phase, { root: "/r", lifecycle: "close-x", pushThreatModel: { required: true, present: false } });
    const ids = list.actions.map((a) => a.id);
    const at = ids.indexOf("materialize-push-threat-model");
    assert.ok(at >= 0, `${phase}: the action is listed`);
    assert.ok(at < ids.indexOf("candidate-frozen"), `${phase}: it stands before the freeze that follows the Close commit`);
    if (ids.includes("tracked-close-finalized")) assert.ok(at > ids.indexOf("tracked-close-finalized"), `${phase}: after the close artefacts are finalized, in the same commit as them`);
    assert.equal(list.actions[at].who, "agent");
    assert.equal(list.actions[at].command, MATERIALIZE);
    assert.equal(list.actions[at].commitWith, "project/push-threat-model.md");
    assert.ok(list.actions.every((a, i) => a.order === i + 1), `${phase}: order stays contiguous`);
  }
  const base = describeCloseActions("tracked-close-finalized", { root: "/r", lifecycle: "close-x" }).actions.map((a) => a.id);
  const withIt = describeCloseActions("tracked-close-finalized", { root: "/r", lifecycle: "close-x", pushThreatModel: { required: true, present: false } });
  assert.deepEqual(withIt.actions.map((a) => a.id).filter((id) => id !== "materialize-push-threat-model"), base, "no other action moves or is added");
  assert.equal(withIt.nextHumanGate, "publication-authorized", "no new PO action is introduced");
});

test("AC-264: the threat-model action is absent when the file exists, when the gate does not require approval, or when the Close commit is already made", () => {
  const ids = (phase, pushThreatModel) => describeCloseActions(phase, { root: "/r", lifecycle: "close-x", pushThreatModel }).actions.map((a) => a.id);
  assert.equal(ids("checkpointed", { required: true, present: true }).includes("materialize-push-threat-model"), false);
  assert.equal(ids("checkpointed", { required: false, present: false }).includes("materialize-push-threat-model"), false);
  assert.equal(ids("checkpointed", undefined).includes("materialize-push-threat-model"), false);
  assert.equal(ids("candidate-frozen", { required: true, present: false }).includes("materialize-push-threat-model"), false);
  assert.equal(ids("final-verify-green", { required: true, present: false }).includes("materialize-push-threat-model"), false);
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
