// SPDX-License-Identifier: SUL-1.0
// The ordered remainder of the feature-close chain for one coordinator phase: what each next transition needs, who or what produces it
// and whether a human gate stands in front of it. Pure; the transitions themselves stay digest-bound plan/apply pairs in close-coordinator.mjs
// (its `drive` verb walks them one at a time), this module only names them. The requirement table mirrors transitionPlan() in that script and
// is pinned to it by close-chain-guide.test.mjs, so a changed requirement there turns the pin red instead of leaving this guide stale.

import { coordinatorNextPhases } from "../scripts/publication-close-journal.mjs";

export const CLOSE_CHAIN_SCHEMA = "pipeline.close-coordinator.chain.v1";

const PUBLICATION_RESULT = "pipeline.publication-executor-result.v1";

// phase -> what plan-transition needs for it.
//   requires        the transition values that must be supplied (architectureImpact | evidence | publication)
//   needsAuthorized the transition refuses without the explicit --authorized flag (a human-gate phase)
//   flags           the option spellings, for the human-readable hint
export const CLOSE_STEP_REQUIREMENTS = Object.freeze({
  checkpointed: {
    requires: [], needsAuthorized: false, flags: [], evidenceSchema: null, humanGate: false,
    producer: "the coordinator reads the active feature from pipeline state",
  },
  "feature-close-prepared": {
    requires: ["architectureImpact"], needsAuthorized: false,
    flags: ["--architecture-impact <typed impact>", "--continuity-close-request <path> (when the feature has one)", "--audit-request <path> --critic-verify-lifecycle <id> (required at rigor >= 1)"],
    evidenceSchema: "pipeline.feature-close-audit-request.v1", humanGate: false,
    producer: "the Critic/Verify lifecycle records and the audit request file; the plan prints the next action",
  },
  "tracked-close-finalized": {
    requires: ["evidence"], needsAuthorized: false, flags: ["--evidence <path>"],
    evidenceSchema: "pipeline.close-tracked-effects.v1", humanGate: false,
    producer: "the tracked close effects (result, backlog, handover, history, telemetry, retrospective, pipeline state) digested after the feature close",
  },
  "candidate-frozen": {
    requires: [], needsAuthorized: false, flags: [], evidenceSchema: null, humanGate: false,
    producer: "HEAD becomes the frozen candidate; from candidate-frozen the same phase renews the freeze to a descendant commit",
  },
  "final-verify-green": {
    requires: ["evidence"], needsAuthorized: false, flags: ["--evidence <path>"],
    evidenceSchema: "pipeline.close-final-verification.v1", humanGate: false,
    producer: "a green Verify and a green security scan, both for the frozen candidate",
  },
  "publication-authorized": {
    requires: ["evidence"], needsAuthorized: true, flags: ["--evidence <path>", "--authorized"],
    evidenceSchema: "pipeline.close-publication-authorization.v1", humanGate: true,
    producer: "the human's publication authorization for the frozen candidate",
  },
  published: {
    requires: ["publication"], needsAuthorized: false, flags: ["--publication <path>"],
    evidenceSchema: PUBLICATION_RESULT, humanGate: false,
    producer: "the fixed publication executor",
  },
  "readback-confirmed": {
    requires: ["publication"], needsAuthorized: false, flags: ["--publication <path>"],
    evidenceSchema: PUBLICATION_RESULT, humanGate: false,
    producer: "the fixed publication executor, read back against the destination",
  },
  "cleanup-complete": {
    requires: ["evidence"], needsAuthorized: false, flags: ["--evidence <path>"],
    evidenceSchema: "pipeline.close-cleanup-receipt.v1", humanGate: false,
    producer: "close-coordinator.mjs write-cleanup-receipt --root <root> --lifecycle <id> (the drive verb runs it for you)",
  },
  "closed-local": {
    requires: [], needsAuthorized: false, flags: [], evidenceSchema: null, humanGate: false,
    producer: "needs a complete cleanup receipt",
  },
  delivered: {
    requires: [], needsAuthorized: false, flags: [], evidenceSchema: null, humanGate: false,
    producer: "needs a complete cleanup receipt and the publication readback",
  },
  "release-eligible": {
    requires: ["evidence"], needsAuthorized: true, flags: ["--evidence <path>", "--authorized"],
    evidenceSchema: "pipeline.close-release-eligible-authorization.v1", humanGate: true,
    producer: "the human's release-eligibility authorization for the frozen candidate",
  },
  promoted: {
    requires: ["evidence"], needsAuthorized: true, flags: ["--evidence <path>", "--authorized"],
    evidenceSchema: "pipeline.close-promoted-authorization.v1", humanGate: true,
    producer: "the human's promotion authorization for the frozen candidate",
  },
});

const stepFor = (phase, root, lifecycle) => {
  const need = CLOSE_STEP_REQUIREMENTS[phase];
  return {
    phase,
    needs: need.flags,
    evidenceSchema: need.evidenceSchema,
    producer: need.producer,
    humanGate: need.humanGate,
    plan: `close-coordinator.mjs plan-transition --root ${root} --lifecycle ${lifecycle} --actor <name> --phase ${phase}${need.flags.length > 0 ? " <needs>" : ""}`,
  };
};

// The remainder of the chain from `phase`. Where the chain forks (final-verify-green may publish or go straight to cleanup, cleanup-complete
// ends in closed-local or delivered) the fork is reported as `alternatives` and the walk continues on the first branch of each fork.
export function describeCloseChain(phase, { root = "<root>", lifecycle = "<id>" } = {}) {
  const steps = [];
  const forks = [];
  const seen = new Set();
  let cursor = phase;
  for (;;) {
    const next = coordinatorNextPhases(cursor);
    if (next.length === 0 || seen.has(cursor)) break;
    seen.add(cursor);
    if (next.length > 1) forks.push({ after: cursor, alternatives: next });
    const chosen = next[0];
    steps.push(stepFor(chosen, root, lifecycle));
    cursor = chosen;
  }
  return {
    schema: CLOSE_CHAIN_SCHEMA,
    current: phase,
    remaining: steps,
    forks,
    note: "Every step is a digest-bound plan-transition then apply-transition pair; the drive verb runs one step per call, never a human-gate step without its authorization evidence.",
  };
}

export const CLOSE_ACTIONS_SCHEMA = "pipeline.close-coordinator.actions.v1";

// The Continuity Result steps that stand between `checkpointed` and `feature-close-prepared`, exactly as the close-feature SKILL orders them
// (section "Closing a feature with active Continuity", steps 3-5). `who` is read from that text: the reconcile signature is "PO only, in the PO's own
// terminal ... never executed by the pipeline"; the rest are run by the agent. Only refusals the SKILL itself names are listed in mayRefuseWith.
const CONTINUITY_RESULT_STEPS = Object.freeze([
  {
    id: "result-bootstrap-plan", who: "agent", mayRefuseWith: [],
    command: "node <plugin-root>/scripts/pipeline-state.mjs continuity-result-bootstrap-plan (run in the project root; read-only)",
    source: "close-feature SKILL, Continuity route step 3",
  },
  {
    id: "result-bootstrap-apply", who: "agent", mayRefuseWith: ["SDC-AUTHORITY-UNAVAILABLE", "COR-BINDING-HELD"],
    command: "the applyAction the plan returned (continuity-result-bootstrap-apply ... --activate); with a session-authority catalogue: node <plugin-root>/scripts/continuity-owner-route.mjs run --root <root> --lifecycle <id> -- continuity-result-bootstrap-apply <flags from applyAction.argv>",
    source: "close-feature SKILL, Continuity route step 3",
  },
  {
    id: "reconcile-signature", who: "po-only", mayRefuseWith: [],
    command: "the signatureCommand printed by the bootstrap completion (po-human-approval.mjs authorize-critical --kind feature-package-reconcile), run in the PO's own terminal",
    source: "close-feature SKILL, Continuity route step 4",
  },
  {
    id: "reconcile", who: "agent", mayRefuseWith: [],
    command: "the reconcileCommand printed by the bootstrap completion (pipeline-state.mjs feature-package-reconcile ...); needs the PO's own name and the requestPath, authorityPath and proofPath the signing terminal printed",
    source: "close-feature SKILL, Continuity route step 5",
  },
]);

// Everything the close still needs from `phase` as ONE ordered list: who does each step (agent | po-only | unclassified) and the command, ending in
// the next human gate and the one-line resume command. Pure and read-only. A step whose classification no source states is "unclassified".
export const PUSH_THREAT_MODEL_FILE = "project/push-threat-model.md";

// The Close commit carries the push threat model when the push gate needs one: prepare-push-subject binds the approval to that file, so a file
// materialized after the close would leave the tree dirty. `pushThreatModel` is { required, present } as read by the caller (this module stays
// pure); the action stands after the close artefacts are finalized and before the freeze, i.e. before the commit it belongs in. Currency is not checked.
export function pushThreatModelDue(pushThreatModel) {
  return pushThreatModel !== null && typeof pushThreatModel === "object" && pushThreatModel.required === true && pushThreatModel.present !== true;
}

// `qualityReadback` is the row list of closeQualityReadback() as read by the caller (this module stays pure). Every row that is "missing" becomes an agent
// action standing before the freeze with its remedy; "unknown" and "not-applicable" rows list nothing. It is advice, never a gate.
export function missingQualityRows(qualityReadback) {
  return Array.isArray(qualityReadback) ? qualityReadback.filter((r) => r !== null && typeof r === "object" && r.status === "missing") : [];
}

export function describeCloseActions(phase, { root = "<root>", lifecycle = "<id>", pushThreatModel = null, qualityReadback = null } = {}) {
  const actions = [];
  const push = (entry) => actions.push({ order: actions.length + 1, mayRefuseWith: [], ...entry });
  if (phase === "active") {
    push({ id: "checkpointed", who: "agent", command: stepFor("checkpointed", root, lifecycle).plan, source: "close-feature SKILL, Continuity route step 2" });
  }
  if (phase === "active" || phase === "checkpointed") for (const step of CONTINUITY_RESULT_STEPS) push({ ...step });
  const chain = describeCloseChain(phase, { root, lifecycle });
  for (const step of chain.remaining) {
    if (step.phase === "checkpointed") continue;
    if (step.phase === "candidate-frozen") {
      for (const quality of missingQualityRows(qualityReadback)) {
        push({
          id: `quality-${quality.id}`, who: "agent",
          command: quality.remedy ?? `no sanctioned command: produce the ${quality.id} artefact for this change`,
          source: "close-quality-readback (advice, not a gate)",
        });
      }
    }
    if (step.phase === "candidate-frozen" && pushThreatModelDue(pushThreatModel)) {
      push({
        id: "materialize-push-threat-model", who: "agent",
        command: "node <plugin-root>/scripts/pipeline-state.mjs materialize-push-threat-model",
        commitWith: PUSH_THREAT_MODEL_FILE,
        source: "close-feature SKILL, Close commit",
      });
    }
    const known = CLOSE_STEP_REQUIREMENTS[step.phase];
    push({
      id: step.phase,
      who: known === undefined ? "unclassified" : known.humanGate ? "po-only" : "agent",
      command: step.plan,
      source: "close-chain-guide CLOSE_STEP_REQUIREMENTS",
    });
  }
  const gate = actions.find((a) => a.who === "po-only");
  return {
    schema: CLOSE_ACTIONS_SCHEMA,
    current: phase,
    actions,
    nextHumanGate: gate === undefined ? null : gate.id,
    resumeCommand: `close-coordinator.mjs drive --root ${root} --lifecycle ${lifecycle} --actor <name>`,
    note: "Stop cleanly at nextHumanGate; after the human step, call the resume command again: drive continues from the stored coordinator phase.",
  };
}

// What the next step still lacks, given the transition values supplied so far. Pure; the transition's own refusals stay authoritative.
export function missingCloseInputs(phase, values) {
  const need = CLOSE_STEP_REQUIREMENTS[phase];
  if (!need) return ["unknown phase"];
  const missing = need.requires.filter((key) => typeof values?.[key] !== "string" || values[key] === "");
  if (need.needsAuthorized && values?.authorized !== true) missing.push("authorized");
  return missing;
}
