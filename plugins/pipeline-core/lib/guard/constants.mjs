// SPDX-License-Identifier: SUL-1.0
// Guard module "constants" (layer 0), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES } from "../project-onboarding-ready-gate.mjs";
import { automatedLifecycleArgvCommands } from "../../scripts/project-onboarding-v3.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../runtime-projection-v3.mjs";

// ADR-0059 Decision 3/4: the same generic, exact-command-bound Human-Guard-Override
// (HGO) route the other guards in this family already use for their own denials
// (guard-testpath.mjs, codex-pretool-guard.mjs). Reused here unmodified -- the three
// closed-shell-grammar denial codes AND, since ADR-0059 Decision 6 (2026-08-08),
// GUARD-CROSS-REPO-MUTATION are wired to it. GUARD-LIFECYCLE-NOT-READY stays outside
// HGO's authority.
//
// Decision 6 reverses Decision 5 for the cross-repository class only: a cross-repository
// mutation is liftable by a signed human override, through exactly this mechanism -- per
// command, one use, bound to the exact command digest, recorded in the override ledger,
// subject to the committed signature/chat mode, and unreachable to an agent acting alone.
//
// Measured boundary, stated rather than implied (evidence/hgocross-1-differential.*.json):
// HGO's own eligibility() classifies a target OUTSIDE the physical project root as
// HGO-NONOVERRIDABLE-CROSS-BOUNDARY, so recordHumanGuardDenial() returns
// external-operator-required and no capability can be armed for it from this guard. Those
// denials therefore print the typed "no route, and why" line instead of a next command --
// the same outcome the grammar codes already produce for an out-of-root path, and the same
// silence Decision 4 forbids. Cross-repository denials whose tool input HGO can classify
// (plugin install/remove, marketplace metadata, the in-root shapes) get the full route
// today. Closing the residual half is an eligibility() change in lib/human-guard-override.mjs,
// which is out of scope for this file.
export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// GF-078 bug 2 / NVA-B-READCONTAIN-1 (restoring the floor c8c7f449 removed): the one
// additional approved root threaded into the bounded rg-to-rg/rg-to-head/rg-to-tail diagnostic pipeline
// (guard-command-grammar.mjs's isBoundedReadOnlyPipeline), alongside the project root every
// call site already carries, and into every single, non-piped read-only command in
// isReadOnlyDiagnosticCommand below (rg, grep, cat, head, tail, wc, stat, file) via
// isApprovedSingleCommandReadArg (pipeline.read-scope-single-command-root-check). Resolved
// once, defensively, from THIS module's own location -- never a project- or command-supplied
// path -- exactly like gateStrengthShellReadOnlyScriptExemption's own realpath of PLUGIN_ROOT
// a few lines below. Falling back to the un-realpathed constant on a (practically
// unreachable, since this module is itself executing from there) realpath failure is still
// strictly narrower than the single-command allowance above, never wider.
export const BOUNDED_PIPELINE_ADDITIONAL_ROOTS = (() => {
  try { return [realpathSync(PLUGIN_ROOT)]; } catch { return [PLUGIN_ROOT]; }
})();

export const MAX_CLAUDE_TASK_OUTPUT_READ_BYTES = 1024 * 1024;

export const BASE_GOVERNANCE_MARKERS = [
  ".agent-pipeline/core.lock.json",
  "pipeline.user.yaml",
  "project/pipeline.json",
  "project/pipeline.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
];

export const MANIFEST_FAILURE_WARNING =
  "[pipeline-config-warning] guard-lifecycle-ready: config/runtime-projection-v3-owned-keys.json "
  + "is missing or unreadable; governance-marker detection continues using only the fixed base "
  + "markers. Deliberate fail-open (PO decision 2026-08-18, backlog/items/"
  + "2026-08-07-module-scope-manifest-read-rearms-the-disarm-by-config-fault.md) -- an unreadable "
  + "manifest must not refuse an otherwise-permitted write.\n";

/**
 * Resolve the full governance-marker list LAZILY, at the point of use, never
 * as a module-scope side effect.
 *
 * Reading `config/runtime-projection-v3-owned-keys.json` at module scope
 * (via the unguarded `loadRuntimeProjectionV3OwnedKeys()`, one identifier
 * away from `runtime-projection-v3.mjs`'s own memoized, lazily-guarded
 * `frozenOwnedKeys()`) meant a missing, unreadable, or malformed manifest
 * threw during this module's own ES-module evaluation -- merely IMPORTING
 * this hook crashed, before `main()` existed, which `hooks/hooks.json`
 * defines as exit 1, "allow + config warning": a config fault silently
 * DISARMED this fail-closed gate for every write in the process
 * (backlog/items/2026-08-07-module-scope-manifest-read-rearms-the-disarm-by-config-fault.md).
 *
 * PO decision 2026-08-18 (same item): keep admitting on an unreadable
 * manifest -- do NOT turn it into a refusal -- but stop letting the failure
 * escape as an uncontrolled crash. Catching it right here, at the one call
 * site that consumes it, narrows the blast radius from "the entire hook
 * process crashes and every write for its lifetime is silently admitted" to
 * "the runtime-projection-derived markers are treated as absent for this one
 * call; the fixed BASE_GOVERNANCE_MARKERS above are still enforced
 * normally." The admit-don't-refuse outcome the PO ratified is unchanged;
 * only its blast radius and its visibility (an explicit warning instead of a
 * bare uncaught-exception stack trace) are narrower and deliberate now.
 */
export function governanceMarkers(dependencies = {}) {
  const loadFn = dependencies.loadRuntimeProjectionV3OwnedKeysFn ?? loadRuntimeProjectionV3OwnedKeys;
  try {
    return {
      markers: [
        ...BASE_GOVERNANCE_MARKERS,
        ...loadFn().targets.map((target) => target.path),
      ].filter((value, index, values) => values.indexOf(value) === index),
      warning: null,
    };
  } catch {
    return { markers: BASE_GOVERNANCE_MARKERS, warning: MANIFEST_FAILURE_WARNING };
  }
}

export const READY_RECEIPT_KEYS = ["intent", "schema", "status"];

export const RUNTIME_AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

export const RUNTIME_AGENT_TYPE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u;

export const ONBOARDING_SCRIPT = fileURLToPath(new URL("../../scripts/project-onboarding-v3.mjs", import.meta.url));

// NVA-K-DRIVERREACH (backlog: 2026-08-28-the-guided-driver-is-neither-discoverable-nor-
// runnable.md): onboarding-init.mjs walks the onboarding CLI's `nextAction` chain to
// completion in one invocation instead of an agent hand-running each step. Until this
// admission it was refused by this exact gate in every non-ready state it exists to serve
// (`GUARD-LIFECYCLE-NOT-READY`), so every chaining improvement built on top of it was
// unreachable. Admitting it grants no new authority: the driver is read-only in itself --
// it only reads the CLI's own typed `nextAction` and re-invokes it -- and every MUTATING
// step it chains is a separately-admitted command this same guard evaluates on its own
// terms when the driver spawns it, exactly as if an agent had typed that command by hand.
export const DRIVER_SCRIPT = fileURLToPath(new URL("../../scripts/onboarding-init.mjs", import.meta.url));

// NVA-V4-PUSHDRIVER: the push-path equivalent of DRIVER_SCRIPT above -- same reasoning,
// same admission shape (sanctionedPushInitArgs() below, next to sanctionedDriverArgs()).
// push-init.mjs is itself strictly read-only (it spawns/imports only check-doc-
// reconciliation.mjs, push-gate-satisfiability.mjs and push-prepare.mjs, never
// po-human-approval.mjs -- see that file's own header comment "THE SIGNATURE BOUNDARY"),
// so admitting it grants no authority beyond what a session could already do by hand-typing
// the same three commands one at a time.
export const PUSH_INIT_SCRIPT = fileURLToPath(new URL("../../scripts/push-init.mjs", import.meta.url));

export const ONBOARDING_CONSENT_MARK_SCRIPT = fileURLToPath(new URL("../../scripts/onboarding-consent-mark.mjs", import.meta.url));

export const MIGRATION_SCRIPT = fileURLToPath(new URL("../../scripts/runner-profile-migration-v3.mjs", import.meta.url));

export const V3_BOOTSTRAP_AUTHORITY_SCRIPT = fileURLToPath(new URL("../../scripts/v3-bootstrap-authority.mjs", import.meta.url));

export const LAUNCH_SCRIPT = fileURLToPath(new URL("../../scripts/codex-onboarding-launch.mjs", import.meta.url));

export const READBACK_SCRIPT = fileURLToPath(new URL("../../scripts/codex-project-runtime-readback-host.mjs", import.meta.url));

export const APP_SERVER_SCRIPT = fileURLToPath(new URL("../../scripts/codex-app-server-health.mjs", import.meta.url));

export const START_PREFLIGHT_SCRIPT = fileURLToPath(new URL("../../scripts/pipeline-start-preflight.mjs", import.meta.url));

// A stale pipeline-owned hook must be able to invoke only its own exact updater.
export const PRE_PUSH_HOOK_INSTALL_SCRIPT = fileURLToPath(new URL("../../scripts/pre-push-hook-install.mjs", import.meta.url));

export const OBSERVATION_GOVERNANCE_BOOTSTRAP_SCRIPT = fileURLToPath(new URL("../../scripts/observation-governance-bootstrap.mjs", import.meta.url));

// The sole pre-bootstrap route that may inspect a runner's private transcript
// collection.  Its own implementation derives the collection, authenticates the
// recorded repository identity, and excludes the current session; this guard
// admits only this exact argv shape, never a raw session-directory read.
export const TRANSCRIPT_RECOVERY_SCRIPT = fileURLToPath(new URL("../../scripts/runner-transcript-recovery.mjs", import.meta.url));

export const REPAIR_MAP_SCRIPT = fileURLToPath(new URL("../../scripts/repair-map.mjs", import.meta.url));

export const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../../scripts/codex-host-repository-init.mjs", import.meta.url));

export const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../../scripts/session-cleanup.mjs", import.meta.url));

export const SESSION_CRITIC_FINALIZER_SCRIPT = fileURLToPath(new URL("../../scripts/session-critic-finalizer.mjs", import.meta.url));

export const SESSION_CAPABILITY_DIAGNOSE_SCRIPT = fileURLToPath(new URL("../../scripts/session-capability-diagnose.mjs", import.meta.url));

export const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../../scripts/pipeline-state.mjs", import.meta.url));

export const DESIGN_COURSE_SCRIPT = fileURLToPath(new URL("../../scripts/design-course-session.mjs", import.meta.url));

export const SETTINGS_ALLOWLIST_MERGE_SCRIPT = fileURLToPath(new URL("../../scripts/settings-allowlist-merge.mjs", import.meta.url));

export const PO_PROFILE_REPAIR_SCRIPT = fileURLToPath(new URL("../../scripts/po-gate-profile-repair.mjs", import.meta.url));

export const PROJECT_AUTHORITY_MIGRATION_SCRIPT = fileURLToPath(new URL("../../scripts/project-authority-migration.mjs", import.meta.url));

export const RESUME_HINT_SCRIPT = fileURLToPath(new URL("../../scripts/resume-hint.mjs", import.meta.url));

export const HUMAN_OVERRIDE_SCRIPT = fileURLToPath(new URL("../../scripts/guard-human-override.mjs", import.meta.url));

export const PRIVATE_OVERLAY_SCRIPT = fileURLToPath(new URL("../../scripts/codex-private-overlay-activation.mjs", import.meta.url));

export const PO_HUMAN_APPROVAL_SCRIPT = fileURLToPath(new URL("../../scripts/po-human-approval.mjs", import.meta.url));

export const PO_APPROVAL_GATE_SCRIPT = fileURLToPath(new URL("../../scripts/po-approval-gate.mjs", import.meta.url));

export const RESTART_RESUME_HINT_INPUT_PATH = "project/.resume-hint-input.json";

// NVA-LCREADONLY-1 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-and-
// tmp-fallback.md): the ONE write-side diagnosis lane a `partial` lifecycle admits -- see
// isPartialLifecycleScratchDirCreate() / isPartialLifecycleIncidentReportWrite() below.
// Deliberately a single fixed relative path, never a directory prefix or a glob.
export const PARTIAL_LIFECYCLE_SCRATCH_DIR = "scratch";

export const PARTIAL_LIFECYCLE_INCIDENT_REPORT_PATH = join(PARTIAL_LIFECYCLE_SCRATCH_DIR, "incident-report.md");

// NVA-GF-SCRATCH (backlog: 2026-08-28-a-scratch-write-is-refused-during-intake-against-the-
// documented-exemption.md): the two onboarding-readiness statuses a fresh, not-yet-onboarded
// project sits at before any dev-plan-gated write is even reachable -- see
// isIntakeLifecycleScratchWrite() / isIntakeLifecycleScratchMkdir() below. Unlike the `partial`
// diagnosis lane above (one fixed file), this admits ANY path resolving inside the repository's
// own scratch/ directory, matching guard-devplan.mjs's own scratch/ prefix exemption
// (lib/guard-devplan-policy.mjs DEFAULT_EXEMPT_PREFIXES) -- which already admits any path under
// scratch/, in every dev-plan phase -- so this gate's readiness check stops disagreeing with the
// dev-plan gate about the one directory the pipeline-start skill tells every agent is always
// safe.
export const INTAKE_LIFECYCLE_STATUSES = new Set(["intake-required", "intake-design-questions-required"]);

export const SCRATCH_LIFECYCLE_STATUSES = new Set([
  ...INTAKE_LIFECYCLE_STATUSES,
  "restart-required",
  "migration-required",
]);

export const HEX = /^[a-f0-9]{64}$/u;

// GUARDDERIVE-1: resolved once at module load from the onboarding CLI's own registered
// subcommand table (ONBOARDING_SUBCOMMANDS in scripts/project-onboarding-v3.mjs), not
// restated here. See sanctionedOnboardingArgs() below for what this set does and does
// NOT relax.
export const AUTOMATED_LIFECYCLE_ARGV_COMMANDS = automatedLifecycleArgvCommands();

export const VALID_RUNNERS = new Set(["claude", "codex", "antigravity"]);

// Every write-capable tool this gate admits. NotebookEdit was absent from both this list
// and from every hooks.json matcher until 2026-08-06, so a .ipynb write returned verdict(0)
// -- allow -- without the session ever proving a ready bootstrap. Its target arrives as
// `notebook_path`, not `file_path`; see lib/tool-write-target.mjs.
export const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];

// Both shells this hook is wired for. PowerShell was named in the matcher but in no
// decision, which made the whole gate a no-op on the runner that uses it.
export const SHELL_TOOLS = ["Bash", "PowerShell"];

export const READ_TOOLS = ["Read", "Grep", "Glob"];

// backlog: 2026-08-17-command-grammar-guesses-shell-dialect-from-host-os-not-the-actual-
// tool-shell.md. Claude's Bash tool always executes through Git-Bash/POSIX, on every host
// including Windows -- process.platform reflects the HOST operating system, never the
// actual shell dialect the tool runs commands through. parseGuardCommand()'s own default
// (guard-command-grammar.mjs: `{ platform = process.platform } = {}`) is therefore the
// wrong signal for every call site below that parses a raw Bash command string; each now
// threads this fixed, never-"win32" value explicitly instead of falling through to that
// default. dialectFor()'s own CONTENT-based Windows heuristics (a drive-letter prefix, an
// `.exe`-suffixed executable, a `Get-Content` prefix) are untouched by this -- they still
// select a Windows dialect for a literal Windows-shaped command string regardless of this
// constant. Scoped to guard-lifecycle-ready.mjs's own un-optioned parseGuardCommand() call
// sites only; codex-pretool-guard.mjs already threads its own explicit platform and is out
// of this item's scope.
export const CLAUDE_BASH_SHELL_DIALECT_PLATFORM = "linux";

export const HOST_INIT_CROSS_VIEW_STATUSES = new Set([
  "repository-mount-read-only",
  "repository-control-path-invalid",
]);

// NVA-REBDEAD-F5B: the measured set of lifecycleStatus values an unparseable-or-
// inconsistent lifecycle state file actually produces (backlog/evidence/2026-09-02-
// nva-rebdead-f5-lifecycle-status-measurement.json). "continuity-damaged" is reachable when the state
// file PARSES and then fails its own projection; "continuity-observation-unavailable" is
// reachable when it does not parse at all (parseJsonObject() in lib/onboarding-continuity.mjs
// raises KICKOFF-READ-MALFORMED, observeDetailed()'s own catch returns continuity.status =
// "unavailable", and lib/project-onboarding-v3.mjs's branch order at :2885/:2904-2905 then
// yields this lifecycleStatus for that continuity status -- the App-Server and intake/kickoff
// branches above it are skipped in an otherwise-healthy repository). See the usage site in
// evaluateAfterGrammarAdmission() for why both, and only both, are admitted.
export const REBASE_READINESS_LIFECYCLE_STATUSES = new Set([
  "continuity-damaged",
  "continuity-observation-unavailable",
]);

export const CONTROLLING_NON_READY_STATUSES = new Set(
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
);

export const ARCHITECTURE_ADOPTION_DENIAL_CODE = "GUARD-ARCHITECTURE-ADOPTION-UNRESOLVED";

export const ARCHITECTURE_FITNESS_DENIAL_CODE = "GUARD-ARCHITECTURE-FITNESS-NON-GREEN";

export const MINIMUM_RIGOR_ADVISORY_CODE = "GUARD-MINIMUM-RIGOR-ADVISORY";
