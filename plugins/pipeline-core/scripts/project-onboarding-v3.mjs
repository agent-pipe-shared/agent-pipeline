#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { readFileSync } from "node:fs";
import { spawnSync as hostSpawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { observeCodexOnboardingCapabilities } from "../lib/codex-onboarding-capabilities.mjs";
import { chatAttributionRecord, requireAttendedChatGateConfirmation } from "../lib/chat-gate-ceremony.mjs";
import { USER_SOURCE_PATH, readHumanApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import { loadManifestSafe, resolveHumanFacingLanguage, gateConfig } from "../lib/manifest.mjs";
import { planInstall as planPrePushHookInstall, MARKER_SCHEMA as PRE_PUSH_HOOK_MARKER_SCHEMA, DECLINE_MARKER_SCHEMA as PRE_PUSH_HOOK_DECLINE_MARKER_SCHEMA } from "./pre-push-hook-install.mjs";
import { resolveActiveRunner } from "./pipeline-start-preflight.mjs";
import {
  applyOnboardingIntakeConsent,
  applyOnboardingIntakeCapture,
  applyOnboardingIntakeDesignQuestions,
  applyOnboardingIntakeGenerate,
  planOnboardingIntakeGenerate,
  planOnboardingBootstrapBind,
  applyOnboardingBootstrapBind,
  INTAKE_CONSENT_APPLY_SCHEMA,
  INTAKE_CAPTURE_APPLY_SCHEMA,
  INTAKE_DESIGN_QUESTIONS_APPLY_SCHEMA,
  INTAKE_GENERATE_PLAN_SCHEMA,
  INTAKE_GENERATE_APPLY_SCHEMA,
  KICKOFF_PROMOTION_APPLY_SCHEMA,
} from "../lib/onboarding-continuity.mjs";
import {
  applyProjectOnboardingManifestRepairV4,
  applyProjectOnboardingKickoffV4,
  applyProjectOnboardingKickoffPromotionV4,
  applyProjectOnboardingLifecycleV4,
  inspectProjectOnboardingV3,
  planProjectOnboardingKickoffV4,
  planProjectOnboardingKickoffPromotionV4,
  planProjectOnboardingLifecycleV4,
  planProjectOnboardingManifestRepairV4,
  planProjectPartialAuthorityAdoption,
  applyProjectPartialAuthorityAdoption,
  applyProjectOnboardingReinstall,
  planProjectOnboardingReinstall,
  planProjectRemoteAdoptionV4,
  applyProjectRemoteAdoptionV4,
  planProjectOnboardingSourceRecoveryV4,
} from "../lib/project-onboarding-v3.mjs";
// NVA-INTAKEARGV-1: the mutating-onboarding argv shape table and its argv renderer moved to
// lib/onboarding-argv-shapes.mjs so the third consumer -- the `nextAction.guidance` string in
// lib/project-onboarding-v3.mjs, the only one an agent actually reads -- can derive from the
// same declaration the CLI emits from and the guard admits by. It could not before: this file
// imports lib/project-onboarding-v3.mjs, so the guidance side importing back would be a cycle.
// Re-exported here unchanged, because guard-lifecycle-ready.mjs and the suites already reach
// them through this module's seam.
import { MUTATING_ONBOARDING_ARGV_SHAPES, automatedMutatingApplyArgv } from "../lib/onboarding-argv-shapes.mjs";

export { MUTATING_ONBOARDING_ARGV_SHAPES, automatedMutatingApplyArgv };

/**
 * NVA-INTAKEARGV-1: resolve one PO material-input chunk from exactly one of its two routes.
 * `--text` carries the value inline. `--text-file` reads it from a file, and is the only way a
 * real design document can reach the intake at all: the closed Pipeline shell grammar refuses
 * any command text containing a newline, while this very input is declared multi-line prose by
 * intakeCaptureAction() itself (`singleLine: false`). Measured 2026-08-27 on a Codex greenfield
 * run -- the PO's design document could not be passed, in any quoting.
 *
 * The file must resolve INSIDE the project root. A capture is repository-scoped material, and
 * reading an arbitrary host path on the strength of a relative-looking argument is exactly the
 * shape the containment rules exist to refuse; `scratch/` is the intended home for it and is
 * inside the root. Returns `options.text` untouched when no file route was used, so
 * applyOnboardingIntakeCapture's own non-empty validation stays the single authority on an
 * absent or empty value.
 *
 * NVA-V10B-INTAKEONEROUND: shared unchanged by both intake-capture-apply (where at least one
 * of the two is required) and intake-consent-apply (where both are optional and may be
 * omitted entirely) -- resolution and the "never both" caller-error check are identical for
 * either caller, so this stays the one place that owns them.
 */
function resolveIntakeCaptureText(options) {
  if (options.text !== undefined && options.textFile !== undefined) {
    const conflict = new Error("accepts exactly one of --text or --text-file, never both");
    conflict.code = "INTAKE-CAPTURE-TEXT-AMBIGUOUS";
    throw conflict;
  }
  if (options.textFile === undefined) return options.text;
  const root = resolve(options.root);
  const candidate = resolve(root, options.textFile);
  const inside = relative(root, candidate);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    const escape = new Error("--text-file must name a path inside the project root");
    escape.code = "INTAKE-CAPTURE-TEXT-FILE-OUTSIDE-ROOT";
    throw escape;
  }
  let bytes;
  try {
    bytes = readFileSync(candidate, "utf8");
  } catch {
    const unreadable = new Error("--text-file could not be read");
    unreadable.code = "INTAKE-CAPTURE-TEXT-FILE-UNREADABLE";
    throw unreadable;
  }
  return bytes;
}

// GUARDDERIVE-1 (backlog:
// 2026-08-16-guard-lifecycle-allowlist-should-derive-from-the-onboarding-cli-table.md).
// The ONE registered subcommand table of this CLI. Every consumer of "which
// subcommands exist / which of them write / which of them an automated session
// may be told to run" derives from this literal, so adding a subcommand is a
// single edit that forces an explicit decision per property instead of leaving
// a second, hand-maintained copy somewhere else to drift. Three consumers today:
//
//   1. parse() below -- FLAT_COMMANDS, the argv[0] tokens it recognises.
//   2. APPLY_SHAPED_COMMANDS below -- the --activate validity check and the
//      exit-status decision, which stay derived from ONE `mutates` declaration
//      so they can never silently disagree (RUNNERNEUT-1 mechanism C).
//   3. hooks/guard-lifecycle-ready.mjs -- via automatedLifecycleArgvCommands(),
//      replacing the hand-maintained plan* array that had gone stale three
//      separate times (backlog items 2026-08-08, 2026-08-09, 2026-08-16).
//
// Per entry:
//   name    -- the internal command id. `flat: true` entries are also the exact
//              argv[0] token; `flat: false` entries are synthesized by parse()
//              from a compound form (`kickoff promote apply` -> kickoff-promote-apply).
//   mutates -- the DECLARED write property. `true` means the command may write
//              and therefore accepts --activate. This is what read-only-ness is
//              keyed on: never the `plan` name prefix, so a future WRITING
//              subcommand that happens to be named plan-* is not admitted
//              anywhere merely for matching the naming convention.
//   automatedArgvShape -- "lifecycle" means an AUTOMATED (machine-issued)
//              invocation of this command is exactly the bare
//              lifecycleArgv([SCRIPT, name, "--root", root], runner, intent)
//              argv: `--root <root> [--runner <claude|codex>] [--intent <value>]`
//              and nothing wider -- deliberately NOT the full human-invoked CLI
//              surface, which for some of these commands accepts further flags
//              (plan-partial-authority's --profile/--source). `null` means the
//              command has no such bare automated shape (it carries digests,
//              operands, or arrives through a compound subcommand path); those
//              are admitted, where they are admitted at all, only by the guard's
//              own explicit per-command branches. This distinction is the
//              twice-Critic-reviewed defense-in-depth the guard is built on and
//              is preserved here on purpose, not widened.
const ONBOARDING_SUBCOMMANDS = Object.freeze([
  { name: "inspect", flat: true, mutates: false, automatedArgvShape: null },
  { name: "plan", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "plan-reinstall", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "apply-reinstall", flat: true, mutates: true, automatedArgvShape: null },
  { name: "plan-partial-authority", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "apply-partial-authority", flat: true, mutates: true, automatedArgvShape: null },
  { name: "plan-source-recovery", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "plan-manifest-repair", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "apply-manifest-repair", flat: true, mutates: true, automatedArgvShape: null },
  { name: "apply-portable-seed", flat: true, mutates: true, automatedArgvShape: null },
  { name: "plan-runtime", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "initialize-runtime", flat: true, mutates: true, automatedArgvShape: null },
  { name: "plan-repair", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "apply-repair", flat: true, mutates: true, automatedArgvShape: null },
  { name: "plan-readback", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "apply-readback", flat: true, mutates: true, automatedArgvShape: null },
  { name: "continuity-inspect", flat: false, mutates: false, automatedArgvShape: null },
  { name: "kickoff-plan", flat: false, mutates: false, automatedArgvShape: null },
  { name: "kickoff-apply", flat: false, mutates: true, automatedArgvShape: null },
  { name: "kickoff-promote-plan", flat: false, mutates: false, automatedArgvShape: null },
  { name: "kickoff-promote-apply", flat: false, mutates: true, automatedArgvShape: null },
  { name: "adopt-remote-plan", flat: false, mutates: false, automatedArgvShape: null },
  { name: "adopt-remote-apply", flat: false, mutates: true, automatedArgvShape: null },
  // Wave 4 onboarding coordinator, Phase 1 (NVA-W4-COORD-1, specs/wave4-onboarding-coordinator/design.md
  // SSa.5 steps 1-3). Apply-only: no separate plan step exists for these three (design SSa.5 lists them
  // as single "-apply" commands, unlike steps 4-5's plan/apply pairs). Like every other `mutates: true`
  // entry above, GUARDDERIVE-1's derived admission never covers these three names -- but
  // guard-lifecycle-ready.mjs's sanctionedOnboardingArgs() DOES have its own admission branch for each,
  // closed by NVA-W5-GUARDADMIT-1 (commit 70bd1fb3, 2026-08-19; backlog:
  // 2026-08-19-guard-lifecycle-ready-has-no-admission-branch-for-the-intake-checkpoint-subcommands.md).
  // This is no longer a KNOWN GAP.
  { name: "intake-consent-apply", flat: true, mutates: true, automatedArgvShape: null },
  { name: "intake-capture-apply", flat: true, mutates: true, automatedArgvShape: null },
  { name: "intake-design-questions-apply", flat: true, mutates: true, automatedArgvShape: null },
  // Wave 4 onboarding coordinator, step 4 (NVA-W4-COORD-2, design.md SSa.5 point 4). Unlike the
  // three apply-only commands above, this IS a plan/apply pair (mirroring every other command in
  // the table, per design): intake-generate-plan needs no operand beyond the bare lifecycle argv
  // (staging content is a pure function of the already-durable checkpoint), so it is
  // `automatedArgvShape: "lifecycle"` and is covered automatically by GUARDDERIVE-1's derived
  // admission -- no guard-lifecycle-ready.mjs change needed for the plan half. intake-generate-apply
  // mutates, so it needed its own sanctionedOnboardingArgs() admission branch -- added in the same
  // closure pass as the three commands above, directly (commit 0b2386fd, 2026-08-19; see the
  // "Closure" note in
  // backlog/items/2026-08-19-guard-lifecycle-ready-has-no-admission-branch-for-the-intake-checkpoint-subcommands.md).
  // This is no longer a KNOWN GAP.
  { name: "intake-generate-plan", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "intake-generate-apply", flat: true, mutates: true, automatedArgvShape: null },
  // Wave 4 onboarding coordinator, step 5 (NVA-W5-COORD-STEP5-2, design.md SSa.5 point 5, SSc.3).
  // A plan/apply pair like intake-generate's, same reasoning: bootstrap-bind-plan needs no operand
  // beyond the bare lifecycle argv (every input -- profile/featureId/prdPath/specPath/designInputPath
  // -- is derived from the already-durable intake checkpoint, resolveBootstrapBindInputs() in
  // lib/onboarding-continuity.mjs), so it is `automatedArgvShape: "lifecycle"`, covered automatically
  // by GUARDDERIVE-1's derived admission. bootstrap-bind-apply mutates, so it needed its own
  // sanctionedOnboardingArgs() branch too -- added under this same NVA-W5-COORD-STEP5-2 dispatch,
  // not literally alongside intake-generate-apply's (that one landed earlier, 2026-08-19, under
  // NVA-W5-GUARDADMIT-1's closure). Both branches exist today.
  { name: "bootstrap-bind-plan", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "bootstrap-bind-apply", flat: true, mutates: true, automatedArgvShape: null },
].map((entry) => Object.freeze(entry)));

export { ONBOARDING_SUBCOMMANDS };

/**
 * GUARDDERIVE-1: the read-only, bare-lifecycleArgv-shaped subcommand names,
 * derived from the two DECLARED properties above -- never from the `plan` name
 * prefix. Both conditions must hold: a mutating command is excluded whatever it
 * is named, and a read-only command whose automated invocation is not the bare
 * lifecycle argv is excluded too. Exported for hooks/guard-lifecycle-ready.mjs;
 * takes the table as a parameter so the derivation itself is unit-testable
 * against synthetic entries without touching the real registration.
 */
export function automatedLifecycleArgvCommands(subcommands = ONBOARDING_SUBCOMMANDS) {
  return Object.freeze(subcommands
    .filter((entry) => entry.mutates === false && entry.automatedArgvShape === "lifecycle")
    .map((entry) => entry.name));
}

// The argv[0] tokens parse() recognises directly (the compound `kickoff`,
// `kickoff promote`, `adopt-remote` and `continuity` forms are handled by their
// own branches below and synthesize the remaining names in the table).
const FLAT_COMMANDS = ONBOARDING_SUBCOMMANDS.filter((entry) => entry.flat).map((entry) => entry.name);

// The commands that mutate (accept --activate). Shared between the --activate
// validity check and the exit-status decision below, so the two can never
// silently drift apart: what may write is exactly what the exit code below
// treats as "apply-shaped" (RUNNERNEUT-1 mechanism C).
const APPLY_SHAPED_COMMANDS = new Set(
  ONBOARDING_SUBCOMMANDS.filter((entry) => entry.mutates).map((entry) => entry.name),
);

// CLI-edge runner resolution -- NOT the reverted library-level default
// (project-onboarding-v3.mjs carries the full history). Deep inside the
// library a `runner` parameter answers "which runner is this project for",
// a fact about the project that a helper must never guess. Here, at the
// process entry point, the question is "which runner is executing this
// process" -- and at exactly this boundary the two questions coincide,
// because the entry point IS the running session. `resolveActiveRunner` is
// imported from pipeline-start-preflight.mjs (the ONE shared implementation,
// backlog: a-po-ceremony-in-the-po-s-own-terminal-resolves-the-wrong-runner.md
// -- a duplicated copy of this expression was the reported defect) rather
// than re-derived here. Unlike preflight's own internal call, this one DOES
// pass `rootDir`/`read`: a genuinely signal-less shell (a PO's own attended
// terminal, exactly the reported incident) then resolves through this
// project's own declared `runners.default` instead of guessing "codex" by
// elimination. A CLI invocation that omits --runner therefore resolves and
// threads this value explicitly -- it never raises and never passes
// `undefined` onward to a library helper.
function resolveOnboardingCliRunner(env, root, deps) {
  return resolveActiveRunner({ env, rootDir: root, read: deps?.readFileSync ?? readFileSync });
}

function usage() {
  return [
    "Usage: node plugins/pipeline-core/scripts/project-onboarding-v3.mjs <inspect|plan|plan-reinstall|apply-reinstall|plan-source-recovery|plan-manifest-repair|apply-manifest-repair|apply-portable-seed|plan-runtime|initialize-runtime|plan-repair|apply-repair|plan-readback|apply-readback> --root <project-dir> [--intent onboarding|bootstrap|session|dispatch] [--runner claude|codex] [--plan-sha256 <sha256>] [--activate]",
    "       node plugins/pipeline-core/scripts/project-onboarding-v3.mjs plan-partial-authority --root <project-dir> --runner <claude|codex> [--profile <epic|feature|mini> --source <selection>]",
    "       node plugins/pipeline-core/scripts/project-onboarding-v3.mjs adopt-remote <plan|apply> --root <project-dir> --remote <url> --ref <refs/heads/branch> [--runner claude|codex] [--plan-sha256 <sha256>] [--activate]",
    "       node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff <plan|apply> --root <project-dir> --goal <text> --language <de|en> [--runner claude|codex] [--plan-sha256 <sha256>] [--activate]",
    "       node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff promote <plan|apply> --root <project-dir> --profile <epic|feature|mini> --id <id> --plan-path <path> --prd-path <path> --spec-path <path> --design-input-path <path> [--runner claude|codex] [--plan-sha256 <sha256>] [--activate]",
    "       (--id is a caller-chosen slug for the promoted feature; the `kickoff-` prefix is reserved for this tool's own provisional-anchor naming and is rejected -- choose a plain slug)",
    "       node plugins/pipeline-core/scripts/project-onboarding-v3.mjs continuity inspect --root <project-dir>",
    "       node plugins/pipeline-core/scripts/project-onboarding-v3.mjs <plan-repair|apply-repair> --root <project-dir> [--id <feature-id> --plan-path <path> --prd-path <path> --spec-path <path> --language <de|en>] [--runner claude|codex] [--plan-sha256 <sha256>] [--activate]",
  ].join("\n");
}
function parse(args) {
  const output = { activate: false, intent: "onboarding" };
  let start = 0;
  if (args[0] === "adopt-remote") {
    if (!["plan", "apply"].includes(args[1])) return { error: "adopt-remote requires plan or apply" };
    output.command = `adopt-remote-${args[1]}`;
    start = 2;
  } else if (args[0] === "kickoff" && args[1] === "promote") {
    if (!["plan", "apply"].includes(args[2])) return { error: "kickoff promote requires plan or apply" };
    output.command = `kickoff-promote-${args[2]}`;
    start = 3;
  } else if (args[0] === "kickoff") {
    if (!["plan", "apply"].includes(args[1])) return { error: "kickoff requires plan or apply" };
    output.command = `kickoff-${args[1]}`;
    start = 2;
  } else if (args[0] === "continuity") {
    if (args[1] !== "inspect") return { error: "continuity requires inspect" };
    output.command = "continuity-inspect";
    start = 2;
  } else if (FLAT_COMMANDS.includes(args[0])) {
    output.command = args[0];
    start = 1;
  }
  for (let index = start; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") { const root = args[index + 1]; if (!root || root.startsWith("--")) return { error: "--root requires a project directory" }; output.root = root; index += 1; }
    else if (arg === "--remote") { const remote = args[index + 1]; if (!remote || remote.startsWith("--")) return { error: "--remote requires one remote URL" }; output.remote = remote; index += 1; }
    else if (arg === "--ref") { const ref = args[index + 1]; if (!ref || ref.startsWith("--")) return { error: "--ref requires one refs/heads branch" }; output.ref = ref; index += 1; }
    else if (arg === "--intent") { const intent = args[index + 1]; if (!["onboarding", "bootstrap", "session", "dispatch"].includes(intent)) return { error: "--intent must be onboarding, bootstrap, session, or dispatch" }; output.intent = intent; index += 1; }
    else if (arg === "--runner") { const runner = args[index + 1]; if (!["claude", "codex", "antigravity"].includes(runner)) return { error: "--runner must be claude or codex or antigravity" }; output.runner = runner; index += 1; }
    else if (arg === "--goal") { const goal = args[index + 1]; if (goal === undefined) return { error: "--goal requires one argv text element" }; output.goal = goal; index += 1; }
    else if (arg === "--language") { const language = args[index + 1]; if (!["de", "en"].includes(language)) return { error: "--language must be de or en" }; output.language = language; index += 1; }
    else if (arg === "--profile") { const profile = args[index + 1]; if (!["epic", "feature", "mini"].includes(profile)) return { error: "--profile must be epic, feature, or mini" }; output.profile = profile; index += 1; }
    else if (arg === "--source") { const source = args[index + 1]; if (!source || source.startsWith("--")) return { error: "--source requires one explicit V3 source selection" }; output.source = source; index += 1; }
    else if (arg === "--id") { const featureId = args[index + 1]; if (!featureId || featureId.startsWith("--")) return { error: "--id requires a feature id" }; output.featureId = featureId; index += 1; }
    else if (arg === "--plan-path") { const planPath = args[index + 1]; if (!planPath || planPath.startsWith("--")) return { error: "--plan-path requires a repository path" }; output.planPath = planPath; index += 1; }
    else if (arg === "--prd-path") { const prdPath = args[index + 1]; if (!prdPath || prdPath.startsWith("--")) return { error: "--prd-path requires a repository path" }; output.prdPath = prdPath; index += 1; }
    else if (arg === "--spec-path") { const specPath = args[index + 1]; if (!specPath || specPath.startsWith("--")) return { error: "--spec-path requires a repository path" }; output.specPath = specPath; index += 1; }
    else if (arg === "--design-input-path") { const designInputPath = args[index + 1]; if (!designInputPath || designInputPath.startsWith("--")) return { error: "--design-input-path requires a repository path" }; output.designInputPath = designInputPath; index += 1; }
    else if (arg === "--plan-sha256") { const digest = args[index + 1]; if (!/^[a-f0-9]{64}$/u.test(digest ?? "")) return { error: "--plan-sha256 requires a lowercase SHA-256 digest" }; output.planSha256 = digest; index += 1; }
    else if (arg === "--granted") output.granted = true;
    else if (arg === "--git-author-name") { const value = args[index + 1]; if (!value || value.startsWith("--")) return { error: "--git-author-name requires a name" }; output.gitAuthorName = value; index += 1; }
    else if (arg === "--git-author-email") { const value = args[index + 1]; if (!value || value.startsWith("--")) return { error: "--git-author-email requires an email" }; output.gitAuthorEmail = value; index += 1; }
    else if (arg === "--text") { const value = args[index + 1]; if (value === undefined) return { error: "--text requires one argv text element" }; output.text = value; index += 1; }
    else if (arg === "--text-file") { const value = args[index + 1]; if (!value || value.startsWith("--")) return { error: "--text-file requires one file path" }; output.textFile = value; index += 1; }
    else if (arg === "--answers-json") { const value = args[index + 1]; if (!value || value.startsWith("--")) return { error: "--answers-json requires a JSON array" }; output.answersJson = value; index += 1; }
    else if (arg === "--activate") output.activate = true;
    else if (arg === "--help" || arg === "-h") output.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!output.help && !output.command) return { error: "one command is required" };
  if (!output.help && !output.root) return { error: "--root is required" };
  if (output.command?.startsWith("adopt-remote-") && (!output.remote || !output.ref)) return { error: "adopt-remote requires --remote and --ref" };
  if (output.command === "adopt-remote-apply" && !output.planSha256) return { error: "adopt-remote apply requires --plan-sha256" };
  // `plan-repair`/`apply-repair` are the only non-kickoff commands that accept
  // the operator-confirmed continuity authority claim
  // (`onboarding-continuity.mjs`'s `operatorConfirmedContinuity()`, surfaced
  // via `collectOperatorContinuityAuthorityAction()` in project-onboarding-v3.mjs)
  // -- the third repair case, for a mature project whose `pipeline-state.json`
  // is absent while its configured handover is real. The five fields are a
  // closed set (`validateOperatorContinuityAuthority`): all or none, never a
  // partial claim that would silently resolve to `operatorAuthority: null` and
  // hand back the flat "operator-authority-required" ask again.
  const isRepairCommand = output.command === "plan-repair" || output.command === "apply-repair";
  // intake-consent-apply's --language/--profile candidate values are its own
  // still-missing-values ask (design SSa.5 point 1), a genuinely third
  // non-kickoff, non-repair command allowed to carry --language -- additive to
  // the isRepairCommand carve-out above, never a widening of it.
  const isIntakeConsentCommand = output.command === "intake-consent-apply";
  if (output.command?.startsWith("kickoff-promote-")) {
    if (output.goal !== undefined) return { error: "--goal is not valid for kickoff promotion" };
    if (output.language !== undefined) return { error: "--language is not valid for kickoff promotion" };
    if (![output.profile, output.featureId, output.planPath, output.prdPath, output.specPath, output.designInputPath].every(Boolean)) return { error: "kickoff promotion requires --profile --id --plan-path --prd-path --spec-path --design-input-path" };
  } else if (output.command?.startsWith("kickoff-") && output.goal === undefined) return { error: "kickoff plan/apply requires --goal <text>" };
  else if (output.command?.startsWith("kickoff-") && output.language === undefined) return { error: "kickoff plan/apply requires --language <de|en>" };
  else if (!output.command?.startsWith("kickoff-") && output.goal !== undefined) return { error: "--goal is only valid for kickoff plan/apply" };
  else if (!output.command?.startsWith("kickoff-") && !isRepairCommand && !isIntakeConsentCommand && output.language !== undefined) return { error: "--language is only valid for kickoff plan/apply" };
  if (isRepairCommand) {
    const operatorFields = [output.featureId, output.planPath, output.prdPath, output.specPath, output.language];
    const suppliedCount = operatorFields.filter((value) => value !== undefined).length;
    if (suppliedCount > 0 && suppliedCount < operatorFields.length) {
      return { error: "operator-confirmed continuity repair requires --id --plan-path --prd-path --spec-path --language together, or none of them" };
    }
    if (suppliedCount === operatorFields.length) {
      output.operatorAuthority = {
        featureId: output.featureId,
        planPath: output.planPath,
        prdPath: output.prdPath,
        specPath: output.specPath,
        language: output.language,
      };
    }
  }
  if (output.activate && !APPLY_SHAPED_COMMANDS.has(output.command)) return { error: "--activate is only valid for an apply command" };
  return output;
}
// AGY-CHATADAPTER-2 (backlog/items/2026-08-21-enforce-kickoff-po-questions.md):
// which two commands carry a PO-input value that must be genuinely confirmed by
// a human in an attended terminal before this CLI accepts it, and what that
// confirmation looks like. Deliberately keyed on `options.command`, never on
// mere flag presence -- `--profile` is ALSO valid on `plan-partial-authority`/
// `apply-partial-authority`, and `--language` is ALSO valid on `plan-repair`/
// `apply-repair` and on `intake-consent-apply` (which additionally can carry
// BOTH values in one bundled call, behind its own pre-existing `--granted`/
// `--activate` consent gate -- a structurally different shape, left ungated
// here; see the backlog item's "Outcome (3)" note). A presence-based gate would
// silently reach those unrelated commands too.
function kickoffChatGateSpecFor(options) {
  if (options.command === "kickoff-plan" || options.command === "kickoff-apply") {
    return {
      label: `--language ${options.language}`,
      expected: options.language,
      summaryLines: [
        "PO KICKOFF LANGUAGE CONFIRMATION -- read before you type the value:",
        `  root: ${options.root}`,
        `  goal: ${options.goal}`,
        `  language: ${options.language}`,
      ],
    };
  }
  if (options.command === "kickoff-promote-plan" || options.command === "kickoff-promote-apply") {
    return {
      label: `--profile ${options.profile}`,
      expected: options.profile,
      summaryLines: [
        "PO KICKOFF PROMOTION PROFILE CONFIRMATION -- read before you type the value:",
        `  root: ${options.root}`,
        `  id: ${options.featureId}`,
        `  profile: ${options.profile}`,
      ],
    };
  }
  return null;
}

// Only a committed repository-wide selection suppresses the historical terminal
// ceremony.  A missing, malformed, unsafe, unreadable or uncommitted source stays
// on the existing fail-closed path and therefore cannot weaken a kickoff gate.
function committedGlobalChatHumanApproval(root, deps = {}) {
  try {
    const approval = readHumanApprovalMode(root, { spawn: deps.spawnSync ?? deps.spawn });
    return approval.mode === "chat"
      && approval.source === USER_SOURCE_PATH
      && approval.scope === "global";
  } catch {
    return false;
  }
}

// The EXACT re-run command a human copies into their own attended terminal --
// built from the raw argv this call received (not reconstructed from parsed
// `options`), so it is byte-faithful to what the agent actually invoked, same
// spirit as `approve-push`'s echoed command in pipeline-state.mjs. Each element
// is JSON-quoted so a value containing spaces or shell metacharacters (a goal
// sentence, for instance) still round-trips as one token when copy-pasted.
//
// `runner` is ALWAYS appended when `args` did not already spell out --runner
// (backlog: a-po-ceremony-in-the-po-s-own-terminal-resolves-the-wrong-runner.md,
// direction (2)): the value this AGENT session already resolved
// (`options.runner`, from resolveOnboardingCliRunner above) is what the human
// is handed, explicitly -- never left for their own attended shell to
// re-derive from its own, possibly signal-less, environment.
export function formatOnboardingRerunCommand(args, runner) {
  const withRunner = args.includes("--runner") ? args : [...args, "--runner", runner];
  return `node plugins/pipeline-core/scripts/project-onboarding-v3.mjs ${withRunner.map((value) => JSON.stringify(value)).join(" ")}`;
}

// NVA-PREPUSHOFFER-1: the offer text a human actually reads before consenting
// (the same `language.human_facing` authority that resolves every other
// operator-facing surface here -- resolveHumanFacingLanguage, lib/manifest.mjs
// -- never a hardcoded English literal). Kept as a small closed frame table,
// same idiom as scripts/po-human-approval.mjs's CONFIRMATION_PROMPT_FRAME:
// a value with no entry, or that cannot be resolved at all, always falls back
// to English rather than failing the whole onboarding read.
const PRE_PUSH_HOOK_OFFER_DEFAULT_LANGUAGE = "en";
const PRE_PUSH_HOOK_OFFER_TEXT = Object.freeze({
  en: "Installs a git pre-push hook (under this repository's hooks path) that re-checks the Push-Gate even outside an agent session; `git push --no-verify` bypasses it (git's own escape, by design); it can be removed later with this installer's --remove verb.",
  de: "Installiert einen Git-pre-push-Hook (im Hooks-Pfad dieses Repositorys), der das Push-Gate auch außerhalb einer Agenten-Sitzung erneut prüft; `git push --no-verify` umgeht ihn (Gits eigene, beabsichtigte Ausweichmöglichkeit); er kann später mit dem --remove-Verb dieses Installers wieder entfernt werden.",
});

// NVA-GF-PREPUSH (backlog: 2026-08-28-the-pre-push-hook-is-offered-not-installed-so-the-git-
// backstop-can-be-absent.md): the manifest's `gates.push` chapter can declare `mode: blocking`
// while nothing on disk actually enforces it at the git layer -- the hook is absent because it
// was never offered/answered, or because it was declined. This text is what turns that from a
// state merely PRINTED (`state: "absent"`/`"declined"`) into a state read as a GAP. Same closed
// frame-table idiom as PRE_PUSH_HOOK_OFFER_TEXT immediately above (never a hardcoded English
// literal, always falls back to English on an unresolved language).
const PRE_PUSH_HOOK_GAP_TEXT = Object.freeze({
  en: "UNBACKED GATE: this repository's manifest declares gates.push: blocking, but no git-layer pre-push hook enforces it. Anything that does not go through this session's own tool-call guard -- a spawned sub-process, a script wrapper, a human running `git push` directly -- can currently push unchecked.",
  de: "UNGEDECKTES GATE: Das Manifest dieses Repositorys deklariert gates.push: blocking, aber kein Git-Ebene-pre-push-Hook setzt es durch. Alles, was nicht über die eigene Tool-Call-Guard dieser Sitzung läuft -- ein gestarteter Unterprozess, ein Skript-Wrapper, ein Mensch, der `git push` direkt ausführt -- kann derzeit ungeprüft pushen.",
});

/** True only when THIS repository's manifest actually declares `gates.push: blocking` --
 * never when the manifest is absent/unreadable, or the gate is configured `warn`/`off`, or
 * simply not configured at all: there is nothing declared for an absent hook to leave unbacked
 * in any of those cases, so "absent" there is a plain state, not a gap. Reuses `gateConfig`
 * (lib/manifest.mjs) -- the SAME reader `pre-push-hook-install.mjs`'s generated hook itself
 * calls to decide its own verdict -- never a second, hand-rolled parse of the gate shape that
 * could silently drift from what the hook actually enforces once installed. Never throws:
 * `loadManifestSafe` already swallows every read/parse fault into `null`. */
function isPushGateDeclaredBlocking(rootDir) {
  return gateConfig(loadManifestSafe(rootDir), "push")?.mode === "blocking";
}

/** Never throws, never asks the CLI's own caller for a language: reads the
 * project's already-compiled manifest the same way every other operator-facing
 * surface in this codebase does (lib/manifest.mjs's `loadManifestSafe` +
 * `resolveHumanFacingLanguage`), and falls back to English on anything short
 * of a resolved `de`/`en` value -- an absent/unreadable/invalid manifest, a
 * missing `language.human_facing`, or any unexpected exception. */
function resolvePrePushHookOfferLanguage(rootDir) {
  try {
    const manifest = loadManifestSafe(rootDir);
    if (!manifest) return PRE_PUSH_HOOK_OFFER_DEFAULT_LANGUAGE;
    const resolved = resolveHumanFacingLanguage(manifest);
    return resolved.ok ? resolved.value : PRE_PUSH_HOOK_OFFER_DEFAULT_LANGUAGE;
  } catch {
    return PRE_PUSH_HOOK_OFFER_DEFAULT_LANGUAGE;
  }
}

// NVA-R9-PREPUSHHOOK (backlog: pipeline.pre-push-hook-is-offered-not-installed): the
// pre-push git hook is now installed-by-default at the FIRST real onboarding apply
// (lib/project-onboarding-v3.mjs's `applyProjectOnboardingV3`, the same "portable"
// transaction that auto-seeds `.gitignore`, called unconditionally with no confirmation
// step) -- not merely offered here anymore. This function stays as the RECOVERY surface:
// a project onboarded before this change shipped, or whose hook is otherwise still
// absent/declined/foreign, is still surfaced through `inspect`/`continuity-inspect` below
// so a human can act on it later. It is never the primary path for a fresh onboarding.
//
// Read-only: never installs, removes, or declines anything itself (DoD (g)) --
// `planPrePushHookInstall` (pre-push-hook-install.mjs's `planInstall`) only
// inspects. Three outcomes:
//   - hook absent, never offered/declined ("ready"): return the real,
//     confirmation-requiring offer, same base action shape
//     (`kind: "command"`/`executable`/`argv`/`mutation`/`requiresConfirmation`/
//     `expected`) every other confirmation-requiring onboarding action in this
//     codebase uses (see lib/project-onboarding-v3.mjs's `commandAction`) --
//     plus the human-facing `text` field DoD (c) requires, which that shared
//     shape does not otherwise carry.
//   - already declined once ("declined"): a settled, informational note --
//     never re-asked, never itself a `requiresConfirmation` action (that is
//     the whole point: a human answers once).
//   - anything else (already installed, a foreign hook present, or the
//     repository root could not even be resolved yet): nothing to offer.
function buildPrePushHookOfferAction({ rootDir }) {
  const plan = planPrePushHookInstall({ rootDir });
  if (plan.status === "declined") {
    // NVA-GF-PREPUSH: the hook is absent here too (planInstall checks hook-presence
    // BEFORE the decline marker, see its own doc comment) -- a declined offer is exactly
    // as unbacked as an unanswered one for a repository whose manifest declares blocking.
    const unbackedGate = isPushGateDeclaredBlocking(rootDir);
    const language = resolvePrePushHookOfferLanguage(rootDir);
    return {
      kind: "info",
      feature: "pre-push-hook",
      status: "declined",
      declinedAt: plan.declinedAt ?? null,
      unbackedGate,
      ...(unbackedGate ? { gap: PRE_PUSH_HOOK_GAP_TEXT[language] ?? PRE_PUSH_HOOK_GAP_TEXT[PRE_PUSH_HOOK_OFFER_DEFAULT_LANGUAGE] } : {}),
    };
  }
  if (plan.status !== "ready") return null;
  const language = resolvePrePushHookOfferLanguage(rootDir);
  const unbackedGate = isPushGateDeclaredBlocking(rootDir);
  return {
    kind: "command",
    executable: "node",
    argv: ["plugins/pipeline-core/scripts/pre-push-hook-install.mjs", "--install"],
    mutation: true,
    requiresConfirmation: true,
    expected: { schema: PRE_PUSH_HOOK_MARKER_SCHEMA, statuses: ["installed"] },
    text: PRE_PUSH_HOOK_OFFER_TEXT[language] ?? PRE_PUSH_HOOK_OFFER_TEXT[PRE_PUSH_HOOK_OFFER_DEFAULT_LANGUAGE],
    // NVA-GF-PREPUSH: `unbackedGate`/`gap` turn "never offered/declined" from a state
    // printed as a bare fact into a state read as a currently-open enforcement gap when
    // this repository's own manifest already declares gates.push: blocking -- exactly the
    // "declining, or simply not answering, silently produces a repository whose gate is
    // unenforceable" defect the backlog item names. Absent for every other repository
    // (no manifest yet, or a non-blocking gate) -- there is nothing declared to be unbacked.
    unbackedGate,
    ...(unbackedGate ? { gap: PRE_PUSH_HOOK_GAP_TEXT[language] ?? PRE_PUSH_HOOK_GAP_TEXT[PRE_PUSH_HOOK_OFFER_DEFAULT_LANGUAGE] } : {}),
    declineAction: {
      kind: "command",
      executable: "node",
      argv: ["plugins/pipeline-core/scripts/pre-push-hook-install.mjs", "--decline"],
      mutation: true,
      requiresConfirmation: false,
      expected: { schema: PRE_PUSH_HOOK_DECLINE_MARKER_SCHEMA, statuses: ["declined"] },
    },
  };
}

export { buildPrePushHookOfferAction };

function runGitObservation(spawn, root, args) {
  try {
    const result = spawn("git", args, {
      cwd: root,
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    if (result?.error) return { status: null, stdout: "" };
    return { status: result?.status ?? null, stdout: String(result?.stdout ?? "").trim() };
  } catch {
    return { status: null, stdout: "" };
  }
}

/**
 * True only for a real local worktree whose repository contains zero reachable
 * commits anywhere. A missing HEAD alone is insufficient: a broken symbolic
 * ref, a branch switch, or a repository with another committed ref must never
 * suppress the real dispatch probe.
 */
function repositoryHasUnbornHead(root, spawn) {
  const inside = runGitObservation(spawn, root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout !== "true") return false;
  const head = runGitObservation(spawn, root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (head.status === 0) return false;
  const commits = runGitObservation(spawn, root, ["rev-list", "--all", "--count"]);
  return commits.status === 0 && commits.stdout === "0";
}

/**
 * A detached worktree cannot be created until one commit exists. Treating that
 * Git prerequisite as a failed capability turns an ordinary greenfield repo
 * into a false repair dead end. At the public onboarding CLI edge only, defer
 * the dispatch worktree probe by observing the still-genuine session
 * capability and report worktreeCapability "not-observed". The requested
 * lifecycle intent remains "dispatch" throughout; once any commit exists this
 * adapter disappears and the original full dispatch probe runs unchanged.
 */
function withUnbornHeadDispatchDeferral({ root, intent, deps }) {
  if (intent !== "dispatch") return deps;
  const spawn = deps?.spawnSync ?? hostSpawnSync;
  if (!repositoryHasUnbornHead(root, spawn)) return deps;
  const observe = deps?.observeCodexOnboardingCapabilities ?? observeCodexOnboardingCapabilities;
  return {
    ...(deps ?? {}),
    observeCodexOnboardingCapabilities(options) {
      const deferred = observe({ ...options, intent: "session" });
      return { ...deferred, worktreeCapability: "not-observed" };
    },
  };
}

export function main(args = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
  writeError = process.stderr.write.bind(process.stderr),
  deps,
  env = process.env,
} = {}) {
  const options = parse(args);
  if (options.help) { write(`${usage()}\n`); return 0; }
  if (options.error) { write(`${usage()}\n${options.error}\n`); return 2; }
  if (options.runner === undefined) options.runner = resolveOnboardingCliRunner(env, options.root, deps);

  // NVA-W3-ONBOARDENV: the seam an in-process caller of this file's own exported
  // functions already has (`deps: { homedir: () => ... }`, mirroring
  // lib/machine-plane.mjs's `homedirFn` injection) extended across the process boundary
  // for a caller that can only reach this CLI as a spawned subprocess
  // (onboarding-init.mjs `driveOnboardingInit`'s `env` seam). Opt-in and additive only:
  // an in-process caller that already supplies its own `deps` is never overridden here,
  // and a caller that supplies neither `deps` nor this environment variable gets exactly
  // the previous behaviour (the library's own default `os.homedir()`/real `$HOME`).
  if (deps === undefined) {
    const homedirOverride = env.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE;
    if (typeof homedirOverride === "string" && homedirOverride.length > 0) {
      deps = { homedir: () => homedirOverride };
    }
  }
  deps = withUnbornHeadDispatchDeferral({ root: options.root, intent: options.intent, deps });

  // The default/legacy posture keeps AGY-CHATADAPTER-2's attended-terminal
  // ceremony.  A committed global `human_approval: chat` is a different
  // product posture: explicit Chat attribution is intentionally non-attested,
  // so it must not inspect a TTY or request a copy-back value.  Kickoff has no
  // project-state record before this point; its durable source is the committed
  // policy, while the successful command result carries the explicit basis.
  const gateSpec = kickoffChatGateSpecFor(options);
  const globalChat = gateSpec !== null && committedGlobalChatHumanApproval(options.root, deps ?? {});
  if (gateSpec && !globalChat) {
    const confirmation = requireAttendedChatGateConfirmation({
      summaryLines: gateSpec.summaryLines,
      expected: gateSpec.expected,
      dependencies: deps ?? {},
    });
    if (!confirmation.ok) {
      if (confirmation.code === "CHAT-GATE-NOT-ATTENDED") {
        writeError(`Error: ${options.command} refused (${confirmation.code}); a human must confirm ${gateSpec.label} directly, in their own attended terminal -- an agent's own tool call cannot complete this step.\n`);
        writeError("Re-run this EXACT command yourself and type the value shown above when prompted:\n");
        writeError(`${formatOnboardingRerunCommand(args, options.runner)}\n`);
      } else {
        writeError(`Error: ${options.command} refused (${confirmation.code}); the typed value did not match ${gateSpec.label}.\n`);
      }
      return 1;
    }
  }
  let output;
  try {
    if (options.command === "inspect") output = inspectProjectOnboardingV3({ rootDir: options.root, deps, intent: options.intent, runner: options.runner });
    else if (options.command === "plan-reinstall") output = planProjectOnboardingReinstall({ rootDir: options.root, deps });
    else if (options.command === "apply-reinstall") output = applyProjectOnboardingReinstall({ rootDir: options.root, planSha256: options.planSha256, activate: options.activate, deps });
    else if (options.command === "plan-partial-authority") output = planProjectPartialAuthorityAdoption({ rootDir: options.root, profile: options.profile, source: options.source, runner: options.runner, deps });
    else if (options.command === "apply-partial-authority") output = applyProjectPartialAuthorityAdoption({ rootDir: options.root, profile: options.profile, source: options.source, runner: options.runner, planSha256: options.planSha256, activate: options.activate, deps });
    else if (options.command === "adopt-remote-plan") output = planProjectRemoteAdoptionV4({ rootDir: options.root, remote: options.remote, ref: options.ref, deps });
    else if (options.command === "adopt-remote-apply") output = applyProjectRemoteAdoptionV4({ rootDir: options.root, remote: options.remote, ref: options.ref, runner: options.runner, planSha256: options.planSha256, activate: options.activate, deps });
    else if (options.command === "continuity-inspect") output = inspectProjectOnboardingV3({ rootDir: options.root, deps, intent: "onboarding", runner: options.runner });
    else if (options.command === "plan") output = planProjectOnboardingLifecycleV4({ rootDir: options.root, deps, operation: "portable", intent: options.intent, runner: options.runner });
    else if (options.command === "plan-runtime") output = planProjectOnboardingLifecycleV4({ rootDir: options.root, deps, operation: "runtime", intent: options.intent, runner: options.runner });
    else if (options.command === "plan-repair") output = planProjectOnboardingLifecycleV4({ rootDir: options.root, deps, operation: "repair", intent: options.intent, runner: options.runner, operatorAuthority: options.operatorAuthority ?? null });
    else if (options.command === "plan-readback") output = planProjectOnboardingLifecycleV4({ rootDir: options.root, deps, operation: "readback", intent: options.intent, runner: options.runner });
    else if (options.command === "plan-source-recovery") output = planProjectOnboardingSourceRecoveryV4({ rootDir: options.root, deps, runner: options.runner, intent: options.intent });
    else if (options.command === "plan-manifest-repair") output = planProjectOnboardingManifestRepairV4({ rootDir: options.root, deps, runner: options.runner, sessionIntent: options.intent });
    else if (options.command === "apply-manifest-repair") output = applyProjectOnboardingManifestRepairV4({
      rootDir: options.root,
      runner: options.runner,
      planSha256: options.planSha256,
      activate: options.activate,
      deps,
    });
    else if (options.command === "kickoff-plan") output = planProjectOnboardingKickoffV4({
      rootDir: options.root,
      goal: options.goal,
      language: options.language,
      runner: options.runner,
      deps,
    });
    else if (options.command === "kickoff-apply") output = applyProjectOnboardingKickoffV4({
      rootDir: options.root,
      goal: options.goal,
      language: options.language,
      runner: options.runner,
      planSha256: options.planSha256,
      activate: options.activate,
      deps,
    });
    else if (options.command === "kickoff-promote-plan") output = planProjectOnboardingKickoffPromotionV4({
      rootDir: options.root, profile: options.profile, featureId: options.featureId,
      planPath: options.planPath, prdPath: options.prdPath, specPath: options.specPath, designInputPath: options.designInputPath,
      runner: options.runner, deps,
    });
    else if (options.command === "kickoff-promote-apply") output = applyProjectOnboardingKickoffPromotionV4({
      rootDir: options.root, profile: options.profile, featureId: options.featureId,
      planPath: options.planPath, prdPath: options.prdPath, specPath: options.specPath, designInputPath: options.designInputPath,
      runner: options.runner, planSha256: options.planSha256, activate: options.activate, deps,
    });
    else if (options.command === "intake-consent-apply") output = applyOnboardingIntakeConsent({
      rootDir: options.root,
      granted: options.granted === true,
      gitAuthor: options.gitAuthorName && options.gitAuthorEmail
        ? { name: options.gitAuthorName, email: options.gitAuthorEmail } : null,
      language: options.language ?? null,
      profile: options.profile ?? null,
      // NVA-V10B-INTAKEONEROUND: optional -- resolveIntakeCaptureText() returns undefined when
      // neither --text nor --text-file was supplied, and applyOnboardingIntakeConsent treats
      // that identically to omitting `text` altogether (behaviour/shape unchanged).
      text: resolveIntakeCaptureText(options) ?? null,
      activate: options.activate,
      deps,
    });
    else if (options.command === "intake-capture-apply") output = applyOnboardingIntakeCapture({
      rootDir: options.root, text: resolveIntakeCaptureText(options), activate: options.activate, deps,
    });
    else if (options.command === "intake-design-questions-apply") {
      let answers;
      try { answers = JSON.parse(options.answersJson ?? "null"); } catch { answers = null; }
      output = applyOnboardingIntakeDesignQuestions({
        rootDir: options.root, answers, activate: options.activate, deps,
      });
    }
    else if (options.command === "intake-generate-plan") output = planOnboardingIntakeGenerate({
      rootDir: options.root, deps,
    });
    else if (options.command === "intake-generate-apply") output = applyOnboardingIntakeGenerate({
      rootDir: options.root, expectedPlanSha256: options.planSha256, activate: options.activate, deps,
    });
    else if (options.command === "bootstrap-bind-plan") output = planOnboardingBootstrapBind({
      rootDir: options.root, runner: options.runner, deps,
    });
    else if (options.command === "bootstrap-bind-apply") output = applyOnboardingBootstrapBind({
      rootDir: options.root, runner: options.runner, expectedPlanSha256: options.planSha256, activate: options.activate, deps,
    });
    else {
      const operation = options.command === "initialize-runtime"
        ? "runtime"
        : options.command === "apply-repair"
          ? "repair"
          : options.command === "apply-readback"
            ? "readback"
            : "portable";
      output = applyProjectOnboardingLifecycleV4({
        rootDir: options.root,
        deps,
        operation,
        planSha256: options.planSha256,
        activate: options.activate,
        intent: options.intent,
        runner: options.runner,
        operatorAuthority: operation === "repair" ? (options.operatorAuthority ?? null) : null,
      });
    }
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "ONBOARDING-ERROR";
    const message = String(error?.message ?? "onboarding command failed").replace(/[\r\n]+/gu, " ");
    writeError(`${code}: ${message}\n`);
    return 2;
  }
  // NVA-PREPUSHOFFER-1: surfaced only on the two read-only state-observation
  // commands (never on an apply-shaped call, and never executed here -- this
  // only READS pre-push-hook-install.mjs's own planner, see
  // buildPrePushHookOfferAction above). `null` (already installed, a foreign
  // hook present, or the repository root not resolvable yet) adds nothing --
  // never an empty/placeholder field on every other command's output.
  if (options.command === "inspect" || options.command === "continuity-inspect") {
    const prePushHookOffer = buildPrePushHookOfferAction({ rootDir: options.root });
    if (prePushHookOffer) output.prePushHookOffer = prePushHookOffer;
  }
  if (globalChat && output !== null && typeof output === "object" && !Array.isArray(output)) {
    output = {
      ...output,
      humanApproval: chatAttributionRecord({
        kind: gateSpec.label.startsWith("--language") ? "kickoff-language" : "kickoff-promotion-profile",
      }),
    };
  }
  write(`${JSON.stringify(output, null, 2)}\n`);
  // Wave 4 step 4 (NVA-W4-COORD-2): intake-generate-plan is `{ schema, root,
  // ..., planSha256, targets }` shaped, no `status` field -- same
  // reaching-this-line-means-success convention as the two kickoff plan
  // schemas it is grouped with below.
  if ([
    "pipeline.codex-onboarding-kickoff-plan.v1", "pipeline.codex-onboarding-kickoff-promotion-plan.v1",
    INTAKE_GENERATE_PLAN_SCHEMA,
  ].includes(output.schema)) return 0;
  // Wave 4 intake-checkpoint apply commands (NVA-W4-COORD-1/2) are apply-only,
  // `{ schema, root, mutated, checkpoint }` shaped -- no `status` field, so
  // the resting-status set below never applies to them. Reaching this line at
  // all means the apply function returned rather than throwing, i.e. it
  // succeeded (possibly as a no-op replay, `mutated: false`).
  if ([
    INTAKE_CONSENT_APPLY_SCHEMA, INTAKE_CAPTURE_APPLY_SCHEMA, INTAKE_DESIGN_QUESTIONS_APPLY_SCHEMA,
    INTAKE_GENERATE_APPLY_SCHEMA,
  ].includes(output.schema)) return 0;
  // Wave 4 onboarding coordinator, step 5 (NVA-W5-COORD-STEP5-2): bootstrap-bind-apply calls
  // applyOnboardingBootstrapBind(), which calls applyOnboardingKickoffPromotion() DIRECTLY --
  // bypassing the v4Inspection wrapper kickoff-promote-apply goes through
  // (applyProjectOnboardingKickoffPromotionV4 re-wraps its result as the shared
  // "pipeline.project-onboarding.v4" shape below; this command's own output never does). Its
  // schema is KICKOFF_PROMOTION_APPLY_SCHEMA with `status: "applied"|"replayed"` -- neither
  // value is in restingStatuses below, and it never will be (that set is v4Inspection's own
  // vocabulary). fail() throws on every non-success path (see applyOnboardingKickoffPromotion),
  // so reaching this line with this schema always means the apply succeeded, exactly like the
  // intake-checkpoint apply commands immediately above.
  if (output.schema === KICKOFF_PROMOTION_APPLY_SCHEMA) return 0;
  if (output.schema === "pipeline.project-onboarding-remote-adoption-plan.v1") return output.status === "ready" || output.status === "activation-required" ? 0 : 1;
  // `runtime-attestation-required` is a legitimate resting point for an
  // inspect/plan command: it names what the caller still needs before it can
  // proceed. It is not one for an apply-shaped command: an apply that reaches
  // it wrote nothing (the mutating step aborted before its write), so exit 0
  // there would report a failed transaction as success to a scripting caller
  // (RUNNERNEUT-1 mechanism C; backlog:
  // kickoff-apply-action-drops-the-runner-the-plan-was-made-for). Deliberate
  // split, not a shared list: every other resting status stays shared because
  // each of those genuinely can be the settled outcome of either shape.
  const restingStatuses = new Set([
    "portable-seed-required", "runtime-initialization-required", "runtime-attestation-required",
    "restart-required", "kickoff-required", "host-repository-init-required", "ready",
    "migration-required", "adoption-required", "projection-drift",
    // Wave 4 onboarding coordinator, step 6 (NVA-W5-COORD-STEP6-1): the three
    // new v4Inspection statuses a genuinely fresh repo now settles into are
    // exactly as legitimate a resting point for inspect/plan as
    // kickoff-required always was.
    "intake-required", "intake-design-questions-required", "bootstrap-binding-required",
  ]);
  if (APPLY_SHAPED_COMMANDS.has(options.command)) restingStatuses.delete("runtime-attestation-required");
  return restingStatuses.has(output.status) ? 0 : 1;
}
if (isDirectInvocation(import.meta.url)) process.exit(main());
