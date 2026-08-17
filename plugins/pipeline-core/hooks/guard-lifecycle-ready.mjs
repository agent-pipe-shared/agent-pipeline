#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Codex implementation-write guard for already Pipeline-governed roots. */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
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
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
import {
  hasCodexExistingGitControlMount,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import {
  consumeHumanGuardOverride,
  humanGuardRouteUnavailableReason,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { machinePlaneFilePath } from "../lib/machine-plane.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";
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

const GOVERNANCE_MARKERS = [
  ".agent-pipeline/core.lock.json",
  "pipeline.user.yaml",
  "project/pipeline.json",
  "project/pipeline.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
  ...loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path),
].filter((value, index, values) => values.indexOf(value) === index);
const READY_RECEIPT_KEYS = ["intent", "schema", "status"];
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
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
const HEX = /^[a-f0-9]{64}$/u;
const VALID_RUNNERS = new Set(["claude", "codex"]);
// Every write-capable tool this gate admits. NotebookEdit was absent from both this list
// and from every hooks.json matcher until 2026-08-06, so a .ipynb write returned verdict(0)
// -- allow -- without the session ever proving a ready bootstrap. Its target arrives as
// `notebook_path`, not `file_path`; see lib/tool-write-target.mjs.
const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];
// Both shells this hook is wired for. PowerShell was named in the matcher but in no
// decision, which made the whole gate a no-op on the runner that uses it.
const SHELL_TOOLS = ["Bash", "PowerShell"];
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
const READ_SCOPE_DENIAL_CODE = "GUARD-READ-SCOPE-OUTSIDE-ROOT";
const READ_SCOPE_DENIAL_GUIDANCE = "The bounded read-only diagnostic pipeline reads a path outside the project root.";
// The four lines every grammar denial has always printed, moved verbatim out of blocked()'s
// template so a code that must NOT print them (READ_SCOPE_DENIAL_CODE) can say something
// true instead. Byte-identical output for the three grammar codes.
const GRAMMAR_DENIAL_REMEDY = [
  "Use one simple shell command per tool call; issue independent read-only commands as separate parallel tool calls.",
  "Do not construct a new composed command with &&, ;, pipelines, redirects, or line continuation.",
  "If typed retryActions are present, run only those exact read-only actions as separate tool calls.",
  "Only bounded rg-to-rg and rg-to-head diagnostic pipelines are admitted as exceptions.",
];
// Every line here is executable advice that actually clears THIS refusal -- the item's
// second requirement ("make the remedy true or omit it"), and the reason the old text was a
// defect rather than a wording nit: it sent the operator to fix a pipeline that was never
// the objection. Line 3 is admitted by isReadOnlyDiagnosticCommand() below, which imposes no
// path-location restriction on a single, un-piped read command; both claims are pinned by
// the NVA-BL-76 tests, which EXECUTE the advice rather than matching its wording.
const READ_SCOPE_DENIAL_REMEDY = [
  "The pipeline is not the objection: the identical bounded rg-to-rg / rg-to-head pipeline is admitted when every read target resolves inside the project root.",
  "Recomposing the same read -- splitting it, adding operators, redirects or line continuation -- cannot lift this refusal.",
  "Either re-target the read inside the project root, or issue it as ONE simple, un-piped read command (rg, grep, cat, head, tail, wc, stat, file), a shape this guard admits without a path-location restriction.",
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
function rejectedGrammarElement(code, command, parsed) {
  if (code === "GUARD-REDIRECT-UNAPPROVED" && parsed.redirects.length > 0) {
    const redirect = parsed.redirects[0];
    const token = redirect.fd === 2 ? "2>" : redirect.direction;
    return `the redirect operator "${token}"`;
  }
  if (code === "GUARD-OPERATOR-UNAPPROVED" && parsed.operators.length > 0) {
    return `the operator "${parsed.operators[0].operator}"`;
  }
  if (code === "GUARD-PARSE-UNSUPPORTED" && typeof command === "string") {
    if (/\n/u.test(command)) return "a newline character inside the command text";
    if (/\r/u.test(command)) return "a carriage-return character inside the command text";
    if (/\0/u.test(command)) return "a NUL character inside the command text";
  }
  return null;
}

function blocked(
  code = "GUARD-LIFECYCLE-NOT-READY", lifecycleStatus = null, retryActions = [], overrideGuidance = "", rejectedElement = null,
  remediation = null,
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
  const guidance = typedLifecycleStatus === null
    ? [
      "Pipeline-governed project writes require an exact V4 ready result for session intent.",
      "Re-run the typed project-onboarding-v3 session inspection and use only its returned nextAction.",
    ]
    : [
      `Pipeline session readiness is ${typedLifecycleStatus}.`,
      "Re-run the typed project-onboarding-v3 inspection with intent session and use only its returned nextAction.",
    ];
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${code}: `
      + `${guidance[0]}\n`
      + `${guidance[1]}\n`,
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
            `Then, outside this session (presence of a valid, correctly-bound Ed25519 ` +
              `signature IS the authorization -- there is no in-session activate step for this mode):`,
            `${process.execPath} ${JSON.stringify(script)} prepare-authorization --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256-from-plan> --reason "<fixed HGO_SIGNATURE_REASON text>"`,
            `${process.execPath} ${JSON.stringify(script)} emit-signature-digest --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256>`,
            `${process.execPath} ${JSON.stringify(script)} authorize-by-signature --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256> --proof <external-proof.json>`,
          ].join("\n");
        overrideGuidance = [
          "",
          `Human override available for this exact ${subject} (one use; audited; the human confirms):`,
          `${process.execPath} ${JSON.stringify(script)} plan --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256}`,
          continuation,
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
 * message merely naming one of these files is refused too. Over-refusal costs a `-F`
 * flag; under-refusal costs the gate. Read-only diagnostics are exempt via the existing
 * classifier, so `cat`, `rg`, `sha256sum` and `git diff` on these paths keep working --
 * except for one measured, real, prescribed shape that classifier does not cover:
 * `node <script> --guardrail <gate-strength-path> ...`, the exact command
 * `skills/critic-review/SKILL.md`'s mandatory dispatch-admission step instructs an
 * operator to run (it tells them to pass "every declared guardrail", a gate-strength
 * path among them for a governance project). That shape is closed instead by the exact,
 * closed exemption below (GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS): not "any read-only
 * command", but one specific, provably write-free plugin-local script, matched on exact
 * identity rather than shape.
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

function gateStrengthShellRefusal(command, root, dependencies = {}) {
  if (typeof command !== "string" || command === "") return null;
  if (isReadOnlyDiagnosticCommand(command, root)) return null;
  if (isGateStrengthSafeGitCommand(command, root)) return null;
  if (gateStrengthShellReadOnlyScriptExemption(command, root, dependencies)) return null;
  // Scoped to the five configuration paths (GS-1..GS-5) deliberately. The live plugin
  // root (GS-6) is NOT a needle here: executing a plugin script by absolute path is the
  // normal bootstrap and recovery shape, so matching the root would refuse
  // `node <pluginRoot>/scripts/project-onboarding-v3.mjs inspect` -- the very command the
  // gate tells the operator to run. Shell WRITES into the enforcing plugin root are
  // already refused by GUARD-CROSS-REPO-MUTATION whenever the installed copy sits outside
  // the project root, which is the arrangement docs/claude-local-plugin-development.md
  // now prescribes; the residual case is recorded in docs/state.md rather than closed by
  // a rule that would break bootstrap.
  const needles = GATE_STRENGTH_PATHS.map((rule) => basename(rule.path));
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
      + "are admitted, and so is the one exact, closed script exemption this rule grants "
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
    return applyPatchTargetsResumeHintInput(input?.tool_input?.command, root);
  }
  return false;
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

/**
 * Keep fail-closed lifecycle states diagnosable without turning arbitrary
 * shell syntax into a write bypass.  Only one simple command is accepted; the
 * parser already rejects control operators, redirections and command
 * substitution.
 */
export function isReadOnlyDiagnosticCommand(command, root) {
  const parsed = parseGuardCommand(command, root);
  if (isBoundedReadOnlyPipeline(parsed, root, BOUNDED_PIPELINE_ADDITIONAL_ROOTS)) return true;
  const words = simpleWords(command, root);
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
    return !args.some((arg) => arg === "--files-with-matches" && executable === "grep");
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
    const parsed = parseGuardCommand(part, root);
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

function isHumanPoSigningCommand(command, root) {
  const args = poApprovalArgs(command, root, PO_HUMAN_APPROVAL_SCRIPT);
  return args !== null && ["setup", "approve", "approve-all"].includes(args[0]);
}

/**
 * Identify the concrete cross-repository mutation patterns involved in local
 * plugin development. Read-only commands remain handled by the diagnostic
 * allowlist; unknown commands do not gain mutation authority from this helper.
 */
export function isForbiddenCrossRepositoryMutation(command, root, dependencies = {}) {
  const parsed = parseGuardCommand(command, root);
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
    if (args[i] === "--runner" && ["claude", "codex"].includes(args[i + 1])) {
      return [...args.slice(0, i), ...args.slice(i + 2)];
    }
  }
  return args;
}

function sanctionedOnboardingArgs(rawArgs, root) {
  const args = withoutRunnerFlag(rawArgs);
  // NVA-LCGUARD-3 (backlog: 2026-08-17-lifecycle-guard-omits-the-operator-authority-repair-shape.md).
  // collectOperatorContinuityAuthorityAction() (lib/project-onboarding-v3.mjs) is the
  // guidance a session actually reads once plan-repair reports operator-authority-required:
  // "rerun plan-repair/apply-repair with --id --plan-path --prd-path --spec-path --language
  // set to those exact values" -- the same five-field, all-or-none operator-confirmed
  // continuity claim the CLI's own usage string documents (scripts/project-onboarding-v3.mjs,
  // "<plan-repair|apply-repair> --root <project-dir> [--id <feature-id> --plan-path <path>
  // --prd-path <path> --spec-path <path> --language <de|en>] ..."). Exact position, like every
  // sibling here: parse() is flag-name-based and order-tolerant, but the guard is the only
  // place order actually matters. --id/--plan-path/--prd-path/--spec-path are a feature id and
  // repository-relative paths, checked only as non-empty, non-flag-shaped strings -- the same
  // defensive idiom the adopt-remote branch already applies to its own free-form --remote
  // value below -- never re-deriving the path-safety/existence validation that stays the
  // library's job. --language is the CLI's own closed two-value enum, exactly as the kickoff
  // branches below already check it.
  const operatorContinuityAuthorityAt = (index) => {
    const nonEmptyPathArg = (value) => typeof value === "string" && value !== "" && !value.startsWith("--");
    return args[index] === "--id" && nonEmptyPathArg(args[index + 1])
      && args[index + 2] === "--plan-path" && nonEmptyPathArg(args[index + 3])
      && args[index + 4] === "--prd-path" && nonEmptyPathArg(args[index + 5])
      && args[index + 6] === "--spec-path" && nonEmptyPathArg(args[index + 7])
      && args[index + 8] === "--language" && ["de", "en"].includes(args[index + 9]);
  };
  // GF-093: same reasoning as START_PREFLIGHT_SCRIPT's and REPAIR_MAP_SCRIPT's own bare
  // no-arg admissions above -- a stuck agent needs the CLI's own usage text precisely in the
  // state this function exists to gate. `main()` returns immediately on `options.help`
  // (scripts/project-onboarding-v3.mjs:127) with zero filesystem access and zero mutation,
  // and `--help`/`-h` is accepted before `--root` is even required (line 106). Narrow by
  // construction: exactly one argument, exactly `--help` or `-h`, nothing else -- never an
  // escape hatch bolted onto a real command (`--root <path> --help` and `kickoff plan --help`
  // both still fall through to refusal below, same as every other malformed shape here).
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return true;
  if (args[0] === "inspect"
    && exactRoot(args, root, 1)
    && (args.length === 3
      || (args.length === 5 && args[3] === "--intent"
        && ["onboarding", "bootstrap", "session", "dispatch"].includes(args[4])))) return true;
  if (args[0] === "continuity" && args[1] === "inspect"
    && exactRoot(args, root, 2) && args.length === 4) return true;
  // GUARDALLOW-1 (backlog: 2026-08-16-lifecycle-guard-omits-the-partial-authority-repair-it-prescribes.md).
  // `plan-partial-authority` is a read-only planner -- absent from APPLY_SHAPED_COMMANDS
  // (scripts/project-onboarding-v3.mjs:28-32) and passed through commandAction(..., false, ...)
  // (lib/project-onboarding-v3.mjs:3436) -- built through the same lifecycleArgv(argv, runner,
  // intent) helper as every sibling here, so it emits the identical `--root <root> [--runner
  // <runner>] [--intent <value>]` shape and belongs in this exact branch, not a new one.
  if (["plan", "plan-runtime", "plan-reinstall", "plan-repair", "plan-readback", "plan-source-recovery", "plan-manifest-repair", "plan-partial-authority"].includes(args[0])
    && exactRoot(args, root, 1)
    && (args.length === 3
      || (args.length === 5 && args[3] === "--intent"
        && ["onboarding", "bootstrap", "session", "dispatch"].includes(args[4])))) return true;
  // NVA-LCGUARD-3: the operator-authority form -- only plan-repair ever accepts these five
  // fields (isRepairCommand in the CLI's own parse()); no other sibling in the bare-form
  // branch above does, so this is a plan-repair-only addition, not a widening of that
  // shared branch.
  if (args[0] === "plan-repair" && exactRoot(args, root, 1) && operatorContinuityAuthorityAt(3)
    && (args.length === 13
      || (args.length === 15 && args[13] === "--intent"
        && ["onboarding", "bootstrap", "session", "dispatch"].includes(args[14])))) return true;
  if (["plan-source-recovery", "plan-manifest-repair"].includes(args[0])
    && exactRoot(args, root, 1) && args.length === 3) return true;
  if (args[0] === "apply-manifest-repair"
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6) return true;
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
    && exactRoot(args, root, 1)
    && args[3] === "--profile" && ["epic", "feature", "mini"].includes(args[4])
    && args[5] === "--source" && args[6] === "canonical-fresh-v3"
    && args[7] === "--plan-sha256" && HEX.test(args[8] ?? "")
    && args[9] === "--activate" && args.length === 10) return true;
  // lib/project-onboarding-v3.mjs:4198 and :4111 construct exactly these two commands --
  // the documented onboarding-recovery.md path for portable-seed-required when an existing
  // remote+branch is supplied. Only these two adopt-remote subcommands are ever admitted;
  // --remote is checked loosely (non-empty, not flag-shaped) -- genuinely caller-chosen at
  // both construction sites. NVA-LCGUARD-2 round 2 (Critic finding F-B): --ref mirrors the
  // FULL validRemoteAdoptionRequest gate at lib/project-onboarding-v3.mjs:3988-3990, not just
  // its REMOTE_REF_RE half -- that gate also refuses "..", "//", a trailing "/", and a ".lock"
  // suffix before either adopt-remote command is ever constructed, so a guard admitting those
  // four extra shapes was a strict superset of what any construction site can emit.
  if (args[0] === "adopt-remote" && ["plan", "apply"].includes(args[1])
    && exactRoot(args, root, 2)
    && args[4] === "--remote" && typeof args[5] === "string" && args[5] !== "" && !args[5].startsWith("--")
    && args[6] === "--ref" && /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(args[7] ?? "")
    && !(args[7] ?? "").includes("..") && !(args[7] ?? "").includes("//")
    && !(args[7] ?? "").endsWith("/") && !(args[7] ?? "").endsWith(".lock")
    && ((args[1] === "plan" && args.length === 8)
      || (args[1] === "apply" && args[8] === "--plan-sha256" && HEX.test(args[9] ?? "")
        && args[10] === "--activate" && args.length === 11))) return true;
  // The apply half of the same defect the plan* branch above already closed. `plan-runtime
  // --intent session` returns `initialize-runtime --root <root> --plan-sha256 <hex>
  // --activate --runner <runner> --intent session` (lib/project-onboarding-v3.mjs:3608-3627
  // building it through lifecycleArgv at :1315-1318), so the planner emitted a command this
  // very allowlist refused, and the printed recovery instruction -- run the returned
  // nextAction verbatim -- pointed straight back at the refusal. Measured 2026-08-08.
  // The trailing `--intent <value>` pair is optional and positional exactly as in the two
  // branches above; the closed value set is the CLI's own
  // (scripts/project-onboarding-v3.mjs:62). Nothing else moves: no new subcommand, no
  // reordering tolerance, both digest and `--activate` still checked by position.
  if (["apply-portable-seed", "apply-reinstall", "initialize-runtime", "apply-repair", "apply-readback"].includes(args[0])
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate"
    && (args.length === 6
      || (args.length === 8 && args[6] === "--intent"
        && ["onboarding", "bootstrap", "session", "dispatch"].includes(args[7])))) return true;
  // NVA-LCGUARD-3: apply-repair's own operator-authority form. applyLifecycle()
  // (lib/project-onboarding-v3.mjs) re-threads operatorAuthority into the apply-side
  // recomputation of the repair plan, so the digest only matches when these five fields are
  // supplied again alongside --plan-sha256/--activate -- only apply-repair ever accepts them
  // (isRepairCommand), so this is an apply-repair-only addition, not a widening of the
  // shared digest+activate branch above.
  if (args[0] === "apply-repair" && exactRoot(args, root, 1) && operatorContinuityAuthorityAt(3)
    && args[13] === "--plan-sha256" && HEX.test(args[14] ?? "")
    && args[15] === "--activate"
    && (args.length === 16
      || (args.length === 18 && args[16] === "--intent"
        && ["onboarding", "bootstrap", "session", "dispatch"].includes(args[17])))) return true;
  // --language <de|en> is mandatory for kickoff plan/apply since the CLI's
  // GF-066 addition (scripts/project-onboarding-v3.mjs:56,92,114); it sits
  // between --goal <text> and --plan-sha256 <sha256> in the CLI's own
  // documented canonical order. Exact position, exact two-value enum, like
  // every other branch in this function -- no reordering tolerance.
  if (args[0] === "kickoff" && args[1] === "plan"
    && exactRoot(args, root, 2) && args[4] === "--goal"
    && typeof args[5] === "string" && args[5].trim() !== ""
    && args[6] === "--language" && ["de", "en"].includes(args[7])
    && args.length === 8) return true;
  return args[0] === "kickoff" && args[1] === "apply"
    && exactRoot(args, root, 2) && args[4] === "--goal"
    && typeof args[5] === "string" && args[5].trim() !== ""
    && args[6] === "--language" && ["de", "en"].includes(args[7])
    && args[8] === "--plan-sha256" && HEX.test(args[9] ?? "")
    && args[10] === "--activate" && args.length === 11;
}

function sanctionedMigrationArgs(args, root) {
  if (["inspect", "plan"].includes(args[0]) && exactRoot(args, root, 1) && args.length === 3) return true;
  if (args[0] !== "apply" || !exactRoot(args, root, 1)) return false;
  return (args.length === 4 && args[3] === "--activate")
    || (args.length === 5 && args[3] === "--initialize-missing-runtime" && args[4] === "--activate");
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

export function isSanctionedLifecycleCommand(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  const platform = options.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = options.processExecPath ?? process.execPath;
  if (!words || words.length < 2 || ![...directNode, trustedNode].includes(words[0])) return false;
  const [script, ...args] = words.slice(1);
  if (script === ONBOARDING_SCRIPT) return sanctionedOnboardingArgs(args, root);
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
  if (toolName === "Bash" && input.tool_input.command.includes(LAUNCH_SCRIPT)) {
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
      || (toolName === "Bash" && isRestartResumeHintCapture(input.tool_input.command, root)))) {
      return verdict(0);
    }
    const exactPoAuthorityRebindRecovery = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "partial"
      && toolName === "Bash"
      && isExactPoAuthorityRebindPlannerRecovery(input.tool_input.command, root, dependencies);
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
    // above). Scoped to `lifecycleStatus === "partial"` only -- every other PORG-NOT-READY
    // status (restart-required among them) is unaffected and keeps refusing both operations
    // exactly as before, and this is strictly additive: it never touches GUARDALLOW-1's
    // `plan-partial-authority` branch or any other existing allowlist entry.
    const partialLifecycleDiagnosisWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "partial"
      && ((toolName === "Bash" && isPartialLifecycleScratchDirCreate(input.tool_input.command, root))
        || isPartialLifecycleIncidentReportWrite(input, root));
    if (partialLifecycleDiagnosisWrite) return verdict(0);
    return toolName === "Bash"
      && (isSanctionedLifecycleCommand(input.tool_input.command, root)
        || isSanctionedGhReadOnlyDiagnostic(input.tool_input.command, root))
      ? verdict(0)
      : blocked(
        "GUARD-LIFECYCLE-NOT-READY",
        error instanceof ProjectOnboardingReadyError
          && error.code === "PORG-NOT-READY"
          && error.intent === "session"
          ? error.lifecycleStatus
          : null,
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
    const command = input?.tool_input?.command;
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
    governed = GOVERNANCE_MARKERS.some((marker) => exists(join(root, marker)));
  } catch {
    return blocked();
  }
  if (!governed) return verdict(0);
  if (toolName === "Bash" && isHumanPoSigningCommand(input.tool_input.command, root)) {
    return externalPoSigningOnly();
  }
  if (SHELL_TOOLS.includes(toolName)) {
    const gateStrength = gateStrengthShellRefusal(input.tool_input.command, root, dependencies);
    if (gateStrength !== null) return gateStrength;
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
  if (toolName === "PowerShell") return verdict(0);
  // ADR-0059 Decision 6: a consumed cross-repository capability clears ONLY the
  // cross-repository objection. Every later check still runs against the lifted action --
  // the writer-owned State refusal, the closed shell grammar, the LAUNCH_SCRIPT external
  // restart and the readiness gate above all -- exactly as NOVA-LCR-HGO-2 established for
  // the grammar lift. `lifts` carries the consumption notices so a capability spent on an
  // action a later check refuses is surfaced rather than silently swallowed; it is already
  // irreversibly consumed on disk by then, and there is no "un-consume" available here.
  const lifts = [];
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
    }
  }
  if (toolName === "Bash"
    && isForbiddenCrossRepositoryMutation(input.tool_input.command, root, dependencies)) {
    const route = humanOverrideRoute(
      CROSS_REPO_DENIAL_CODE, crossRepoReason, "command", root, toolName, input.tool_input, dependencies,
    );
    if (!route.admitted) return crossRepositoryMutationBlocked(route.overrideGuidance);
    lifts.push(route.admitted);
  }
  if (toolName === "Bash" && isReadOnlyDiagnosticCommand(input.tool_input.command, root)) {
    return withLifts(lifts, verdict(0));
  }
  if (toolName === "Bash" && isNarrowRepositoryRecoveryCommand(input.tool_input.command, root)) {
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
    const parsed = parseGuardCommand(input.tool_input.command, root);
    if (parsed.parseStatus !== "accepted") {
      const code = "GUARD-PARSE-UNSUPPORTED";
      const route = humanOverrideRoute(
        code, `${code}: ${GRAMMAR_DENIAL_GUIDANCE[code]}`, "command", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) {
        return withLifts(lifts, blocked(
          code,
          null,
          retryActionsForDeniedCommand(input.tool_input.command, root),
          route.overrideGuidance,
          rejectedGrammarElement(code, input.tool_input.command, parsed),
          commitMessageFileRemediation(input.tool_input.command),
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
        return withLifts(lifts, blocked(
          code, null, [], route.overrideGuidance, rejectedGrammarElement(code, input.tool_input.command, parsed),
        ));
      }
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
