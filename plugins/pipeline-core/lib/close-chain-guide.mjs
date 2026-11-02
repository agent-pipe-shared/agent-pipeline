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

// What the next step still lacks, given the transition values supplied so far. Pure; the transition's own refusals stay authoritative.
export function missingCloseInputs(phase, values) {
  const need = CLOSE_STEP_REQUIREMENTS[phase];
  if (!need) return ["unknown phase"];
  const missing = need.requires.filter((key) => typeof values?.[key] !== "string" || values[key] === "");
  if (need.needsAuthorized && values?.authorized !== true) missing.push("authorized");
  return missing;
}
