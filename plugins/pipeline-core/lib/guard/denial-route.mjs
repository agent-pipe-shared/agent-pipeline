// SPDX-License-Identifier: SUL-1.0
// Guard module "denial-route" (layer 2), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isSessionCapabilityFailurePhase } from "../codex-onboarding-capabilities.mjs";
import { placeholder, renderHumanCopySafeCommand } from "../copy-safe-command.mjs";
import { consumeHumanGuardOverride, humanGuardRouteUnavailableReason, recordHumanGuardDenial } from "../human-guard-override.mjs";
import { readHumanApprovalMode } from "../critical-human-proof-policy.mjs";
import { CONTROLLING_NON_READY_STATUSES, INTAKE_LIFECYCLE_STATUSES, PARTIAL_LIFECYCLE_INCIDENT_REPORT_PATH, PARTIAL_LIFECYCLE_SCRATCH_DIR, PLUGIN_ROOT } from "./constants.mjs";
import { GRAMMAR_DENIAL_GUIDANCE, GRAMMAR_DENIAL_REMEDY, GRAMMAR_DENIAL_REMEDY_SHORT, READ_COMMAND_UNSUPPORTED_CODE, READ_COMMAND_UNSUPPORTED_GUIDANCE, READ_COMMAND_UNSUPPORTED_NOTE, READ_SCOPE_DENIAL_CODE, READ_SCOPE_DENIAL_GUIDANCE, READ_SCOPE_DENIAL_REMEDY } from "./grammar-denials.mjs";
import { verdict } from "./verdict.mjs";

export function blocked(
  code = "GUARD-LIFECYCLE-NOT-READY", lifecycleStatus = null, retryActions = [], overrideGuidance = "", rejectedElement = null,
  remediation = null, nearMissHint = null, observationInvalid = false, firstOccurrenceThisSession = true,
  sessionCapabilityFailurePhase = null,
) {
  const typedLifecycleStatus = code === "GUARD-LIFECYCLE-NOT-READY"
    && CONTROLLING_NON_READY_STATUSES.has(lifecycleStatus)
    ? lifecycleStatus
    : null;
  // Restored by NVA-B-READCONTAIN-1: the read-scope code is not keyed in
  // GRAMMAR_DENIAL_GUIDANCE (it must not print the grammar remedy -- the pipeline was never
  // the objection), so it is checked first and supplies its own true guidance/remedy.
  const readScope = code === READ_SCOPE_DENIAL_CODE;
  const readUnsupported = code === READ_COMMAND_UNSUPPORTED_CODE;
  const grammarReason = readScope ? READ_SCOPE_DENIAL_GUIDANCE
    : readUnsupported ? READ_COMMAND_UNSUPPORTED_GUIDANCE : GRAMMAR_DENIAL_GUIDANCE[code];
  if (grammarReason) {
    const retryEnvelope = {
      schema: "pipeline.guard-retry-actions.v1",
      retryActions,
    };
    // NVA-B-DENIALTRIM: every other caller of blocked() (every non-grammar denial code, and
    // every grammar-denial call site that does not compute a session-scoped first-occurrence
    // check) keeps the parameter defaulted to `true` -- full text, unconditionally -- so this
    // is additive only; nothing that does not opt in changes shape. The read-scope code never
    // had a short form pre-restoration and keeps its full, three-line true remedy every time --
    // only the three grammar codes (GUARD-PARSE-UNSUPPORTED / GUARD-OPERATOR-UNAPPROVED /
    // GUARD-REDIRECT-UNAPPROVED) trim on repeat.
    const remedyLines = readScope
      ? READ_SCOPE_DENIAL_REMEDY
      : readUnsupported
        ? [READ_COMMAND_UNSUPPORTED_NOTE, ...GRAMMAR_DENIAL_REMEDY]
        : (firstOccurrenceThisSession ? GRAMMAR_DENIAL_REMEDY : GRAMMAR_DENIAL_REMEDY_SHORT);
    return verdict(
      2,
      "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
        + `${code}: ${grammarReason}\n`
        + (rejectedElement ? `Rejected element: ${rejectedElement}.\n` : "")
        + (remediation ? `${remediation}\n` : "")
        + remedyLines.map((line) => `${line}\n`).join("")
        + `${JSON.stringify(retryEnvelope)}\n`
        + overrideGuidance,
    );
  }
  // NVA-T-READYKEYS: PORG-INVALID-OBSERVATION (the ready-gate could not validate the shape
  // of what project-onboarding-v3 returned) and a genuinely unresolved cause (no typed
  // lifecycle status at all, e.g. this guard's own root/governance resolution failing) used
  // to render as the SAME generic "not ready" message -- an operator whose project actually
  // IS ready read that as "the project is broken" and diagnosed the wrong thing. This names
  // which of the two occurred; it deliberately does not say how to bypass either.
  const guidance = typedLifecycleStatus === null
    ? (observationInvalid
      ? [
        "Pipeline session onboarding readiness was OBSERVED, but the observation failed the ready-gate's own shape validation (PORG-INVALID-OBSERVATION) -- this is not a report that the lifecycle is not ready.",
        "Re-run the typed project-onboarding-v3 session inspection and use only its returned nextAction.",
      ]
      : [
        "Pipeline-governed project writes require an exact V4 ready result for session intent.",
        "Re-run the typed project-onboarding-v3 session inspection and use only its returned nextAction.",
      ])
    : typedLifecycleStatus === "session-capability-unavailable" && isSessionCapabilityFailurePhase(sessionCapabilityFailurePhase)
      ? [
        `Pipeline session readiness is ${typedLifecycleStatus} (failed session probe phase: ${sessionCapabilityFailurePhase}).`,
        "Re-run the typed project-onboarding-v3 inspection and use only its returned nextAction.",
      ]
    : typedLifecycleStatus === "partial"
      ? [
        `Pipeline session readiness is ${typedLifecycleStatus}.`,
        "Re-run the typed project-onboarding-v3 inspection with intent session and use only its returned nextAction.",
        // NVA-LCREADONLY-2 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-
        // and-tmp-fallback.md): NVA-LCREADONLY-1 admitted this narrow diagnosis lane but never
        // named it in the denial a blocked session actually reads, so a stuck session had no
        // way to discover it existed. Named here, conditional on exactly `partial` -- every
        // other status keeps the two-line message above, unchanged.
        `A narrow diagnosis lane stays admitted while status is partial: creating the `
          + `repository's own ${PARTIAL_LIFECYCLE_SCRATCH_DIR} directory and writing exactly `
          + `${PARTIAL_LIFECYCLE_INCIDENT_REPORT_PATH} via Write or Edit.`,
      ]
      : INTAKE_LIFECYCLE_STATUSES.has(typedLifecycleStatus)
        ? [
          `Pipeline session readiness is ${typedLifecycleStatus}.`,
          "Re-run the typed project-onboarding-v3 inspection with intent session and use only its returned nextAction.",
          // NVA-GF-SCRATCH: named here so a session stuck at an intake status can discover the
          // lane without reading this guard's own source -- the same discoverability fix
          // NVA-LCREADONLY-2 already made for the `partial` lane above.
          `A scratch write stays admitted during intake: creating the repository's own `
            + `${PARTIAL_LIFECYCLE_SCRATCH_DIR} directory (mkdir or mkdir -p, including a nested `
            + `path inside it) and any Edit/Write/NotebookEdit write whose resolved path is `
            + `inside it.`,
        ]
        : [
          `Pipeline session readiness is ${typedLifecycleStatus}.`,
          "Re-run the typed project-onboarding-v3 inspection with intent session and use only its returned nextAction.",
        ];
  // NVA-MICRO-1: a near-miss resume-hint-input write (same file basename, wrong directory)
  // names the one correct path directly, before this falls through to the generic message
  // above -- a self-correctable agent error, not a case that needs the external-operator
  // ceremony. Only ever set by the restart-required near-miss call site below; every other
  // denial passes no hint and this stays a no-op.
  if (nearMissHint) guidance.push(nearMissHint);
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${code}: `
      + guidance.map((line) => `${line}\n`).join(""),
  );
}

/**
 * ADR-0059 Decision 3: wire the three closed-shell-grammar denial codes into the
 * EXISTING, already-working generic HGO Bash class (`eligibility()`'s
 * `commandClass: "closed-shell-exact"`) -- no new classification logic, this file is a
 * CONSUMER of that machinery. Always attempt to consume a matching capability first
 * (harmless: it only ever succeeds against a genuinely armed, matching one, regardless
 * of mode); when nothing is consumed, attempt to record the denial and offer the
 * mode-appropriate next step (Decision 4). Offering the route is a convenience, never a
 * gate: an unusable store leaves the refusal itself standing unchanged -- same pattern as
 * guard-testpath.mjs's `overrideGuidance` block, adapted to this file's own message
 * shape. Called by the three grammar codes and, since ADR-0059 Decision 6, by
 * GUARD-CROSS-REPO-MUTATION. GUARD-LIFECYCLE-NOT-READY never calls it: readiness is not a
 * human-liftable class, and no capability admits a session that never proved its bootstrap.
 *
 * What it does NOT leave unchanged any more is the silence. Both no-route outcomes --
 * planning threw, and planning returned a status other than `planned` -- print a bounded
 * typed reason via humanGuardRouteUnavailableReason(), because Decision 4's claim is that
 * every denial reports its next step, and "no next step, and no word about why" is the one
 * outcome that makes it untrue.
 *
 * The caller passes the exact denial reason text -- the SAME string the denial itself
 * prints for that code -- because the HGO request/capability is bound to this exact reason
 * string; a request planned for one code's reason will not match a differently-worded
 * denial for the same command.
 *
 * @param {string} code the typed denial code, printed in the admission audit line.
 * @param {string} reason the exact denial reason text the refusal prints, bound into the capability.
 * @param {string} subject short noun for humanGuardRouteUnavailableReason ("command", "write").
 */
export function humanOverrideRoute(code, reason, subject, root, toolName, toolInput, dependencies = {}) {
  const denials = [{ guard: "guard-lifecycle-ready.mjs", reason }];
  const consumeFn = dependencies.consumeHumanGuardOverrideFn ?? consumeHumanGuardOverride;
  let consumed = { status: "absent" };
  try {
    consumed = consumeFn({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
  } catch {
    consumed = { status: "absent" }; // an unusable capability is not an authorization
  }
  if (consumed.status === "consumed") {
    return {
      admitted: verdict(
        0,
        `[pipeline-human-override] guard-lifecycle-ready ${code}: exact one-time capability consumed; plan=${consumed.planSha256}.\n`,
      ),
    };
  }
  let overrideGuidance = "";
  let repeatOverrideGuidance = "";
  if (consumed.status === "absent" || consumed.status === "replan") {
    let approvalMode = "signature";
    try {
      if ((dependencies.readHumanApprovalModeFn ?? readHumanApprovalMode)(root, { legacyKind: "push" })?.mode === "chat") approvalMode = "chat";
    } catch { /* Keep the fail-closed signature posture. */ }
    try {
      const recordFn = dependencies.recordHumanGuardDenialFn ?? recordHumanGuardDenial;
      const planned = recordFn({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
      if (planned.status === "planned") {
        const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
        // Render only the request-bound plan action here. Its JSON supplies a
        // mode-specific nextAction; the signature preparation result supplies
        // the attended external sign-intent action and the in-session proof step.
        const inSessionPlatform = toolName === "PowerShell" ? "powershell" : "posix";
        const planCommand = renderHumanCopySafeCommand({
          label: "plan",
          executable: process.execPath,
          argv: [placeholder(JSON.stringify(script)), "plan", "--repo",
            placeholder(JSON.stringify(root)), "--request-sha256", planned.requestSha256],
          platform: inSessionPlatform,
        });
        overrideGuidance = [
          "",
          `Human override available for this exact ${subject} (one use; audited; the human confirms):`,
          planCommand.text,
          approvalMode === "chat"
            ? "The plan JSON gives the mode-specific nextAction; follow each returned action. The human confirms in-session; chat is attribution, not proof."
            : "The plan JSON gives the mode-specific nextAction; follow each returned action. The PO signs with a human-held Ed25519 key in an attended external terminal; this session only prepares digests and verifies the proof.",
          "",
        ].join("\n");
        // A repeated parser denial must stay directly actionable without dumping
        // the multi-shell ceremony again. The exact first recovery command remains
        // present and request-bound; its structured output supplies the next action.
        repeatOverrideGuidance = [
          "",
          `Human override remains available for this exact ${subject}; run this exact next command:`,
          planCommand.text,
          "Follow the plan JSON's mode-specific nextAction and each action it returns.",
          "",
        ].join("\n");
      } else {
        // ADR-0059 Decision 4: a denial that could not be routed must SAY so. Silence here
        // made this path indistinguishable from a denial that was never eligible for a
        // route at all -- see humanGuardRouteUnavailableReason()'s own header for what may
        // and may not appear in the rendered reason.
        overrideGuidance = ["", humanGuardRouteUnavailableReason(subject, { planned }), ""].join("\n");
      }
    } catch (error) {
      overrideGuidance = ["", humanGuardRouteUnavailableReason(subject, { error }), ""].join("\n");
    }
  }
  return { admitted: null, overrideGuidance, repeatOverrideGuidance };
}

export function externalRestartOnly() {
  return verdict(
    2,
    "EXTERNAL ACTION REQUIRED (guard-lifecycle-ready, plugin pipeline-core): "
      + "restart-process is external-terminal/user-copy-only and must never be executed through a Codex tool call.\n"
      + "Stop this session, show the exact lifecycle launch.copyCommand in a fenced code block, "
      + "and ask the user to run it in a real external terminal.\n",
  );
}

export function protectedStateWriterOnly() {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + "Pipeline State is writer-owned and must not be edited directly.\n"
      + "Use the exact sanctioned State or digest-bound lifecycle writer action.\n",
  );
}

// GUARD-LIFECYCLE-AUTHORITY-BOUND: same typed-refusal family as
// protectedStateWriterOnly() above, extended per backlog
// 2026-08-08-a-permitted-edit-drops-the-session-into-an-unrecoverable-readiness-class.md.
// A direct write to Pipeline State was already refused outright; a write to the
// currently bound PRD, its Spec, or its design input was admitted and only caught
// afterwards, by the continuity mutual-digest binding in
// onboarding-continuity.mjs (`observeDetailed`), which throws
// KICKOFF-PROMOTION-AUTHORITY-DRIFT / KICKOFF-PROMOTION-EVIDENCE-DRIFT and lands the
// session in the non-liftable `continuity-observation-unavailable` readiness class
// with no agent-executable exit. This closes the entrance instead of only detecting
// the fall afterwards. Direction 3 of that item -- the readiness class itself stays
// non-liftable -- is an explicit hard constraint this refusal does not touch: it
// prevents the drift, it does not offer any new way to lift the class once reached.
const AUTHORITY_DOCUMENT_BOUND_CODE = "GUARD-LIFECYCLE-AUTHORITY-BOUND";

export function protectedAuthorityDocumentWriteOnly(matchedRelativePath) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${AUTHORITY_DOCUMENT_BOUND_CODE}: this file is the currently bound authority `
      + "document (the promoted PRD, its Spec, or its design input) and must not be "
      + "edited directly while it is bound.\n"
      + `File: ${matchedRelativePath}\n`
      + "A direct edit here does not change the recorded binding -- it only drifts the "
      + "file out from under it, which the continuity check later reports as an "
      + "unavailable observation rather than as the edit that caused it.\n"
      + "The sanctioned route for a genuine planning change: run `reopen-design --by "
      + "<name>` to release the binding, make the edit, then rebind with `submit-plan "
      + "--by <name> --profile <epic|feature|mini>` and `approve-plan --by <name>`.\n"
      + "If the only problem is a missing/incorrect PO plan acknowledgement marker on an "
      + "otherwise-correct bound PRD, the narrower `po-authority-acknowledge-plan` / "
      + "`po-authority-acknowledge-apply` route (NVA-W4-2B) records the acknowledgement "
      + "without reopening design or editing the file directly.\n",
  );
}

/**
 * The write-time counterpart used by evaluateLifecycleReadyGuard() to decide
 * AUTHORITY_DOCUMENT_BOUND_CODE. Returns the matched relative path, or null when
 * the write target is not a currently bound authority document.
 *
 * The live binding is `continuity.authority.prd`/`.spec` in Pipeline State -- the
 * SAME live binding onboarding-continuity.mjs names as authoritative over the
 * private promotion-history record once a feature's design has ever been reopened
 * (its 2026-08-09 resolution note: "the live binding for an edited package is
 * `continuity.authority` plus `planApproval.poGateAuthority`"). The design input is
 * never itself named in Pipeline State; `promotionInput()` in
 * onboarding-continuity.mjs fixes it at promotion time as the sibling of the Spec
 * under the exact basename `design-input.md`, so it is derived here rather than
 * read from the private continuity history a second time at write time.
 *
 * `reopen-design` durably releases this binding until the next
 * `submit-plan`/`approve-plan` re-establishes it (recorded as `planInvalidation` on
 * State); a state carrying it is legitimately mid a sanctioned edit and is not
 * matched here -- matching it would refuse the very route this refusal names.
 *
 * Fails OPEN on anything absent, unreadable, unparseable, or short of the exact
 * shape expected: this is an additional, data-dependent write-time refusal layered
 * on top of the readiness gate that already runs after it, not the gate itself --
 * when nothing can be determined about the current binding, there is nothing yet
 * known to protect here, and the existing post-hoc continuity check is unchanged.
 */
export function boundAuthorityDocumentPath(root, requested) {
  for (const relativeStatePath of [join(".claude", "pipeline-state.json"), join("project", "pipeline-state.json")]) {
    let raw;
    try {
      raw = readFileSync(join(root, relativeStatePath), "utf8");
    } catch {
      continue; // absent here -- try the other installed-layout location
    }
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      return null; // present but unreadable -- nothing determinable, fail open
    }
    if (state === null || typeof state !== "object" || Array.isArray(state)) return null;
    if (state.planInvalidation !== null && typeof state.planInvalidation === "object") return null;
    if (state.activeFeature?.phase === "design" && state.planApproved !== true) return null;
    const authority = state.continuity?.authority;
    if (authority === null || typeof authority !== "object") return null;
    const prdPath = authority.prd?.path;
    const specPath = authority.spec?.path;
    if (typeof prdPath !== "string" || prdPath === "" || typeof specPath !== "string" || specPath === "") return null;
    const candidates = [
      prdPath,
      specPath,
      join(dirname(specPath), "design-input.md"),
      state.planApproval?.poGateAuthority?.planPath,
      state.planApproval?.poGateAuthority?.specPath,
    ].filter((p) => typeof p === "string" && p !== "");
    for (const candidate of candidates) {
      let candidateAbsolute;
      try {
        candidateAbsolute = resolve(root, candidate);
      } catch {
        continue;
      }
      if (candidateAbsolute === requested) return candidate;
    }
    return null;
  }
  return null;
}
