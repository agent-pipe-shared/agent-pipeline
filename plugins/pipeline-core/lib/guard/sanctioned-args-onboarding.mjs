// SPDX-License-Identifier: SUL-1.0
// Guard module "sanctioned-args-onboarding" (layer 3), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { MUTATING_ONBOARDING_ARGV_SHAPES } from "../../scripts/project-onboarding-v3.mjs";
import { repositoryPathIdentityOrSelf } from "../repository-path-identity.mjs";
import { AUTOMATED_LIFECYCLE_ARGV_COMMANDS, HEX, ONBOARDING_SCRIPT } from "./constants.mjs";
import { matchFlagSpec } from "./shell-grammar.mjs";
import { resolveSanctionedScriptInvocation } from "./sanctioned-args-scripts.mjs";

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
export function rootIdentityMismatch(command, root, options = {}) {
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

export function sanctionedOnboardingArgs(rawArgs, root, options = {}) {
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
  // Explicit retained-history Git creation: exact request and digest only.
  // The canonical CLI independently requires attended confirmation of this digest.
  if (args[0] === "apply-enrollment-git-creation") {
    const runnerIndex = rawArgs.indexOf("--runner");
    return runnerIndex >= 0
      && ["claude", "codex", "antigravity"].includes(rawArgs[runnerIndex + 1])
      && matchFlagSpec(args.slice(1), {
        required: { "--request-create-git": true, "--activate": true },
        requiredValue: { "--root": isRootValue, "--plan-sha256": isHexDigest },
      });
  }
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
      optional: args[0] === "intake-generate-plan" ? { "--summary": true } : {},
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
  if (["apply-portable-seed", "apply-reinstall", "initialize-runtime", "apply-readback"].includes(args[0])
    && matchFlagSpec(args.slice(1), {
      requiredValue: { "--root": isRootValue, "--plan-sha256": isHexDigest },
      required: { "--activate": true },
      optionalValue: { "--intent": isIntentValue },
    })) return true;
  // A damaged lifecycle gets exactly one state-writing escape: the repair
  // planner's digest-bound apply. Keep it separate from the generic apply
  // family so no future widening of that family can silently broaden this
  // deadlock-recovery boundary.
  if (args[0] === "apply-repair"
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
  const isClaudeIntakeReference = value => {
    if (typeof value !== "string" || Buffer.byteLength(value) > 4096) return false;
    let reference;
    try { reference = JSON.parse(value); } catch { return false; }
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) return false;
    const raw = reference.schema === "pipeline.claude-intake-prompt-reference.v1";
    const initial = reference.schema === "pipeline.claude-initial-prompt-reference.v1";
    if (!raw && !initial) return false;
    const keys = raw ? ["schema", "captureId", "sessionId", "transcriptPathSha256", "promptSha256", "byteLength"]
      : ["schema", "pointerId", "sessionId", "promptId", "promptSha256", "byteLength"];
    if (Object.keys(reference).sort().join("\0") !== keys.sort().join("\0")
      || !/^[A-Za-z0-9_-]{1,128}$/u.test(reference.sessionId ?? "")
      || !/^[a-f0-9]{64}$/u.test(reference.promptSha256 ?? "")
      || !Number.isSafeInteger(reference.byteLength) || reference.byteLength < 1 || reference.byteLength > 1000000) return false;
    return raw ? /^[a-f0-9]{48}$/u.test(reference.captureId ?? "") && /^[a-f0-9]{64}$/u.test(reference.transcriptPathSha256 ?? "")
      : /^[a-f0-9]{48}$/u.test(reference.pointerId ?? "") && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(reference.promptId ?? "");
  };
  const MUTATING_ONBOARDING_FLAG_VALIDATORS = {
    "--root": isRootValue,
    "--text": nonEmptyTrimmed,
    // NVA-INTAKEARGV-1: a repository-relative path, not free text. Containment (must resolve
    // inside the project root) is enforced CLI-side in resolveIntakeCaptureText(), where the
    // root is actually resolved; the guard's job here stays the flag SET plus a value SHAPE.
    "--text-file": nonEmptyTrimmedNotFlag,
    "--text-file-sha256": isHexDigest,
    "--text-turn-ref": isClaudeIntakeReference,
    "--answers-json": nonEmptyTrimmedNotFlag,
    "--plan-sha256": isHexDigest,
    "--proof": nonEmptyTrimmedNotFlag,
    "--git-author-name": nonEmptyTrimmedNotFlag,
    "--git-author-email": nonEmptyTrimmedNotFlag,
    "--language": isLanguageValue,
    "--profile": isProfileValue,
    "--intent": isIntentValue,
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
