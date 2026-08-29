#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Codex implementation-write guard for already Pipeline-governed roots. */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import {
  inspectProjectOnboardingV3,
  PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS,
} from "../lib/project-onboarding-v3.mjs";
// NVA-GF-COPYSAFE: sourced from the shared renderer module rather than
// project-onboarding-v3.mjs directly -- same function (re-exported there,
// unchanged), so this file's bounded-rendering output stays byte-identical.
import { boundedOpaqueCopyCommand } from "../lib/copy-safe-command.mjs";
import { automatedLifecycleArgvCommands, MUTATING_ONBOARDING_ARGV_SHAPES } from "../scripts/project-onboarding-v3.mjs";
import { isBootstrapBindingStagingAuthoringWrite } from "../lib/onboarding-staging-authoring.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
import {
  hasCodexExistingGitControlMount,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
// NVA-R15-ROOTADMIT (backlog: 2026-08-28-the-guards-root-admission-compares-a-typed-path-to-
// a-realpathed-one.md): the one reviewed, already-consolidated path-identity fold -- reused
// here rather than writing a fourth independent copy of WSL/Windows path-identity logic
// (see that module's own header for the three prior copies this consolidated).
import { repositoryPathIdentityOrSelf } from "../lib/repository-path-identity.mjs";
import { readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import {
  consumeHumanGuardOverride,
  humanGuardRouteUnavailableReason,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { machinePlaneFilePath } from "../lib/machine-plane.mjs";
import {
  DEVPLAN_SHELL_DENIAL_CODE,
  devPlanGateVerdict,
} from "../lib/guard-devplan-policy.mjs";
import {
  extractShellWriteTargets,
  loadProtectedTestPathRules,
  protectedTestPathShellHit,
  TESTPATH_SHELL_DENIAL_CODE,
} from "../lib/protected-test-paths.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";
// NVA-BOOTRECEIPT-1: the identity chain and git-common-dir resolution are proven and
// already keyed on the same agentId/private-state tree by guard-dispatch-budget.mjs --
// reused here rather than copied, per that dispatch's own briefing.
import { resolveGitCommonDir, subagentIdentity } from "./guard-dispatch-budget.mjs";
import { GATE_STRENGTH_PATHS } from "./guard-gate-strength.mjs";
import {
  isBoundedReadOnlyPipeline,
  parseGuardCommand,
} from "./guard-command-grammar.mjs";
// MACHPATH-1/AC-9: machinePlaneFilePath() is re-exported here so no existing test import
// changes -- lib/machine-plane.mjs is now the sole owner of that derivation (no second
// copy anywhere in this plugin). isMachinePlaneWritePath() below keeps its own guard-side
// admission logic (the exact-identity check, the existing-symlink refusal, the containment
// walk) unchanged; only where the path comes from moved.
export { machinePlaneFilePath };

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
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// GF-078 bug 2: the one additional approved root threaded into the bounded rg-to-rg/
// rg-to-head diagnostic pipeline (guard-command-grammar.mjs's isBoundedReadOnlyPipeline),
// alongside the project root every call site already carries. Every single, non-piped
// read-only command in isReadOnlyDiagnosticCommand below (rg, grep, cat, head, tail, wc,
// stat, file) already carries NO path restriction at all -- an agent reading its own
// installed plugin's code with a single `rg` call was already unconditionally admitted;
// only the identical read piped through a second rg or head was refused, purely because it
// is a pipeline. Resolved once, defensively, from THIS module's own location -- never a
// project- or command-supplied path -- exactly like gateStrengthShellReadOnlyScriptExemption's
// own realpath of PLUGIN_ROOT a few lines below. Falling back to the un-realpathed constant
// on a (practically unreachable, since this module is itself executing from there) realpath
// failure is still strictly narrower than the single-command allowance above, never wider.
const BOUNDED_PIPELINE_ADDITIONAL_ROOTS = (() => {
  try { return [realpathSync(PLUGIN_ROOT)]; } catch { return [PLUGIN_ROOT]; }
})();

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
const READY_RECEIPT_KEYS = ["intent", "schema", "status"];
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
// NVA-K-DRIVERREACH (backlog: 2026-08-28-the-guided-driver-is-neither-discoverable-nor-
// runnable.md): onboarding-init.mjs walks the onboarding CLI's `nextAction` chain to
// completion in one invocation instead of an agent hand-running each step. Until this
// admission it was refused by this exact gate in every non-ready state it exists to serve
// (`GUARD-LIFECYCLE-NOT-READY`), so every chaining improvement built on top of it was
// unreachable. Admitting it grants no new authority: the driver is read-only in itself --
// it only reads the CLI's own typed `nextAction` and re-invokes it -- and every MUTATING
// step it chains is a separately-admitted command this same guard evaluates on its own
// terms when the driver spawns it, exactly as if an agent had typed that command by hand.
const DRIVER_SCRIPT = fileURLToPath(new URL("../scripts/onboarding-init.mjs", import.meta.url));
// NVA-V4-PUSHDRIVER: the push-path equivalent of DRIVER_SCRIPT above -- same reasoning,
// same admission shape (sanctionedPushInitArgs() below, next to sanctionedDriverArgs()).
// push-init.mjs is itself strictly read-only (it spawns/imports only check-doc-
// reconciliation.mjs, push-gate-satisfiability.mjs and push-prepare.mjs, never
// po-human-approval.mjs -- see that file's own header comment "THE SIGNATURE BOUNDARY"),
// so admitting it grants no authority beyond what a session could already do by hand-typing
// the same three commands one at a time.
const PUSH_INIT_SCRIPT = fileURLToPath(new URL("../scripts/push-init.mjs", import.meta.url));
const ONBOARDING_CONSENT_MARK_SCRIPT = fileURLToPath(new URL("../scripts/onboarding-consent-mark.mjs", import.meta.url));
const MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
const V3_BOOTSTRAP_AUTHORITY_SCRIPT = fileURLToPath(new URL("../scripts/v3-bootstrap-authority.mjs", import.meta.url));
const LAUNCH_SCRIPT = fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url));
const READBACK_SCRIPT = fileURLToPath(new URL("../scripts/codex-project-runtime-readback-host.mjs", import.meta.url));
const APP_SERVER_SCRIPT = fileURLToPath(new URL("../scripts/codex-app-server-health.mjs", import.meta.url));
const START_PREFLIGHT_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-start-preflight.mjs", import.meta.url));
const REPAIR_MAP_SCRIPT = fileURLToPath(new URL("../scripts/repair-map.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const SESSION_CAPABILITY_DIAGNOSE_SCRIPT = fileURLToPath(new URL("../scripts/session-capability-diagnose.mjs", import.meta.url));
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const PO_PROFILE_REPAIR_SCRIPT = fileURLToPath(new URL("../scripts/po-gate-profile-repair.mjs", import.meta.url));
const PROJECT_AUTHORITY_MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/project-authority-migration.mjs", import.meta.url));
const RESUME_HINT_SCRIPT = fileURLToPath(new URL("../scripts/resume-hint.mjs", import.meta.url));
const HUMAN_OVERRIDE_SCRIPT = fileURLToPath(new URL("../scripts/guard-human-override.mjs", import.meta.url));
const PRIVATE_OVERLAY_SCRIPT = fileURLToPath(new URL("../scripts/codex-private-overlay-activation.mjs", import.meta.url));
const PO_HUMAN_APPROVAL_SCRIPT = fileURLToPath(new URL("../scripts/po-human-approval.mjs", import.meta.url));
const PO_APPROVAL_GATE_SCRIPT = fileURLToPath(new URL("../scripts/po-approval-gate.mjs", import.meta.url));
const RESTART_RESUME_HINT_INPUT_PATH = "project/.resume-hint-input.json";
// NVA-LCREADONLY-1 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-and-
// tmp-fallback.md): the ONE write-side diagnosis lane a `partial` lifecycle admits -- see
// isPartialLifecycleScratchDirCreate() / isPartialLifecycleIncidentReportWrite() below.
// Deliberately a single fixed relative path, never a directory prefix or a glob.
const PARTIAL_LIFECYCLE_SCRATCH_DIR = "scratch";
const PARTIAL_LIFECYCLE_INCIDENT_REPORT_PATH = join(PARTIAL_LIFECYCLE_SCRATCH_DIR, "incident-report.md");
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
const INTAKE_LIFECYCLE_STATUSES = new Set(["intake-required", "intake-design-questions-required"]);
const HEX = /^[a-f0-9]{64}$/u;
// GUARDDERIVE-1: resolved once at module load from the onboarding CLI's own registered
// subcommand table (ONBOARDING_SUBCOMMANDS in scripts/project-onboarding-v3.mjs), not
// restated here. See sanctionedOnboardingArgs() below for what this set does and does
// NOT relax.
const AUTOMATED_LIFECYCLE_ARGV_COMMANDS = automatedLifecycleArgvCommands();
const VALID_RUNNERS = new Set(["claude", "codex", "antigravity"]);
// Every write-capable tool this gate admits. NotebookEdit was absent from both this list
// and from every hooks.json matcher until 2026-08-06, so a .ipynb write returned verdict(0)
// -- allow -- without the session ever proving a ready bootstrap. Its target arrives as
// `notebook_path`, not `file_path`; see lib/tool-write-target.mjs.
const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];
// Both shells this hook is wired for. PowerShell was named in the matcher but in no
// decision, which made the whole gate a no-op on the runner that uses it.
const SHELL_TOOLS = ["Bash", "PowerShell"];
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
const CLAUDE_BASH_SHELL_DIALECT_PLATFORM = "linux";
const HOST_INIT_CROSS_VIEW_STATUSES = new Set([
  "repository-mount-read-only",
  "repository-control-path-invalid",
]);
const CONTROLLING_NON_READY_STATUSES = new Set(
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
);

function verdict(exitCode, stderr = "") {
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
function withLifts(lifts, result) {
  if (lifts.length === 0) return result;
  return verdict(result.exitCode, `${lifts.map((lift) => lift.stderr).join("")}${result.stderr ?? ""}`);
}

function exactReadyReceipt(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(READY_RECEIPT_KEYS)
    && value.schema === "pipeline.project-onboarding-ready-gate.v1"
    && value.status === "ready"
    && value.intent === "session";
}

// Hoisted to module scope so grammarOverrideRoute() can build the identical, exact
// denial reason text blocked() itself prints -- the two must never drift apart, since
// the HGO request/capability is bound to this exact reason string.
const GRAMMAR_DENIAL_GUIDANCE = {
  "GUARD-PARSE-UNSUPPORTED": "The command is outside the closed Pipeline shell grammar.",
  "GUARD-OPERATOR-UNAPPROVED": "The command contains an unapproved shell operator.",
  "GUARD-REDIRECT-UNAPPROVED": "The command contains an unapproved shell redirection.",
};

/**
 * NVA-BL-76: the bounded read-only diagnostic pipeline (rg-to-head / rg-to-rg) whose only
 * unmet condition is that a read target resolves OUTSIDE the project root. Before this code
 * existed the same refusal was issued as GUARD-OPERATOR-UNAPPROVED (or, with the admitted
 * `2>/dev/null` suppressor, GUARD-REDIRECT-UNAPPROVED) -- a reason that is false: the
 * identical pipeline, identical operator, is admitted one directory over, and the refusal's
 * own closing line names bounded rg-to-head as an admitted exception while refusing one.
 *
 * Deliberately NOT the cross-repository-mutation family: nothing here writes anywhere. It is
 * a narrower READ-scope refusal, and it is routed through humanOverrideRoute() exactly like
 * the grammar codes, so a human signature can authorize one exact outside-root read
 * (measured class `cross-repository-target`, ADR-0059 Decision 6). Distinguishing this from
 * a write is the whole point of giving it its own code: a signature that may authorize
 * reading a background job's log outside the checkout is not a signature that may authorize
 * mutating another repository.
 */
// backlog/items/2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md
// Proposal point 1: a SMALL, explicit allowlist of read-only commands admitted when
// chained with `&&`. Deliberately bounded and small -- 6 segments comfortably covers the
// 4-segment triggering example with headroom, without becoming an unbounded chain. Declared
// here, ahead of ADMITTED_GRAMMAR_SHAPES below, because that table's array literal reads this
// constant at module-load time -- a `const` a few hundred lines further down would still be in
// its temporal dead zone at that point.
const MAX_AND_CHAIN_SEGMENTS = 6;
const READ_SCOPE_DENIAL_CODE = "GUARD-READ-SCOPE-OUTSIDE-ROOT";
const READ_SCOPE_DENIAL_GUIDANCE = "The bounded read-only diagnostic pipeline reads a path outside the project root.";
// NVA-I-GRAMMAR (PO, 2026-08-28, backlog: 2026-08-27-shell-grammar-reads-quoted-content-as-
// shell-syntax.md): "wichtig ist, dass der guard das erlaubte grammar immer auch sagt" -- the
// refusal must state the COMPLETE admitted grammar with bounds and exact spellings, not just
// name the shapes. This is the single table the message below renders from AND the test suite
// (guard-lifecycle-ready.test.mjs) submits every `example` from, so the printed text can never
// drift from what is actually admitted -- the item's own complaint about the old fixed string
// ("grep-to-head" named with no bound, `head -N` omitted entirely). Every `example` here must
// be independently admitted by isReadOnlyDiagnosticCommand() on its own -- pinned by that same
// test, executing rather than merely matching each line.
export const ADMITTED_GRAMMAR_SHAPES = [
  {
    spelling: "one simple, un-piped read-only command (rg, grep, cat, head, tail, wc, stat, "
      + "file, sed [non-mutating], find [non-mutating], pwd, git [read-only subcommands], and "
      + "a few narrow hash/check forms)",
    example: "rg -n needle probe.txt",
  },
  {
    spelling: "bounded rg-to-rg or rg-to-head diagnostic pipeline: \"rg ... | rg ...\" or "
      + "\"rg ... | head -n N\" / \"rg ... | head -N\" (N in 1..500), optionally followed by "
      + "\"2>/dev/null\"",
    example: "rg -n needle probe.txt | head -5",
  },
  {
    spelling: "bounded grep-to-grep or grep-to-head diagnostic pipeline: \"grep ... | grep ...\" "
      + "or \"grep ... | head -n N\" / \"grep ... | head -N\" (N in 1..500), optionally followed "
      + "by \"2>/dev/null\"",
    example: "grep -n needle probe.txt | head -5",
  },
  {
    spelling: "bounded cat-to-grep or cat-to-head diagnostic pipeline: \"cat <paths...> | "
      + "grep ...\" or \"cat <paths...> | head -n N\" / \"cat <paths...> | head -N\" "
      + "(N in 1..500), optionally followed by \"2>/dev/null\"",
    example: "cat probe.txt | head -5",
  },
  {
    spelling: `up to ${MAX_AND_CHAIN_SEGMENTS} "&&"-chained segments, admitted only when EVERY `
      + "segment is independently one of the shapes above or the small always-safe-write "
      + "allowlist (echo; \"mkdir -p\" under scratch/ or .claude/worktrees/)",
    example: "rg -n needle probe.txt && rg -n needle probe.txt",
  },
];
function grammarShapeLines() {
  return ADMITTED_GRAMMAR_SHAPES.map((shape) => `- ${shape.spelling} (e.g. "${shape.example}").`);
}
// The four lines every grammar denial has always printed, moved verbatim out of blocked()'s
// template so a code that must NOT print them (READ_SCOPE_DENIAL_CODE) can say something
// true instead. Byte-identical output for the three grammar codes.
const GRAMMAR_DENIAL_REMEDY = [
  "Use one simple shell command per tool call; issue independent read-only commands as separate parallel tool calls.",
  "Do not construct a new composed command with ;, pipelines, redirects, or line continuation outside the admitted shapes below.",
  "If typed retryActions are present, run only those exact read-only actions as separate tool calls.",
  "The complete admitted grammar, with bounds and exact spellings:",
  ...grammarShapeLines(),
];
// Every line here is executable advice that actually clears THIS refusal -- the item's
// second requirement ("make the remedy true or omit it"), and the reason the old text was a
// defect rather than a wording nit: it sent the operator to fix a pipeline that was never
// the objection. Since pipeline.read-scope-single-command-root-check (backlog:
// 2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md), a single,
// un-piped read command is ALSO root-checked -- it is no longer a shape admitted "without a
// path-location restriction", so line 3 no longer claims that. Both remaining claims are
// pinned by the NVA-BL-76 tests, which EXECUTE the advice rather than matching its wording.
const READ_SCOPE_DENIAL_REMEDY = [
  "The pipeline is not the objection: the identical bounded rg-to-rg / rg-to-head pipeline is admitted when every read target resolves inside the project root.",
  "Recomposing the same read -- splitting it, adding operators, redirects or line continuation -- cannot lift this refusal.",
  "Re-target the read inside the project root: the identical bounded pipeline AND the identical single, un-piped read are both admitted once every read target resolves inside the project root.",
];

/**
 * GRAMMARHINT-1 AC-1: name the specific construct the ALREADY-COMPLETED parse rejected,
 * using only what parseGuardCommand() (guard-command-grammar.mjs, out of this dispatch's
 * scope) determined -- never a second, competing parse.
 *
 * GUARD-OPERATOR-UNAPPROVED / GUARD-REDIRECT-UNAPPROVED: the accepted() parse already
 * carries the exact operator/redirect token in parsed.operators / parsed.redirects; naming
 * those is a pure read of data the guard already holds, nothing re-derived. The redirect
 * target itself is never surfaced (AC-5: it can be an absolute, machine-specific path) --
 * only the operator/direction/fd, which is fixed vocabulary.
 *
 * GUARD-PARSE-UNSUPPORTED: parseGuardCommand()'s denied() branch does not preserve which of
 * its several rejection paths fired -- unbalanced quote, backtick, malformed redirect,
 * mismatched segment count and a raw control character are all indistinguishable once
 * denied() returns (guard-command-grammar.mjs, 5 call sites). Carrying that distinction
 * through denied() is a guard-command-grammar.mjs change and out of this dispatch's scope
 * (GRAMMARHINT-1 briefing SS4) -- reported, not made, per SS5's stop condition. The one
 * exception mirrored below is the control-character gate: parseGuardCommand()'s FIRST,
 * unconditional line (`command.trim() === "" || /[\0\r\n]/u.test(command)`) always
 * short-circuits before any tokenization runs, so if this predicate is true the real parser
 * is GUARANTEED, by that same unconditional early return, to have denied the command for
 * exactly this reason -- no other path through parseGuardCommand() can produce "denied" for
 * a command matching this test. Reading that off is not a second parser: no tokenization, no
 * admission decision, no possible drift from what the real parser already concluded.
 */
function rejectedGrammarElement(code, command, parsed, root) {
  if (code === "GUARD-REDIRECT-UNAPPROVED" && parsed.redirects.length > 0) {
    const redirect = parsed.redirects[0];
    const token = redirect.fd === 2 ? "2>" : redirect.direction;
    return `the redirect operator "${token}"`;
  }
  if (code === "GUARD-OPERATOR-UNAPPROVED" && parsed.operators.length > 0) {
    return `the operator "${parsed.operators[0].operator}"`;
  }
  if (code === "GUARD-PARSE-UNSUPPORTED" && typeof command === "string") {
    // NVA-I-GRAMMAR DoD 4: named FIRST -- a well-formed `&&`-chain whose only fault is that
    // one segment is not independently admitted gets a specific, actionable reason instead of
    // falling through to the generic messages below (which would say nothing at all: none of
    // \n/\r/\0 need be present for this shape).
    const chainFault = typeof root === "string" ? rejectedAndChainSegment(command, root) : null;
    if (chainFault) {
      return `"&&"-chain segment ${chainFault.position} of ${chainFault.total} `
        + `("${chainFault.segment}") is not independently admitted as a read-only diagnostic `
        + "or an approved always-safe write";
    }
    if (/\n/u.test(command)) return "a newline character inside the command text";
    if (/\r/u.test(command)) return "a carriage-return character inside the command text";
    if (/\0/u.test(command)) return "a NUL character inside the command text";
  }
  return null;
}

function blocked(
  code = "GUARD-LIFECYCLE-NOT-READY", lifecycleStatus = null, retryActions = [], overrideGuidance = "", rejectedElement = null,
  remediation = null, nearMissHint = null, observationInvalid = false,
) {
  const typedLifecycleStatus = code === "GUARD-LIFECYCLE-NOT-READY"
    && CONTROLLING_NON_READY_STATUSES.has(lifecycleStatus)
    ? lifecycleStatus
    : null;
  const readScope = code === READ_SCOPE_DENIAL_CODE;
  const grammarReason = readScope ? READ_SCOPE_DENIAL_GUIDANCE : GRAMMAR_DENIAL_GUIDANCE[code];
  if (grammarReason) {
    const retryEnvelope = {
      schema: "pipeline.guard-retry-actions.v1",
      retryActions,
    };
    const remedy = readScope ? READ_SCOPE_DENIAL_REMEDY : GRAMMAR_DENIAL_REMEDY;
    return verdict(
      2,
      "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
        + `${code}: ${grammarReason}\n`
        + (rejectedElement ? `Rejected element: ${rejectedElement}.\n` : "")
        + (remediation ? `${remediation}\n` : "")
        + remedy.map((line) => `${line}\n`).join("")
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
/**
 * Renders each already-assembled ceremony command through boundedOpaqueCopyCommand()
 * (NVA-W4-01B) so a human whose terminal wraps a line mid-path or mid-digest still has a
 * copy-safe alternative -- appended AFTER the existing flat per-command chain, never
 * replacing it: the flat chain's own strict line-adjacency assertions
 * (guard-lifecycle-ready.test.mjs) stay pinned to their unmodified text. A rendering
 * failure for one step (or one shell within a step) never suppresses the flat chain or the
 * other steps -- boundedOpaqueCopyCommand() already returns `null` per-shell rather than
 * throwing for an unrenderable value; this only additionally guards the exceptional case of
 * a completely non-string/empty command, which should not happen here but must not fail the
 * whole denial message if it somehow does.
 */
function boundedCeremonyRenderingBlock(steps) {
  const blocks = [];
  for (const { label, command } of steps) {
    let bounded;
    try {
      bounded = boundedOpaqueCopyCommand(command);
    } catch {
      continue;
    }
    const shells = [];
    if (bounded.posix) shells.push(`  posix:\n${bounded.posix}`);
    if (bounded.powershell) shells.push(`  powershell:\n${bounded.powershell}`);
    if (bounded.cmd) shells.push(`  cmd.exe:\n${bounded.cmd}`);
    if (shells.length === 0) continue;
    blocks.push(`Bounded copy-safe rendering of the ${label} step (max ${bounded.maxColumns} columns per line; use this if the line above wrapped when you copied it):\n${shells.join("\n")}`);
  }
  return blocks.join("\n\n");
}

function humanOverrideRoute(code, reason, subject, root, toolName, toolInput, dependencies = {}) {
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
  if (consumed.status === "absent" || consumed.status === "replan") {
    let approvalMode = "signature";
    const readModeFn = dependencies.readPushApprovalModeFn ?? readPushApprovalMode;
    try { approvalMode = readModeFn(root)?.mode ?? "signature"; } catch { approvalMode = "signature"; }
    try {
      const recordFn = dependencies.recordHumanGuardDenialFn ?? recordHumanGuardDenial;
      const planned = recordFn({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
      if (planned.status === "planned") {
        const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
        // ADR-0059 Decision 4: name the exact next command for the CURRENTLY CONFIGURED
        // mode -- mirrors guard-testpath.mjs's own continuation exactly in shape.
        const continuation = approvalMode === "chat"
          ? [
            `Then (the human confirms in-session; this is attribution, not proof):`,
            `${process.execPath} ${JSON.stringify(script)} prepare-authorization --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256-from-plan> --reason "<human-reason>"`,
            `${process.execPath} ${JSON.stringify(script)} authorize --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256> --selection-sha256 <selection-sha256> --reason "<human-reason>" --reason-sha256 <reason-sha256> --activate`,
          ].join("\n")
          : [
            `Then, in this session (pure digest computation against data already in the ` +
              `repository -- neither step needs the external key, ADR-0059 Decision 1):`,
            `${process.execPath} ${JSON.stringify(script)} prepare-authorization --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256-from-plan> --reason "<fixed HGO_SIGNATURE_REASON text>"`,
            `${process.execPath} ${JSON.stringify(script)} emit-signature-digest --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256>`,
            `Then, outside this session (only the signature itself needs the external Ed25519 ` +
              `key; presence of a valid, correctly-bound signature IS the authorization -- ` +
              `there is no in-session activate step for this mode):`,
            `${process.execPath} ${JSON.stringify(script)} authorize-by-signature --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256> --proof <external-proof.json>`,
          ].join("\n");
        // NVA-W4-01B: the same steps rendered again, bounded, appended AFTER the flat
        // chain above -- see boundedCeremonyRenderingBlock()'s own header.
        const planCommand = `${process.execPath} ${JSON.stringify(script)} plan --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256}`;
        const ceremonySteps = approvalMode === "chat"
          ? [
            { label: "plan", command: planCommand },
            { label: "prepare-authorization", command: `${process.execPath} ${JSON.stringify(script)} prepare-authorization --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256-from-plan> --reason "<human-reason>"` },
            { label: "authorize", command: `${process.execPath} ${JSON.stringify(script)} authorize --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256> --selection-sha256 <selection-sha256> --reason "<human-reason>" --reason-sha256 <reason-sha256> --activate` },
          ]
          : [
            { label: "plan", command: planCommand },
            { label: "prepare-authorization", command: `${process.execPath} ${JSON.stringify(script)} prepare-authorization --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256-from-plan> --reason "<fixed HGO_SIGNATURE_REASON text>"` },
            { label: "emit-signature-digest", command: `${process.execPath} ${JSON.stringify(script)} emit-signature-digest --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256>` },
            { label: "authorize-by-signature", command: `${process.execPath} ${JSON.stringify(script)} authorize-by-signature --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256> --proof <external-proof.json>` },
          ];
        const boundedBlock = boundedCeremonyRenderingBlock(ceremonySteps);
        overrideGuidance = [
          "",
          `Human override available for this exact ${subject} (one use; audited; the human confirms):`,
          `${process.execPath} ${JSON.stringify(script)} plan --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256}`,
          continuation,
          "",
          ...(boundedBlock ? [boundedBlock, ""] : []),
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
  return { admitted: null, overrideGuidance };
}

function externalRestartOnly() {
  return verdict(
    2,
    "EXTERNAL ACTION REQUIRED (guard-lifecycle-ready, plugin pipeline-core): "
      + "restart-process is external-terminal/user-copy-only and must never be executed through a Codex tool call.\n"
      + "Stop this session, show the exact lifecycle launch.copyCommand in a fenced code block, "
      + "and ask the user to run it in a real external terminal.\n",
  );
}

function protectedStateWriterOnly() {
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

function protectedAuthorityDocumentWriteOnly(matchedRelativePath) {
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
function boundAuthorityDocumentPath(root, requested) {
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
    const authority = state.continuity?.authority;
    if (authority === null || typeof authority !== "object") return null;
    const prdPath = authority.prd?.path;
    const specPath = authority.spec?.path;
    if (typeof prdPath !== "string" || prdPath === "" || typeof specPath !== "string" || specPath === "") return null;
    const candidates = [prdPath, specPath, join(dirname(specPath), "design-input.md")];
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

// Hoisted for the same reason GRAMMAR_DENIAL_GUIDANCE is: the HGO request/capability is
// bound to the exact denial reason string, so the text the denial prints and the text the
// route binds must be one constant, never two copies that can drift.
const CROSS_REPO_DENIAL_CODE = "GUARD-CROSS-REPO-MUTATION";
const CROSS_REPO_DENIAL_GUIDANCE = "A governed consumer session may write only inside its own physical project root.";

function crossRepositoryMutationBlocked(overrideGuidance = "") {
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

/**
 * GS-1..GS-6 refuse an Edit or a Write. A shell command is neither.
 *
 * Measured 2026-08-06: `touch project/guard-config.json` was admitted with no guard
 * claiming it. `guard-gate-strength` is wired into exactly one PreToolUse entry, matcher
 * `Edit|Write|NotebookEdit`, so no Bash command can ever reach it -- and `node -e` is an
 * ordinary simple command under the closed grammar. An agent that wanted
 * `gates.push_approval: "chat"` therefore never needed the Edit tool at all, which is
 * precisely the property GS-1 was introduced to remove.
 *
 * Same shape as GS-6 one level up: the config decides a gate's strength, the installed
 * code decides whether the config is read -- and the shell decides everything, because it
 * was never asked.
 *
 * SHAPE. Substring, not token, matching: the path that matters can sit INSIDE a quoted
 * script argument (`node -e '...writeFileSync("pipeline.user.yaml", ...)'`), where token
 * matching sees one opaque word. That deliberately over-refuses -- a `git commit -m`
 * message merely naming one of these files is refused too, and the same over-refusal
 * applies to the product-source entries (GS-8, GS-9), not only the configuration ones --
 * a shell command or commit message that merely names one of those source files is
 * refused too. Over-refusal costs a `-F` flag; under-refusal costs the gate. Read-only
 * diagnostics are exempt via the existing classifier, so `cat`, `rg`, `sha256sum` and
 * `git diff` on these paths keep working -- except for one measured, real, prescribed
 * shape that classifier does not cover: `node <script> --guardrail <gate-strength-path>
 * ...`, the exact command `skills/critic-review/SKILL.md`'s mandatory dispatch-admission
 * step instructs an operator to run (it tells them to pass "every declared guardrail", a
 * gate-strength path among them for a governance project). That shape is closed instead
 * by the exact, closed exemption below (GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS): not "any
 * read-only command", but one specific, provably write-free plugin-local script, matched
 * on exact identity rather than shape.
 */
/**
 * GSSHELL-STAGE-1. Git verbs that cannot write the file, and are therefore not this
 * rule's business.
 *
 * The substring match refuses `git add pipeline.user.yaml` because the NAME appears,
 * and the refusal then tells the reader to "use the Edit or Write tool instead" --
 * which answers a different question, because staging is not a content change. The
 * measured consequence, in the PO's 2026-08-09 greenfield runs on both runners:
 * neither repository has a single commit, and the Codex run's published branch
 * silently dropped `.claude/`, `.codex/`, `docs/`, `project/` and `pipeline.user.yaml`
 * because the agent shrank its publication scope around this refusal. A consumer
 * that cannot commit its own calibration also cannot make a committed
 * `gates.push_approval` choice take effect (ADR-0055/ADR-0056), so the rule that
 * protects the gate from being weakened made the legitimate setting unreachable.
 * The remaining route -- `git add -A`, which names no file -- is the one
 * `templates/prompts/agent-obligations.md` §6 forbids, so the rule was pushing agents
 * into breaking a different rule.
 *
 * An ALLOWLIST, never a denylist: only these verbs are admitted, and every other git
 * subcommand keeps the substring refusal. `checkout`, `restore`, `switch`, `stash`,
 * `apply`, `reset`, `clean` and a bare `rm` can all put different bytes in the working
 * tree, so none of them appears here. `rm` is admitted ONLY with `--cached`. The
 * content path is untouched: writing this file still goes through
 * `guard-gate-strength.mjs` and its audited override ceremony.
 */
const GATE_STRENGTH_SHELL_SAFE_GIT_VERBS = Object.freeze(new Set(["add", "status", "commit", "diff", "log", "show", "ls-files", "check-ignore", "check-attr"]));

function isGateStrengthSafeGitCommand(command, root) {
  const words = simpleWords(command, root);
  if (!words || words.length < 2) return false;
  if (!["git", "git.exe"].includes(basename(words[0]).toLowerCase())) return false;
  // Skip recognised global options (`-C <dir>`, `-c k=v`, …) to reach the subcommand.
  let index = 1;
  while (index < words.length && words[index].startsWith("-")) {
    index += ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(words[index]) ? 2 : 1;
  }
  const verb = words[index];
  if (verb === undefined) return false;
  if (verb === "rm") return words.includes("--cached");
  return GATE_STRENGTH_SHELL_SAFE_GIT_VERBS.has(verb);
}

// NVA-LCGUARD-4 gap 1 (backlog: 2026-08-17-two-guards-block-an-unrelated-file-via-substring-
// name-matching.md, part A). A raw `haystack.includes(needle)` matches a protected basename
// as a substring of an UNRELATED, differently-named file -- `pipeline.user.yaml.bak` is not
// `pipeline.user.yaml`, but the old check could not tell the difference. This requires the
// needle to occur as a whole filename/path segment: bounded on both sides by anything that
// could not itself continue the SAME filename token (i.e. not an ASCII letter, digit, `.`,
// `-`, or `_`), or by the start/end of the string. `pipeline.user.yaml.bak` fails (the `.`
// right after `yaml` continues the token); `project/pipeline.user.yaml` and
// `pipeline.user.yaml` alone both still match (bounded by `/`, the string edges, or nothing
// filename-shaped at all).
function matchesProtectedBasename(haystack, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![a-z0-9._-])${escaped}(?![a-z0-9._-])`, "u").test(haystack);
}

/**
 * NVA-STARNEEDLE-1 (backlog: 2026-08-27-gate-strength-shell-lane-refuses-any-command-
 * containing-a-quoted-wildcard.md). Derives ONE needle per GATE_STRENGTH_PATHS entry, and
 * for a glob-suffixed entry (currently only GS-15, `project/.onboarding-staging/*`) mirrors
 * guard-gate-strength.mjs's own write-lane semantics (`gateStrengthRuleFor()`): that
 * function already strips the trailing `/*` and matches the DIRECTORY the entry describes,
 * never the literal `*` character. This lane matched by basename instead of by directory
 * prefix, so `basename("project/.onboarding-staging/*")` was the bare wildcard character
 * itself -- a needle that is not a filename at all, and one `matchesProtectedBasename` then
 * matched against ANY quoted `*` anywhere in a command's text, whatever the command actually
 * targeted.
 *
 * Applies to every present and future glob-suffixed entry automatically, by shape (the
 * trailing `/*` suffix), never by naming GS-15 specifically -- so this is not a one-entry
 * patch. The directory basename is a real, meaningful multi-character identifier (here,
 * `.onboarding-staging`), so a command genuinely naming a file under that directory keeps
 * matching exactly like before (AC-1/AC-3); only the bare wildcard needle is gone.
 */
export function gateStrengthShellNeedleFor(path) {
  const normalized = path.endsWith("/*") ? path.slice(0, -2) : path;
  return basename(normalized);
}

/**
 * NVA-STARNEEDLE-1 AC-4: the general defense, independent of gateStrengthShellNeedleFor()
 * above and of today's specific GATE_STRENGTH_PATHS table. A needle carrying no
 * alphanumeric character at all is never a real, meaningful filename/directory identifier
 * -- it is exactly the shape that turned a wildcard glob suffix into a needle that matched
 * almost anything. Exported so the shell lane's own test file can pin this predicate
 * directly, against synthetic inputs, rather than only against today's one glob-suffixed
 * entry (GS-15) -- a future entry that produced a degenerate needle would be caught by this
 * same, entry-agnostic rule, not only by a test that happens to still be named after GS-15.
 */
export function isMeaningfulGateStrengthShellNeedle(needle) {
  return typeof needle === "string" && /[a-z0-9]/iu.test(needle);
}

function gateStrengthShellRefusal(command, root, dependencies = {}) {
  if (typeof command !== "string" || command === "") return null;
  if (isReadOnlyDiagnosticCommand(command, root)) return null;
  if (isGateStrengthSafeGitCommand(command, root)) return null;
  if (gateStrengthShellReadOnlyScriptExemption(command, root, dependencies)) return null;
  // Needles are every entry of GATE_STRENGTH_PATHS (imported above), by basename -- not
  // restated here as a count or a fixed category, because that is what went stale last
  // time: this sentence used to say "the five configuration paths (GS-1..GS-5)" and the
  // table has since grown past that count and past that category (GS-7's legacy-tier
  // config, then GS-8 and GS-9, which protect product source rather than configuration --
  // see their own entries in guard-gate-strength.mjs for why). The live plugin
  // root (GS-6) is NOT a needle here: executing a plugin script by absolute path is the
  // normal bootstrap and recovery shape, so matching the root would refuse
  // `node <pluginRoot>/scripts/project-onboarding-v3.mjs inspect` -- the very command the
  // gate tells the operator to run. Shell WRITES into the enforcing plugin root are
  // already refused by GUARD-CROSS-REPO-MUTATION whenever the installed copy sits outside
  // the project root, which is the arrangement docs/claude-local-plugin-development.md
  // now prescribes; the residual case is recorded in docs/state.md rather than closed by
  // a rule that would break bootstrap.
  //
  // NVA-STARNEEDLE-1: derived via gateStrengthShellNeedleFor() (glob-aware, see its own
  // header) rather than a bare basename(), and defensively filtered so a needle carrying no
  // alphanumeric character at all -- a bare wildcard/punctuation "filename" that is never a
  // real, meaningful identifier -- can never be produced, whatever future entry
  // GATE_STRENGTH_PATHS grows. This is the general defense AC-4 asks for: it is not
  // conditioned on GS-15's id or path, only on the needle's own shape once derived, so a
  // brand-new glob-suffixed entry whose directory basename were somehow still degenerate
  // would silently drop out of the needle set instead of silently reintroducing this class.
  const needles = GATE_STRENGTH_PATHS
    .map((rule) => gateStrengthShellNeedleFor(rule.path))
    .filter(isMeaningfulGateStrengthShellNeedle);
  const haystack = command.replace(/\\/gu, "/").toLowerCase();
  const hit = needles.find((needle) => matchesProtectedBasename(haystack, needle.replace(/\\/gu, "/").toLowerCase()));
  if (hit === undefined) return null;
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + "GUARD-GATE-STRENGTH-SHELL: "
      + `This command names ${hit}, a file whose contents decide how strong a gate is.\n`
      + `The match is on the file NAME ${hit} appearing in the command, not on a detected `
      + "write: this rule cannot tell a read from a write inside an arbitrary shell command, "
      + "so it refuses both rather than risk letting the gate-weakening write through.\n"
      + "Reading is unaffected: cat, rg, head, sha256sum and git diff/log/show on this path "
      + "are admitted -- including a bounded cat-to-grep/cat-to-head read pipeline naming this "
      + "path, not only the single-command form -- and so is the one exact, closed script "
      + "exemption this rule grants "
      + "(GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS) -- if this command was one of those shapes "
      + "and was still refused, that is this classifier under-covering, not this file "
      + "genuinely changing.\n"
      + "To actually CHANGE this file, use the Edit or Write tool instead of a shell command: "
      + "guard-gate-strength.mjs enforces the identical rule there and offers the audited "
      + "human-guard-override ceremony (chat- or signature-mode, matching whatever "
      + "gates.push_approval is actually committed) -- never a hand-edit outside a session. "
      + "There is deliberately no in-session override for this shell-lane refusal itself -- "
      + "not even the audited one.\n",
  );
}

/**
 * AC-2 (backlog 2026-08-08-the-gate-strength-shell-lane-refuses-the-read-only-critic-
 * preflight.md, C2). The ONLY relief this shell lane grants beyond the ordinary read-only
 * diagnostic classifier above: a closed, exact exemption for plugin-local scripts that are
 * PROVABLY write-free. "Provably" is not asserted here -- GST3x in
 * guard-gate-strength.test.mjs walks each entry's source and its transitive plugin-local
 * relative imports for a filesystem-write API on every run (AC-3), so this list stays
 * honest rather than becoming a second, uninspected trust boundary.
 *
 * Frozen literal, never agent-settable: no environment variable, config key, or other
 * agent-chosen input selects membership. A prior dispatch in this block implemented
 * project configuration as `process.env[...]`, turning an agent-chosen value into a
 * security input; it was rejected and removed. Membership changes only by editing this
 * source file, which is itself Edit/Write-tool territory under ordinary review.
 *
 * AC-1 measured (scratch/c2-ac1-measurement.mjs): `buildPacket()`
 * (lib/critic-packet-governance.mjs) already auto-requires `.claude/pipeline.yaml` in the
 * returned `guardrails` array whenever the candidate manifest declares a `governance`
 * block, even with an EMPTY `--guardrail` list. This exemption is granted anyway: SKILL.md
 * still instructs the operator to pass every declared guardrail explicitly (`critic-
 * review/SKILL.md:32/:71`), and an operator who follows that instruction and names a path
 * the preflight itself reports as required must not be punished for it.
 */
export const GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS = Object.freeze([
  Object.freeze({
    path: "scripts/critic-dispatch-preflight.mjs",
    reason: "skills/critic-review/SKILL.md's mandatory dispatch-admission step instructs "
      + "the operator to pass every declared guardrail path -- a gate-strength path among "
      + "them for a governance project (SKILL.md:32/:71) -- and preflightCriticDispatch() "
      + "has zero filesystem-write calls: it only parses and reports.",
  }),
]);

/**
 * Fires ONLY when: the command's first word is a trusted `node` executable (the same
 * platform-aware direct-name-or-trusted-execPath check `isRestartResumeHintCapture()`
 * above already uses); its second word, resolved against `root` exactly as every other
 * path argument in this file is (`commandPath()`), is EXACTLY one of the frozen entries
 * above joined onto this module's own resolved plugin root; and that resolved candidate
 * also passes the realpath-safe containment walk this file already has
 * (`isPathWithinRealpathedRoot`, exported elsewhere as `isProjectWritePath`) against that
 * same root -- so a symlink planted to redirect the exact-match candidate elsewhere cannot
 * slip through. Nothing else about the command is inspected or assumed: extra flags, extra
 * words, or a write to a gate-strength path elsewhere in the SAME command line all fall
 * through untouched (AC-5 pins the write-smuggling case) -- they still reach the ordinary
 * substring refusal, or GUARD-CROSS-REPO-MUTATION / GS-1..GS-5/GS-7's Edit lane, exactly as
 * before this exemption existed.
 *
 * The plugin root used here is THIS module's own resolved location (`PLUGIN_ROOT`, GS-6's
 * "the copy that is CURRENTLY ENFORCING"), never the project root a command happens to
 * name -- a vendored `plugins/pipeline-core/` inside some OTHER governed project is not
 * trusted merely for sharing a relative path; only the installed copy actually running
 * this check is.
 */
function gateStrengthShellReadOnlyScriptExemption(command, root, dependencies = {}) {
  const words = simpleWords(command, root);
  if (!words || words.length < 2) return false;
  const platform = dependencies.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = dependencies.processExecPath ?? process.execPath;
  if (![...directNode, trustedNode].includes(words[0])) return false;
  const scriptArg = words[1];
  if (typeof scriptArg !== "string" || scriptArg === "" || scriptArg.startsWith("-")) return false;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  let pluginRoot;
  try {
    pluginRoot = realpath(PLUGIN_ROOT);
  } catch {
    return false;
  }
  const resolvedScript = resolve(root, scriptArg);
  return GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS.some((entry) => resolve(pluginRoot, entry.path) === resolvedScript
    && isPathWithinRealpathedRoot(resolvedScript, pluginRoot, dependencies));
}

/**
 * GUARD-TESTPATH-SHELL — the shell lane of the test-path authority gate.
 *
 * WHY HERE. `guard-testpath.mjs` is wired for `Edit|Write|NotebookEdit` only, so an agent
 * that could not clear TP-* simply wrote the same bytes from Bash and reported it as a
 * deviation (backlog: 2026-08-08-an-authority-gate-is-bypassable-by-choosing-a-different-
 * write-tool.md). `guardrails/global.md` GL-09 calls this gate authority-bearing, and a gate
 * whose coverage depends on which tool an agent picks is not one. This file is ALREADY the
 * `Bash|PowerShell` half of the sibling authority gate (`GUARD-GATE-STRENGTH-SHELL`, one
 * function up), for exactly the same reason and by exactly the same route, so the test-path
 * rule joins it here rather than through a new matcher — `hooks.json` needs no change, and
 * the protected set has one definition (`lib/protected-test-paths.mjs`) read by both lanes.
 *
 * WHAT IT REFUSES, and what it deliberately does not. Unlike its gate-strength sibling this
 * is NOT a name-mention refusal: protected suites are meant to be run, and `node --test
 * <protected suite>` is the verification command guard-testpath.mjs's own header prescribes.
 * The classifier detects writes — redirect targets, write-capable executables, git verbs
 * that rewrite the working tree, and opaque interpreter payloads. Its residual blind spots
 * (a write performed inside an executed script; a path assembled at runtime) are named in
 * lib/protected-test-paths.mjs's header rather than implied here.
 *
 * OVERRIDE. Unlike GUARD-GATE-STRENGTH-SHELL, which has none, this refusal carries the same
 * audited human-guard-override the write lane offers — chat- or signature-mode, matching
 * whatever `gates.push_approval` is actually committed (ADR-0056/ADR-0059). That is a PO
 * decision recorded in the item's own triage, and it is the half that matters: the reported
 * bypass happened because the sanctioned route was closed BEFORE the unsanctioned one was
 * taken, so closing the route without opening a lift would just relocate the same failure.
 * For `PowerShell` the ceremony is not reachable — `eligibility()` in
 * lib/human-guard-override.mjs recognises `Bash` among the shell tools and returns
 * HGO-NONOVERRIDABLE-TOOL otherwise — so that lane renders the typed no-route reason instead
 * of a copyable command. Stated, not hidden; widening HGO's tool eligibility is its own
 * decision, not a side effect of this one.
 */
/**
 * GL-09 requires this authority-bearing gate to resolve to its blocking outcome when it
 * cannot complete its evaluation, verified by a fault-injection test that raises inside the
 * blocking path (Critic finding, backlog: 2026-08-08-an-authority-gate-is-bypassable-by-
 * choosing-a-different-write-tool.md). The config-load catch just below is a documented
 * exception, not a gap: an unreadable guard config carries no rules to enforce (rules.length
 * === 0 falls through to the same "nothing to check" result the write lane already accepts).
 * A throw from the CLASSIFIER on a real command is different — it means a command that may
 * write a protected path could not be evaluated, and GL-09 requires that to block rather than
 * pass through unseen. Returning a typed fault sentinel here (rather than swallowing to null,
 * as the pre-fix code did) lets the call site distinguish "no rules loaded" from "the
 * classifier itself failed" and fail closed only for the latter.
 */
function protectedTestPathShellRefusalHit(command, root, dependencies = {}, toolName = "Bash") {
  if (typeof command !== "string" || command === "") return null;
  let rules = [];
  try {
    const loadFn = dependencies.loadProtectedTestPathRulesFn ?? loadProtectedTestPathRules;
    rules = loadFn({ rootDir: root }).rules;
  } catch {
    return null; // an unreadable guard config blocks nothing here, exactly as in the write lane
  }
  if (rules.length === 0) return null;
  try {
    const classify = dependencies.protectedTestPathShellHitFn ?? protectedTestPathShellHit;
    return classify({
      command,
      rules,
      root,
      toolName,
      platform: dependencies.platform ?? process.platform,
    });
  } catch (error) {
    return { fault: true, error };
  }
}

function protectedTestPathShellBlocked(hit, overrideGuidance) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${TESTPATH_SHELL_DENIAL_CODE}: ${hit.rule.id}: ${hit.rule.reason}\n`
      + `Detected as a shell write to a protected test path (lane: ${hit.lane}).\n`
      + "Why: an implementing Goldfish MUST NOT modify, weaken, skip or delete the tests/checks "
      + "that gate its own implementation (QG-04 / roles/goldfish.md GF-04). A genuine test "
      + "change is its own, explicitly briefed task, and this gate is authority-bearing "
      + "(guardrails/global.md GL-09) -- so which write tool you reach for cannot decide "
      + "whether it applies.\n"
      + "Reading and RUNNING the suite are unaffected: node --test, node <suite>, cat, rg, "
      + "git add/commit/diff/log/show on this path are all admitted. Only a detected write is "
      + "refused.\n"
      + (overrideGuidance ?? ""),
  );
}

/** Fail-closed outcome for a classifier fault (GL-09) — see protectedTestPathShellRefusalHit(). */
function protectedTestPathShellFaultBlocked(error) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${TESTPATH_SHELL_DENIAL_CODE}-FAULT: the shell classifier for the protected-test-path `
      + "gate raised while evaluating this command, so whether it writes a protected path "
      + "could not be determined.\n"
      + `Error: ${error instanceof Error ? error.message : String(error)}\n`
      + "Why: this gate is authority-bearing (guardrails/global.md GL-09), which MUST resolve "
      + "to its blocking outcome rather than pass a command through unseen when it cannot "
      + "complete its evaluation.\n"
      + "No override route is offered for a classifier fault -- fix the command shape (or the "
      + "classifier, if the fault is a real defect) and retry.\n",
  );
}

/**
 * GUARD-DEVPLAN-SHELL -- the `Bash|PowerShell` lane of the Dev-Plan-Gate (`guard-devplan.mjs`),
 * built the identical way `GUARD-TESTPATH-SHELL` closes the same route-choice gap for the
 * protected-test-path gate, two functions up: extract every write-target CANDIDATE a shell
 * command's syntax shows it touching (`extractShellWriteTargets()`, the SAME extraction both
 * shell lanes share -- see that function's own header in `lib/protected-test-paths.mjs`), and
 * run the IDENTICAL decision function the Edit|Write lane calls (`devPlanGateVerdict()`,
 * `lib/guard-devplan-policy.mjs`) against each one, in order, stopping at the first "block".
 * Unlike the test-path lane, no rules-config loading step happens here: `devPlanGateVerdict()`
 * has no external rule set of its own -- it reads the manifest/State directly -- so there is no
 * "config unreadable, claim nothing" branch to mirror.
 *
 * A "warn" verdict (manifest/State readable-but-malformed, fail-open by policy) or "allow" is
 * non-blocking here exactly as in the Edit|Write lane -- only "block" produces a hit.
 *
 * GL-09 fail-closed contract (mirrors `protectedTestPathShellRefusalHit()`'s own doc comment
 * just above it): the whole extraction+verdict walk is one try/catch, so a throw anywhere in it
 * (a malformed command the extractor cannot classify, a corrupt manifest/State byte shape
 * `devPlanGateVerdict()` itself did not already contain to a "warn") returns a typed fault
 * sentinel rather than silently falling through as "nothing to check".
 *
 * @returns {null|{fault:true,error:Error}|{verdict:"block",reason:string,feature?:string,
 *   planPath?:string|null,lifecycleStatus?:string,candidate:string,lane:string}} the first
 *   "block" verdict for any candidate (carrying which candidate/lane produced it), or null when
 *   nothing blocks.
 */
function devPlanShellRefusalHit(command, root, dependencies = {}, toolName = "Bash") {
  if (typeof command !== "string" || command === "") return null;
  try {
    const extractFn = dependencies.extractShellWriteTargetsFn ?? extractShellWriteTargets;
    const verdictFn = dependencies.devPlanGateVerdictFn ?? devPlanGateVerdict;
    const targets = extractFn({
      command,
      root,
      toolName,
      platform: dependencies.platform ?? process.platform,
    });
    for (const { candidate, lane } of targets) {
      const result = verdictFn({ filePath: candidate, projectDir: root });
      if (result.verdict === "block") return { ...result, candidate, lane };
    }
    return null;
  } catch (error) {
    return { fault: true, error };
  }
}

/**
 * `hit.reason` is `devPlanGateVerdict()`'s own message text -- the EXACT bytes
 * `guard-devplan.mjs`'s Edit|Write lane has always emitted for this feature/lifecycle/plan
 * combination (`Feature "…" lifecycle is "…".` / `Plan: …` / `File: …` / `Why: …`). Embedded
 * verbatim rather than re-derived, so the shell lane can never drift into inventing its own
 * wording for a decision the Edit|Write lane already states authoritatively -- the same
 * one-owner discipline `lib/guard-devplan-policy.mjs`'s own header describes.
 */
function devPlanShellBlocked(hit, overrideGuidance) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${DEVPLAN_SHELL_DENIAL_CODE}: ${hit.reason}\n`
      + `Detected as a shell write to a dev-plan-gated path (lane: ${hit.lane}).\n`
      + "Why: an implementing Goldfish MUST NOT write implementation before the plan is approved "
      + "(roles/goldfish.md GF-04-adjacent discipline, enforced here as a technical gate). This "
      + "gate is authority-bearing (guardrails/global.md GL-09) -- so which write tool you reach "
      + "for cannot decide whether it applies.\n"
      + "A genuine draft-phase write belongs under docs/, specs/, .claude/, backlog/ or scratch/, "
      + "or the active feature's own plan path while still in draft -- or wait for the sanctioned "
      + "lifecycle transition named in the Why line above.\n"
      + (overrideGuidance ?? ""),
  );
}

/** Fail-closed outcome for a classifier fault (GL-09) — see devPlanShellRefusalHit(). */
function devPlanShellFaultBlocked(error) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${DEVPLAN_SHELL_DENIAL_CODE}-FAULT: the shell classifier for the dev-plan lifecycle gate `
      + "raised while evaluating this command, so whether it writes a dev-plan-gated path could "
      + "not be determined.\n"
      + `Error: ${error instanceof Error ? error.message : String(error)}\n`
      + "Why: this gate is authority-bearing (guardrails/global.md GL-09), which MUST resolve "
      + "to its blocking outcome rather than pass a command through unseen when it cannot "
      + "complete its evaluation.\n"
      + "No override route is offered for a classifier fault -- fix the command shape (or the "
      + "classifier, if the fault is a real defect) and retry.\n",
  );
}

function externalPoSigningOnly() {
  return verdict(
    2,
    "EXTERNAL ACTION REQUIRED (guard-lifecycle-ready, plugin pipeline-core): "
      + "PO setup and approve are human-terminal actions; the agent may prepare and verify only public request/proof artifacts.\n",
  );
}

/** Read an explicit `--runner <value>` from this process's own argv (ADR-0051). */
function runnerFromArgv(argv) {
  const index = argv.indexOf("--runner");
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function pathInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Reject lexical escapes and escapes through an existing symlink ancestor. Shared by
 * isProjectWritePath() (root = this project's own physical root, already realpathed by its
 * caller) and isClaudeSessionMemoryWritePath() (root = this session's own derived memory
 * directory, MEMPATH-1) -- the identical walk, bound to whichever already-real boundary the
 * caller owns.
 */
function isPathWithinRealpathedRoot(filePath, root, dependencies) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")) return false;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  const requested = resolve(root, filePath);
  if (!pathInside(root, requested)) return false;
  let ancestor = requested;
  try {
    while (ancestor !== root && !exists(ancestor)) ancestor = dirname(ancestor);
    return pathInside(root, realpath(ancestor));
  } catch {
    return false;
  }
}

export function isProjectWritePath(filePath, root, dependencies = {}) {
  return isPathWithinRealpathedRoot(filePath, root, dependencies);
}

/**
 * MEMPATH-1 (PO decision, 2026-08-08 -- backlog/items/2026-07-29-guard-lifecycle-ready-
 * blocks-claude-memory-writes.md, "PO decision, 2026-08-08 -- Option A"). Claude Code's own
 * PreToolUse hook payload carries `transcript_path`: this session's transcript file, as the
 * CLI itself reports it, never reconstructed or guessed from a sampled naming/hashing
 * scheme. `dirname(transcript_path)` is this session's project directory exactly as the CLI
 * lays it out; `<that>/memory/` is this project's memory directory -- the ONE narrow
 * carve-out this function exists to identify.
 *
 * Never a `~/.claude/**` prefix: that tree also holds `settings.json`, `agents/`, `plugins/`
 * and the local marketplace sits beside it, so admitting a prefix would admit all of those
 * too -- exactly the escape ADR-0059 Decision 5 and the cross-repository guard exist to
 * close. Never a path taken from tool input, an environment variable, or repository config
 * -- only from this CLI-supplied hook field, which is a fixed per-session value the agent's
 * own tool calls cannot set (unlike `tool_input`, which the calling tool call constructs).
 *
 * Fails closed whenever the derivation is unusable: `transcript_path` absent, empty,
 * relative, or naming a session directory whose own `memory/` does not yet exist on disk (an
 * empty session before Claude Code has created it, rather than guessing a lazy-create
 * contract this repository has not observed). realpathSync() on the full candidate resolves
 * every symlinked ancestor in one step, so a symlinked `~/.claude` or `projects/<hash>`
 * cannot misdirect the boundary this function hands back.
 */
export function claudeSessionMemoryDirectory(input, dependencies = {}) {
  const transcriptPath = input?.transcript_path;
  if (typeof transcriptPath !== "string" || transcriptPath.trim() === ""
    || transcriptPath.includes("\0") || !isAbsolute(transcriptPath)) return null;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  const statFn = dependencies.statSyncFn ?? statSync;
  const candidate = join(dirname(transcriptPath), "memory");
  try {
    const real = realpath(candidate);
    return statFn(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Admit a write only strictly inside the derived memory directory above, through the same
 * realpath walk isProjectWritePath() uses -- a symlink planted inside the memory directory
 * cannot redirect a write outside it, and a path that merely contains the segment `memory`
 * without landing inside the exact derived directory is refused by the same lexical
 * containment check.
 */
export function isClaudeSessionMemoryWritePath(filePath, input, dependencies = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")
    || !isAbsolute(filePath)) return false;
  const memoryDir = claudeSessionMemoryDirectory(input, dependencies);
  if (memoryDir === null) return false;
  return isPathWithinRealpathedRoot(filePath, memoryDir, dependencies);
}

/**
 * MACHPATH-1 (PO decision, 2026-08-08 -- specs/sprint-nova-epic/plans/nova-setup-bootstrap.md
 * SS6a, "Where the machine plane lives"). The second, and so far last, write surface this
 * guard admits outside the project root: exactly one file, `<homedir>/.agent-pipeline/
 * machine.json`, the machine-scoped configuration plane a bootstrap writes once per machine
 * (push-approval default, key directory, model routing, language -- never a project's own
 * committed `gates.push_approval`, which stays inside the repository, SS2/SS7 of that plan).
 *
 * SETUP-2b/AC-9: `machinePlaneFilePath()` itself now lives in `../lib/machine-plane.mjs`,
 * imported above and re-exported unchanged so no existing test import breaks -- that module
 * is the SOLE derivation of this path anywhere in the plugin, and this guard's admission
 * decision reads it from there rather than keeping a second copy that could drift. Its own
 * doctrine (never `tool_input`/`process.env`/repository config, `os.homedir()` realpathed
 * once, fails closed on an absent/empty/relative/unresolvable home) is documented in full at
 * its new home; nothing about that doctrine changed by moving it.
 */

/**
 * Admit a write only when it is EXACTLY the single derived file above -- never a prefix, never
 * a directory. `isPathWithinRealpathedRoot()` alone has no notion of "exactly one file": rooted
 * at a directory it legitimately admits anything nested inside it, which is precisely what the
 * memory carve-out above wants for its directory and precisely what THIS carve-out must refuse
 * (a sibling `other.json`, a nested `sub/machine.json`, the bare `.agent-pipeline` directory).
 * Reusing it unmodified with root = the target FILE itself is not possible either: the file
 * need not already exist (the whole point is the first write that creates it), and that walk's
 * base case realpaths its own root, which would throw on a not-yet-created file.
 *
 * So identity is checked first, against the resolved (lexically normalized) candidate -- this
 * alone closes the single-file, no-prefix, and lexical-escape (`../..`) requirements. An
 * explicit leaf check runs next: if `machine.json` itself already exists and is not its own
 * realpath, the candidate is refused outright, before the shared walk below ever runs -- that
 * walk only starts climbing when the candidate does not yet exist, so an existing `machine.json`
 * planted as a symlink would otherwise realpath straight through to whatever it points at and
 * be admitted merely for staying inside the home directory, which would let this carve-out
 * resolve onto an arbitrary EXISTING in-home file of another name, `~/.claude/settings.json`
 * among them -- exactly the file `claudeSessionMemoryDirectory()` above refuses ever to admit
 * as a prefix. That is refused unconditionally: the final path segment resolving to anywhere
 * other than itself is never accepted, whatever it points at.
 *
 * The shared containment walk is then reused exactly as every other caller uses it, rooted at
 * the already-realpathed home directory (which does exist) rather than at the file itself, for
 * the ancestor protection that root actually gives -- stated exactly, not overclaimed: a
 * `.agent-pipeline` planted as a symlink before this write runs cannot redirect the write
 * OUTSIDE the realpathed home directory, but it CAN redirect it to any other location INSIDE
 * that same home directory. That remains an accepted, pinned limit, not a defended one, and it
 * stays narrower than the leaf case above: the file created there is always a NEW `machine.json`
 * in the redirected directory, never an existing file of another name -- the leaf check just
 * above is exactly what keeps that true. That home directory, on this machine class, also holds
 * the CLI's own `~/.claude/` configuration tree and the local plugin marketplace beside it -- the
 * same trees `claudeSessionMemoryDirectory()` above refuses ever to admit as a prefix. A party
 * able to plant such a symlink before this write ever runs already has write access inside the
 * real home directory, exactly the access section 5a of the same plan excludes from this guard's
 * threat model. The realpath semantics themselves are identical to every other caller of that
 * walk; only the root differs.
 */
export function isMachinePlaneWritePath(filePath, dependencies = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")
    || !isAbsolute(filePath)) return false;
  const target = machinePlaneFilePath(dependencies);
  if (target === null || resolve(filePath) !== target) return false;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  try {
    // The one case isPathWithinRealpathedRoot()'s own ancestor walk cannot catch: it only
    // starts climbing when the candidate itself does not yet exist. When `machine.json`
    // already exists as a symlink, that walk realpaths the leaf and admits any target still
    // inside the home directory -- which would let this carve-out resolve onto an arbitrary
    // existing in-home file, `~/.claude/settings.json` among them. Refused here, before the
    // shared walk ever runs; the not-yet-existing case (the ordinary first write) is
    // untouched, since `exists(target)` is false for it.
    if (exists(target) && realpath(target) !== target) return false;
  } catch {
    return false;
  }
  return isPathWithinRealpathedRoot(filePath, dirname(dirname(target)), dependencies);
}

/**
 * GF-078 bug 1. `writeTargetPath()` (lib/tool-write-target.mjs, out of this dispatch's
 * scope) only ever reads the Claude Code `file_path`/`notebook_path` keys -- Codex's own
 * write-capable tool is `apply_patch`, whose `tool_input.command` carries the ENTIRE patch
 * envelope text (`*** Begin Patch\n*** Add File: <path>\n...\n*** End Patch`), never a
 * `file_path` field. Simply adding `"apply_patch"` to `WRITE_TOOLS` would therefore not
 * admit this write -- it would make `writeTargetPath()` see an always-empty target for
 * EVERY apply_patch call (both of its fallback reads return ""), turning this into a
 * blanket refusal of every apply_patch write during restart-required rather than the one
 * narrow admission this function exists to grant. `WRITE_TOOLS` itself, and every other
 * caller of `writeTargetPath()`, are deliberately left untouched; only this one call site
 * gains a second, apply_patch-shaped extraction, narrow enough to name only the two patch
 * headers that create or fully replace a file's content ("Add File" / "Update File"),
 * mirroring guard-apply-patch.mjs's own header regex. "Delete File" and a bare "Move to"
 * destination are deliberately not matched: neither writes the resume-hint JSON body this
 * admission exists for.
 *
 * Exported for the same reason `isRestartResumeHintCapture()` already is: direct,
 * regression-testable coverage of this function's own decision, independent of whatever a
 * given caller's own tool-name gate happens to admit further up the call chain.
 */
function applyPatchTargetsResumeHintInput(command, root) {
  if (typeof command !== "string") return false;
  const lines = command.replace(/\r\n/gu, "\n").split("\n");
  for (const line of lines) {
    const header = line.match(/^\*\*\* (?:Add File|Update File): (.*)$/u);
    if (!header) continue;
    const filePath = header[1];
    if (typeof filePath === "string" && filePath !== ""
      && resolve(root, filePath) === join(root, RESTART_RESUME_HINT_INPUT_PATH)) return true;
  }
  return false;
}

export function isRestartResumeHintInputWrite(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (WRITE_TOOLS.includes(toolName)) {
    const filePath = writeTargetPath(input?.tool_input, toolName);
    return filePath !== ""
      && resolve(root, filePath) === join(root, RESTART_RESUME_HINT_INPUT_PATH);
  }
  if (toolName === "apply_patch") {
    return applyPatchTargetsResumeHintInput((input?.tool_input?.command ?? input?.tool_input?.CommandLine), root);
  }
  return false;
}

// NVA-MICRO-1 (backlog: 2026-08-09-restart-resume-hint-write-misses-the-project-prefix.md):
// a write that ALREADY missed isRestartResumeHintInputWrite() above (so this is only ever
// called after that returned false) but names the exact same file BASENAME the admitted path
// requires -- e.g. `.resume-hint-input.json` written at the repository root instead of under
// `project/`. That is a narrow, diagnosable margin: a self-correctable agent path error, not a
// case requiring a human. Deliberately narrow -- a write to a same-named file under a
// completely unrelated tree still counts (same basename is the only signal this checks,
// mirroring how little information the guard actually has about "how close" a miss is), but a
// write whose basename differs entirely (e.g. `project/resume-hint.json`, already covered by
// this file's own restart-required fixture) is NOT a near miss and falls through unchanged to
// the generic denial.
const RESTART_RESUME_HINT_INPUT_BASENAME = basename(RESTART_RESUME_HINT_INPUT_PATH);

function restartResumeHintNearMissWrite(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (!WRITE_TOOLS.includes(toolName)) return false;
  const filePath = writeTargetPath(input?.tool_input, toolName);
  if (filePath === "") return false;
  const resolved = resolve(root, filePath);
  if (resolved === join(root, RESTART_RESUME_HINT_INPUT_PATH)) return false;
  return basename(resolved) === RESTART_RESUME_HINT_INPUT_BASENAME;
}

function simpleWords(command, root, options = {}) {
  const parsed = parseGuardCommand(command, root, options);
  if (parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 1
    || parsed.operators.length !== 0
    || parsed.redirects.length !== 0) return null;
  return [parsed.segments[0].executable, ...parsed.segments[0].argv];
}

function exactRoot(args, root, index) {
  return args[index] === "--root" && args[index + 1] === root;
}

// NVA-BOOTADMIT-2 (backlog: onboarding/runner-profile-migration allowlist admitted a flag
// SET only in one fixed order, so a caller that wrote the same flags in a different order --
// or, for intake-consent-apply, omitted an individually-optional value flag its own library
// function never required -- fell through to refusal even though the underlying command was
// exactly as sanctioned as the canonical ordering). Matches an argv TAIL (flags only; the
// caller has already peeled off any fixed leading subcommand/positional tokens such as
// `apply` or `plan repair`) against a declared per-subcommand spec, order-insensitive on the
// flag SET while staying exact on everything else:
//   - `spec.required` / `spec.optional`: sets of bare flags (e.g. `--activate`) that consume
//     only themselves; the only difference between the two is whether the flag has to have
//     been seen by the end of the walk.
//   - `spec.requiredValue` / `spec.optionalValue`: maps from a value flag to its validator.
//     A value flag consumes itself plus exactly the next token, which the validator must
//     accept; the only difference between the two maps is whether the flag has to have been
//     seen by the end of the walk.
// An unknown flag, a duplicated flag, a value flag with a missing or failing value, or a
// leftover positional token where nothing is declared all fall through to no-match -- the
// walk only ever advances by consuming a declared token (plus its value, for a value flag),
// so anything else it encounters ends the match immediately.
//   - `spec.requiredValueOneOf`: a map from value flag to validator of which EXACTLY ONE
//     must be present (NVA-INTAKEARGV-1). It consumes its value like any other value flag;
//     the difference is only in the end-of-walk check. Zero alternatives supplied, or two,
//     both fall through to no-match -- so this never widens the admitted set beyond "one of
//     these, and only one".
function matchFlagSpec(argsTail, spec) {
  const required = spec.required ?? {};
  const optional = spec.optional ?? {};
  const requiredValue = spec.requiredValue ?? {};
  const optionalValue = spec.optionalValue ?? {};
  const requiredValueOneOf = spec.requiredValueOneOf ?? {};
  const seen = new Set();
  let index = 0;
  while (index < argsTail.length) {
    const token = argsTail[index];
    if (Object.prototype.hasOwnProperty.call(required, token)
      || Object.prototype.hasOwnProperty.call(optional, token)) {
      if (seen.has(token)) return false;
      seen.add(token);
      index += 1;
      continue;
    }
    let validator;
    if (Object.prototype.hasOwnProperty.call(requiredValue, token)) validator = requiredValue[token];
    else if (Object.prototype.hasOwnProperty.call(requiredValueOneOf, token)) validator = requiredValueOneOf[token];
    else validator = optionalValue[token];
    if (validator !== undefined) {
      if (seen.has(token)) return false;
      const value = argsTail[index + 1];
      if (value === undefined || !validator(value)) return false;
      seen.add(token);
      index += 2;
      continue;
    }
    return false;
  }
  const oneOfFlags = Object.keys(requiredValueOneOf);
  if (oneOfFlags.length > 0 && oneOfFlags.filter((flag) => seen.has(flag)).length !== 1) return false;
  return Object.keys(required).every((flag) => seen.has(flag))
    && Object.keys(requiredValue).every((flag) => seen.has(flag));
}

// Exported so the artifact that PRINTS this command can be tested against the rule
// that admits it. It was not, and the two disagreed: the bootstrap skill described a
// free `--card-file <json>` while this admits one fixed path, so the §6 duty was
// unsatisfiable in the pre-restart state that imposes it (measured 2026-08-09).
export function isRestartResumeHintCapture(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  const platform = options.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = options.processExecPath ?? process.execPath;
  if (!words || ![...directNode, trustedNode].includes(words[0])) return false;
  const [script, ...args] = words.slice(1);
  return script === RESUME_HINT_SCRIPT
    && args[0] === "capture"
    && args[1] === "--root" && args[2] === root
    && args[3] === "--card-file" && args[4] === join(root, RESTART_RESUME_HINT_INPUT_PATH)
    && args[5] === "--consume-card" && args.length === 6;
}

// Shared by every bounded-pipeline SINK below (isBoundedGrepPipeline's own grep-to-grep leg,
// and now isBoundedCatPipeline's grep-to-grep leg too): the identical single-command grep
// argv rule (`--files-with-matches` excluded, nothing else restricted) this file already
// applies outside a pipeline (isReadOnlySimpleWords below). Factored out once so a second
// pipeline SOURCE never means a second, parallel copy of this rule -- NVA-CATPIPE-1 briefing
// field 3, "reuse the SAME argv predicates the existing grep/head sinks already use".
function isValidPipelineGrepArgs(argv) {
  return !argv.some((arg) => arg === "--files-with-matches");
}

// Shared by every bounded-pipeline SINK ending in `head`: the exact two-token `-n N` shape
// (N in the same canonical 1..500 range guard-command-grammar.mjs's rg-to-head pipeline
// uses) isBoundedGrepPipeline already enforced inline.
//
// NVA-I-GRAMMAR: the combined `head -N` form (backlog: 2026-08-27-shell-grammar-reads-quoted-
// content-as-shell-syntax.md, repro 3) is now admitted here too, mirroring the identical
// `headOk` bound guard-command-grammar.mjs's own isBoundedReadOnlyPipeline (rg-to-head) has
// used since GF-078 bug 2 -- same canonical 1..500 range, same regex shape, checked both ways.
// `head -N` was previously refused for grep-to-head/cat-to-head while already admitted for
// rg-to-head: the identical bounded read, refused only because of which command sourced it.
const HEAD_PIPELINE_COUNT = /^(?:[1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)$/u;
function isValidPipelineHeadArgs(argv) {
  return (argv.length === 2 && argv[0] === "-n" && HEAD_PIPELINE_COUNT.test(argv[1]))
    || (argv.length === 1 && argv[0].startsWith("-") && argv[0] !== "-"
      && HEAD_PIPELINE_COUNT.test(argv[0].slice(1)));
}

/**
 * Extends the bounded read-only pipeline family (guard-command-grammar.mjs's
 * isBoundedReadOnlyPipeline, rg-to-rg/rg-to-head only) with the "grep-to-grep"
 * and "grep-to-head" shapes: the same closed, bounded two-segment structure
 * already admitted for rg, applied to grep, because a bare `grep ... | head`
 * pipeline is the most frequent read-only diagnostic shape actually rejected
 * in practice (backlog/items/2026-07-26-readonly-command-guard-classification.md;
 * specs/sprint-phoenix-epic/RECOVERY.md R-02). Deliberately kept LOCAL to this
 * file rather than added to guard-command-grammar.mjs: this dispatch's briefed
 * scope is exactly guard-lifecycle-ready.mjs, the Dev-Plan gate file, and their
 * test files -- guard-command-grammar.mjs is a separate, unbriefed file, so this
 * duplicates only the bounded head-count/redirect shape already proven safe for
 * rg (never a general shell composer). The grep source/sink argv predicate
 * itself is identical to the already-accepted single-command grep rule below
 * (`--files-with-matches` excluded) -- this recognizes the SAME already-safe
 * command now composed via one bounded pipe, nothing more permissive.
 */
function isBoundedGrepPipeline(parsed, root) {
  if (!parsed || parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 2
    || parsed.operators.length !== 1
    || parsed.operators[0].operator !== "|"
    || parsed.redirects.length > 1) return false;
  const windows = parsed.dialect === "windows-readonly-pipeline";
  const expectedGrep = windows ? "grep.exe" : "grep";
  const sourceName = basename(parsed.segments[0].executable).toLowerCase();
  if (sourceName !== expectedGrep) return false;
  if (!isValidPipelineGrepArgs(parsed.segments[0].argv)) return false;
  const sinkName = basename(parsed.segments[1].executable).toLowerCase();
  if (sinkName === expectedGrep) {
    return parsed.redirects.length === 0 && isValidPipelineGrepArgs(parsed.segments[1].argv);
  }
  if (sinkName !== (windows ? "head.exe" : "head")) return false;
  if (parsed.redirects.length === 1) {
    const redirect = parsed.redirects[0];
    if (redirect.segment !== 0 || redirect.fd !== 2 || redirect.direction !== ">"
      || (windows ? redirect.target.toLowerCase() !== "nul" : redirect.target !== "/dev/null")) return false;
  }
  return isValidPipelineHeadArgs(parsed.segments[1].argv);
}

// NVA-CATPIPE-1: the exact GNU/POSIX `cat` flags this predicate admits alongside one or more
// read paths, chosen deliberately narrow and as an ALLOWLIST (unlike isValidPipelineGrepArgs
// above, which is a denylist -- grep's flag surface changes WHAT matches, so excluding the one
// unsafe flag is the safe shape; cat's flags only ever change how already-read bytes are
// DISPLAYED, never which bytes are read or whether anything is written, so admitting a fixed,
// closed set and refusing everything else is both safe and simple). Every entry is a pure
// formatting toggle (numbering lines, marking line ends/tabs, showing non-printing characters,
// squeezing blank runs) or `-u` (unbuffered output, POSIX cat's only other defined flag) --
// none writes, none changes which paths are read. A flag this set does not recognise falls
// through to refusal below (fails closed), never silently ignored.
const CAT_PIPELINE_DISPLAY_FLAGS = new Set([
  "-A", "--show-all",
  "-b", "--number-nonblank",
  "-e",
  "-E", "--show-ends",
  "-n", "--number",
  "-s", "--squeeze-blank",
  "-t",
  "-T", "--show-tabs",
  "-u",
  "-v", "--show-nonprinting",
]);

// A local twin of guard-command-grammar.mjs's approvedReadPath(): resolve `value` against
// `root` and require it to stay inside `root`. Not imported -- approvedReadPath is not
// exported from that file (only parseGuardCommand and isBoundedReadOnlyPipeline are), and this
// dispatch's briefed scope excludes editing it. Uses this file's own already-local
// `pathInside` (below), the same containment logic guard-command-grammar.mjs's copy applies.
// A separate copy from isApprovedSingleCommandReadArg's near-identical containment check
// (isReadOnlySimpleWords' single-command rule, above) on purpose -- this dispatch's briefing
// asks for "the same approved-read-path rule the existing [rg] predicates use" for this
// pipeline family specifically, and out-of-scope for this dispatch to merge the two; this
// function must not change functionally, a different pipeline family from the single-command
// shape (pipeline.read-scope-single-command-root-check).
function isApprovedCatPipelineReadPath(value, root) {
  if (typeof value !== "string" || value === "" || value.includes("\0")) return false;
  try {
    return pathInside(resolve(root), resolve(root, value));
  } catch {
    return false;
  }
}

// cat's argv, source side: zero or more CAT_PIPELINE_DISPLAY_FLAGS entries (an optional `--`
// ends flag parsing, matching ordinary shell convention), then one or more read paths, each
// approved by isApprovedCatPipelineReadPath above. At least one path is required -- a `cat`
// with no path argument reads stdin only, which is not a file read this pipeline family
// exists to admit.
function isValidCatPipelineSourceArgs(argv, root) {
  let afterDashDash = false;
  const paths = [];
  for (const arg of argv) {
    if (!afterDashDash && arg === "--") { afterDashDash = true; continue; }
    if (!afterDashDash && arg.startsWith("-") && arg !== "-") {
      if (!CAT_PIPELINE_DISPLAY_FLAGS.has(arg)) return false;
      continue;
    }
    paths.push(arg);
  }
  return paths.length > 0 && paths.every((path) => isApprovedCatPipelineReadPath(path, root));
}

/**
 * NVA-CATPIPE-1. Extends the same bounded pipeline family isBoundedGrepPipeline established
 * (above) with a `cat`-sourced source: `cat <paths...> | grep ...` and
 * `cat <paths...> | head -n N`. Measured 2026-08-27: `cat <repo-file> | grep -c open` was
 * refused GUARD-OPERATOR-UNAPPROVED in this repository, and in a different governed
 * repository `cat .claude/pipeline.yaml .claude/pipeline.json .claude/settings.json | grep -E
 * '...'` was refused GUARD-GATE-STRENGTH-SHELL even though that refusal's own text claims cat
 * reads are admitted -- true only for the single-command form until now.
 *
 * Sink half identical to isBoundedGrepPipeline: the same isValidPipelineGrepArgs /
 * isValidPipelineHeadArgs helpers, one sink rule shared by both sources, never a second
 * parallel copy. Source half validated by isValidCatPipelineSourceArgs above -- see that
 * function and CAT_PIPELINE_DISPLAY_FLAGS for the flag-allowlist and path-restriction
 * rationale (deliberately narrower than the existing single-command `cat` rule).
 */
function isBoundedCatPipeline(parsed, root) {
  if (!parsed || parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 2
    || parsed.operators.length !== 1
    || parsed.operators[0].operator !== "|"
    || parsed.redirects.length > 1) return false;
  const windows = parsed.dialect === "windows-readonly-pipeline";
  const expectedCat = windows ? "cat.exe" : "cat";
  const sourceName = basename(parsed.segments[0].executable).toLowerCase();
  if (sourceName !== expectedCat) return false;
  if (!isValidCatPipelineSourceArgs(parsed.segments[0].argv, root)) return false;
  const sinkName = basename(parsed.segments[1].executable).toLowerCase();
  const expectedGrep = windows ? "grep.exe" : "grep";
  if (sinkName === expectedGrep) {
    return parsed.redirects.length === 0 && isValidPipelineGrepArgs(parsed.segments[1].argv);
  }
  if (sinkName !== (windows ? "head.exe" : "head")) return false;
  if (parsed.redirects.length === 1) {
    const redirect = parsed.redirects[0];
    if (redirect.segment !== 0 || redirect.fd !== 2 || redirect.direction !== ">"
      || (windows ? redirect.target.toLowerCase() !== "nul" : redirect.target !== "/dev/null")) return false;
  }
  return isValidPipelineHeadArgs(parsed.segments[1].argv);
}

/**
 * Splits a command string on top-level `&&` occurrences only, mirroring
 * retryActionsForDeniedCommand's own quote- and escape-aware local scanner below (same
 * file) but for `&&` instead of `;`/newline. Deliberately NOT delegated to
 * guard-command-grammar.mjs's shared tokenizer: that tokenizer treats `&&` -- together
 * with `;`, `||`, bare `&`, `(`, `)` -- as an unconditional CONTROL rejection
 * (parseGuardCommand returns parseStatus "denied", segments/operators empty) for every
 * OTHER caller across the Pipeline, and this dispatch's briefed scope is
 * guard-lifecycle-ready.mjs only -- widening the SHARED tokenizer would touch every
 * consumer of parseGuardCommand, far outside it. So this file grows its own narrow
 * `&&`-only splitter, the same local-scanner shape already established here.
 *
 * ANY other control character (|, ;, bare &, <, >, (, )) at the top level aborts the
 * split entirely (returns null): admitting an `&&`-chain must never become a side door
 * for a DIFFERENT, still-unapproved operator riding along inside it -- in particular, a
 * chain ending in a pipe (e.g. `git log | head`) is deliberately NOT admitted by this
 * function. This is NOT an unbriefed shape: backlog/items/2026-08-19-closed-shell-
 * grammar-still-rejects-common-readonly-composition.md Proposal point 1 explicitly names
 * "the existing grep-to-grep/grep-to-head pipeline shape as a trailing stage" as accepted
 * scope, and the PO accepted it -- it is simply NOT YET implemented here, deliberately
 * deferred to a dedicated follow-up tracked separately from this dispatch. Each returned
 * part is re-validated independently through parseGuardCommand by the caller -- this
 * function only locates boundaries, it grants no authority on its own.
 */
function splitTopLevelAndChain(command) {
  if (typeof command !== "string" || command.trim() === "" || /[\0`]/u.test(command)) return null;
  const parts = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      if (char === "\r" || char === "\n") return null;
      escaped = false;
      continue;
    }
    if (quote !== "'" && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "\r" || char === "\n") return null;
    if (char === "&" && command[index + 1] === "&") {
      parts.push(command.slice(start, index).trim());
      start = index + 2;
      index += 1;
      continue;
    }
    if (";&<>()".includes(char)) return null;
  }
  if (quote !== null || escaped) return null;
  parts.push(command.slice(start).trim());
  if (parts.length < 2 || parts.length > MAX_AND_CHAIN_SEGMENTS) return null;
  if (parts.some((part) => part === "")) return null;
  return parts;
}

// Narrow, explicit allowlist of safe `git log` display flags for the `&&`-chain family.
// A WHITELIST, not a denylist of known-bad flags -- so an unrecognized flag fails closed
// by construction ("if genuinely unsure whether a specific flag is safe, exclude it and
// disclose the exclusion rather than guessing it's fine"). `--all` is deliberately
// EXCLUDED (it reaches refs beyond the working branch); nothing resembling `-c`,
// `--exec`, a pager-invoking flag, or a credential-touching flag is in this set, and
// nothing outside this set is admitted regardless of how safe it looks.
const GIT_LOG_CHAIN_ALLOWED_FLAGS = new Set([
  "--oneline", "--stat", "--name-only", "--name-status", "--graph",
  "--no-merges", "--merges", "--reverse", "--abbrev-commit",
]);

function isChainEligibleGitLogArgs(argv) {
  let maxCountSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (GIT_LOG_CHAIN_ALLOWED_FLAGS.has(arg)) continue;
    if (/^-[1-9][0-9]{0,2}$/u.test(arg)) {
      if (maxCountSeen) return false;
      maxCountSeen = true;
      continue;
    }
    if (arg === "-n") {
      const value = argv[index + 1];
      if (maxCountSeen || typeof value !== "string" || !/^[1-9][0-9]{0,2}$/u.test(value)) return false;
      maxCountSeen = true;
      index += 1;
      continue;
    }
    if (/^--max-count=[1-9][0-9]{0,2}$/u.test(arg)) {
      if (maxCountSeen) return false;
      maxCountSeen = true;
      continue;
    }
    return false;
  }
  return true;
}

// The backlog item's exact "restricted to paths already permitted for agent writes --
// scratch/, scratchpad, `.claude/worktrees/**`" scope, minus `scratchpad`: `scratchpad`
// names an OS-external path (this session's own scratchpad directory, outside the repo),
// never reachable from this in-repo-only classifier -- a path outside `root` can never
// pass the `isProjectWritePath` containment check below, so admitting it here would be a
// silent no-op at best. Deliberately NOT the general `isProjectWritePath` predicate (that
// admits ANY in-repo path, which is exactly the bug this narrowing fixes): a governed but
// not-yet-onboarding-ready session must not be able to create a directory anywhere in the
// repo merely by riding the `&&`-chain family, bypassing the onboarding-readiness gate
// evaluateAfterGrammarAdmission() enforces below. `.claude/worktrees` is repo-relative
// from `root`, matching this file's own path-join convention (`join`, not a raw string).
const CHAIN_ELIGIBLE_MKDIR_PREFIXES = [
  "scratch",
  join(".claude", "worktrees"),
];

/**
 * `mkdir -p` chain eligibility: `isProjectWritePath` is still required (containment / no
 * symlink-escape through an existing ancestor), but it is now an ADDITIONAL check, never
 * the only gate -- the actual restriction is the prefix allowlist above. A target must
 * resolve, relative to `root`, to exactly `scratch/...` or `.claude/worktrees/...`.
 */
function isChainEligibleMkdirTarget(target, root) {
  if (!isProjectWritePath(target, root)) return false;
  const rel = relative(root, resolve(root, target));
  return CHAIN_ELIGIBLE_MKDIR_PREFIXES.some(
    (prefix) => rel === prefix || rel.startsWith(`${prefix}${sep}`),
  );
}

/**
 * The exact small set the backlog item names: git rev-parse, git log (restricted
 * flags), git status, echo, ls, mkdir -p (restricted to scratch/ or .claude/worktrees/,
 * see isChainEligibleMkdirTarget above). `git rev-parse`/`git status`/`ls` are admitted
 * with any argv here because isReadOnlySimpleWords below already admits them
 * unconditionally as single commands -- chaining grants no new authority over what each
 * already does alone. `echo` is admitted with any argv: it has no side effects (no
 * redirect can ride along, since every chain segment below is independently required to
 * parse with zero redirects of its own). Deliberately no `-C`/`-c` support here (unlike
 * the single-command git rule's `-C` handling): keeping the chain family free of the
 * cross-repository-reaching `-C` shape is a deliberate narrowing, not an oversight -- an
 * argv beginning with `-C` or `-c` simply fails every subcommand match below and is
 * refused.
 */
function isChainEligibleSegment(segment, root) {
  const executable = basename(segment.executable).toLowerCase();
  const argv = segment.argv;
  if (executable === "echo") return true;
  if (executable === "ls") return true;
  if (executable === "mkdir") {
    return argv.length === 2 && argv[0] === "-p" && isChainEligibleMkdirTarget(argv[1], root);
  }
  if (executable !== "git") return false;
  const subcommand = argv[0];
  if (subcommand === "rev-parse" || subcommand === "status") return true;
  if (subcommand === "log") return isChainEligibleGitLogArgs(argv.slice(1));
  return false;
}

/**
 * Extends the bounded-composition exception family (the same shape isBoundedGrepPipeline
 * above already established) to `&&`-chained read-only commands, per backlog/items/
 * 2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md Proposal
 * point 1, 2026-08-19-readonly-and-chain-grep-pipe-trailing-stage-not-implemented.md, and
 * (NVA-I-GRAMMAR) the PO's 2026-08-28 decision to admit `&&` generally, recorded in backlog/
 * items/2026-08-27-shell-grammar-reads-quoted-content-as-shell-syntax.md: "anything
 * expressible as `a && b` is already expressible as two tool calls, each classified exactly
 * as it would be inside the chain."
 *
 * Every segment (leading, middle, or trailing -- position no longer matters, per that same
 * no-new-authority argument) is admitted if EITHER of two independent, unioned tests passes,
 * never a verdict inherited from an earlier segment:
 *
 *   1. isReadOnlyDiagnosticCommand(part, root) -- the EXACT classifier a standalone Bash tool
 *      call carrying that same text would be judged by (evaluateLifecycleReadyGuard calls it
 *      identically, a few hundred lines below). Recursion is bounded: `part` is one segment
 *      already split on `&&`, so its own splitTopLevelAndChain() call finds none and returns
 *      null immediately, meaning isBoundedReadOnlyAndChain(part, ...) itself always resolves
 *      to false one level down -- no unbounded recursion, one extra cheap check per part.
 *   2. isChainEligibleSegment -- the small, pre-existing, explicitly-approved-even-though-not-
 *      "read-only" allowlist (echo; mkdir -p restricted to scratch/.claude/worktrees) kept
 *      unchanged so no previously-admitted chain shape regresses.
 *
 * A command failing this union is refused: it falls straight through to parseGuardCommand,
 * whose own tokenizer treats a top-level `&&` as an unconditional CONTROL rejection
 * (guard-command-grammar.mjs, out of this dispatch's scope) -- GUARD-PARSE-UNSUPPORTED, with
 * rejectedAndChainSegment() (below) naming which exact segment failed and why.
 */
function isBoundedReadOnlyAndChain(command, root) {
  const parts = splitTopLevelAndChain(command);
  if (!parts) return false;
  return parts.every((part) => isChainSegmentAdmitted(part, root));
}

function isChainSegmentAdmitted(part, root) {
  if (isReadOnlyDiagnosticCommand(part, root)) return true;
  const parsedPart = parseGuardCommand(part, root);
  return parsedPart.parseStatus === "accepted"
    && parsedPart.segments.length === 1
    && parsedPart.operators.length === 0
    && parsedPart.redirects.length === 0
    && isChainEligibleSegment(parsedPart.segments[0], root);
}

/**
 * DoD 4 (NVA-I-GRAMMAR): a refused `&&`-chain names WHICH segment failed, not just that the
 * whole command did -- "a chain refused as a whole teaches nothing" (backlog item, same id).
 * Returns null for anything that is not itself a syntactically well-formed `&&`-chain (so the
 * generic GUARD-PARSE-UNSUPPORTED messaging in rejectedGrammarElement is untouched for those);
 * otherwise the 1-based index, the exact segment text, and the total segment count of the
 * FIRST segment that fails the identical union isBoundedReadOnlyAndChain itself applies --
 * never a second, competing definition of "admitted".
 */
function rejectedAndChainSegment(command, root) {
  const parts = splitTopLevelAndChain(command);
  if (!parts) return null;
  const index = parts.findIndex((part) => !isChainSegmentAdmitted(part, root));
  if (index === -1) return null;
  return { position: index + 1, total: parts.length, segment: parts[index] };
}

/**
 * Admits a bare trailing `2>/dev/null` (POSIX) or `2>nul` (Windows) stderr redirect on a
 * command that is ALREADY independently classified read-only on its own, per backlog
 * Proposal point 2. Reuses parseGuardCommand's own redirect parsing (which already
 * respects quoting) rather than a raw-string scan, so a quoted argument that merely LOOKS
 * like a redirect can never be misread as one.
 *
 * `2>&1` is deliberately NOT admitted here: the shared tokenizer treats the `&` inside a
 * redirect target as a segment/operator terminator, so a bare `2>&1` never produces an
 * empty-vs-populated target it can accept -- parseGuardCommand returns parseStatus
 * "denied" for it today, exactly as it does for `&&`. Making `2>&1` parseable would mean
 * widening guard-command-grammar.mjs's tokenizer, out of this dispatch's briefed scope
 * (guard-lifecycle-ready.mjs and its test file only). Disclosed as a drawn boundary, not
 * implemented.
 */
function simpleWordsAllowingTrailingStderrDevNullRedirect(command, root) {
  const parsed = parseGuardCommand(command, root);
  if (parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 1
    || parsed.operators.length !== 0
    || parsed.redirects.length !== 1) return null;
  const redirect = parsed.redirects[0];
  const windows = parsed.dialect === "windows-direct";
  const isAdmittedRedirect = redirect.fd === 2 && redirect.direction === ">"
    && (windows ? redirect.target.toLowerCase() === "nul" : redirect.target === "/dev/null");
  if (!isAdmittedRedirect) return null;
  return [parsed.segments[0].executable, ...parsed.segments[0].argv];
}

function isReadOnlyDiagnosticCommandWithTrailingStderrRedirect(command, root) {
  const words = simpleWordsAllowingTrailingStderrDevNullRedirect(command, root);
  return words !== null && isReadOnlySimpleWords(words, root);
}

/**
 * A single un-piped read command's path-taking argument, checked against the identical
 * containment rule isOutsideRootBoundedDiagnosticRead() already applies to the piped shape:
 * a flag (commandPath() returns null) is never a path token and is always approved; a real
 * path argument must resolve inside `root` or one of `extraRoots`. Reused rather than a
 * second copy of the containment logic (see isOutsideRootBoundedDiagnosticRead's own
 * scopeLifted comment for why a second copy is exactly the drift this repository's
 * guardrails warn against).
 */
function isApprovedSingleCommandReadArg(arg, root, extraRoots) {
  const resolved = commandPath(arg, root); // null for flags -> not a path token
  if (resolved === null) return true;
  if (pathInside(root, resolved)) return true;
  return extraRoots.some((extra) => {
    try { return pathInside(resolve(extra), resolved); } catch { return false; }
  });
}

/**
 * Keep fail-closed lifecycle states diagnosable without turning arbitrary
 * shell syntax into a write bypass.  Only one simple command is accepted; the
 * parser already rejects control operators, redirections and command
 * substitution. The bounded rg and grep pipeline families (above) are the
 * only two-segment exceptions.
 *
 * Shared tail logic, factored out of isReadOnlyDiagnosticCommand so the trailing-redirect
 * exception above can validate an already-tokenized `[executable, ...argv]` shape without
 * re-parsing (and without duplicating this whole classifier). Behavior for every existing
 * caller of isReadOnlyDiagnosticCommand is unchanged -- this is a pure extraction.
 *
 * `extraRoots` defaults to BOUNDED_PIPELINE_ADDITIONAL_ROOTS so both existing call sites
 * (neither of which passes a third argument) keep exactly the piped shape's own allowance
 * for reading this plugin's own installed root, for free.
 */
function isReadOnlySimpleWords(words, root, extraRoots = BOUNDED_PIPELINE_ADDITIONAL_ROOTS) {
  if (!words || words.length === 0) return false;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);
  if (executable === "pwd") return args.length === 0 || (args.length === 1 && args[0] === "-P");
  if (["node", "node.exe"].includes(executable)) {
    return args.length === 2
      && args[0] === "--check"
      && !args[1].startsWith("-")
      && isProjectWritePath(args[1], root);
  }
  if (executable === "sha256sum") {
    // backlog: 2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md
    // (C3). Several path arguments are admitted, each subject to the identical
    // containment check a single path already applies -- `.every()` refuses
    // the whole command if even one entry escapes, so a mixed list cannot be
    // admitted because most of it is fine (AC-3).
    const paths = args[0] === "--" ? args.slice(1) : args;
    return paths.length > 0
      && paths.every((path) => typeof path === "string"
        && !path.startsWith("-")
        && isProjectWritePath(path, root));
  }
  if (executable === "shasum") {
    if (args.length < 3 || !["-a", "--algorithm"].includes(args[0]) || args[1] !== "256") return false;
    const paths = args.slice(2);
    return paths.every((path) => typeof path === "string"
      && !path.startsWith("-")
      && isProjectWritePath(path, root));
  }
  if (["certutil", "certutil.exe"].includes(executable)) {
    return args.length === 3
      && args[0].toLowerCase() === "-hashfile"
      && !args[1].startsWith("-")
      && args[2].toUpperCase() === "SHA256"
      && isProjectWritePath(args[1], root);
  }
  if (["ls", "rg", "grep", "cat", "head", "tail", "wc", "stat", "file"].includes(executable)) {
    if (args.some((arg) => arg === "--files-with-matches" && executable === "grep")) return false;
    // The single-command sibling of isOutsideRootBoundedDiagnosticRead's containment check --
    // see isOutsideRootSingleCommandRead() below, whose comment carries the item's done_when
    // marker.
    return args.every((arg) => isApprovedSingleCommandReadArg(arg, root, extraRoots));
  }
  if (executable === "sed") {
    return !args.some((arg) => /^-[^-]*[iew]/u.test(arg) || /^--(?:in-place|expression|file)(?:=|$)/u.test(arg));
  }
  if (executable === "find") {
    return !args.some((arg) => ["-delete", "-exec", "-execdir", "-fprint", "-fprintf", "-fls", "-ok", "-okdir"].includes(arg));
  }
  if (executable !== "git") return false;
  let index = 0;
  if (args[index] === "-C") index += 2;
  const subcommand = args[index];
  const subargs = args.slice(index + 1);
  if (["status", "diff", "log", "show", "rev-parse", "ls-files", "ls-tree", "for-each-ref"].includes(subcommand)) {
    return true;
  }
  if (subcommand === "branch") {
    return subargs.length === 0 || subargs.every((arg) =>
      arg === "--list" || arg === "--show-current" || arg === "--contains" || arg.startsWith("--format="));
  }
  if (subcommand === "remote") return subargs.length === 0 || (subargs.length === 1 && subargs[0] === "-v");
  // Fetch updates only remote-tracking/object state; it never changes the
  // index or working tree.  A stale or migration-required lifecycle must not
  // prevent an operator from observing the current upstream.  Destructive
  // adoption remains separately guarded at checkout/switch time.
  if (subcommand === "fetch") return true;
  return subcommand === "config"
    && subargs.length >= 2
    && ["--get", "--get-all", "--get-regexp"].includes(subargs[0]);
}

export function isReadOnlyDiagnosticCommand(command, root) {
  const parsed = parseGuardCommand(command, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
  if (isBoundedReadOnlyPipeline(parsed, root, BOUNDED_PIPELINE_ADDITIONAL_ROOTS)) return true;
  if (isBoundedGrepPipeline(parsed, root)) return true;
  if (isBoundedCatPipeline(parsed, root)) return true;
  if (isBoundedReadOnlyAndChain(command, root)) return true;
  if (isReadOnlyDiagnosticCommandWithTrailingStderrRedirect(command, root)) return true;
  return isReadOnlySimpleWords(simpleWords(command, root), root);
}

/**
 * GRAMMARHINT-1 AC-2 / GUARDFIX-2: the one GUARD-PARSE-UNSUPPORTED shape with a fixed, safe,
 * universally available remediation -- a `git commit ... -m <value>` (or `--message`) whose
 * message text carries a literal newline or carriage return, which the closed grammar can
 * never admit (control characters are refused unconditionally, parseGuardCommand()'s first
 * line, before any tokenization runs). The fix does not depend on the message content: write
 * it to a file, then `git commit -F <file>`.
 *
 * It is delivered as MESSAGE TEXT, never as a typed retryAction. AC-047-140 admits an entry
 * into `pipeline.guard-retry-actions.v1` only when "every returned action is a
 * separate-tool-call, independently admitted read-only diagnostic", and `git commit -F` is a
 * mutation the closed grammar does not admit on its own -- not a borderline case but exactly
 * what that sentence excludes. Shipping it as an action also put the producer at odds with the
 * envelope's only in-repo consumer: denialRetryActions() (lib/human-guard-override.mjs) drops
 * every action whose `mutation` is not `false`, so it could never be executed through that
 * path either. Prose carries no such contract -- it can name a mutating fix without claiming
 * the envelope's read-only guarantee for it, which is why the help survives here undiminished.
 *
 * Detected narrowly, by raw text, never by re-parsing the command into the closed grammar:
 * "git commit" at the start, an -m/--message flag present, and a literal newline/CR
 * somewhere in the command. A false negative here only means no remediation line is printed
 * (never worse than the silence that preceded it); it can never print a wrong one, and
 * printing it never changes what the grammar admits (AC-3) -- the verdict is untouched, only
 * better explained. Deliberately narrow: `git -C <dir> commit` and other prefixed invocations
 * are not matched (reported as a known limitation, not silently claimed as covered).
 */
function commitMessageFileRemediation(command) {
  if (typeof command !== "string") return null;
  if (!/^\s*git\s+commit\b/u.test(command)) return null;
  if (!/(?:^|\s)-m(?:[\s"'=]|$)|(?:^|\s)--message\b/u.test(command)) return null;
  if (!/[\r\n]/u.test(command)) return null;
  return "Remediation: a commit message carrying a newline cannot be passed on the command line. "
    + "Write the message to a file, then run \"git add -- <paths>\" and "
    + "\"git commit -F <msgfile> -- <paths>\" as two separate tool calls, naming the same exact paths in both.";
}

/**
 * Recover only independent semicolon- or physical-newline-separated
 * diagnostics. This is a correction hint, never an execution bypass: each
 * returned argv must pass the same closed single-command read-only policy on
 * its own. Quoted and escaped newlines are deliberately not normalized -- a
 * newline inside quotes (the `git commit -m` case above) yields no action at
 * all, and its remediation is printed as message text instead. No caller may
 * add an entry past the per-part policy below: the returned list is the whole
 * envelope, and every element of it has passed that policy.
 */
export function retryActionsForDeniedCommand(command, root) {
  if (typeof command !== "string" || command.trim() === ""
    || /[\0`]/u.test(command) || /\$\s*\(/u.test(command)) return [];
  const parts = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      if (char === "\r" || char === "\n") return [];
      escaped = false;
      continue;
    }
    if (quote !== "'" && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === ";" || char === "\n" || char === "\r") {
      if (char === "\r" && command[index + 1] !== "\n") return [];
      parts.push(command.slice(start, index).trim());
      start = index + (char === "\r" ? 2 : 1);
      if (char === "\r") index += 1;
      continue;
    }
    if ("|&<>()".includes(char)) return [];
  }
  if (quote !== null || escaped || parts.length === 0) return [];
  parts.push(command.slice(start).trim());
  if (parts.some((part) => part === "")) return [];
  const actions = [];
  for (const part of parts) {
    const parsed = parseGuardCommand(part, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
    if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
      || parsed.operators.length !== 0 || parsed.redirects.length !== 0
      || !isReadOnlyDiagnosticCommand(part, root)) return [];
    actions.push({
      executable: parsed.segments[0].executable,
      argv: [...parsed.segments[0].argv],
      mutation: false,
      requiresConfirmation: false,
      executionBoundary: "separate-tool-call",
      expected: { exitCodes: [0, 1] },
    });
  }
  return actions;
}

function pipelineSourceRoot(root, exists = existsSync) {
  return exists(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"))
    && exists(join(root, "harness", "scripts", "verify.mjs"));
}

function commandPath(value, root) {
  if (typeof value !== "string" || value === "" || value.startsWith("-")) return null;
  return resolve(root, value);
}

/**
 * The one redirect shape that writes nothing anywhere: stderr sent to the platform null
 * device. Shared by BOTH redirect classifiers -- the accepted-parse branch of
 * isForbiddenCrossRepositoryMutation() and the unparsed-command fallback
 * hasExternalOutputRedirect() -- so the two cannot drift apart again.
 *
 * They had drifted. The accepted-parse branch already exempted `2>/dev/null`; the fallback
 * did not, so any command the closed grammar could not parse -- `cmd 2>/dev/null; cmd2`,
 * `cmd 2>/dev/null && cmd2` -- was refused as GUARD-CROSS-REPO-MUTATION on the strength of
 * its stderr suppressor. Suppressing stderr mutates nothing, least of all another
 * repository, and what was actually wrong with those commands (composition) has its own
 * truthful code. A guard that misnames what it caught teaches operators to distrust the
 * codes it gets right. Measured 2026-08-08.
 *
 * This exempts a REASON, never a command: such commands are still refused, by the closed
 * grammar (GUARD-PARSE-UNSUPPORTED / GUARD-REDIRECT-UNAPPROVED) one screen below. Narrow by
 * construction -- file descriptor 2 only, the null device only, per redirect. `2>audit.log`,
 * `>/dev/null`, `&>/dev/null` and every stdout redirect stay outside it, and a second
 * redirect in the same command is judged on its own (`cmd 2>/dev/null > /etc/passwd` stays a
 * cross-repository mutation).
 */
function isNullDeviceStderrRedirect(fd, target) {
  return fd === 2 && (target === "/dev/null" || target.toLowerCase() === "nul");
}

/**
 * NVA-BL-75 (backlog: guard-reclassification-changed-what-a-signature-can-lift). WHY the
 * exemption above is correct -- not merely harmless. 88d316d proved that it admits nothing;
 * the reasoning for the classification itself lived only in the backlog item that reviewed
 * it, which is exactly the kind of thing that has to be readable next to the code.
 *
 * The claim, on its own terms: `2>/dev/null` writes nothing, anywhere -- least of all into
 * another repository. It therefore never was a cross-repository mutation, and was never a
 * member of the class this function selects. Skipping it removes a FALSE POSITIVE; it does
 * not carve an exception out of a true one. What such commands are actually refused for --
 * composition the closed grammar does not accept -- is untouched and keeps its own code.
 *
 * Why that distinction is worth stating: the class this function selects is not only a
 * denial code, it is an OVERRIDE class. At 88d316d, GUARD-CROSS-REPO-MUTATION was a bare
 * refusal (ADR-0059 Decision 5) while the three grammar codes routed through the human
 * override planner (Decisions 3/4), so reclassifying looked like moving a command from
 * "never liftable" into "liftable by a signed human override" while its verdict stayed put.
 * Correctness of the classification is what settles that: a command that is not a
 * cross-repository mutation must not be held in the non-liftable class BY a cross-repository
 * label it does not deserve. A guard may refuse a command for what it is; it may not keep a
 * human from authorizing it on the strength of a fact that is untrue.
 *
 * Two things keep that from being a mere assertion:
 *   - ADR-0059 Decision 6 has since made the cross-repository class routable too, through its
 *     own narrower `cross-repository-target` class whose plan carries a scopeAttestation. So
 *     today BOTH classes route, on different terms -- which is why the difference is measured
 *     rather than argued: guard-lifecycle-ready.test.mjs's NVA-BL-75 corpus pins the pair
 *     (denial code, override class) per command, so the next reclassification that moves a
 *     command between override classes fails a test instead of needing a reviewer.
 *   - For the exact shapes 88d316d moved (`cmd 2>/dev/null; cmd2` and siblings) the measured
 *     reachability delta is zero, under either code: HGO's own eligibility()
 *     (lib/human-guard-override.mjs) refuses an unparseable command containing `>` before it
 *     can be classified, so no capability is armable for one and the guard says so
 *     ("No human override route ... status=external-operator-required"). That refusal
 *     predates the reclassification (af5826e7, 2026-07-29), so no signature gained reach.
 */
function hasExternalOutputRedirect(command, root) {
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (quote === "\"" && char === "\\") index += 1;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char !== ">") continue;
    if (command[index + 1] === ">" || command[index + 1] === "&") continue;
    // Same descriptor rule the tokenizer uses (hooks/guard-command-grammar.mjs, the
    // `char === "2" && command[index + 1] === ">"` branch): a `2` immediately before the
    // `>` names file descriptor 2. `&>` and a bare `>` are deliberately not descriptor 2.
    const fd = command[index - 1] === "2" ? 2 : null;
    let cursor = index + 1;
    while (cursor < command.length && /\s/u.test(command[cursor])) cursor += 1;
    let target = "";
    while (cursor < command.length && !/\s/u.test(command[cursor])
      && !"|;&<>()".includes(command[cursor])) {
      target += command[cursor];
      cursor += 1;
    }
    if (isNullDeviceStderrRedirect(fd, target)) continue;
    const resolved = commandPath(target, root);
    if (resolved !== null && !pathInside(root, resolved)) return true;
  }
  return false;
}

/**
 * NVA-BL-76: is this command the bounded read-only diagnostic pipeline that
 * isReadOnlyDiagnosticCommand() admits in every respect EXCEPT that a read target resolves
 * outside the project root (and outside BOUNDED_PIPELINE_ADDITIONAL_ROOTS)?
 *
 * Answered by evaluating the SAME predicate twice -- never by a second, competing parse of
 * the command, and never by re-deriving which argv token is a path (the rule against a rival
 * parser that rejectedGrammarElement() states one screen up applies here verbatim). The
 * second call passes every argv token, resolved against the invocation root, as its own
 * approved read root; `approvedReadPath` resolves a candidate exactly the same way, so
 * `pathInside(extra, target)` is true (rel === "") for precisely the path candidates and the
 * call returns true iff every OTHER bound already holds: two segments, one `|`, rg as the
 * producer, validateRg's flag allowlist on both sides, head's canonical 1..500 count, and
 * the single admitted `2>/dev/null` suppressor. `rg … | tee out.txt`, `… | head -n 9999`
 * and `… | head -n 5 > out.txt` therefore stay false and keep their existing codes.
 *
 * This never admits anything. Its only consumer picks WHICH refusal is printed, so the
 * relaxed second evaluation cannot widen what the guard allows: the first call, with the
 * real roots, is still the one that decides admission (isReadOnlyDiagnosticCommand).
 */
export function isOutsideRootBoundedDiagnosticRead(parsed, root) {
  if (!parsed || parsed.parseStatus !== "accepted") return false;
  if (isBoundedReadOnlyPipeline(parsed, root, BOUNDED_PIPELINE_ADDITIONAL_ROOTS)) return false;
  const scopeLifted = parsed.segments.flatMap((segment) => segment.argv
    .filter((token) => typeof token === "string" && token !== "" && !token.includes("\0"))
    .map((token) => {
      try { return resolve(root, token); } catch { return null; }
    })
    .filter((value) => value !== null));
  return isBoundedReadOnlyPipeline(parsed, root, [...BOUNDED_PIPELINE_ADDITIONAL_ROOTS, ...scopeLifted]);
}

/**
 * pipeline.read-scope-single-command-root-check: the single, un-piped sibling of
 * isOutsideRootBoundedDiagnosticRead() just above -- is this command the single-command
 * read-only shape isReadOnlyDiagnosticCommand() admits in every respect EXCEPT that a read
 * target resolves outside the project root (and outside BOUNDED_PIPELINE_ADDITIONAL_ROOTS)?
 * Before this check existed, isReadOnlySimpleWords() imposed no containment restriction at
 * all on the single-command shape while the piped shape was already root-checked -- so
 * protection against reading outside the project root depended on the shell shape of the
 * command (piped vs. not), not on the actual filesystem target being read (backlog:
 * 2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md).
 *
 * Answered by the identical two-call pattern as the piped sibling: the first call, with the
 * real roots, decides whether this shape is a read-only single command AT ALL (an in-root
 * read short-circuits earlier via isReadOnlyDiagnosticCommand() and never reaches this
 * function; a command not shaped like a read-only single command -- e.g. `grep
 * --files-with-matches`, or any write/mutating command -- returns false on the first call
 * regardless of extraRoots, since none of those branches ever consult extraRoots). The
 * second call, with the read's own literal path arguments additionally approved as extra
 * roots, answers "was the containment check the ONLY thing blocking this command" -- exactly
 * the question isOutsideRootBoundedDiagnosticRead() answers for the piped shape. This never
 * admits anything; its only consumer (evaluateLifecycleReadyGuard()) picks WHICH refusal
 * code is printed, so the relaxed second evaluation cannot widen what the guard allows.
 */
export function isOutsideRootSingleCommandRead(parsed, root) {
  if (!parsed || parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return false;
  const words = [parsed.segments[0].executable, ...parsed.segments[0].argv];
  if (isReadOnlySimpleWords(words, root)) return false;
  const scopeLifted = words.slice(1)
    .filter((token) => typeof token === "string" && token !== "" && !token.includes("\0"))
    .map((token) => {
      try { return resolve(root, token); } catch { return null; }
    })
    .filter((value) => value !== null);
  return isReadOnlySimpleWords(words, root, [...BOUNDED_PIPELINE_ADDITIONAL_ROOTS, ...scopeLifted]);
}

function poApprovalArgs(command, root, scriptPath) {
  const words = simpleWords(command, root);
  if (!words || words.length < 3 || resolve(root, words[1]) !== scriptPath) return null;
  return words.slice(2);
}

function externalApprovalDirectory(args, root, index) {
  return args[index] === "--directory"
    && typeof args[index + 1] === "string"
    && isAbsolute(args[index + 1])
    && !pathInside(root, resolve(args[index + 1]));
}

/**
 * Preparation and verification handle public, candidate-bound artifacts only.
 * They are agent work.  Setup and signing remain excluded below because they
 * can access the human's private key or terminal passphrase prompt.
 */
export function isAgentPoPublicCommand(command, root) {
  const args = poApprovalArgs(command, root, PO_APPROVAL_GATE_SCRIPT);
  if (!args) return false;
  const feature = (index) => args[index] === "--feature-id" && ["cyb-4", "cyb-5"].includes(args[index + 1]);
  if (["prepare-all", "verify-all"].includes(args[0])) {
    return args[1] === "--repo-root" && args[2] === root
      && externalApprovalDirectory(args, root, 3) && args.length === 5;
  }
  if (["prepare", "verify"].includes(args[0])
    && args[1] === "--repo-root" && args[2] === root
    && externalApprovalDirectory(args, root, 3)) {
    return args.length === 5 || (feature(5) && args.length === 7);
  }
  return false;
}

// The full po-human-approval.mjs KNOWN_COMMANDS set is twelve subcommands, but only six of
// them are human-terminal signing actions -- po-human-approval.mjs's own header docstring is
// explicit: "prepare" (and prepare-all/prepare-critical) "writes only public candidate-bound
// requests and is agent work", and "verify" (and verify-all/verify-critical) "is public
// readback and is agent work again". Only setup/approve/approve-all/approve-critical/
// authorize-critical/sign-intent are the human-terminal signing half of the split (backlog
// 2026-08-07-lifecycle-guard-does-not-know-the-human-signing-commands.md: "names only three of
// six" -- six, not twelve, is the correct target). Recognising the agent-work half here too
// would regress the existing agent-executable prepare/verify path this guard's own test suite
// pins ("agents prepare and verify only public PO artifacts while human signing stays
// external").
function isHumanPoSigningCommand(command, root) {
  const args = poApprovalArgs(command, root, PO_HUMAN_APPROVAL_SCRIPT);
  return args !== null && [
    "setup", "approve", "approve-all", "approve-critical", "authorize-critical", "sign-intent",
  ].includes(args[0]);
}

/**
 * Identify the concrete cross-repository mutation patterns involved in local
 * plugin development. Read-only commands remain handled by the diagnostic
 * allowlist; unknown commands do not gain mutation authority from this helper.
 */
export function isForbiddenCrossRepositoryMutation(command, root, dependencies = {}) {
  const parsed = parseGuardCommand(command, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
  if (isAgentPoPublicCommand(command, root)) return false;
  const poArgs = poApprovalArgs(command, root, PO_APPROVAL_GATE_SCRIPT);
  if (poArgs !== null) {
    // GF-078 bug 3: a bare, argument-free --help/--version is read-only and informational --
    // it mutates nothing, in this repository or any other, unlike every other shape this
    // script accepts (which is why every OTHER shape still falls straight through to the
    // blanket refusal below, unchanged). Narrow by construction: exactly one argument,
    // exactly one of the two flags; "prepare --help" or "--help extra" still hits the
    // blanket refusal exactly as before.
    if (poArgs.length === 1 && ["--help", "--version"].includes(poArgs[0])) return false;
    return true;
  }
  if (isBoundedReadOnlyPipeline(parsed, root, BOUNDED_PIPELINE_ADDITIONAL_ROOTS)) return false;
  if (isBoundedGrepPipeline(parsed, root)) return false;
  if (isBoundedCatPipeline(parsed, root)) return false;
  if (isBoundedReadOnlyAndChain(command, root)) return false;
  if (isReadOnlyDiagnosticCommandWithTrailingStderrRedirect(command, root)) return false;
  if (parsed.parseStatus !== "accepted" && hasExternalOutputRedirect(command, root)) return true;
  if (parsed.parseStatus === "accepted" && parsed.redirects.length > 0) {
    return parsed.redirects.some((redirect) => {
      if (isNullDeviceStderrRedirect(redirect.fd, redirect.target)) return false;
      const target = commandPath(redirect.target, root);
      return target !== null && !pathInside(root, target);
    });
  }
  const words = simpleWords(command, root);
  if (!words || words.length === 0) return false;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);

  if (/codex(?:\.exe)?$/iu.test(executable)) {
    const pluginIndex = args.indexOf("plugin");
    if (pluginIndex >= 0) {
      const operation = args[pluginIndex + 1];
      if (["add", "remove", "update", "install", "uninstall"].includes(operation)) return true;
      if (operation === "marketplace"
        && ["add", "remove", "update"].includes(args[pluginIndex + 2])) return true;
    }
  }

  if (["python", "python3", "py"].includes(executable)) {
    const scriptIndex = args.findIndex((arg) => basename(arg) === "update_plugin_cachebuster.py");
    if (scriptIndex >= 0) {
      const target = commandPath(args[scriptIndex + 1], root);
      return !pipelineSourceRoot(root, exists) || target === null || !pathInside(root, target);
    }
  }

  if (executable === "git") {
    const cIndex = args.indexOf("-C");
    if (cIndex >= 0) {
      const target = commandPath(args[cIndex + 1], root);
      if (target !== null && !pathInside(root, target)
        && !isReadOnlyDiagnosticCommand(command, root)) return true;
    }
  }

  const mutatingTargets = new Set([
    "cp", "mv", "rm", "mkdir", "rmdir", "touch", "chmod", "chown", "chgrp",
    "ln", "install", "truncate", "tee", "rsync",
  ]);
  if (mutatingTargets.has(executable)) {
    return args.some((arg) => {
      const target = commandPath(arg, root);
      return target !== null && isAbsolute(arg) && !pathInside(root, target);
    });
  }
  if (executable === "sed" && args.some((arg) => /^-[^-]*i/u.test(arg) || /^--in-place(?:=|$)/u.test(arg))) {
    return args.some((arg) => {
      const target = commandPath(arg, root);
      return target !== null && isAbsolute(arg) && !pathInside(root, target);
    });
  }
  return false;
}

/**
 * Strip an optional `--runner <claude|codex>` pair before the shape checks.
 *
 * ADR-0051 requires the invoking runner to be threaded explicitly, and the onboarding
 * CLI now honours it — but this allowlist predated that and accepted only the
 * runner-LESS forms. The effect was inverted enforcement: the guard refused the
 * identity-carrying command and permitted only the one that silently defaults the
 * runner, i.e. it pushed every caller onto the exact path ADR-0051 exists to prevent,
 * and the refusal it printed named a command it would itself deny.
 *
 * `lifecycleArgv(argv, runner, intent)` always appends `--runner <runner>` first and,
 * whenever `intent !== "onboarding"`, `--intent <intent>` afterward — so `--runner` is
 * not always the trailing pair; it can also sit second-to-last, with `--intent`
 * trailing. Scan the array for the first `--runner <claude|codex>` pair found
 * anywhere and remove it, so both shapes normalize correctly before the shape
 * checks run. Narrow by construction: only the two registered runner values,
 * only an exact `--runner <value>` pair, first match only.
 */
function withoutRunnerFlag(args) {
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === "--runner" && ["claude", "codex", "antigravity"].includes(args[i + 1])) {
      return [...args.slice(0, i), ...args.slice(i + 2)];
    }
  }
  return args;
}

/**
 * NVA-R15-ROOTADMIT (backlog: 2026-08-28-the-guards-root-admission-compares-a-typed-path-to-
 * a-realpathed-one.md): the caller's typed `--root` value through the SAME
 * resolve()+realpathSync() normalisation this file already applies to its own root
 * (evaluateLifecycleReadyGuard, above), folded through repository-path-identity.mjs's
 * shared comparator so a residual cross-notation spelling difference (WSL /mnt/<drive>
 * mount vs. native Windows drive letter, differing case, differing separator) that
 * survives OS-level realpath still compares equal. A value that does not resolve at all
 * (does not exist, or is not a path this process's filesystem view can reach) stays
 * refused, exactly as the byte-exact comparison this replaces already refused it --
 * `realpathSync` throwing is caught and treated as "does not resolve", never as an error.
 * `options.resolveFn`/`options.realpathSyncFn` mirror the same injection seam this file
 * already threads for `parseGuardCommand`'s `options.platform`/`options.processExecPath`
 * (resolveSanctionedScriptInvocation above): a test exercising native-Windows argv PARSING
 * on a non-Windows runner has no real win32 filesystem to resolve against, so it injects
 * identity stand-ins here the same way it already injects a fake `processExecPath`.
 * Production call sites never pass either override -- both default to the real functions.
 */
function resolveRootComparisonValue(value, options = {}) {
  if (typeof value !== "string" || value === "") return null;
  const resolveFn = options.resolveFn ?? resolve;
  const realpath = options.realpathSyncFn ?? realpathSync;
  try {
    const resolved = realpath(resolveFn(value));
    return { resolved, identity: repositoryPathIdentityOrSelf(resolved) };
  } catch {
    return null;
  }
}

function rootValueIdentityMatcher(root, options = {}) {
  const rootIdentity = repositoryPathIdentityOrSelf(root);
  const cache = new Map();
  return (value) => {
    if (typeof value !== "string" || value === "") return false;
    if (cache.has(value)) return cache.get(value);
    const comparison = resolveRootComparisonValue(value, options);
    const result = comparison !== null && comparison.identity === rootIdentity;
    cache.set(value, result);
    return result;
  };
}

/**
 * NVA-R15-ROOTADMIT: distinguishes a refusal caused specifically by the caller's --root
 * value resolving to a DIFFERENT physical location than this guard's own root, from every
 * other reason a sanctioned-script invocation is refused (Direction #2 of the backlog item
 * above -- "say so and show both sides", extending the same nearMissHint reporting
 * mechanism `restartResumeHintNearMissWrite`/`restartResumeHintNearMissHint` already use,
 * rather than inventing a parallel one). Returns `null` -- no distinguishable mismatch --
 * for a command that is not a recognised sanctioned-script invocation, carries no --root
 * token, or whose --root token does not resolve at all (that stays the ordinary
 * "unadmitted shape" refusal, unchanged, exactly as Acceptance Criteria #3 requires).
 */
function rootIdentityMismatch(command, root, options = {}) {
  const resolved = resolveSanctionedScriptInvocation(command, root, options);
  // Scoped to ONBOARDING_SCRIPT only, matching the exact scope of the comparison fix in
  // sanctionedOnboardingArgs() above -- the sibling scripts (driver, push-init, migration,
  // ...) still compare their own --root tokens byte-exact (unchanged, out of scope for this
  // fix), so a mismatch hint here for one of THEIR commands would describe a comparison that
  // was never actually applied to them.
  if (resolved === null || resolved.script !== ONBOARDING_SCRIPT) return null;
  const args = withoutRunnerFlag(resolved.args);
  const rootIndex = args.indexOf("--root");
  if (rootIndex === -1) return null;
  const typedValue = args[rootIndex + 1];
  const comparison = resolveRootComparisonValue(typedValue, options);
  if (comparison === null || comparison.identity === repositoryPathIdentityOrSelf(root)) return null;
  return { typedValue, resolvedTyped: comparison.resolved, root };
}

function sanctionedOnboardingArgs(rawArgs, root, options = {}) {
  const args = withoutRunnerFlag(rawArgs);
  // NVA-BOOTADMIT-2: every branch below matches its argv TAIL through matchFlagSpec()
  // (defined near exactRoot()) rather than checking fixed positions -- the declared flag SET
  // still has to be exactly right, but the ORDER the caller wrote the flags in no longer has
  // to match construction order. Shared validators, one per flag semantics, reused across
  // branches below exactly where the original per-branch checks already agreed with each
  // other; every branch still states its OWN flag set and required/optional split.
  const isRootValue = rootValueIdentityMatcher(root, options);
  const isHexDigest = (value) => HEX.test(value);
  const isIntentValue = (value) => ["onboarding", "bootstrap", "session", "dispatch"].includes(value);
  const isLanguageValue = (value) => ["de", "en"].includes(value);
  const isProfileValue = (value) => ["epic", "feature", "mini"].includes(value);
  const nonEmptyTrimmed = (value) => typeof value === "string" && value.trim() !== "";
  const nonEmptyTrimmedNotFlag = (value) => typeof value === "string" && value.trim() !== "" && !value.startsWith("--");
  const nonEmptyNotFlag = (value) => typeof value === "string" && value !== "" && !value.startsWith("--");
  const isRefValue = (value) => typeof value === "string"
    && /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value)
    && !value.includes("..") && !value.includes("//") && !value.endsWith("/") && !value.endsWith(".lock");
  // GF-093: same reasoning as START_PREFLIGHT_SCRIPT's and REPAIR_MAP_SCRIPT's own bare
  // no-arg admissions above -- a stuck agent needs the CLI's own usage text precisely in the
  // state this function exists to gate. `main()` returns immediately on `options.help`
  // (scripts/project-onboarding-v3.mjs:127) with zero filesystem access and zero mutation,
  // and `--help`/`-h` is accepted before `--root` is even required (line 106). Narrow by
  // construction: exactly one argument, exactly `--help` or `-h`, nothing else -- never an
  // escape hatch bolted onto a real command (`--root <path> --help` and `kickoff plan --help`
  // both still fall through to refusal below, same as every other malformed shape here). Not
  // routed through matchFlagSpec(): there is no subcommand prefix and no --root here, and a
  // single admissible token has no flag order to be insensitive to.
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return true;
  if (args[0] === "inspect"
    && matchFlagSpec(args.slice(1), {
      requiredValue: { "--root": isRootValue },
      optionalValue: { "--intent": isIntentValue },
    })) return true;
  if (args[0] === "continuity" && args[1] === "inspect"
    && matchFlagSpec(args.slice(2), { requiredValue: { "--root": isRootValue } })) return true;
  // GUARDDERIVE-1 (backlog:
  // 2026-08-16-guard-lifecycle-allowlist-should-derive-from-the-onboarding-cli-table.md).
  // This branch used to carry a hand-maintained array of plan* names, and it had gone stale
  // three separate times against the CLI it gates (backlog items 2026-08-08, 2026-08-09,
  // 2026-08-16 -- each a real read-only subcommand the inspection prescribed and the guard
  // refused). The set is now DERIVED from ONBOARDING_SUBCOMMANDS, the onboarding CLI's own
  // registered subcommand table, keyed on two declared properties (`mutates: false` and
  // `automatedArgvShape: "lifecycle"`) -- never on the `plan` name prefix, so a future
  // WRITING subcommand that happens to be named plan-* is not admitted just for matching
  // the naming convention.
  //
  // What is deliberately NOT derived: the argv SHAPE below. The guard still admits only the
  // exact automated nextAction argv -- `--root <root> [--runner <runner>] [--intent <value>]`
  // as lifecycleArgv(argv, runner, intent) emits it -- and never the wider human-invoked CLI
  // surface those same commands accept (plan-partial-authority's --profile/--source stay
  // refused here, pinned by this file's own tests). That narrowness is twice-Critic-reviewed
  // defense-in-depth (backlog:
  // 2026-08-17-plan-partial-authority-guard-allowlist-does-not-admit-its-own-profile-source-flags.md),
  // not an oversight, so deriving the NAME set never widens the SHAPE set.
  if (AUTOMATED_LIFECYCLE_ARGV_COMMANDS.includes(args[0])
    && matchFlagSpec(args.slice(1), {
      requiredValue: { "--root": isRootValue },
      optionalValue: { "--intent": isIntentValue },
    })) return true;
  // NVA-LCGUARD-3 (backlog: 2026-08-17-lifecycle-guard-omits-the-operator-authority-repair-shape.md).
  // collectOperatorContinuityAuthorityAction() (lib/project-onboarding-v3.mjs) is the
  // guidance a session actually reads once plan-repair reports operator-authority-required:
  // "rerun plan-repair/apply-repair with --id --plan-path --prd-path --spec-path --language
  // set to those exact values" -- the same five-field, all-or-none operator-confirmed
  // continuity claim the CLI's own usage string documents (scripts/project-onboarding-v3.mjs,
  // "<plan-repair|apply-repair> --root <project-dir> [--id <feature-id> --plan-path <path>
  // --prd-path <path> --spec-path <path> --language <de|en>] ..."). --id/--plan-path/
  // --prd-path/--spec-path are a feature id and repository-relative paths, checked only as
  // non-empty, non-flag-shaped strings -- the same defensive idiom the adopt-remote branch
  // below already applies to its own free-form --remote value -- never re-deriving the
  // path-safety/existence validation that stays the library's job. --language is the CLI's
  // own closed two-value enum, exactly as the kickoff branches below already check it. All
  // five, like --root, are required value flags; matchFlagSpec() no longer cares which order
  // the caller wrote them in, only that each is present exactly once (NVA-LCGUARD-3: the
  // operator-authority form -- only plan-repair ever accepts these five fields
  // (isRepairCommand in the CLI's own parse()); no other sibling in the bare-form branch
  // above does, so this is a plan-repair-only addition, not a widening of that shared branch).
  if (args[0] === "plan-repair"
    && matchFlagSpec(args.slice(1), {
      requiredValue: {
        "--root": isRootValue,
        "--id": nonEmptyNotFlag,
        "--plan-path": nonEmptyNotFlag,
        "--prd-path": nonEmptyNotFlag,
        "--spec-path": nonEmptyNotFlag,
        "--language": isLanguageValue,
      },
      optionalValue: { "--intent": isIntentValue },
    })) return true;
  if (["plan-source-recovery", "plan-manifest-repair"].includes(args[0])
    && matchFlagSpec(args.slice(1), { requiredValue: { "--root": isRootValue } })) return true;
  if (args[0] === "apply-manifest-repair"
    && matchFlagSpec(args.slice(1), {
      requiredValue: { "--root": isRootValue, "--plan-sha256": isHexDigest },
      required: { "--activate": true },
    })) return true;
  // NVA-LCGUARD-1 (backlog: 2026-08-17-lifecycle-guard-allowlist-still-misses-apply-partial-authority-and-adopt-remote.md).
  // lib/project-onboarding-v3.mjs:470 constructs exactly this command as the plan's own
  // applyAction -- the very next step after a successful plan-partial-authority -- and
  // this allowlist had no apply-partial-authority branch at all, so it was 100%
  // unreachable. --profile is the CLI's own closed enum (scripts/project-onboarding-v3.mjs
  // usage text). NVA-LCGUARD-2: --source is pinned to the one value
  // planProjectPartialAuthorityAdoption (lib/project-onboarding-v3.mjs:439) ever lets reach
  // the applyAction construction -- PARTIAL_AUTHORITY_SOURCE, "canonical-fresh-v3" -- since
  // any other source returns selection-required before that command is ever built.
  if (args[0] === "apply-partial-authority"
    && matchFlagSpec(args.slice(1), {
      requiredValue: {
        "--root": isRootValue,
        "--profile": isProfileValue,
        "--source": (value) => value === "canonical-fresh-v3",
        "--plan-sha256": isHexDigest,
      },
      required: { "--activate": true },
    })) return true;
  // lib/project-onboarding-v3.mjs:4198 and :4111 construct exactly these two commands --
  // the documented onboarding-recovery.md path for portable-seed-required when an existing
  // remote+branch is supplied. Only these two adopt-remote subcommands are ever admitted;
  // --remote is checked loosely (non-empty, not flag-shaped) -- genuinely caller-chosen at
  // both construction sites. NVA-LCGUARD-2 round 2 (Critic finding F-B): --ref mirrors the
  // FULL validRemoteAdoptionRequest gate at lib/project-onboarding-v3.mjs:3988-3990, not just
  // its REMOTE_REF_RE half -- that gate also refuses "..", "//", a trailing "/", and a ".lock"
  // suffix before either adopt-remote command is ever constructed, so a guard admitting those
  // four extra shapes was a strict superset of what any construction site can emit.
  if (args[0] === "adopt-remote" && args[1] === "plan"
    && matchFlagSpec(args.slice(2), {
      requiredValue: { "--root": isRootValue, "--remote": nonEmptyNotFlag, "--ref": isRefValue },
    })) return true;
  if (args[0] === "adopt-remote" && args[1] === "apply"
    && matchFlagSpec(args.slice(2), {
      requiredValue: {
        "--root": isRootValue, "--remote": nonEmptyNotFlag, "--ref": isRefValue,
        "--plan-sha256": isHexDigest,
      },
      required: { "--activate": true },
    })) return true;
  // The apply half of the same defect the plan* branch above already closed. `plan-runtime
  // --intent session` returns `initialize-runtime --root <root> --plan-sha256 <hex>
  // --activate --runner <runner> --intent session` (lib/project-onboarding-v3.mjs:3608-3627
  // building it through lifecycleArgv at :1315-1318), so the planner emitted a command this
  // very allowlist refused, and the printed recovery instruction -- run the returned
  // nextAction verbatim -- pointed straight back at the refusal. Measured 2026-08-08.
  // The trailing `--intent <value>` pair is optional, exactly as in the two branches above;
  // the closed value set is the CLI's own (scripts/project-onboarding-v3.mjs:62). Nothing
  // else moves: no new subcommand, no new flags -- only matchFlagSpec()'s order-insensitivity
  // (NVA-BOOTADMIT-2), same as every sibling branch in this function.
  if (["apply-portable-seed", "apply-reinstall", "initialize-runtime", "apply-repair", "apply-readback"].includes(args[0])
    && matchFlagSpec(args.slice(1), {
      requiredValue: { "--root": isRootValue, "--plan-sha256": isHexDigest },
      required: { "--activate": true },
      optionalValue: { "--intent": isIntentValue },
    })) return true;
  // NVA-LCGUARD-3: apply-repair's own operator-authority form. applyLifecycle()
  // (lib/project-onboarding-v3.mjs) re-threads operatorAuthority into the apply-side
  // recomputation of the repair plan, so the digest only matches when these five fields are
  // supplied again alongside --plan-sha256/--activate -- only apply-repair ever accepts them
  // (isRepairCommand), so this is an apply-repair-only addition, not a widening of the
  // shared digest+activate branch above.
  if (args[0] === "apply-repair"
    && matchFlagSpec(args.slice(1), {
      requiredValue: {
        "--root": isRootValue,
        "--id": nonEmptyNotFlag,
        "--plan-path": nonEmptyNotFlag,
        "--prd-path": nonEmptyNotFlag,
        "--spec-path": nonEmptyNotFlag,
        "--language": isLanguageValue,
        "--plan-sha256": isHexDigest,
      },
      required: { "--activate": true },
      optionalValue: { "--intent": isIntentValue },
    })) return true;
  // --language <de|en> is mandatory for kickoff plan/apply since the CLI's GF-066 addition
  // (scripts/project-onboarding-v3.mjs:56,92,114), alongside --goal <text> -- and, for apply,
  // --plan-sha256 <sha256> and --activate. Exact flag SET and exact two-value enum, like
  // every other branch in this function; matchFlagSpec() is order-insensitive on where each
  // flag sits (NVA-BOOTADMIT-2).
  if (args[0] === "kickoff" && args[1] === "plan"
    && matchFlagSpec(args.slice(2), {
      requiredValue: { "--root": isRootValue, "--goal": nonEmptyTrimmed, "--language": isLanguageValue },
    })) return true;
  if (args[0] === "kickoff" && args[1] === "apply"
    && matchFlagSpec(args.slice(2), {
      requiredValue: {
        "--root": isRootValue, "--goal": nonEmptyTrimmed, "--language": isLanguageValue,
        "--plan-sha256": isHexDigest,
      },
      required: { "--activate": true },
    })) return true;
  // NVA-CODEXARGV-1 (2026-08-27): the five mutating-onboarding admission branches that used to
  // live here individually (intake-consent-apply/intake-capture-apply/intake-design-questions-
  // apply added by NVA-W5-GUARDADMIT-1, commit 70bd1fb3; intake-generate-apply added directly in
  // the same closure pass, commit 0b2386fd; bootstrap-bind-apply added by NVA-W5-COORD-STEP5-2 --
  // backlog: 2026-08-19-guard-lifecycle-ready-has-no-admission-branch-for-the-intake-checkpoint-subcommands.md)
  // are now ONE generic loop reading MUTATING_ONBOARDING_ARGV_SHAPES, the shared declaration
  // scripts/project-onboarding-v3.mjs exports through the same import seam GUARDDERIVE-1 already
  // uses. The FLAG SET each subcommand admits can therefore never silently diverge between the
  // CLI and this guard again -- design.md SSb's claim that no guard change is needed for these
  // subcommands was FALSE for the reason the backlog item above documents; nothing below widens
  // what was already admitted, it only sources the same flag names from one place instead of five
  // separate hand-written literals.
  //
  // Per-flag VALUE validation stays here, unchanged and exactly as narrow as every branch above
  // already is -- this map is a lookup by flag NAME, not a rewrite of any validator:
  //   --root            -- the caller's own resolved project root (isRootValue).
  //   --text            -- intake-capture-apply's PO-message text (applyOnboardingIntakeCapture
  //                        requires non-empty; nonEmptyTrimmed mirrors the kickoff --goal idiom).
  //   --answers-json    -- checked only loosely here (non-empty, not flag-shaped); deep JSON-shape
  //                        validation stays applyOnboardingIntakeDesignQuestions's job.
  //   --plan-sha256     -- the same HEX digest shape every other digest-bound apply step uses.
  //   --git-author-name/--git-author-email -- free-form PO-supplied identity text, checked loosely
  //                        like every other free-form value flag in this function.
  //   --language/--profile -- the CLI's own closed enums, same idiom as the kickoff branches.
  // NVA-BOOTADMIT-2 (2026-08-27): intake-consent-apply's own function
  // (applyOnboardingIntakeConsent, onboarding-continuity.mjs) always requires --granted and
  // --activate unconditionally. Of the other six value flags, four (--git-author-name,
  // --git-author-email, --language, --profile) each default to null and merge as
  // base.values.X ?? X; the remaining two (--text, --text-file) do not merge into that values
  // bag at all -- the CLI collapses whichever one is supplied into a single `text` value that,
  // when present, routes through a separate applyOnboardingIntakeCapture call recording a
  // material-input chunk instead. Any subset of all six, including none, may be supplied --
  // reflected in MUTATING_ONBOARDING_ARGV_SHAPES's optionalValue list for this command.
  //
  // bootstrap-bind-apply's nextAction (promotionApplyAction(), onboarding-continuity.mjs) always
  // carries a trailing `--runner <runner>` pair too, but withoutRunnerFlag() at the top of this
  // function already stripped the first `--runner <claude|codex|antigravity>` pair found anywhere
  // in argv before this loop ever runs -- so the shape matched below is the POST-STRIPPING one,
  // identical to every sibling here.
  const MUTATING_ONBOARDING_FLAG_VALIDATORS = {
    "--root": isRootValue,
    "--text": nonEmptyTrimmed,
    // NVA-INTAKEARGV-1: a repository-relative path, not free text. Containment (must resolve
    // inside the project root) is enforced CLI-side in resolveIntakeCaptureText(), where the
    // root is actually resolved; the guard's job here stays the flag SET plus a value SHAPE.
    "--text-file": nonEmptyTrimmedNotFlag,
    "--answers-json": nonEmptyTrimmedNotFlag,
    "--plan-sha256": isHexDigest,
    "--git-author-name": nonEmptyTrimmedNotFlag,
    "--git-author-email": nonEmptyTrimmedNotFlag,
    "--language": isLanguageValue,
    "--profile": isProfileValue,
  };
  const mutatingShape = MUTATING_ONBOARDING_ARGV_SHAPES[args[0]];
  if (mutatingShape !== undefined) {
    const spec = { required: {}, requiredValue: {}, requiredValueOneOf: {}, optionalValue: {} };
    for (const flag of mutatingShape.required) spec.required[flag] = true;
    for (const flag of mutatingShape.requiredValue) spec.requiredValue[flag] = MUTATING_ONBOARDING_FLAG_VALIDATORS[flag];
    for (const flag of mutatingShape.requiredValueOneOf ?? []) spec.requiredValueOneOf[flag] = MUTATING_ONBOARDING_FLAG_VALIDATORS[flag];
    for (const flag of mutatingShape.optionalValue) spec.optionalValue[flag] = MUTATING_ONBOARDING_FLAG_VALIDATORS[flag];
    return matchFlagSpec(args.slice(1), spec);
  }
  return false;
}

/**
 * NVA-K-DRIVERREACH: the guided driver's own exact argv surface (`parseArgs()` in
 * scripts/onboarding-init.mjs) and nothing wider than it -- `--root <root>` required,
 * `--runner <claude|codex|antigravity>` and `--step-cap <positive integer>` both optional,
 * order-insensitive via matchFlagSpec() like every sibling admission above. Deliberately
 * NOT admitting `--help`/`-h` here (unlike GF-093's ONBOARDING_SCRIPT admission just above):
 * the acceptance criteria this closes name only the three chaining flags, so this stays the
 * narrower of the two shapes the driver's own parser would accept rather than the widest.
 * `--step-cap`'s validator mirrors parseArgs()'s own `Number(raw)` / `Number.isInteger` /
 * `>= 1` check exactly, so this can never admit a value the driver's own parser would itself
 * refuse.
 */
function sanctionedDriverArgs(args, root) {
  return matchFlagSpec(args, {
    requiredValue: { "--root": (value) => value === root },
    optionalValue: {
      "--runner": (value) => VALID_RUNNERS.has(value),
      "--step-cap": (value) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= 1;
      },
    },
  });
}

/**
 * NVA-V4-PUSHDRIVER: push-init.mjs's own exact argv surface (`parseArgs()` in
 * scripts/push-init.mjs) and nothing wider than it -- `--root <root>` required and pinned to
 * the observed root (same discipline as sanctionedDriverArgs() above), `--by`/`--remote`/
 * `--destination` required, `--base` optional. Validators mirror the target script's OWN
 * argv handling exactly rather than being invented here: `--destination` matches push-
 * prepare.mjs's `DESTINATION_RE` (`^refs\/heads\/[A-Za-z0-9._/-]{1,200}$`), `--remote`
 * matches its `REMOTE_RE` (`^[A-Za-z0-9._-]{1,80}$`) -- push-init.mjs forwards both
 * unchanged into `pushPrepareReport()`, so a value this guard admitted but that script would
 * refuse could never actually happen. `--by` and `--base` accept any non-empty, non-flag
 * string: `--by` is free-form attribution text (push-prepare.mjs itself does not further
 * constrain it beyond non-blank), and `--base` is any git revision expression check-doc-
 * reconciliation.mjs's own `--base <ref>` accepts (a branch name, a SHA, `HEAD~N`, a tag --
 * never just hex, so this deliberately does NOT reuse isHexDigest).
 */
function sanctionedPushInitArgs(args, root) {
  const isDestinationValue = (value) => typeof value === "string" && /^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/u.test(value);
  const isRemoteValue = (value) => typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/u.test(value);
  const nonEmptyNotFlagValue = (value) => typeof value === "string" && value.trim() !== "" && !value.startsWith("--");
  return matchFlagSpec(args, {
    requiredValue: {
      "--root": (value) => value === root,
      "--by": nonEmptyNotFlagValue,
      "--remote": isRemoteValue,
      "--destination": isDestinationValue,
    },
    optionalValue: { "--base": nonEmptyNotFlagValue },
  });
}

function sanctionedMigrationArgs(args, root) {
  // NVA-BOOTADMIT-2: both branches route through matchFlagSpec() so the flag SET stays exact
  // while its ORDER no longer matters, same rationale as sanctionedOnboardingArgs() above.
  if (["inspect", "plan"].includes(args[0])
    && matchFlagSpec(args.slice(1), { requiredValue: { "--root": (value) => value === root } })) return true;
  if (args[0] !== "apply") return false;
  return matchFlagSpec(args.slice(1), {
    requiredValue: { "--root": (value) => value === root },
    required: { "--activate": true },
    optional: { "--initialize-missing-runtime": true },
  });
}

// GF-060 (backlog: 2026-08-09-guard-lifecycle-ready-runner-allowlist-incomplete.md;
// originally GF-059's finding (a), never merged -- HEAD carried none of this widening,
// for any subcommand). session-cleanup.mjs's own USAGE text and arg-parsing table
// document and accept an optional `--runner claude|codex` pair on every one of its
// subcommands (ADR-0051's runner threading). Same optional-tail style as
// sanctionedHumanOverrideArgs()'s exactAuthorRoot(...): a fixed base shape, plus an
// exact optional suffix -- never a loosened match on the base shape itself, so a wrong
// runner value, extra/misordered args, or a duplicate --runner still falls through to
// exact rejection.
function sanctionedSessionCleanupArgs(args, root) {
  const exactRunnerTail = (index) => args[index] === "--runner"
    && (args[index + 1] === "claude" || args[index + 1] === "codex");
  if (["start", "status", "release-binding", "plan-recovery", "plan-human-recovery", "plan-privatization"].includes(args[0])) {
    const base = args[1] === "--repo" && args[2] === root;
    return base && (args.length === 3 || (exactRunnerTail(3) && args.length === 5));
  }
  if (args[0] === "confirm-privatization") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--accept";
    return base && (args.length === 6 || (exactRunnerTail(6) && args.length === 8));
  }
  if (["apply-recovery", "apply-privatization"].includes(args[0])) {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--activate";
    return base && (args.length === 6 || (exactRunnerTail(6) && args.length === 8));
  }
  const base = args[0] === "cleanup"
    && args[1] === "--repo" && args[2] === root
    && args[3] === "--session-descriptor"
    && /^[A-Za-z0-9._-]{1,80}$/u.test(args[4] ?? "")
    && args[5] === "--expected-descriptor-sha256"
    && HEX.test(args[6] ?? "");
  return base && (args.length === 7 || (exactRunnerTail(7) && args.length === 9));
}

/**
 * A partially initialized lifecycle must not strand Git's own reversible
 * operation state. This admits only the exact local abort; ordinary status,
 * diff and rev-parse readback already use the read-only diagnostic path.
 */
export function isNarrowRepositoryRecoveryCommand(command, root) {
  const words = simpleWords(command, root);
  if (!words) return false;
  let index = 0;
  if (basename(words[index]).toLowerCase() !== "git") return false;
  index += 1;
  if (words[index] === "-C") {
    const target = words[index + 1];
    if (typeof target !== "string" || resolve(root, target) !== root) return false;
    index += 2;
  }
  return words[index] === "rebase"
    && words[index + 1] === "--abort"
    && index + 2 === words.length;
}

function sanctionedPoAuthorityRebindArgs(args) {
  if (args[0] === "po-authority-decision-plan" && args.length === 1) return true;
  if (args[0] === "po-authority-decision-select") {
    return args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--planned-at"
      && typeof args[4] === "string" && Number.isFinite(Date.parse(args[4]))
      && new Date(args[4]).toISOString() === args[4]
      && args[5] === "--selection" && new Set(["prd", "spec"]).has(args[6])
      && args.length === 7;
  }
  if (args[0] === "po-authority-decision-apply") {
    return args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--selection-digest" && HEX.test(args[4] ?? "")
      && args[5] === "--planned-at"
      && typeof args[6] === "string" && Number.isFinite(Date.parse(args[6]))
      && new Date(args[6]).toISOString() === args[6]
      && args[7] === "--selection" && args[8] === "spec"
      && args[9] === "--activate" && args.length === 10;
  }
  // Critic finding F4, 2026-08-19 (dispatch W4-CRITIC-2B): po-authority-
  // acknowledge-apply's refusal text (po-gate-authority.mjs) and
  // guard-lifecycle-ready.mjs's own bound-authority-document refusal text
  // both name this route as sanctioned, but it was missing from this
  // admission list -- "prescribe a command and then block it", the exact
  // defect class this same function's own doc comment names above. The
  // read-only po-authority-acknowledge-plan side is NOT added here: unlike
  // po-authority-rebind-plan (admitted via isExactPoAuthorityRebindPlannerRecovery,
  // a diagnostic-gated route above), acknowledge-plan has no equivalent
  // diagnostic entry yet -- a disclosed, deliberately scoped-down follow-up,
  // not an oversight; only the CAS-committing apply step is closed here.
  if (args[0] === "po-authority-acknowledge-apply") {
    return args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--updated-at"
      && typeof args[4] === "string"
      && Number.isFinite(Date.parse(args[4]))
      && new Date(args[4]).toISOString() === args[4]
      && args[5] === "--by" && typeof args[6] === "string" && args[6].trim().length > 0
      && args[7] === "--activate" && args.length === 8;
  }
  return args[0] === "po-authority-rebind-apply"
    && args[1] === "--plan-sha256"
    && HEX.test(args[2] ?? "")
    && args[3] === "--updated-at"
    && typeof args[4] === "string"
    && Number.isFinite(Date.parse(args[4]))
    && new Date(args[4]).toISOString() === args[4]
    && args[5] === "--activate"
    && args.length === 6;
}

/**
 * The rebind planner is read-only but must still be unavailable to every
 * unrelated partial lifecycle state. This narrowly admits its exact argv only
 * when the same inspection reports the diagnosis that the planner repairs.
 *
 * backlog: 2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md
 * (C1). This used to also require `observed.nextAction === null`, which
 * `project-onboarding-v3.mjs` stopped producing for this diagnostic once it
 * started returning the read-only planner argv as `nextAction` (2026-08-02,
 * commit fb0e9ac1) -- so that clause could never match a real inspection
 * again and this admission was silently dead against production state,
 * covered only by a hand-mocked test shape that had drifted from reality.
 * The admitted code set is read from `PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS`
 * itself rather than named here. That table is the single call site that emits
 * this whole family, and every entry marked `offersPlannerRetry` hands the
 * operator the SAME fixed planner argv under a DIFFERENT diagnostic code. A
 * hardcoded `po_authority_rebind_unavailable` therefore admitted the fallback
 * reason and refused the five named ones -- prescribing a command and then
 * blocking it, which is the exact defect this backlog item is about; the
 * contract suite (`guard-lifecycle-recovery-contract.test.mjs`) found it by
 * enumerating the table. Deriving the set from the producer means a reason
 * added there cannot reopen the gap. `offersPlannerRetry: false` entries stay
 * out: they return `nextAction: null`, so admitting their code would be the
 * mirror-image defect -- a route the guard allows that nothing offers.
 */
function isExactPoAuthorityRebindPlannerRecovery(command, root, dependencies = {}) {
  const words = simpleWords(command, root);
  if (!words || words.length !== 3
    || !["node", process.execPath].includes(words[0])
    || words[1] !== PIPELINE_STATE_SCRIPT
    || words[2] !== "po-authority-rebind-plan") return false;
  let observed;
  try {
    // Threaded from this same evaluation's own resolved runner
    // (dependencies.runner, set by the caller from --runner argv), never
    // assumed here: project-onboarding-v3.mjs no longer defaults an absent
    // runner to "codex" (backlog: absent-runner-flag-silently-defaults-to-codex).
    observed = (dependencies.inspectProjectOnboardingV3Fn ?? inspectProjectOnboardingV3)({
      rootDir: root,
      intent: "session",
      runner: dependencies.runner,
    });
  } catch {
    return false;
  }
  return observed?.schema === "pipeline.project-onboarding.v4"
    && observed?.status === "partial"
    && observed?.root === root
    && observed?.intent === "session"
    && Array.isArray(observed?.diagnostics)
    && observed.diagnostics.length === 1
    && PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS
      .some((entry) => entry.offersPlannerRetry && entry.code === observed.diagnostics[0]?.code);
}

function sanctionedPipelineStateArgs(args) {
  const validBy = (value) => typeof value === "string"
    && value.trim() !== "" && Buffer.byteLength(value, "utf8") <= 500;
  if (args[0] === "plan-legacy-v2-revocation-recovery") {
    return args[1] === "--by" && validBy(args[2]) && args.length === 3;
  }
  // The plan is a safe diagnostic.  Applying recovery in a non-ready legacy
  // state deliberately remains denied so the central adapter can consume its
  // exact, one-time attended Human-override capability.  Merely spelling a
  // valid digest-bound argv is never Human authority.
  if (args[0] === "apply-legacy-v2-revocation-recovery") return false;
  if (args[0] === "reopen-design") {
    return args[1] === "--by" && validBy(args[2]) && args.length === 3;
  }
  if (args[0] === "submit-plan") {
    return args[1] === "--by" && validBy(args[2])
      && args[3] === "--profile" && new Set(["epic", "feature", "mini"]).has(args[4])
      && args.length === 5;
  }
  if (args[0] === "approve-plan") {
    return args[1] === "--by" && validBy(args[2]) && args.length === 3;
  }
  if (args[0] === "set-phase") {
    return args[1] === "--phase" && new Set(["design", "implementation"]).has(args[2])
      && args.length === 3;
  }
  return sanctionedPoAuthorityRebindArgs(args);
}

/**
 * The closed value set of the repair script's own parser (`SUPPORTED_LANGUAGES`), which
 * is also the set the gate prints as `<de|en>`. Kept as a literal rather than imported:
 * this hook stays self-contained, and the suite pins it against the script's source so
 * the two cannot drift apart silently.
 */
const PO_PROFILE_REPAIR_LANGUAGES = new Set(["de", "en"]);

/**
 * `--human-facing <de|en>` is the language route the repair script writes into the apply
 * argv it emits itself (`buildPlan`'s `action.argv`) and the gate names as the operator's
 * next step ("add --human-facing <de|en>"). Until this branch existed, every clause below
 * refused that exact argv, so the printed route dead-ended in precisely the state it
 * exists for -- a freshly onboarded or half-configured project whose lifecycle is not
 * ready.
 *
 * Admission stays as narrow as its siblings. The flag is accepted POSITIONALLY, in the
 * single position the script emits it -- directly after `--root <root>`, ahead of the
 * digest -- against the closed set above, with an exact total `args.length` per shape and
 * the digest and `--activate` still checked by position. A reordered, duplicated,
 * out-of-set or padded variant matches no branch; no length range and no wildcard word is
 * introduced.
 */
function sanctionedPoProfileRepairArgs(args, root) {
  const languageAt = (index) => args[index] === "--human-facing"
    && PO_PROFILE_REPAIR_LANGUAGES.has(args[index + 1]);
  const digestActivateAt = (index) => args[index] === "--plan-sha256"
    && HEX.test(args[index + 1] ?? "")
    && args[index + 2] === "--activate";
  if (args[0] === "plan") {
    return exactRoot(args, root, 1)
      && (args.length === 3 || (languageAt(3) && args.length === 5));
  }
  return args[0] === "apply"
    && exactRoot(args, root, 1)
    && ((digestActivateAt(3) && args.length === 6)
      || (languageAt(3) && digestActivateAt(5) && args.length === 8));
}

function sanctionedProjectAuthorityMigrationArgs(args, root) {
  if (["inspect", "plan"].includes(args[0])) {
    return exactRoot(args, root, 1) && args.length === 3;
  }
  // "vendor-sync" mirrors "recover": both admit a bare read-only 3-arg shape AND a
  // --plan-sha256/--activate 6-arg mutation shape, so neither can use the unconditional
  // "inspect"/"plan" branch above (that branch returns on length alone, before a longer
  // apply-shaped vendor-sync/recover invocation ever reaches the mutation check below).
  if (["recover", "vendor-sync"].includes(args[0]) && exactRoot(args, root, 1) && args.length === 3) return true;
  return ["apply", "recover", "vendor-sync"].includes(args[0])
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6;
}

/**
 * `--proof` carries a filesystem path, not a digest, so HEX cannot bound it -- and an
 * unbounded word is exactly what the rest of this function refuses to admit. The bound
 * is therefore structural, and deliberately narrower than "any string": an absolute
 * `.json` path, no control characters, no `.`/`..` segment, a bounded byte length, and
 * -- mirroring the CLI's own `externalJson()` discipline (ADR-0059 Decision 1) -- a
 * location OUTSIDE the repository root, so this gate never admits a command the CLI
 * would refuse anyway. Host `isAbsolute`/`resolve`/`pathInside` are used deliberately:
 * a Windows path is absolute on the Windows host and is not a path at all on POSIX,
 * which is the correct answer on each.
 *
 * The residual is a single external path word, and it stays a data argument: the closed
 * shell grammar has already tokenized it, so it can never re-enter the shell, and the
 * only thing the CLI does with it is JSON.parse a file whose contents must still carry a
 * valid signature under the project's committed trust anchor.
 */
function externalProofPathArgument(value, root) {
  if (typeof value !== "string" || value === "" || Buffer.byteLength(value, "utf8") > 500) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value) || !/\.json$/iu.test(value)) return false;
  if (value.split(/[\\/]/u).some((segment) => segment === "." || segment === "..")) return false;
  return isAbsolute(value) && !pathInside(root, resolve(value));
}

function sanctionedHumanOverrideArgs(args, root) {
  const exactAuthorRoot = (index) => args[index] === "--author-source-root"
    && args[index + 1] === join(root, "plugins", "pipeline-core");
  if (args[0] === "plan") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
    return base && (args.length === 5 || (exactAuthorRoot(5) && args.length === 7));
  }
  if (args[0] === "prepare-authorization") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
      && args[7] === "--reason" && typeof args[8] === "string"
      && args[8].trim() !== "" && Buffer.byteLength(args[8], "utf8") <= 500;
    return base && (args.length === 9 || (exactAuthorRoot(9) && args.length === 11));
  }
  if (args[0] === "verify-audit") {
    return args[1] === "--repo" && args[2] === root && args.length === 3;
  }
  // ADR-0059 Decision 4: `signature` mode's own decisive final step -- and, until this
  // branch existed, the one command in the family that every guard PRINTED as the next
  // step while the base check below refused it, because `args[0] === "authorize"` is a
  // strict equality that `authorize-by-signature` does not satisfy. `signature` is this
  // repository's committed mode, so the offered route dead-ended at its last step in
  // exactly the session state (GUARD-LIFECYCLE-NOT-READY) where an override matters.
  //
  // Same exactness discipline as its siblings: pinned flag order, pinned `--repo`, HEX on
  // every digest, an exact total `args.length`, and the optional `--author-source-root`
  // tail handled identically. The shape is derived from the CLI's own argument parsing
  // (scripts/guard-human-override.mjs's `authorize-by-signature` branch), not from the
  // guidance strings: there is no `--activate` here (a verified signature IS the
  // authorization) and no `--authority` at all (the committed trust anchor is the only
  // trust source, ADR-0059 Decision 1).
  if (args[0] === "authorize-by-signature") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
      && args[7] === "--proof" && externalProofPathArgument(args[8], root);
    return base && (args.length === 9 || (exactAuthorRoot(9) && args.length === 11));
  }
  const base = args[0] === "authorize"
    && args[1] === "--repo" && args[2] === root
    && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
    && args[7] === "--selection-sha256" && HEX.test(args[8] ?? "")
    && args[9] === "--reason" && typeof args[10] === "string"
    && args[10].trim() !== "" && Buffer.byteLength(args[10], "utf8") <= 500
    && args[11] === "--reason-sha256" && HEX.test(args[12] ?? "");
  return base && ((args[13] === "--activate" && args.length === 14)
    || (exactAuthorRoot(13) && args[15] === "--activate" && args.length === 16));
}

/**
 * NVA-BOOTRECEIPT-1: the `node <script> <args...>` shape every branch of
 * `isSanctionedLifecycleCommand` below decides against, factored out so the bootstrap-
 * receipt feature can recognise ONE specific script (START_PREFLIGHT_SCRIPT) without
 * duplicating -- and risking drifting from -- this admission preamble. Returns `null` for
 * anything that is not a trusted-node invocation of a script at all; otherwise the
 * identified `script` path and its `args`, exactly as `isSanctionedLifecycleCommand`
 * itself used to compute them inline.
 */
function resolveSanctionedScriptInvocation(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  const platform = options.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = options.processExecPath ?? process.execPath;
  if (!words || words.length < 2 || ![...directNode, trustedNode].includes(words[0])) return null;
  const [script, ...args] = words.slice(1);
  return { script, args };
}

/**
 * NVA-BOOTRECEIPT-1: the receipt trigger for the bootstrap-obligation gate below -- the
 * exact same recognition `isSanctionedLifecycleCommand` already applies for
 * START_PREFLIGHT_SCRIPT (`args.length === 0`), reached through the identical shared
 * preamble above rather than a second, looser matcher. A command carrying extra
 * arguments, a different script, or no `node <script>` shape at all is NOT this
 * invocation -- it is a near miss, not a match.
 */
export function isSanctionedStartPreflightInvocation(command, root, options = {}) {
  const resolved = resolveSanctionedScriptInvocation(command, root, options);
  return resolved !== null && resolved.script === START_PREFLIGHT_SCRIPT && resolved.args.length === 0;
}

export function isSanctionedLifecycleCommand(command, root, options = {}) {
  const resolved = resolveSanctionedScriptInvocation(command, root, options);
  if (resolved === null) return false;
  const { script, args } = resolved;
  if (script === ONBOARDING_SCRIPT) return sanctionedOnboardingArgs(args, root, options);
  // NVA-K-DRIVERREACH: admitted read-only by exact argv shape (sanctionedDriverArgs() above)
  // -- grants no authority beyond ONBOARDING_SCRIPT's own admissions just above, since every
  // mutating step this driver spawns is itself re-checked against this same guard when it
  // runs, on its own terms, exactly as if an agent had typed it directly.
  if (script === DRIVER_SCRIPT) return sanctionedDriverArgs(args, root);
  // NVA-V4-PUSHDRIVER: same admission discipline as DRIVER_SCRIPT immediately above --
  // exact argv shape only (sanctionedPushInitArgs() above), grants no authority beyond what
  // push-init.mjs's own three read-only steps could already do if hand-typed one at a time.
  if (script === PUSH_INIT_SCRIPT) return sanctionedPushInitArgs(args, root);
  if (script === MIGRATION_SCRIPT) return sanctionedMigrationArgs(args, root);
  if (script === V3_BOOTSTRAP_AUTHORITY_SCRIPT) {
    return exactRoot(args, root, 0) && args.length === 2;
  }
  if (script === LAUNCH_SCRIPT) {
    return exactRoot(args, root, 0)
      && args[2] === "--barrier-sha256" && HEX.test(args[3] ?? "")
      && args[4] === "--activate" && args.length === 5;
  }
  if (script === READBACK_SCRIPT) return exactRoot(args, root, 0) && args.length === 2;
  if (script === START_PREFLIGHT_SCRIPT) return args.length === 0;
  // OBLIGROUTE-1. templates/prompts/agent-obligations.md SS5 tells every dispatched agent to
  // ASK which refusals can be lifted -- `node <plugin-root>/scripts/repair-map.mjs` -- rather
  // than read a static table, and the map's own `GUARD-LIFECYCLE-NOT-READY` row is the row an
  // agent needs precisely in the state this branch decides. Until this line the instruction was
  // unreachable in exactly that state: the answer to "am I stuck?" was itself blocked.
  //
  // Admitted as narrowly as the sibling above and for the same reason: this is the file that
  // stops an agent weakening the gate authorizing it, so the admission is one exact argv shape
  // -- the absolute path of THIS plugin's own repair-map.mjs (resolved from import.meta.url,
  // never a directory, prefix or wildcard) with NO arguments at all. That is the whole of its
  // interface: the script parses no subcommand and no flag, and reads its root from
  // CLAUDE_PROJECT_DIR/cwd, so every other argv is a shape it would ignore and this gate has no
  // reason to admit. `node --check <path>` and the sanctioned list stay the only `node` lanes.
  //
  // Read-only is a property of the script, not an assumption made here: repair-map.mjs calls
  // `eligibility()` (pure) and reaches `recordHumanGuardDenial()` only on the branch that
  // returns before `storage()` -- its own AC-5 test pins that it writes nothing.
  if (script === REPAIR_MAP_SCRIPT) return args.length === 0;
  if (script === SESSION_CAPABILITY_DIAGNOSE_SCRIPT) return args[0] === "--repo" && args[1] === root && args.length === 2;
  if (script === SESSION_CLEANUP_SCRIPT) return sanctionedSessionCleanupArgs(args, root);
  if (script === PIPELINE_STATE_SCRIPT) {
    return sanctionedPipelineStateArgs(args);
  }
  if (script === PO_PROFILE_REPAIR_SCRIPT) return sanctionedPoProfileRepairArgs(args, root);
  if (script === PROJECT_AUTHORITY_MIGRATION_SCRIPT) {
    return sanctionedProjectAuthorityMigrationArgs(args, root);
  }
  if (script === HUMAN_OVERRIDE_SCRIPT) return sanctionedHumanOverrideArgs(args, root);
  if (script === PRIVATE_OVERLAY_SCRIPT) {
    return args[0] === "route"
      && args[1] === "--project-root"
      && args[2] === root
      && args.length === 3;
  }
  if (script === HOST_REPOSITORY_INIT_SCRIPT) {
    if (args[0] === "plan") return exactRoot(args, root, 1) && args.length === 3;
    return args[0] === "apply"
      && exactRoot(args, root, 1)
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--activate" && args.length === 6;
  }
  return script === APP_SERVER_SCRIPT
    && ["--recover", "--doctor"].includes(args[0])
    && args.length === 1;
}

/**
 * GF-097: a bare `gh --version` and a bare `gh auth status` are GitHub CLI's own
 * documented read-only diagnostics -- the former only prints the installed CLI version
 * (`gh --help`), the latter only reports which account(s) are authenticated and to which
 * hosts (`gh auth status --help`); neither writes to the repository, the remote, or any
 * credential store. Confirmed live 2026-08-10: a Codex session had both refused with the
 * generic GUARD-LIFECYCLE-NOT-READY denial, identically to a real mutating `gh` command,
 * while diagnosing an unrelated push problem.
 *
 * Deliberately NOT a branch inside isSanctionedLifecycleCommand() above: that function's
 * simpleWords()-based dispatch is keyed on a trusted `node <script>` first word, and `gh`
 * is a different binary entirely -- one this codebase does not own the source of. That is
 * a materially different trust basis than GF-093's `--help` admission (sanctionedOnboardingArgs()
 * above), which could point at the bundled script's own source (`main()` returns before any
 * filesystem access) as its proof of safety; no such proof is available for a third-party
 * binary. The trust basis here is instead GitHub CLI's OWN documented behaviour for exactly
 * these two invocation shapes, stated rather than papered over.
 *
 * Narrow by construction, exactly like every sibling admission in this file: only these two
 * EXACT bare shapes -- no extra flag, no other subcommand, no partial-match tolerance, never
 * a blanket `gh` carve-out. `gh pr create`, `gh auth login`, `gh repo clone`,
 * `gh --version --help` and `gh auth status --hostname <host>` all still fall through to the
 * ordinary GUARD-LIFECYCLE-NOT-READY refusal below, unchanged.
 */
export function isSanctionedGhReadOnlyDiagnostic(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  if (!words || words.length === 0) return false;
  if (!["gh", "gh.exe"].includes(basename(words[0]).toLowerCase())) return false;
  const args = words.slice(1);
  if (args.length === 1 && args[0] === "--version") return true;
  return args.length === 2 && args[0] === "auth" && args[1] === "status";
}

/**
 * NVA-LCREADONLY-1 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-and-
 * tmp-fallback.md): the write-side twin of isReadOnlyDiagnosticCommand() above, scoped to
 * the ONE directory a session stuck at `partial` needs in order to leave a trace of its own
 * incident -- `mkdir scratch` or `mkdir -p scratch`, nothing else. Exact by construction,
 * like every sibling admission in this file: the target argument must resolve to exactly
 * `<root>/scratch`, so `mkdir scratch/nested`, `mkdir somethingelse` and any extra or
 * reordered flag all still fall through to the ordinary GUARD-LIFECYCLE-NOT-READY refusal.
 * This function only recognizes the shape; the caller (evaluateAfterGrammarAdmission()
 * below) is the one that gates it on `lifecycleStatus === "partial"`.
 */
function isPartialLifecycleScratchDirCreate(command, root) {
  const words = simpleWords(command, root);
  if (!words || words.length === 0) return false;
  if (basename(words[0]).toLowerCase() !== "mkdir") return false;
  const args = words.slice(1);
  const target = args.length === 1 ? args[0]
    : args.length === 2 && args[0] === "-p" ? args[1]
      : null;
  return target !== null && resolve(root, target) === join(root, PARTIAL_LIFECYCLE_SCRATCH_DIR);
}

/**
 * NVA-LCREADONLY-1: the Write/Edit-side twin -- the ONE fixed incident-report file a session
 * stuck at `partial` may create to persist a report of its own stuck state. Deliberately
 * scoped to Edit/Write only (never NotebookEdit, which this fixed `.md` path can never
 * legitimately name) and to this one exact resolved path -- no other filename, no directory
 * write, no glob. Shaped like isRestartResumeHintInputWrite() above; the caller is again the
 * one that gates this on `lifecycleStatus === "partial"`.
 */
function isPartialLifecycleIncidentReportWrite(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (toolName !== "Edit" && toolName !== "Write") return false;
  const filePath = writeTargetPath(input?.tool_input, toolName);
  return filePath !== "" && resolve(root, filePath) === join(root, PARTIAL_LIFECYCLE_INCIDENT_REPORT_PATH);
}

/**
 * NVA-GF-SCRATCH: the write-side twin of the `partial` diagnosis lane above, but scoped to the
 * two onboarding-readiness statuses named in INTAKE_LIFECYCLE_STATUSES rather than to one fixed
 * filename -- matching guard-devplan.mjs's own scratch/ prefix exemption
 * (lib/guard-devplan-policy.mjs DEFAULT_EXEMPT_PREFIXES), which already admits any path under
 * scratch/ in every dev-plan phase. Resolved and compared via pathInside(), never a substring or
 * prefix-string match: the target must resolve, relative to root, to a path strictly INSIDE
 * <root>/scratch -- `scratch` itself (the bare directory, a Write/Edit target can never
 * legitimately name anyway) does not qualify, nor does a sibling whose name merely starts with
 * "scratch" (e.g. `scratch-evil/file`, which pathInside's relative()-based check correctly
 * rejects because its own relative path does not start with `scratch${sep}`). The caller
 * (evaluateAfterGrammarAdmission() below) is the one that gates this on lifecycleStatus being a
 * member of INTAKE_LIFECYCLE_STATUSES.
 */
function isIntakeLifecycleScratchWrite(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (!WRITE_TOOLS.includes(toolName)) return false;
  const filePath = writeTargetPath(input?.tool_input, toolName);
  if (filePath === "") return false;
  const scratchRoot = join(root, PARTIAL_LIFECYCLE_SCRATCH_DIR);
  const resolved = resolve(root, filePath);
  return resolved !== scratchRoot && pathInside(scratchRoot, resolved);
}

/**
 * NVA-GF-SCRATCH: the Bash-side twin -- `mkdir scratch`, `mkdir -p scratch`, and (unlike the
 * `partial` lane's isPartialLifecycleScratchDirCreate(), which admits only the bare directory
 * itself) `mkdir -p scratch/<nested>`, since a genuine scratch write may need a nested holding
 * directory first. Exact by construction via the identical resolve()+pathInside() comparison as
 * the write-side twin above; any other target, or any extra/reordered flag simpleWords() cannot
 * parse into this shape, still falls through to the ordinary GUARD-LIFECYCLE-NOT-READY refusal.
 */
function isIntakeLifecycleScratchMkdir(command, root) {
  const words = simpleWords(command, root);
  if (!words || words.length === 0) return false;
  if (basename(words[0]).toLowerCase() !== "mkdir") return false;
  const args = words.slice(1);
  const target = args.length === 1 ? args[0]
    : args.length === 2 && args[0] === "-p" ? args[1]
      : null;
  if (target === null) return false;
  const scratchRoot = join(root, PARTIAL_LIFECYCLE_SCRATCH_DIR);
  const resolved = resolve(root, target);
  return resolved === scratchRoot || pathInside(scratchRoot, resolved);
}

/**
 * NVA-BL-INTAKEBIND-1 (backlog: 2026-08-19-material-intake-bootstrap-bind-has-
 * no-sanctioned-path-to-a-passing-plan-gate.md; design.md SSa.4/SSc.3): the
 * design's own intended review step for a session observed at
 * `bootstrap-binding-required` (checkpoint transactionState "generated") --
 * without this admission no tool could ever perform that edit, since this
 * guard refuses every Edit/Write while onboarding isn't `ready`, with no
 * override route (ADR-0059 Decision 5 below).
 *
 * NVA-GS15-1: `isBootstrapBindingStagingAuthoringWrite` (imported above) moved
 * to `../lib/onboarding-staging-authoring.mjs` so a second guard
 * (guard-gate-strength.mjs, GS-15) can share the identical predicate instead
 * of defining a second copy that drifts from it -- see that module for the
 * full shape/rationale. The caller (evaluateAfterGrammarAdmission() below) is
 * the one that gates this on `lifecycleStatus === "bootstrap-binding-required"`.
 */

function onboardingConsentMarkerPath(root, sessionId) {
  return join(root, ".claude", `.pipeline-install-consent-${sessionId}.json`);
}

function onboardingConsentBlocked(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (!WRITE_TOOLS.includes(toolName)) return null;
  const sessionId = typeof input?.session_id === "string" && input.session_id !== ""
    ? input.session_id
    : null;
  if (!sessionId) return null;
  const markerPath = onboardingConsentMarkerPath(root, sessionId);
  const exists = existsSync(markerPath);
  if (exists) return null;
  const command = `node "${ONBOARDING_CONSENT_MARK_SCRIPT}" record --root "${root}" --session-id "${sessionId}" --answer yes|no`;
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-ONBOARDING-CONSENT-REQUIRED: "
      + `Ask the user, then run this consent-record action with the observed answer:\n${command}\n`
      + "After recording yes or no, retry the identical write action.\n",
  );
}

/**
 * NVA-BOOTRECEIPT-1: the private, agent-write-refused tree a dispatched subagent's
 * sanctioned preflight run is recorded into. Never a tracked or agent-writable path --
 * writes under `.git/agent-pipeline/**` are already refused as pipeline-owned private
 * state (guard-testpath.mjs / the cross-repository-mutation checks in this same file),
 * so a subagent cannot forge its own receipt.
 */
function bootstrapReceiptDir(commonDir) {
  return join(commonDir, "agent-pipeline", "bootstrap-receipt");
}

function bootstrapReceiptPath(commonDir, agentId) {
  return join(bootstrapReceiptDir(commonDir), `${agentId}.json`);
}

function bootstrapObservationsPath(commonDir) {
  return join(bootstrapReceiptDir(commonDir), "observations.jsonl");
}

/**
 * NVA-BOOTRECEIPT-1: append-only, best-effort observability for this feature's own
 * decisions -- mirrors guard-dispatch-budget.mjs's recordUnresolved() (that module's own
 * lines 96-106/248-290, the fail-open-but-visible model this feature follows). A logging
 * failure must never change the verdict already decided; the catch here is deliberately
 * silent for exactly that reason.
 */
function recordBootstrapObservation(commonDir, record, dependencies) {
  try {
    const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
    const appendFileSyncFn = dependencies.appendFileSyncFn ?? appendFileSync;
    mkdirSyncFn(bootstrapReceiptDir(commonDir), { recursive: true, mode: 0o700 });
    appendFileSyncFn(bootstrapObservationsPath(commonDir), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // best-effort observability only -- never let a logging failure change the guard's verdict
  }
}

/**
 * NVA-BOOTRECEIPT-1: writes the one durable proof that a dispatched subagent's process
 * ran the sanctioned preflight command in this session -- and nothing stronger. This
 * proves the process ran for this agentId; it does NOT and cannot prove the agent read or
 * understood the preflight result (that obligation stays the agent's own, validated --
 * never executed on the agent's behalf -- per skills/pipeline-start/SKILL.md:20-27).
 * Fires only for a Bash call whose parsed command is EXACTLY the sanctioned preflight
 * invocation (isSanctionedStartPreflightInvocation, reusing isSanctionedLifecycleCommand's
 * own START_PREFLIGHT_SCRIPT recognition, never a looser match) from a resolved dispatched
 * subagent. A pure side effect: it never changes the verdict for the Bash call that
 * triggered it, which the unmodified logic elsewhere in this file already decides.
 * Fails open silently when no git common dir is resolvable (nowhere safe to persist or
 * record); fails open WITH an observation line for every other unresolvable branch.
 */
function recordBootstrapPreflightReceipt(input, root, dependencies) {
  const identity = (dependencies.subagentIdentityFn ?? subagentIdentity)(input, dependencies);
  if (identity.kind !== "subagent") return;
  const commonDir = (dependencies.resolveGitCommonDirFn ?? resolveGitCommonDir)(root, dependencies);
  if (commonDir === null) return; // nowhere safe to persist or record -- fail open, silently
  const nowFn = dependencies.nowFn ?? (() => new Date().toISOString());
  try {
    const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
    const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
    mkdirSyncFn(bootstrapReceiptDir(commonDir), { recursive: true, mode: 0o700 });
    const receipt = {
      schema: "pipeline.bootstrap-receipt.v1",
      agentId: identity.agentId,
      agentType: identity.agentType,
      observedAt: nowFn(),
    };
    writeFileSyncFn(bootstrapReceiptPath(commonDir, identity.agentId), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  } catch (error) {
    recordBootstrapObservation(commonDir, {
      agentId: identity.agentId,
      agentType: identity.agentType,
      decision: "fail-open-receipt-write-error",
      toolName: "Bash",
      error: String(error?.message ?? error),
      at: nowFn(),
    }, dependencies);
  }
}

function bootstrapReceiptMissingBlocked(identity, toolName) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-BOOTSTRAP-RECEIPT-MISSING: "
      + `This dispatched subagent (${identity.agentType}, agent ${identity.agentId}) has no recorded `
      + `bootstrap preflight run in this session, so its first ${toolName} is refused.\n`
      + `Run exactly: node "${START_PREFLIGHT_SCRIPT}"\n`
      + "Then retry the identical write once that command has completed.\n",
  );
}

/**
 * NVA-BOOTRECEIPT-1: denies a dispatched subagent's first Edit/Write/NotebookEdit while no
 * bootstrap-preflight receipt exists for its agentId. Returns `null` to allow (the caller
 * falls through to every other existing check, unchanged); returns a verdict(2, ...) only
 * for a resolved subagent with no readable receipt. Never reached for the orchestrator --
 * the caller filters `identity.kind === "orchestrator"` before this runs, so the
 * orchestrating session is never gated and never logged, whatever the receipt state.
 * Fails open -- allow, plus an observation line wherever a common dir is resolvable -- on
 * every branch this gate cannot resolve, exactly like guard-dispatch-budget.mjs's own
 * model: a guard that fails closed on its own confusion would halt every dispatch in the
 * repository.
 */
function evaluateBootstrapReceiptGate(input, root, toolName, dependencies) {
  const identity = (dependencies.subagentIdentityFn ?? subagentIdentity)(input, dependencies);
  if (identity.kind === "orchestrator") return null;
  const commonDir = (dependencies.resolveGitCommonDirFn ?? resolveGitCommonDir)(root, dependencies);
  if (commonDir === null) return null; // nowhere safe to persist or record -- fail open, silently
  const nowFn = dependencies.nowFn ?? (() => new Date().toISOString());
  if (identity.kind === "unresolved") {
    recordBootstrapObservation(commonDir, {
      ...identity, decision: "fail-open-unresolved-identity", toolName, at: nowFn(),
    }, dependencies);
    return null;
  }
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const receiptPath = bootstrapReceiptPath(commonDir, identity.agentId);
  let receiptExists;
  try {
    receiptExists = existsSyncFn(receiptPath);
  } catch (error) {
    recordBootstrapObservation(commonDir, {
      agentId: identity.agentId,
      agentType: identity.agentType,
      decision: "fail-open-error",
      toolName,
      error: String(error?.message ?? error),
      at: nowFn(),
    }, dependencies);
    return null;
  }
  if (receiptExists) {
    try {
      JSON.parse(readFileSyncFn(receiptPath, "utf8"));
    } catch (error) {
      recordBootstrapObservation(commonDir, {
        agentId: identity.agentId,
        agentType: identity.agentType,
        decision: "fail-open-unreadable-receipt",
        toolName,
        error: String(error?.message ?? error),
        at: nowFn(),
      }, dependencies);
      return null;
    }
    recordBootstrapObservation(commonDir, {
      agentId: identity.agentId, agentType: identity.agentType, decision: "allow-receipt-present", toolName, at: nowFn(),
    }, dependencies);
    return null;
  }
  recordBootstrapObservation(commonDir, {
    agentId: identity.agentId, agentType: identity.agentType, decision: "deny-no-receipt", toolName, at: nowFn(),
  }, dependencies);
  return bootstrapReceiptMissingBlocked(identity, toolName);
}

/**
 * ADR-0059 Decision 5 / NOVA-LCR-HGO-2: everything below -- the LAUNCH_SCRIPT
 * external-restart refusal and the onboarding-readiness gate (denial code
 * GUARD-LIFECYCLE-NOT-READY) -- stays outside HGO's authority no matter how the
 * shell-grammar objection above was resolved. This function is the exact tail of
 * evaluateLifecycleReadyGuard() that used to be unreachable once a grammar capability
 * was consumed (verdict(0) returned immediately at the grammar check itself); it is now
 * called unconditionally so a lifted command is admitted only if these checks also
 * admit it. Its own logic is otherwise unchanged.
 */
function evaluateAfterGrammarAdmission(input, root, toolName, dependencies) {
  if (toolName === "Bash" && (input.tool_input.command ?? input.tool_input.CommandLine).includes(LAUNCH_SCRIPT)) {
    return externalRestartOnly();
  }

  let receipt;
  try {
    receipt = (dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({
      rootDir: root,
      intent: "session",
      runner: dependencies.runner,
    });
  } catch (error) {
    // Codex 0.145 may execute PreToolUse against the physical host Git
    // directory while the successful bootstrap command sees protected virtual
    // control mounts. Accept only the explicit host-init admission written by
    // the confirmed lifecycle action and bound to this root, stable authority,
    // and immutable kickoff history, and only when the native observation
    // failed with the two exact repository-control statuses produced by that
    // cross-view mismatch. App Server, runtime, continuity, malformed
    // observations, and unknown exceptions must never inherit this admission.
    // The prepared sprint:NONE follow-up owns replacing this narrow hotfix
    // fallback with one native cross-view session attestation.
    const crossViewRepositoryFailure = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && HOST_INIT_CROSS_VIEW_STATUSES.has(error.lifecycleStatus);
    if (crossViewRepositoryFailure) {
      try {
        const admission = (dependencies.readCodexHostRepositoryInitAdmissionFn
          ?? readCodexHostRepositoryInitAdmission)(root);
        if (admission?.gitVersion) return verdict(0);
      } catch {}
      try {
        const existingControlMount = (dependencies.hasCodexExistingGitControlMountFn
          ?? hasCodexExistingGitControlMount)(root);
        if (existingControlMount === true) return verdict(0);
      } catch {}
    }
    const restartRequired = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "restart-required";
    if (restartRequired && (isRestartResumeHintInputWrite(input, root)
      || (toolName === "Bash" && isRestartResumeHintCapture((input.tool_input.command ?? input.tool_input.CommandLine), root)))) {
      return verdict(0);
    }
    // RESTART_LIFECYCLE_SCRATCH_WRITE (backlog: 2026-08-29-scratch-write-exemption-does-not-
    // cover-restart-required.md): the restart-required twin of intakeLifecycleScratchWrite
    // below -- a session stuck at restart-required could write NOTHING at all besides the one
    // fixed resume-hint-input path above, including its own scratch/ throwaway notes,
    // contradicting the pipeline-start skill's own claim that scratch/ is always safe and
    // leaving a stuck session with no route to persist even a diagnostic note about its own
    // stuck state. Reuses isIntakeLifecycleScratchWrite() / isIntakeLifecycleScratchMkdir()
    // unmodified -- "is this write inside scratch/" does not differ by status. Excludes a
    // restart-resume-hint near miss (restartResumeHintNearMissWrite(), which already returns
    // false unconditionally for non-write tools, so calling it here for a Bash mkdir is safe)
    // so the NVA-MICRO-1 near-miss diagnostic above is never silently swallowed by this wider,
    // generic scratch lane -- a write to `scratch/.resume-hint-input.json` must still surface
    // the specific "wrong directory" hint, not a bare verdict(0) that would make the operator
    // believe the write landed somewhere it is actually read from.
    const restartLifecycleScratchWrite = restartRequired
      && !restartResumeHintNearMissWrite(input, root)
      && (isIntakeLifecycleScratchWrite(input, root)
        || (toolName === "Bash" && isIntakeLifecycleScratchMkdir((input.tool_input.command ?? input.tool_input.CommandLine), root)));
    if (restartLifecycleScratchWrite) return verdict(0);
    // NVA-BL-INTAKEBIND-1: the one narrow Edit/Write admission that lets a real
    // session perform the design's own intended staging-PRD/spec review step
    // (isBootstrapBindingStagingAuthoringWrite() above), gated on the exact
    // lifecycleStatus a repo sitting at checkpoint transactionState "generated"
    // observes.
    const bootstrapBindingStagingAuthoringWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "bootstrap-binding-required"
      && isBootstrapBindingStagingAuthoringWrite(input, root);
    if (bootstrapBindingStagingAuthoringWrite) return verdict(0);
    const exactPoAuthorityRebindRecovery = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "partial"
      && toolName === "Bash"
      && isExactPoAuthorityRebindPlannerRecovery((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies);
    if (exactPoAuthorityRebindRecovery) return verdict(0);
    // NVA-LCREADONLY-1 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-
    // and-tmp-fallback.md): a session stuck at `partial` has no route at all today to
    // persist a report of its own stuck state -- the in-root write is refused by this very
    // gate as GUARD-LIFECYCLE-NOT-READY, and a `/tmp` fallback is refused separately as
    // GUARD-CROSS-REPO-MUTATION (a governed session may write only inside its own physical
    // project root). Additive to isReadOnlyDiagnosticCommand()'s existing read-only lane,
    // never a widening of it: this is the write side, narrowed to the one scratch-directory
    // creation and the one fixed incident-report file
    // (isPartialLifecycleScratchDirCreate() / isPartialLifecycleIncidentReportWrite()
    // above). Scoped to `lifecycleStatus === "partial"` only -- every OTHER PORG-NOT-READY
    // status is unaffected by THIS branch and keeps refusing both operations exactly as
    // before through it, and this is strictly additive: it never touches GUARDALLOW-1's
    // `plan-partial-authority` branch or any other existing allowlist entry. (restart-required
    // no longer belongs in that "every other status" set as of
    // RESTART_LIFECYCLE_SCRATCH_WRITE above: both `mkdir scratch` and a
    // `scratch/incident-report.md` write are now ALSO admitted at restart-required, via that
    // separate, more general scratch lane -- not via this partial-only one.)
    const partialLifecycleDiagnosisWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "partial"
      && ((toolName === "Bash" && isPartialLifecycleScratchDirCreate((input.tool_input.command ?? input.tool_input.CommandLine), root))
        || isPartialLifecycleIncidentReportWrite(input, root));
    if (partialLifecycleDiagnosisWrite) return verdict(0);
    // NVA-GF-SCRATCH (backlog: 2026-08-28-a-scratch-write-is-refused-during-intake-against-the-
    // documented-exemption.md): a fresh, not-yet-onboarded session sitting at `intake-required`
    // or `intake-design-questions-required` could write NOTHING at all, including its own
    // scratch/ throwaway notes -- contradicting the pipeline-start skill's own claim that
    // scratch/ is always safe, and giving a consumer project (no plugin source to read) no
    // route forward at all. Scoped to INTAKE_LIFECYCLE_STATUSES only -- every other
    // PORG-NOT-READY status is unaffected and keeps refusing both operations exactly as before.
    const intakeLifecycleScratchWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && INTAKE_LIFECYCLE_STATUSES.has(error.lifecycleStatus)
      && (isIntakeLifecycleScratchWrite(input, root)
        || (toolName === "Bash" && isIntakeLifecycleScratchMkdir((input.tool_input.command ?? input.tool_input.CommandLine), root)));
    if (intakeLifecycleScratchWrite) return verdict(0);
    // NVA-MICRO-1 (backlog: 2026-08-09-restart-resume-hint-write-misses-the-project-
    // prefix.md): a restart-required write that already missed the exact admission above
    // (isRestartResumeHintInputWrite) but names the same basename gets the correct path
    // spelled out directly in the denial, instead of only the generic message -- named here,
    // never widening what is actually admitted (verdict(0) is still returned only from the
    // exact-match branch above).
    const restartResumeHintNearMissHint = restartRequired && restartResumeHintNearMissWrite(input, root)
      ? `This write's basename matches the one resume-hint input this gate admits during a `
        + `restart, but the path is wrong. The only path admitted is exactly `
        + `${RESTART_RESUME_HINT_INPUT_PATH} (relative to the project root).`
      : null;
    // NVA-T-READYKEYS: named separately from the "not ready" branch above -- an observation
    // that failed the ready-gate's own shape validation is a different cause from the
    // lifecycle genuinely reporting not-ready, and the two must not render identically.
    const invalidObservation = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-INVALID-OBSERVATION"
      && error.intent === "session";
    // NVA-R15-ROOTADMIT: same discoverability fix as restartResumeHintNearMissHint above,
    // for a different near miss -- a recognised sanctioned-script invocation refused only
    // because its --root token resolves to a different physical location than this guard's
    // own root. Mutually exclusive with restartResumeHintNearMissHint by construction (one
    // fires only for WRITE_TOOLS, the other only for toolName === "Bash"), so a plain
    // fallback is enough -- never both truthy for the same denial.
    const rootMismatch = toolName === "Bash"
      ? rootIdentityMismatch((input.tool_input.command ?? input.tool_input.CommandLine), root)
      : null;
    const rootIdentityMismatchHint = rootMismatch
      ? `This command's shape is otherwise recognised, but its --root value `
        + `("${rootMismatch.typedValue}", resolving to ${rootMismatch.resolvedTyped}) is not `
        + `the same project root as this guard's own root (${rootMismatch.root}) -- the `
        + "refusal is a root-identity mismatch, not an unadmitted command shape."
      : null;
    return toolName === "Bash"
      && (isSanctionedLifecycleCommand((input.tool_input.command ?? input.tool_input.CommandLine), root)
        || isSanctionedGhReadOnlyDiagnostic((input.tool_input.command ?? input.tool_input.CommandLine), root))
      ? verdict(0)
      : blocked(
        "GUARD-LIFECYCLE-NOT-READY",
        error instanceof ProjectOnboardingReadyError
          && error.code === "PORG-NOT-READY"
          && error.intent === "session"
          ? error.lifecycleStatus
          : null,
        [],
        "",
        null,
        null,
        restartResumeHintNearMissHint ?? rootIdentityMismatchHint,
        invalidObservation,
      );
  }
  return exactReadyReceipt(receipt) ? verdict(0) : blocked();
}

export function evaluateLifecycleReadyGuard(input, dependencies = {}) {
  const toolName = String(input?.tool_name ?? "");
  // PowerShell is wired into the same PreToolUse matcher as Bash and was nevertheless
  // absent from this list, so every PowerShell call returned verdict(0) -- allow -- for
  // bootstrap admission, cross-repo mutation, the closed grammar and gate strength alike.
  // On the native-Windows platform ADR-0051 makes a hard requirement, `Set-Content
  // project/guard-config.json` was exactly the shell bypass efe452c set out to close.
  if (![...SHELL_TOOLS, ...WRITE_TOOLS].includes(toolName)) return verdict(0);
  if (WRITE_TOOLS.includes(toolName)) {
    const filePath = writeTargetPath(input?.tool_input, toolName);
    if (filePath.trim() === "" || filePath.includes("\0")) return blocked();
  } else {
    const command = (input?.tool_input?.command ?? input?.tool_input?.CommandLine);
    if (typeof command !== "string" || command.trim() === "" || command.includes("\0")) return blocked();
  }

  let root;
  try {
    const requestedRoot = dependencies.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    root = (dependencies.realpathSyncFn ?? realpathSync)(resolve(requestedRoot));
  } catch {
    return blocked();
  }

  let governed;
  try {
    const exists = dependencies.existsSyncFn ?? existsSync;
    governed = governanceMarkers(dependencies).markers.some((marker) => exists(join(root, marker)));
  } catch {
    return blocked();
  }
  if (!governed) return onboardingConsentBlocked(input, root) ?? verdict(0);
  // NVA-BOOTRECEIPT-1: a pure side effect, never a verdict of its own -- the sanctioned
  // preflight command is already admitted or refused by the unmodified logic below. This
  // only additionally records that it ran, for a resolved dispatched subagent, when the
  // command is EXACTLY the sanctioned invocation (never a looser match).
  if (toolName === "Bash"
    && isSanctionedStartPreflightInvocation((input.tool_input.command ?? input.tool_input.CommandLine), root)) {
    recordBootstrapPreflightReceipt(input, root, dependencies);
  }
  // The bootstrap-obligation gate itself: a dispatched subagent's first Edit/Write/
  // NotebookEdit is refused while no receipt exists for its agentId. Orthogonal to every
  // other WRITE_TOOLS check below (destination, cross-repo, protected State) -- deciding
  // it first, and returning outright on a denial, keeps this file's existing WRITE_TOOLS
  // branch entirely unmodified for every call this gate does not refuse.
  if (WRITE_TOOLS.includes(toolName)) {
    const receiptDenial = evaluateBootstrapReceiptGate(input, root, toolName, dependencies);
    if (receiptDenial !== null) return receiptDenial;
  }
  if (toolName === "Bash" && isHumanPoSigningCommand((input.tool_input.command ?? input.tool_input.CommandLine), root)) {
    return externalPoSigningOnly();
  }
  // Consumed-capability notices raised by the shell-lane test-path check below, carried onto
  // whatever verdict the remaining checks produce. Declared here rather than folded into
  // `lifts` further down because that array is created after the PowerShell early return, and
  // the test-path shell lane covers PowerShell too.
  const shellLifts = [];
  if (SHELL_TOOLS.includes(toolName)) {
    const gateStrength = gateStrengthShellRefusal((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies);
    if (gateStrength !== null) return gateStrength;
    // Second, and only when gate strength had nothing to say: the test-path authority gate's
    // shell lane. Ordered after its stricter sibling deliberately -- a command that weakens
    // the gate-strength config is refused on that ground with no lift, and must not be able
    // to reach a lane that offers one.
    const testPathHit = protectedTestPathShellRefusalHit((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies, toolName);
    if (testPathHit !== null && testPathHit.fault === true) {
      return protectedTestPathShellFaultBlocked(testPathHit.error);
    }
    if (testPathHit !== null) {
      const reason = `${TESTPATH_SHELL_DENIAL_CODE}: ${testPathHit.rule.id}: ${testPathHit.rule.reason}`;
      const route = humanOverrideRoute(
        TESTPATH_SHELL_DENIAL_CODE, reason, "command", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) return protectedTestPathShellBlocked(testPathHit, route.overrideGuidance);
      shellLifts.push(route.admitted);
    }
    // Third, and only when the two stricter siblings above had nothing to say: the dev-plan
    // lifecycle gate's shell lane (GUARD-DEVPLAN-SHELL). Same ordering discipline -- a command
    // already refused on a stricter sibling's ground must not also reach a lane that offers its
    // own lift.
    const devPlanHit = devPlanShellRefusalHit((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies, toolName);
    if (devPlanHit !== null && devPlanHit.fault === true) {
      return devPlanShellFaultBlocked(devPlanHit.error);
    }
    if (devPlanHit !== null) {
      const reason = `${DEVPLAN_SHELL_DENIAL_CODE}: ${devPlanHit.reason}`;
      const route = humanOverrideRoute(
        DEVPLAN_SHELL_DENIAL_CODE, reason, "command", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) return devPlanShellBlocked(devPlanHit, route.overrideGuidance);
      shellLifts.push(route.admitted);
    }
  }
  // PowerShell reaches the gate-strength check above and nothing else, deliberately.
  // Every decision below parses a POSIX command grammar; applying it to PowerShell would
  // mis-read ordinary Windows syntax and refuse work rather than protect it, and the
  // recovery lanes it gates are Bash-only, so a non-ready Windows operator would be left
  // with no returned action. The bootstrap-admission asymmetry for PowerShell is
  // pre-existing, is NOT closed here, and is recorded in docs/state.md.
  //
  // Consequence stated rather than hidden: `isReadOnlyDiagnosticCommand` is also a POSIX
  // parser, so a PowerShell command naming one of the five paths is refused even when it
  // only reads. That over-refuses on exactly five filenames and fails closed; a
  // PowerShell-aware read-only classifier is the proper fix.
  if (toolName === "PowerShell") return withLifts(shellLifts, verdict(0));
  // ADR-0059 Decision 6: a consumed cross-repository capability clears ONLY the
  // cross-repository objection. Every later check still runs against the lifted action --
  // the writer-owned State refusal, the closed shell grammar, the LAUNCH_SCRIPT external
  // restart and the readiness gate above all -- exactly as NOVA-LCR-HGO-2 established for
  // the grammar lift. `lifts` carries the consumption notices so a capability spent on an
  // action a later check refuses is surfaced rather than silently swallowed; it is already
  // irreversibly consumed on disk by then, and there is no "un-consume" available here.
  const lifts = [...shellLifts];
  const crossRepoReason = `${CROSS_REPO_DENIAL_CODE}: ${CROSS_REPO_DENIAL_GUIDANCE}`;
  if (WRITE_TOOLS.includes(toolName)) {
    const target = writeTargetPath(input.tool_input, toolName);
    // MEMPATH-1: the CLI's own derived memory directory is admitted outright, never through
    // the human-override route -- it is not a lifted cross-repository exception, it is not a
    // cross-repository mutation in the first place. Falls through to the readiness gate
    // below exactly like any other admitted write; only the cross-repository objection and
    // the writer-owned-State check (meaningless for a target this far outside root) are
    // skipped.
    const memoryWrite = isClaudeSessionMemoryWritePath(target, input, dependencies);
    // MACHPATH-1: the second, narrower carve-out (specs/sprint-nova-epic/plans/
    // nova-setup-bootstrap.md SS6a) -- exactly one file, never a directory or a prefix. Same
    // treatment as memoryWrite immediately above: admitted outright, never through the
    // human-override route, and it skips the identical two checks for the identical reason.
    const machineWrite = !memoryWrite && isMachinePlaneWritePath(target, dependencies);
    if (!memoryWrite && !machineWrite && !isProjectWritePath(target, root, dependencies)) {
      const route = humanOverrideRoute(
        CROSS_REPO_DENIAL_CODE, crossRepoReason, "write", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) return crossRepositoryMutationBlocked(route.overrideGuidance);
      lifts.push(route.admitted);
    }
    if (!memoryWrite && !machineWrite) {
      const requested = resolve(root, target);
      if (requested === join(root, ".claude", "pipeline-state.json")
        || requested === join(root, "project", "pipeline-state.json")) {
        return withLifts(lifts, protectedStateWriterOnly());
      }
      const boundAuthority = boundAuthorityDocumentPath(root, requested);
      if (boundAuthority !== null) {
        return withLifts(lifts, protectedAuthorityDocumentWriteOnly(boundAuthority));
      }
    }
  }
  if (toolName === "Bash"
    && isForbiddenCrossRepositoryMutation((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies)) {
    const route = humanOverrideRoute(
      CROSS_REPO_DENIAL_CODE, crossRepoReason, "command", root, toolName, input.tool_input, dependencies,
    );
    if (!route.admitted) return crossRepositoryMutationBlocked(route.overrideGuidance);
    lifts.push(route.admitted);
  }
  if (toolName === "Bash" && isReadOnlyDiagnosticCommand((input.tool_input.command ?? input.tool_input.CommandLine), root)) {
    return withLifts(lifts, verdict(0));
  }
  if (toolName === "Bash" && isNarrowRepositoryRecoveryCommand((input.tool_input.command ?? input.tool_input.CommandLine), root)) {
    return withLifts(lifts, verdict(0));
  }
  // A consumed grammar capability clears ONLY the shell-grammar objection captured in
  // `grammarLift` below -- the LAUNCH_SCRIPT and readiness checks in
  // evaluateAfterGrammarAdmission() stay outside HGO's authority (ADR-0059 Decision 5) and
  // are always evaluated next, whether or not a capability was just consumed here; a lifted
  // command is admitted only if that tail also admits it. consumeHumanGuardOverride()
  // (lib/human-guard-override.mjs, read-only to this dispatch) already marks the capability
  // irreversibly "consumed" on disk, with its own audit entry, the moment it matched, before
  // grammarOverrideRoute() even returns here -- there is no "un-consume" available to this
  // file. A capability spent on a command later refused downstream stays spent; its
  // consumption is surfaced in the denial below rather than left to vanish silently.
  if (toolName === "Bash") {
    const parsed = parseGuardCommand((input.tool_input.command ?? input.tool_input.CommandLine), root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
    if (parsed.parseStatus !== "accepted") {
      const code = "GUARD-PARSE-UNSUPPORTED";
      const route = humanOverrideRoute(
        code, `${code}: ${GRAMMAR_DENIAL_GUIDANCE[code]}`, "command", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) {
        return withLifts(lifts, blocked(
          code,
          null,
          retryActionsForDeniedCommand((input.tool_input.command ?? input.tool_input.CommandLine), root),
          route.overrideGuidance,
          rejectedGrammarElement(code, (input.tool_input.command ?? input.tool_input.CommandLine), parsed, root),
          commitMessageFileRemediation((input.tool_input.command ?? input.tool_input.CommandLine)),
        ));
      }
      lifts.push(route.admitted);
    } else if (parsed.operators.length > 0 || parsed.redirects.length > 0) {
      // NVA-BL-76: the read-scope refusal is decided FIRST, because for this one shape the
      // operator/redirect codes state a reason that is demonstrably not the reason.
      const readScope = isOutsideRootBoundedDiagnosticRead(parsed, root);
      const code = readScope
        ? READ_SCOPE_DENIAL_CODE
        : parsed.redirects.length > 0 ? "GUARD-REDIRECT-UNAPPROVED" : "GUARD-OPERATOR-UNAPPROVED";
      const reason = readScope
        ? `${code}: ${READ_SCOPE_DENIAL_GUIDANCE}`
        : `${code}: ${GRAMMAR_DENIAL_GUIDANCE[code]}`;
      const route = humanOverrideRoute(
        code, reason, "command", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) {
        // Intentional `[]`, not the GUARD-PARSE-UNSUPPORTED omission (backlog:
        // grammar-refusal-does-not-say-which-part-failed): every command reaching this
        // branch is `parsed.parseStatus === "accepted"` with an operator or redirect
        // present, so it contains at least one of `|&<>()` -- and
        // retryActionsForDeniedCommand() returns [] unconditionally on the first such
        // character it scans (its per-part policy only ever recovers `;`/newline-joined
        // segments). Measured empirically across `&&`, `|`, `>`, `2>&1`, `| tee`: [] in
        // every case. Calling it here would be dead code, not a fix.
        return withLifts(lifts, blocked(
          code, null, [], route.overrideGuidance, rejectedGrammarElement(code, (input.tool_input.command ?? input.tool_input.CommandLine), parsed),
        ));
      }
      lifts.push(route.admitted);
    } else if (isOutsideRootSingleCommandRead(parsed, root)) {
      // pipeline.read-scope-single-command-root-check: the single-command sibling of the
      // NVA-BL-76 branch just above -- a single, un-piped read whose target resolves outside
      // the project root is refused under the identical code the piped shape already uses. An
      // in-root single read still short-circuits at the isReadOnlyDiagnosticCommand() fast
      // path above and never reaches this branch.
      const code = READ_SCOPE_DENIAL_CODE;
      const reason = `${code}: ${READ_SCOPE_DENIAL_GUIDANCE}`;
      const route = humanOverrideRoute(code, reason, "command", root, toolName, input.tool_input, dependencies);
      if (!route.admitted) return withLifts(lifts, blocked(code, null, [], route.overrideGuidance));
      lifts.push(route.admitted);
    }
  }
  return withLifts(lifts, evaluateAfterGrammarAdmission(input, root, toolName, dependencies));
}

export function main(rawInput = undefined, dependencies = {}) {
  const writeError = dependencies.writeErrorFn ?? ((value) => process.stderr.write(value));
  let input;
  try {
    const raw = rawInput ?? readFileSync(0, "utf8");
    input = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    const result = blocked();
    writeError(result.stderr);
    return result.exitCode;
  }
  // Runner identity is threaded explicitly at this CLI boundary (ADR-0051):
  // read from this process's own argv, never from the ambient environment.
  // guard-lifecycle-ready.mjs has exactly two production callers --
  // codex-pretool-guard.mjs's boundedSpawn and guard-apply-patch.mjs's GUARDS
  // spawn list -- both of which always supply `--runner codex`. An absent or
  // invalid flag fails closed the same way any other unmet lifecycle
  // precondition does -- it never silently defaults (backlog:
  // ready-gate-env-var-runner-authority).
  const runner = dependencies.runner ?? runnerFromArgv(dependencies.argv ?? process.argv.slice(2));
  if (!VALID_RUNNERS.has(runner)) {
    const result = blocked();
    writeError(result.stderr);
    return result.exitCode;
  }
  const result = evaluateLifecycleReadyGuard(input, { ...dependencies, runner });
  if (result.stderr) {
    writeError(result.stderr);
  }
  return result.exitCode;
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main();
