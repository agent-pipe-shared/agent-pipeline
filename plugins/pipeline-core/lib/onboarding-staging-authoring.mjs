// SPDX-License-Identifier: SUL-1.0
/**
 * NVA-GS15-1: shared predicate for the one narrow Edit/Write admission that lets a real
 * session author/review the freshly generated staging PRD/spec before bootstrap-bind-apply
 * can bind it (NVA-BL-INTAKEBIND-1, backlog: 2026-08-19-material-intake-bootstrap-bind-has-
 * no-sanctioned-path-to-a-passing-plan-gate.md; design.md SSa.4/SSc.3). Moved out of
 * guard-lifecycle-ready.mjs so a SECOND guard (guard-gate-strength.mjs, GS-15) can share the
 * identical predicate instead of defining its own and drifting from it -- the two guards
 * previously disagreed on this exact write (guard-lifecycle-ready.mjs admitted it,
 * guard-gate-strength.mjs refused it as GS-15), deadlocking the greenfield onboarding happy
 * path: the PO's `po-plan-acknowledged` marker could never actually be written.
 *
 * `isBootstrapBindingStagingAuthoringWrite` is the exact shape/tool/path predicate, moved
 * VERBATIM in behaviour from guard-lifecycle-ready.mjs.
 * `bootstrapBindingStagingAuthoringAdmitted` adds the second, checkpoint-backed condition
 * guard-gate-strength.mjs needs on its own: the shape predicate alone only says "this
 * Edit/Write targets a staging authoring file", but GS-15 must stand down only when the
 * repository is ACTUALLY at the one lifecycle point this admission exists for -- checkpoint
 * present, transactionState "generated" -- never merely because a file happens to have this
 * shape and name. Reading the checkpoint's OWN transactionState (rather than calling into
 * `requireProjectOnboardingReady()`, which guard-lifecycle-ready.mjs's caller uses) is
 * deliberate: that gate needs an explicit `runner` argument this hook is never given (its
 * PreToolUse wiring in hooks.json carries no `--runner` flag), and project-onboarding-v3.mjs's
 * own status derivation ties transactionState "generated" 1:1 to lifecycleStatus
 * "bootstrap-binding-required" -- a legitimate, runner-free key for the identical stand-down
 * guard-lifecycle-ready.mjs already performs by catching that exact lifecycleStatus off
 * `requireProjectOnboardingReady()`'s thrown error.
 */
import { basename, dirname, join, resolve } from "node:path";

import { writeTargetPath } from "./tool-write-target.mjs";
import {
  INTAKE_FEATURE_ID_PATTERN,
  INTAKE_STAGING_DIRNAME,
  readOnboardingIntakeCheckpoint,
} from "./onboarding-continuity.mjs";

/**
 * NVA-BL-INTAKEBIND-1 (moved verbatim from guard-lifecycle-ready.mjs). A session observed at
 * `bootstrap-binding-required` (checkpoint transactionState "generated") has a freshly
 * generated, explicitly unreviewed staging PRD/spec (SSa.4's own table: "staging is
 * explicitly unbound, freely regenerable") that must be authored/reviewed and marked
 * `po-plan-acknowledged` before `bootstrap-bind-apply` can bind it -- exactly the design's
 * own intended review step. Narrow by construction, exactly like every sibling admission
 * this predicate was copied from: EXACTLY the two staging targets `intake-generate-apply`
 * itself writes that are meant to be hand-authored before binding -- `prd_<featureId>.md`
 * (featureId matched against INTAKE_FEATURE_ID_PATTERN, the exact shape
 * onboarding-continuity.mjs's deriveIntakeFeatureId() produces, never a wildcard) and
 * `spec.md`, both resolved directly under INTAKE_STAGING_DIRNAME. `design-input.md` is
 * deliberately never matched -- it is an immutable verbatim capture (design.md SSb
 * "Explicitly excluded"). Edit/Write only (never NotebookEdit, which none of these `.md`
 * paths could legitimately name).
 *
 * NVA-GS15-1: a second guard now consumes this predicate (guard-gate-strength.mjs, GS-15) --
 * it is no longer guard-lifecycle-ready.mjs's exclusive concern, which is why this now lives
 * here rather than staying module-private in that file.
 */
export function isBootstrapBindingStagingAuthoringWrite(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (toolName !== "Edit" && toolName !== "Write") return false;
  const filePath = writeTargetPath(input?.tool_input, toolName);
  if (filePath === "") return false;
  const resolved = resolve(root, filePath);
  const name = basename(resolved);
  const parent = dirname(resolved);

  // NVA-INTAKESPECS-1: the design package now lives at `specs/<featureId>/` (ADR-0045's own
  // location). The admission got NARROWER in the move, not wider: the containing directory
  // must itself be a generated feature id, and a `prd_<id>.md` is admitted only when that id
  // matches its own directory -- so a PRD carried into a different feature's directory is
  // refused, which the flat staging directory could not express at all.
  const featureId = basename(parent);
  if (INTAKE_FEATURE_ID_PATTERN.test(featureId) && parent === join(root, "specs", featureId)) {
    if (name === "spec.md") return true;
    const prdMatch = name.match(/^prd_(.+)\.md$/u);
    return prdMatch !== null && prdMatch[1] === featureId;
  }

  // NVA-INTAKESPECS-1 transitional. Nothing generates into the old staging directory any more.
  // This branch exists ONLY so GS-15 and its TP-6-protected regression test (GST38) keep
  // describing a real, still-admitted path until the single signed override that removes all
  // three can run -- scratch/NVA-INTAKESPECS-1-UMSETZUNG.md names the exact removal steps.
  // Removing it early would turn a green protected suite red with no route to fix it in the
  // same session. Delete this block, GS-15, INTAKE_STAGING_DIRNAME and GST38 together.
  const stagingDirectory = join(root, INTAKE_STAGING_DIRNAME);
  if (resolved === join(stagingDirectory, "spec.md")) return true;
  if (parent !== stagingDirectory) return false;
  const legacyPrdMatch = name.match(/^prd_(.+)\.md$/u);
  return legacyPrdMatch !== null && INTAKE_FEATURE_ID_PATTERN.test(legacyPrdMatch[1]);
}

/**
 * NVA-GS15-1: the single entry point guard-gate-strength.mjs calls to decide whether GS-15
 * stands down for this exact write. True only when BOTH the shape predicate above matches
 * AND the intake checkpoint at `root` is `status: "present"` with `value.transactionState
 * === "generated"` -- the one repository state this admission exists for. Fails CLOSED: any
 * thrown error (a malformed checkpoint, an unreadable repository) or any other checkpoint
 * status/transactionState returns false, leaving GS-15's refusal standing.
 */
export function bootstrapBindingStagingAuthoringAdmitted({ input, root }) {
  if (!isBootstrapBindingStagingAuthoringWrite(input, root)) return false;
  try {
    const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: root });
    return checkpoint.status === "present" && checkpoint.value?.transactionState === "generated";
  } catch {
    return false; // fail CLOSED -- a checkpoint read failure never stands GS-15 down
  }
}
