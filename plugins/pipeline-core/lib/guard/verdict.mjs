// SPDX-License-Identifier: SUL-1.0
// Guard module "verdict" (layer 1), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { READY_RECEIPT_KEYS } from "./constants.mjs";

export function verdict(exitCode, stderr = "") {
  return { exitCode, stderr };
}

/**
 * Carry every consumed-capability notice onto whatever verdict the remaining checks
 * produced, admission or refusal alike (NOVA-LCR-HGO-2's rule, generalized from one lift
 * to the list). A capability consumed here and then refused by a later check stays spent --
 * consumeHumanGuardOverride() marked it "consumed" on disk, with its own audit entry,
 * before this function ever runs -- so the consumption must be visible in the output rather
 * than vanish behind the refusal that actually decided the outcome. With no lifts this is
 * the identity function, which is what keeps every unlifted verdict byte-identical.
 */
export function withLifts(lifts, result) {
  if (lifts.length === 0) return result;
  return verdict(result.exitCode, `${lifts.map((lift) => lift.stderr).join("")}${result.stderr ?? ""}`);
}

export function exactReadyReceipt(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(READY_RECEIPT_KEYS)
    && value.schema === "pipeline.project-onboarding-ready-gate.v1"
    && value.status === "ready"
    && value.intent === "session";
}

// Hoisted for the same reason GRAMMAR_DENIAL_GUIDANCE is: the HGO request/capability is
// bound to the exact denial reason string, so the text the denial prints and the text the
// route binds must be one constant, never two copies that can drift.
export const CROSS_REPO_DENIAL_CODE = "GUARD-CROSS-REPO-MUTATION";

export const CROSS_REPO_DENIAL_GUIDANCE = "A governed consumer session may write only inside its own physical project root.";

export function crossRepositoryMutationBlocked(overrideGuidance = "") {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${CROSS_REPO_DENIAL_CODE}: `
      + `${CROSS_REPO_DENIAL_GUIDANCE}\n`
      + "Pipeline source, another repository, marketplace metadata, cachebuster updates, "
      + "and plugin installation require a separate session rooted at the exact target "
      + "plus their own explicit PO authorization.\n"
      + overrideGuidance,
  );
}

// The acknowledgement marker records a human decision and is written only by
// `bootstrap-acknowledge-apply` after its chat/signature-specific evidence has
// been checked.  It must stay writer-owned even if an agent deliberately
// discards or reopens surrounding state: otherwise the agent can write the
// marker first and route around the configured signature ceremony.
export function bootstrapAcknowledgementMarkerBlocked() {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + "GUARD-BOOTSTRAP-ACKNOWLEDGEMENT-WRITER-ONLY: the PRD acknowledgement marker is a human-approval record and may only be written by the exact bootstrap acknowledgement apply action after its configured proof is verified.\n"
      + "Do not add, restore, or hand-edit this marker. Re-run project-onboarding-v3 inspect and follow its exact acknowledgement action.\n",
  );
}
