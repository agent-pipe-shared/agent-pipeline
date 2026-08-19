#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { isDirectInvocation } from "../lib/entrypoint.mjs";
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
  // as single "-apply" commands, unlike steps 4-5's plan/apply pairs). KNOWN GAP, not fixed here: unlike
  // every other `mutates: true` entry above, guard-lifecycle-ready.mjs's sanctionedOnboardingArgs() has no
  // admission branch for these three names yet -- GUARDDERIVE-1's derived admission only ever covers
  // `mutates: false` commands, so a Bash-invoked automated call to any of these three is still refused by
  // GUARD-LIFECYCLE-NOT-READY until a follow-up dispatch adds the exact-argv-shape branch deliberately.
  { name: "intake-consent-apply", flat: true, mutates: true, automatedArgvShape: null },
  { name: "intake-capture-apply", flat: true, mutates: true, automatedArgvShape: null },
  { name: "intake-design-questions-apply", flat: true, mutates: true, automatedArgvShape: null },
  // Wave 4 onboarding coordinator, step 4 (NVA-W4-COORD-2, design.md SSa.5 point 4). Unlike the
  // three apply-only commands above, this IS a plan/apply pair (mirroring every other command in
  // the table, per design): intake-generate-plan needs no operand beyond the bare lifecycle argv
  // (staging content is a pure function of the already-durable checkpoint), so it is
  // `automatedArgvShape: "lifecycle"` and is covered automatically by GUARDDERIVE-1's derived
  // admission -- no guard-lifecycle-ready.mjs change needed for the plan half. intake-generate-apply
  // mutates, so it needs the SAME sanctionedOnboardingArgs() hand-list admission branch the three
  // commands above are still missing (KNOWN GAP, not fixed here -- see the comment above and
  // backlog/items/2026-08-19-guard-lifecycle-ready-has-no-admission-branch-for-the-intake-checkpoint-subcommands.md).
  { name: "intake-generate-plan", flat: true, mutates: false, automatedArgvShape: "lifecycle" },
  { name: "intake-generate-apply", flat: true, mutates: true, automatedArgvShape: null },
  // Wave 4 onboarding coordinator, step 5 (NVA-W5-COORD-STEP5-2, design.md SSa.5 point 5, SSc.3).
  // A plan/apply pair like intake-generate's, same reasoning: bootstrap-bind-plan needs no operand
  // beyond the bare lifecycle argv (every input -- profile/featureId/prdPath/specPath/designInputPath
  // -- is derived from the already-durable intake checkpoint, resolveBootstrapBindInputs() in
  // lib/onboarding-continuity.mjs), so it is `automatedArgvShape: "lifecycle"`, covered automatically
  // by GUARDDERIVE-1's derived admission. bootstrap-bind-apply mutates, so it needs its own
  // sanctionedOnboardingArgs() branch, added alongside intake-generate-apply's.
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
// because the entry point IS the running session. Same environment signal
// pipeline-start-preflight.mjs already resolves the active runner from
// (CLAUDECODE is set by every Claude Code session, main and subagent);
// reused rather than re-derived so the two entry points speak one
// convention. A CLI invocation that omits --runner therefore resolves and
// threads this value explicitly -- it never raises and never passes
// `undefined` onward to a library helper.
function resolveActiveRunner(env) {
  return env.CLAUDECODE === "1" ? "claude" : "codex";
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
    else if (arg === "--runner") { const runner = args[index + 1]; if (!["claude", "codex"].includes(runner)) return { error: "--runner must be claude or codex" }; output.runner = runner; index += 1; }
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
export function main(args = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
  writeError = process.stderr.write.bind(process.stderr),
  deps,
  env = process.env,
} = {}) {
  const options = parse(args);
  if (options.help) { write(`${usage()}\n`); return 0; }
  if (options.error) { write(`${usage()}\n${options.error}\n`); return 2; }
  if (options.runner === undefined) options.runner = resolveActiveRunner(env);
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
      activate: options.activate,
      deps,
    });
    else if (options.command === "intake-capture-apply") output = applyOnboardingIntakeCapture({
      rootDir: options.root, text: options.text, activate: options.activate, deps,
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
  ]);
  if (APPLY_SHAPED_COMMANDS.has(options.command)) restingStatuses.delete("runtime-attestation-required");
  return restingStatuses.has(output.status) ? 0 : 1;
}
if (isDirectInvocation(import.meta.url)) process.exit(main());
