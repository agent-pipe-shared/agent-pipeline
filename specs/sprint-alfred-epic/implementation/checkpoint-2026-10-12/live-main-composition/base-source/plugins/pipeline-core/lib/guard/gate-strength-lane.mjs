// SPDX-License-Identifier: SUL-1.0
// Guard module "gate-strength-lane" (layer 3), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { physicalQualityPackageFile, validateQualityPackageCommandArgs } from "../signed-quality-package.mjs";
import { isBoundedScratchOnlyWords } from "../physical-scratch-boundary.mjs";
import { realpathSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { loadProtectedTestPathRules, protectedTestPathShellHit, TESTPATH_SHELL_DENIAL_CODE } from "../protected-test-paths.mjs";
import { GATE_STRENGTH_PATHS } from "../../hooks/guard-gate-strength.mjs";
import { CLAUDE_BASH_SHELL_DIALECT_PLATFORM, PLUGIN_ROOT } from "./constants.mjs";
import { isPathWithinRealpathedRoot } from "./path-containment.mjs";
import { isReadOnlyDiagnosticCommand, simpleWords } from "./shell-grammar.mjs";
import { verdict } from "./verdict.mjs";

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

export function gateStrengthShellRefusal(command, root, dependencies = {}) {
  if (isBoundedScratchOnlyWords(simpleWords(command, root), { rootDir: root })) return null;
  if (typeof command !== "string" || command === "") return null;
  if (isReadOnlyDiagnosticCommand(command, root)) return null;
  if (isGateStrengthSafeGitCommand(command, root)) return null;
  if (gateStrengthShellReadOnlyScriptExemption(command, root, dependencies)) return null;
  if (signedQualityPackageCommandAdmission(command, root, dependencies)) return null;
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
/**
 * ALFRED-QP3 (G8): on native Windows every path word of this lane (node executable, script, root, intent, proof, policy)
 * contains backslashes, so the former blanket backslash refusal made the lane unreachable there. A backslash is admitted
 * ONLY when the platform is win32 AND the raw command text is exactly the canonical rendering of the parsed words -- each
 * word bare (no backslash), single-quoted, or double-quoted with every backslash doubled, joined by single spaces. A
 * backslash anywhere else (an escape outside a path word, before a quote, trailing, unquoted) never matches a rendering,
 * so what the guard parsed is provably what the shell receives. Every other metacharacter stays refused on every platform.
 */
function win32CanonicalWordRendering(command, words) {
  let at = 0;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidates = [];
    if (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(word)) candidates.push(word);
    if (!word.includes("'")) candidates.push("'" + word + "'");
    if (!word.includes('"')) candidates.push('"' + word.replaceAll("\\", "\\\\") + '"');
    const hit = candidates.find((candidate) => command.startsWith(candidate, at));
    if (hit === undefined) return false;
    at += hit.length;
    if (index < words.length - 1) {
      if (command[at] !== " ") return false;
      at += 1;
    }
  }
  return at === command.length;
}

/** Write-capable signed-package lane: skips ONLY the basename classifier. */
export function signedQualityPackageCommandAdmission(command, root, dependencies = {}) {
  const nativeWin32 = (dependencies.platform ?? process.platform) === "win32";
  if (typeof command !== "string" || (nativeWin32 ? /[$\x60;&|<>\r\n]/u : /[\\$\x60;&|<>\r\n]/u).test(command)) return false;
  // win32: Claude's Bash tool executes through Git-Bash, so the command is tokenized with the POSIX dialect (CLAUDE_BASH_SHELL_DIALECT_PLATFORM:
  // a double-quoted doubled backslash collapses to one backslash); the host default would keep it doubled and no native path word could match.
  const words = simpleWords(command, root, nativeWin32 ? { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM } : {});
  if (!words || words.length !== 7) return false;
  if (nativeWin32 && command.includes("\\") && !win32CanonicalWordRendering(command, words)) return false;
  const directNode = nativeWin32 ? ["node", "node.exe"] : ["node"];
  if (![...directNode, dependencies.processExecPath ?? process.execPath].includes(words[0])) return false;
  try {
    const pluginRoot = realpathSync(PLUGIN_ROOT);
    const script = join(pluginRoot, "scripts", "quality-package-materializer.mjs");
    // win32 (ALFRED-QP3B F-B): the script is matched by PHYSICAL identity, never by a case-folded string. The native realpath
    // of the spelled script must be the native realpath of the sanctioned script, so a spelling that differs only by the
    // letter case NTFS ignores (drive letter, directory or file name) is the same file, while a same-named file in another
    // directory has another realpath and is refused. A real file reached through a link is not the sanctioned spelling
    // either: the spelling itself must pass the closed physical-file grammar (no symlink/junction component, one link, under
    // the plugin root). POSIX keeps the exact string comparison.
    const sameScript = nativeWin32
      ? isAbsolute(words[1]) && realpathSync.native(words[1]) === realpathSync.native(script)
        && physicalQualityPackageFile(words[1], pluginRoot, 1024 * 1024)
      : words[1] === script;
    if (!sameScript || !physicalQualityPackageFile(script, pluginRoot, 1024 * 1024)) return false;
    return validateQualityPackageCommandArgs(words.slice(2), root);
  } catch { return false; }
}

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
export function protectedTestPathShellRefusalHit(command, root, dependencies = {}, toolName = "Bash") {
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

/**
 * NVA-B-UNPARSED-CAVEAT-1 / pipeline.unparsed-command-lane-caveat: this wording follows the
 * classifier's explicit conservative-fallback classification, rather than a particular lane.
 * An opaque payload or an unparsed command can name a protected path without positively resolving
 * it as the write target; the guard still refuses that possible write. Resolved targets do not
 * carry this classification and keep the ordinary detected-write wording.
 */
function protectedTestPathShellConservativeCaveat(hit) {
  if (hit.classification !== "conservative-possible-write") return "";
  return "This conservative fallback cannot parse arbitrary interpreter code or command structure "
    + "well enough to prove the protected path is the write target. It may therefore refuse a mere "
    + "mention when a writer is also named; that does not claim a detected protected write. Route "
    + "forward: split supported standalone read/run commands from the unparsed form. For an actual "
    + "protected test change, use the sanctioned author-repair workflow named by the denial guidance; "
    + "do not try another tool to bypass this protection.\n";
}

export function protectedTestPathShellBlocked(hit, overrideGuidance) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${TESTPATH_SHELL_DENIAL_CODE}: ${hit.rule.id}: ${hit.rule.reason}\n`
      + (hit.classification === "conservative-possible-write"
        ? `Conservatively refused as a possible shell write to a protected test path (lane: ${hit.lane}).\n`
        : `Detected as a shell write to a protected test path (lane: ${hit.lane}).\n`)
      + "Why: an implementing Goldfish MUST NOT modify, weaken, skip or delete the tests/checks "
      + "that gate its own implementation (QG-04 / roles/goldfish.md GF-04). A genuine test "
      + "change is its own, explicitly briefed task, and this gate is authority-bearing "
      + "(guardrails/global.md GL-09) -- so which write tool you reach for cannot decide "
      + "whether it applies.\n"
      + (hit.classification === "conservative-possible-write"
        ? "Supported standalone read/run commands remain admitted: node --test, node <suite>, cat, rg, "
          + "git add/commit/diff/log/show. Their admission does not make an unparsed compound command "
          + "safe.\n"
        : "Reading and RUNNING the suite are unaffected: node --test, node <suite>, cat, rg, "
          + "git add/commit/diff/log/show on this path are all admitted. Only a detected write is "
          + "refused.\n")
      + protectedTestPathShellConservativeCaveat(hit)
      + (overrideGuidance ?? ""),
  );
}

/** Fail-closed outcome for a classifier fault (GL-09) — see protectedTestPathShellRefusalHit(). */
export function protectedTestPathShellFaultBlocked(error) {
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
