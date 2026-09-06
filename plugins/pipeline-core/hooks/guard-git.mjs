#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * git-guard — central PreToolUse deny-guard for Bash|PowerShell tool calls.
 *
 * Plugin: pipeline-core (Agent-Pipeline). Canon: docs/adr/0013-git-guard-union.md,
 * docs/operating-model.md, What the model protects (gate honesty) + Project calibration and extensions (calibration).
 *
 * WHY THIS FILE EXISTS
 *   The three project guards (<PROJECT_A>, <PROJECT_B>, <PROJECT_C>) are divergent copies — none is a
 *   superset of the others (measured copy-paste damage). This file is
 *   the UNION of all their deny rules; project-specific extras come from a per-project
 *   config file (see below), never from forks of this file. The guard lives ONLY
 *   in this plugin; project repos carry config, never guard copies (ADR-0013 risk note).
 *
 * DESIGN INVARIANTS (inherited from all three incarnations)
 *   - Broad permission allows + this targeted deny-hook: Bash-argument permission
 *     patterns are officially fragile; only hook denies also bind in
 *     acceptEdits/bypassPermissions modes (ADR-0013).
 *   - FAIL-OPEN: unparseable input or missing config never blocks ("the guard is a
 *     safety net, not a prison"). A broken guard must not paralyze work.
 *   - EXIT SEMANTICS: exit 0 = allow · exit 2 = BLOCK (stderr goes to the agent as
 *     plain-text reason) · exit 1 = allow + non-blocking warning (stderr shown to the
 *     user; used to surface a broken guard-config, or a loud override notice, instead
 *     of silently dropping denies or silently applying an override).
 *   - ESCAPE HATCH: the governed path is the double-confirmation override mechanism
 *     below. If the mechanism itself is unavailable (e.g. ledger unwritable),
 *     the last-resort fallback stays: the PO runs the blocked command manually in his
 *     own terminal. The guard binds agents, not humans.
 *   - QUOTE-STRIPPING (<PROJECT_A>/<PROJECT_C> heritage): quoted segments are emptied before
 *     matching so a commit MESSAGE that merely MENTIONS "git push --force" does not
 *     trigger a block (really happened at the very first guard commit in <PROJECT_A>).
 *     This also means an override's quoted reason text is never itself deny-matched.
 *   - LOWERCASE NORMALIZATION (<PROJECT_C> heritage): PowerShell cmdlets are mixed-case;
 *     matching happens on the lowercased, quote-stripped string.
 *   - GLOBAL-OPTION NORMALIZATION (a Phase-4 finding): interposing a recognized global git option between `git`
 *     and the subcommand (`git -C <path> push --force`, `git -c k=v reset --hard`,
 *     `git --git-dir=<path> clean -f`, …) used to defeat EVERY deny rule below — they
 *     all require `git\s+<subcommand>` adjacency. A normalization step strips the
 *     recognized-options list (function `normalizeGlobalGitOptions`, below) before rule
 *     matching, so the optioned and un-optioned forms match identically — same rule id,
 *     same override interaction. Unknown/novel global options are deliberately
 *     NOT stripped (see NOT-BLOCKED section — tripwire honesty, never a silently-claimed
 *     fix).
 *
 * OVERRIDE MECHANISM
 *   Every union, raw-string, or pre-normalization deny rule carries a stable id
 *   (GG-01…GG-20, append-only per bucket, never renumbered); project extra denies get
 *   PX-<n> (1-based config-list index) or an explicit "id". Every BLOCK message prints
 *   the matching rule's id — the `OVERRIDE <rule-id>` phrase (guardrails/git.md GIT-04
 *   step 3) needs a referent.
 *
 *   Arming is visible and inline, inside the command string the PO approves:
 *     Bash:       PIPELINE_GUARD_OVERRIDE="<RULE-ID>|<token>|<reason>" <command>
 *     PowerShell: $env:PIPELINE_GUARD_OVERRIDE='<RULE-ID>|<token>|<reason>'; <command>
 *   parsed from the RAW command, before quote-stripping. `process.env.PIPELINE_GUARD_
 *   OVERRIDE` is honored as a fallback for the PO's own session-level arming; when both
 *   are present the inline prefix wins and the ignored env arming is noted on stderr.
 *   Value = exactly 3 segments split on the first two "|" (reason may itself contain
 *   "|"); token is a fresh one-time value, reason is mandatory and non-empty.
 *   In a PHOENIX-GOVERNED repository (governance/events/registry.json present) the
 *   reason segment must itself open with an authority-reference path — effectively
 *   "<RULE-ID>|<token>|<authority-reference.json>|<reason>". A local token alone is
 *   never authority there; see the Phoenix block below.
 *
 *   One-time semantics, BOUND rather than counted: a consumption ledger
 *   `.claude/guard-override.log.jsonl` bound to the physical command target records one
 *   JSON line per successful override `{ts, rule, token, reason, command, commandSha256,
 *   candidateCommit, status, expiresAt, targetSha256}`. A `rule|token` pair already in the
 *   ledger is consumed — re-presenting it blocks — with exactly one exception: the SAME
 *   arming, for the byte-identical command, at the same `candidateCommit`, in the same
 *   physical target, before `expiresAt`, is admitted again and appended as `status:"retry"`.
 *   Rationale (design R2): the token used to be spent by the MATCH, before anything
 *   downstream had decided whether the command would run, so a harness refusal or a remote's
 *   own ruleset burned an authorization the human had already given. Re-running the
 *   identical command against the identical candidate is the same authorized act; what the
 *   unbound counter actually prevented was reuse for a DIFFERENT act, and the binding
 *   prevents that far more precisely. A different command, a moved HEAD, an expired arming,
 *   another target, and every entry written before this change (no `commandSha256`) all stay
 *   consumed forever. Lifetime: `overrideArmingTtlSeconds` from the loaded guard-config,
 *   else 3600s from the first admission — an arming that outlives the session that
 *   requested it is not a retry window. In a Phoenix-governed repository (governance/events
 *   /registry.json present), this local ledger is not the sole authority — see "override
 *   mechanism: Phoenix canonical human authority" below: a checkpoint-bound canonical human
 *   decision is additionally required, its own append-only stream is what is actually
 *   consumed for that admission, and the local ledger is never reached for that path (no
 *   command or reason content is persisted locally there).
 *
 * SIGNED-PUSH ADMISSION (GG-03 only) — ADR-0061 Decision 0, design R1
 *   When GG-03 is the ONLY matching rule, no `PIPELINE_GUARD_OVERRIDE` is in play, and the
 *   command is one plain `git [-C <same root>] push <remote> <source>:<destination>`, the
 *   guard verifies the project's recorded push approval (lib/critical-action-authorization
 *   .mjs `authorizeRecordedPush`) against the OBSERVED candidate, the parsed remote and the
 *   parsed destination ref. `authorized: true` allows the push (exit 0) and appends an audit
 *   entry naming the authorization relied on (`keyReference`, `forCommit`, `destination`);
 *   no token, no typed phrase, no second human act. The Decision-0 test is what removed the
 *   phrase: the signature is per-commit, per-destination, unforgeable by the agent and
 *   verified against a gate-strength committed anchor, so `OVERRIDE GG-03` on top of it
 *   prevents no agent behaviour — it only asks the human to decide twice.
 *   What stays: GG-03 blocks exactly as before whenever no verified approval exists for
 *   THIS commit and THIS destination (the unattended-agent case it was built for); a
 *   `--force`/`+refspec`/`--no-verify` push carrying a valid approval still blocks on ITS
 *   rule, because the admission requires GG-03 to be the single match; a deletion or an
 *   implicit destination is never matched against an attestation, and the denial now says
 *   so. Every failure mode — unparseable command, unconfirmed physical target, unreadable
 *   candidate/State, absent anchor, unwritable ledger, a throw — leaves the refusal exactly
 *   as it was.
 *
 *   Evaluation order: ALL deny rules are always evaluated; consumption is decided on
 *   the FINAL verdict. Only when every matching rule equals the single armed rule id
 *   does the guard consume the token (once, even across multiple matched segments of a
 *   chained command — the arming scope is the whole invocation) and allow (exit 1,
 *   loud stderr notice). If ANY other rule also matches, the guard blocks via that
 *   rule (exit 2) and consumes nothing, ledgers nothing — the override never widens
 *   beyond the single named rule.
 *
 *   FAIL-CLOSED (deliberate inversion of the guard's own fail-open): malformed arming
 *   (fewer than 3 segments, empty token/reason, or an unknown rule id) is ignored —
 *   rules evaluate as if unarmed, and an "override malformed" warning is always
 *   emitted (as an exit-1 warning when nothing blocks, so it is never silent). A
 *   ledger that cannot be appended (e.g. `.claude/` missing) means the override is
 *   NOT applied — normal block, explanatory reason. Rationale: an override without an
 *   audit record would violate the override audit contract; ordinary (unarmed) guard operation
 *   stays fail-open, unchanged.
 *
 *   HONESTY NOTE (gate honesty, docs/operating-model.md, What the model protects, M20): the mechanism cannot
 *   technically distinguish who typed the arming prefix — an agent could arm it
 *   without the PO. The defense is procedural + forensic, not technical: GIT-04
 *   forbids agents to self-arm, the arming is visible in the permission prompt, every
 *   consumption is loudly logged and lands in ledger + handover + telemetry, and the
 *   Critic checks trajectories (E12). This residual risk is documented, not hidden.
 *
 * RULE PROVENANCE — union of three divergent incarnations
 *   [ALL]     force-push (--force/-f), reset --hard, clean with force flag,
 *             remote main deletion, .env staging block
 *   [<PROJECT_A>] +refspec hidden force-push · archive/ tag protection (remote + local;
 *             archive/ tags are the <PROJECT_A> branch archive) · quote-stripping ·
 *             `git clean --force` long-flag coverage
 *   [<PROJECT_B>]      master alongside main · `push -d` short flag · local `branch -d/-D`
 *             main/master · blanket discard `checkout -- .` / `-- *` · staging block
 *             for secrets.yaml (project state/secrets) ·
 *             rm -rf on .git and /config · Remove-Item -Recurse on .git/secrets.yaml
 *   [<PROJECT_C>]  blanket discard via `restore` and bare `git checkout .` · SSH-key/PEM
 *             staging block (id_ed25519/id_rsa/.pem/.key) · clean -f rationale:
 *             untracked content packs (AssetPackA/AssetPackB/AssetPackC/…) would be
 *             deleted · lowercase normalization
 *   [GG-14/GG-15/GG-16] raw-string quote-evasion rules — a legacy guard also blocked
 *             several QUOTED destructive forms that quote-stripping (above) deliberately
 *             lets the union rules miss; this small, high-risk raw-string list
 *             (RAW_BLOCKERS below) closes that specific gap without a full engine revamp.
 *   [GG-17/GG-18/GG-19/GG-20] hook-bypass enforcement (2026-07-09) —
 *             `--no-verify` on any subcommand (union, no adjacency requirement),
 *             `git commit -n` short flag (union, adjacency-scoped to `commit` so
 *             `push -n`/`merge -n`, which mean --dry-run/--no-stat and are NOT hook-
 *             skips, stay allowed), `-c`/`--config-env core.hooksPath` transient
 *             rebind (a fourth, pre-normalization bucket, PRENORM_BLOCKERS below — see
 *             its own header comment for why it cannot live in UNION_BLOCKERS or
 *             RAW_BLOCKERS), and `git config [set] core.hooksPath` persistent rebind
 *             (union). Restores gate honesty (guardrails/git.md GIT-07): the docs now
 *             claim exactly these four ids block exactly these four forms, no more.
 *   Documented micro-hardenings vs. the originals (each marked [hardened] at the rule):
 *   segment-scoped matching `[^|&;]*` instead of `.*`/`[^\n]*` (fewer false positives
 *   across chained commands), flags allowed between `reset` and `--hard`, end-of-segment
 *   anchors for blanket discards, bare `:archive/` refspec, flag/path order for
 *   rm/Remove-Item, `/config` only as absolute path start (no `build/config` hits).
 *   History rewrites are enforced at the push boundary: rebase/amend/filter-branch stay
 *   local and only become destructive via force-push/+refspec — which is blocked.
 *
 * NOT IN THE UNION — machine-/repo-path-specific rules (central artifacts must stay
 * path-independent; two machines with different paths):
 *   - <PROJECT_B>:     rm -rf targeting the local repo path (was: a hardcoded drive path)
 *   - <PROJECT_C>: rm -rf / Remove-Item -Recurse targeting the repo folder name
 *   → Projects re-add these via the per-project guard-config (example below).
 *
 * PER-PROJECT EXTRA DENIES — config instead of fork (denies live here or in the
 * committed settings.json, NOT in .claude/pipeline.json — docs/operating-model.md, Project calibration and extensions):
 *   File:   <project>/.claude/guard-config.json   (committed in the project repo)
 *   Schema: { "extraDenyPatterns": [ { "pattern": "<JS regex body>",
 *                                      "reason": "<agent-facing explanation>",
 *                                      "id": "<optional explicit rule id>" } ] }
 *   Example (re-adds a repo-folder protection, <PROJECT_C>-style):
 *     { "extraDenyPatterns": [
 *         { "pattern": "\\brm\\s+-[a-z]*rf?[a-z]*\\b[^|&;]*acme",
 *           "reason": "rm -rf on the acme repo folder is blocked." } ] }
 *   Semantics:
 *   - Patterns are matched case-insensitively against the QUOTE-STRIPPED command.
 *   - Each entry's rule id is its explicit "id" if given, else `PX-<n>` (1-based
 *     position in the extraDenyPatterns list, counting skipped/invalid entries too).
 *   - Config file absent → union rules only (fail-safe, silent — the normal case).
 *   - Config unreadable/invalid JSON, or an entry without usable "pattern"/regex →
 *     that part is skipped, union stays active, and the guard exits 1 with a WARN so
 *     the broken config is surfaced instead of silently losing project denies.
 *   - Missing "reason" is tolerated (generic reason is generated); pattern still binds.
 *   Config is looked up under $CLAUDE_PROJECT_DIR (set by Claude Code for hooks),
 *   falling back to the process cwd. The override ledger uses the same lookup.
 *
 * WHAT THIS GUARD DOES NOT BLOCK (gate honesty, docs/operating-model.md, What the model protects, M20)
 *   - The everyday workflow: git push (incl. `push origin main` = <PROJECT_A> deploy path),
 *     push -u, tag creation, merge/pull/fetch/commit, deleting FEATURE branches
 *     (part of the branch-archival convention).
 *   - Local history edits without push (rebase/amend/filter-branch) — see above.
 *   - Quoted-path evasion (e.g. `git add ".env"`): inherited trade-off of
 *     quote-stripping; the false-positive protection was judged more valuable by all
 *     three incarnations. Narrowed: a small,
 *     high-risk raw-string list (GG-14/GG-15/GG-16 below) additionally catches quoted
 *     interpreter/remote-wrapper payloads, quoted `git add` of a protected target, and
 *     quoted recursive `rm`/`Remove-Item` of a protected target — the general class
 *     remains an accepted trade-off OUTSIDE that narrow list. Accepted residual risk:
 *     prose that literally quotes a full interpreter invocation or a quoted protected
 *     path may overblock — the escape is a manual commit by the PO, or the override
 *     mechanism.
 *   - Aliases `del`/`rd` (cmd.exe) and `ri` (PowerShell alias of Remove-Item) are not
 *     matched — only the literal `rm`/`Remove-Item` command forms are.
 *   - Obfuscation: variable indirection, base64, command substitution, bundled short
 *     flags (`-uf`). PowerShell parameter abbreviations: all `-r`-prefix abbreviations
 *     of `-Recurse` (`-r`, `-re`, `-rec`, `-recu`, `-recur`, `-recurs`, `-recurse`) are
 *     matched for GG-13/GG-16 targets. Global git options: only the
 *     recognized list (GLOBAL-OPTION NORMALIZATION invariant above) is normalized
 *     away before matching — an unrecognized/novel global option still breaks rule
 *     adjacency and is NOT blocked, exactly like the other obfuscation forms here (not
 *     silently claimed covered). A regex guard is a tripwire,
 *     not a sandbox — permissions + Critic review cover the rest.
 *   - HOOK-BYPASS evasions NOT reached by GG-17/GG-18/GG-19/GG-20 (2026-07-09 —
 *     enumerated deliberately, gate honesty, not silently claimed covered):
 *       - Quoted-value form `git -c "core.hooksPath=..."` — quote-stripping (above)
 *         empties the quoted content before GG-19 ever sees it; the same general
 *         quote-stripping trade-off as everywhere else in this guard, not a gap unique
 *         to this rule.
 *       - `--config-env` breaking `git commit` adjacency: `--config-env` is NOT in the
 *         recognized-global-option list (lib/git-cmd.mjs), so it is never
 *         normalized away and sits between `git` and `commit`, breaking the
 *         `\bgit\s+commit\b` adjacency GG-18 requires — `git --config-env=x=y commit -n`
 *         evades GG-18. GG-17 still catches the `--no-verify` long-form variant of the
 *         same intent regardless of what sits between `git` and the subcommand.
 *       - `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>` environment-
 *         variable config injection (git >= 2.31) — the `core.hooksPath` key/value pair
 *         never appears as a `-c`/`git config` token in the command string at all.
 *       - `GIT_CONFIG_GLOBAL=<file>` indirection pointing at an attacker-controlled
 *         config file that itself sets `core.hooksPath` — uncatchable by a command-
 *         string regex; the key never appears in the command string.
 *       - Alias indirection, e.g. `git -c alias.x="commit -n" x` — the literal
 *         `-n`/`--no-verify`/`core.hooksPath` token is hidden one level inside an alias
 *         definition, not in the command actually typed.
 *   - Non-shell tools (Write/Edit/MCP): this hook only sees Bash|PowerShell commands.
 *   - Overblocking is accepted where it errs safe (e.g. `.env.example` is caught by the
 *     `.env` staging rule — inherited from <PROJECT_A>; the PO commits such files manually).
 *   - Who physically typed the arming prefix (see HONESTY NOTE above).
 *   - OPEN (Phase 4): per-project end-to-end verification (plugin hook loading incl.
 *     ${CLAUDE_PLUGIN_ROOT} expansion on Windows, parity check against the three legacy
 *     guards) BEFORE the legacy .claude/hooks/guard-git.mjs copies are retired.
 *
 * MECHANICS
 *   Claude Code pipes the tool-input JSON to stdin: { tool_input: { command } }.
 *   Wired via plugins/pipeline-core/hooks/hooks.json (PreToolUse, matcher Bash|PowerShell).
 *
 * VERIFY (full suite — 1 block case + 1 allow counter-case per deny rule, plus
 * quote-stripping, segment-scoping, guard-config, override-mechanism, and
 * global-git-option-normalization cases; GIT-04/SEC-02):
 *   node plugins/pipeline-core/hooks/guard-git.test.mjs
 * Manual smoke (from the repo root; expect exit codes 2 / 2 / 0):
 *   printf '{"tool_input":{"command":"git push --force origin main"}}' | node plugins/pipeline-core/hooks/guard-git.mjs; echo $?
 *   printf '{"tool_input":{"command":"git add secrets.yaml"}}'          | node plugins/pipeline-core/hooks/guard-git.mjs; echo $?
 *   printf '{"tool_input":{"command":"git push origin main"}}'          | node plugins/pipeline-core/hooks/guard-git.mjs; echo $?
 */
import { existsSync, readFileSync, appendFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { commitMessageFindings, commitTypeFindings, markerPolicyMode } from "../lib/commit-message-policy.mjs";
import { stripQuotedSegments, normalizeGlobalGitOptions, tokenizeArgv } from "../lib/git-cmd.mjs";
import {
  LEGACY_GUARD_AUDIT,
  LEGACY_GUARD_CONFIG,
  LEGACY_STATE,
  NEUTRAL_GUARD_AUDIT,
  NEUTRAL_GUARD_CONFIG,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";

// The plugin root this guard is itself running from -- same self-location resolution
// guard-lifecycle-ready.mjs / guard-human-override.mjs already use (`resolve(dirname(
// fileURLToPath(import.meta.url)), "..")`), reused rather than a second mechanism, so a
// path this hook prints resolves inside a consumer's installed plugin, never a path
// that exists only in this repository's own source checkout (backlog: 2026-08-08-
// shipped-artifacts-assume-the-pipelines-own-repository.md).
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Runnable reference to pipeline-state.mjs under the plugin actually enforcing this
 * guard. Degrades to a locate-it hint (never a broken path or an empty string) if the
 * script cannot be found under PLUGIN_ROOT.
 */
function pipelineStateScriptRef() {
  const script = join(PLUGIN_ROOT, "scripts", "pipeline-state.mjs");
  return existsSync(script)
    ? script
    : "pipeline-state.mjs (locate it under your installed pipeline-core plugin's scripts directory)";
}

const GOVERNANCE_AUTHORITY_CLI = fileURLToPath(new URL("../scripts/governance-authority.mjs", import.meta.url));
const PHOENIX_OVERRIDE_REFERENCE_SCHEMA = "pipeline.git-override-authority-reference.v1";

// ---- read tool input (fail-open) --------------------------------------------------
let cmd = "";
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  cmd = String(input?.tool_input?.command ?? input?.tool_input?.CommandLine ?? "");
} catch {
  process.exit(0); // fail-open: guard is a safety net, not a prison
}
if (!cmd) process.exit(0);

// ---- normalize: strip quoted segments, then lowercase ------------------------------
// Commit messages and prose live in quotes; destructive flags never do.
// stripQuotedSegments/normalizeGlobalGitOptions now live in ../lib/git-cmd.mjs
// (extracted verbatim — zero behavior change).
const stripped = stripQuotedSegments(cmd);
const c = stripped.toLowerCase();

// ---- normalize: strip recognized global git options between `git` and the subcommand
// (a Phase-4 finding — see header GLOBAL-OPTION NORMALIZATION invariant) ------
const normalizedC = normalizeGlobalGitOptions(c);
const normalizedStripped = normalizeGlobalGitOptions(stripped);

// ---- union deny rules (provenance per rule; matched against `normalizedC`) ----------
/** @type {Array<{id: string, re: RegExp, why: string, origin: string}>} */
const UNION_BLOCKERS = [
  {
    id: "GG-01",
    // --force prefix also catches --force-with-lease / --force-if-includes.
    re: /\bgit\s+push\b[^|&;]*(--force|\s-f\b)/,
    why: "Force-push rewrites remote history (main may be production or shared state).",
    origin: "common core (<PROJECT_A>+<PROJECT_B>+<PROJECT_C>)",
  },
  {
    id: "GG-02",
    re: /\bgit\s+push\b[^|&;]*\s\+\S+/,
    why: "A +refspec is a hidden force-push (remote history rewrite).",
    origin: "<PROJECT_A>+<PROJECT_C>",
  },
  {
    id: "GG-03",
    // --delete/-d …main|master, or :refspec deletion/overwrite of main|master.
    re: /\bgit\s+push\b[^|&;]*(\s(--delete|-d)\s[^|&;]*\b(main|master)\b|:\s*(refs\/heads\/)?(main|master)\b)/,
    why: "Deleting or directly overwriting main/master on the remote.",
    origin: "common core; -d short flag from <PROJECT_B>, master from <PROJECT_B>+<PROJECT_C>",
  },
  {
    id: "GG-04",
    // [hardened] bare `:archive/…` refspec added to <PROJECT_A>'s original two forms.
    re: /\bgit\s+push\b[^|&;]*(--delete[^|&;]*\barchive\/|:\s*(refs\/tags\/)?archive\/)/,
    why: "archive/ tags are the <PROJECT_A> branch archive — remote deletion only deliberately, by hand.",
    origin: "<PROJECT_A> (archive-tag protection)",
  },
  {
    id: "GG-05",
    re: /\bgit\s+tag\s+(-d|--delete)\b[^|&;]*\barchive\//,
    why: "archive/ tags are the <PROJECT_A> branch archive — local deletion only deliberately, by hand.",
    origin: "<PROJECT_A> (archive-tag protection)",
  },
  {
    id: "GG-06",
    // Input is lowercased, so -D is matched as -d. `--?delete` also catches the
    // inert single-dash word form `-delete` (not a real git flag; git exits 129
    // on it) — restoring string parity with the <PROJECT_C> legacy guard is cheap
    // and was its only remaining gap.
    re: /\bgit\s+branch\s+(--?delete|-d{1,2})\b[^|&;]*\b(main|master)\b/,
    why: "Deleting the local main/master branch.",
    origin: "<PROJECT_B>+<PROJECT_C>",
  },
  {
    id: "GG-07",
    // [hardened] flags allowed between reset and --hard (e.g. `git reset -q --hard`).
    re: /\bgit\s+reset\s+[^|&;]*--hard\b/,
    why: "reset --hard discards local work irrecoverably (use git restore/stash instead).",
    origin: "common core (<PROJECT_A>+<PROJECT_B>+<PROJECT_C>)",
  },
  {
    id: "GG-08",
    // -{1,2} covers -f/-fd/-xdf AND --force (<PROJECT_A> caught --force; <PROJECT_B>'s pattern missed it).
    re: /\bgit\s+clean\b[^|&;]*\s-{1,2}[a-z]*f/,
    why: "git clean with force deletes untracked files — local notes (<PROJECT_A>) and the untracked <PROJECT_C> content packs (AssetPackA/AssetPackB/…).",
    origin: "common core; content-pack rationale from <PROJECT_C>",
  },
  {
    id: "GG-09",
    // [hardened] end-of-segment anchor instead of end-of-string only.
    re: /\bgit\s+(checkout|restore)\b[^|&;]*--\s+(\.|\*)\s*($|[|&;])/,
    why: "Blanket discard of ALL working-tree changes (checkout/restore -- . or -- *).",
    origin: "<PROJECT_B> (checkout -- ./-- *) + <PROJECT_C> (restore)",
  },
  {
    id: "GG-10",
    re: /\bgit\s+(checkout|restore)\s+(\.|\*)\s*($|[|&;])/,
    why: "Bare `git checkout .` / `git restore .` discards all working-tree changes.",
    origin: "<PROJECT_C> (checkout .) + <PROJECT_B> (bare-dot form); restore-dot combined",
  },
  {
    id: "GG-21",
    // A branch checkout with --force discards colliding tracked and untracked
    // control artifacts. Fetch is intentionally not restricted; this closes
    // only the destructive follow-up that turned remote adoption into an
    // unrecoverable mixed authority state.
    re: /\bgit\s+(checkout|switch)\b[^|&;]*\s(?:--force|-f)\b/,
    why: "Force checkout discards or overlays local repository state; archive/adopt the checkout explicitly first.",
    origin: "remote-authority adoption recovery",
  },
  {
    id: "GG-11",
    // Union of all three staging deny-lists. `.env` intentionally without trailing \b
    // so .env.local/.env.production are caught (errs safe: .env.example too).
    re: /\bgit\s+add\b[^|&;]*(\.env|(?<![a-zA-Z0-9_])secrets\.yaml\b|id_ed25519\b|id_rsa\b|\.pem\b|\.key\b)/,
    why: "Staging secrets/state (.env*, secrets.yaml, SSH keys, .pem/.key) — these never belong in a repo. secrets.yaml uses a negative-lookbehind boundary so fakesecrets.yaml (a real, intentional CI fixture) does not match by substring coincidence (GG-11, backlog item two-guards-block-an-unrelated-file-via-substring-name-matching).",
    origin: ".env: all three · secrets.yaml: <PROJECT_B> · SSH keys/.pem/.key: <PROJECT_C>",
  },
  {
    id: "GG-12",
    // [hardened] flag/path order independent; /config only as absolute path start
    // (lookbehind requires whitespace, so `rm -rf build/config` stays allowed). Covers
    // GNU long forms incl. unambiguous abbreviations (--recursive, --recur, …);
    // deliberately overblocking: ANY double-dash rm option containing `r` (e.g.
    // --force) counts as the recursive flag when a protected target is present — errs
    // safe per guard philosophy.
    // Machine-specific repo paths are NOT here — re-add per project via guard-config.
    re: /\brm\s+(?:[^|&;]*\s)?-{1,2}[a-z]*r[a-z]*\b[^|&;]*(\.git\b|(?<=\s)\/config\b)|\brm\s+[^|&;]*(\.git\b|(?<=\s)\/config\b)[^|&;]*\s-{1,2}[a-z]*r[a-z]*\b/,
    why: "Recursive rm targeting .git (repo history) or /config (<PROJECT_B> runtime config).",
    origin: "<PROJECT_B> (.git, /config) + <PROJECT_C> (.git); repo-path variants → guard-config",
  },
  {
    id: "GG-13",
    // [hardened] target may precede the flag (lookahead); -r(ecurse) abbreviations
    // (-r, -re, -rec, -recu, -recur, -recurs, -recurse) all match — PowerShell accepts
    // any unambiguous prefix of a parameter name. Abbreviation class closed: the
    // guard-git.test.mjs case that pinned this gap as an intentional ALLOW was converted
    // to BLOCK under explicit Elephant authorization (the case codified a documented gap,
    // not a protection contract).
    re: /\bremove-item\b(?=[^|&;]*\s-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?\b)[^|&;]*(\.git\b|\.storage\b|secrets\.yaml\b)/,
    why: "Recursive Remove-Item targeting .git, .storage or secrets.yaml.",
    origin: "<PROJECT_B> (.git/.storage/secrets.yaml) + <PROJECT_C> (.git); repo-path variants → guard-config",
  },
  {
    id: "GG-17",
    // Deliberately no subcommand adjacency — `--no-verify` anywhere after `git` in the
    // segment blocks (immune to unrecognized-global-option breaks). `(?!-)` excludes
    // the real `--no-verify-signatures` merge/pull flag (NOT a hook-skip). Quote-
    // stripping (already applied before this rule ever sees the string) keeps a commit
    // message that merely MENTIONS "--no-verify" safe.
    re: /\bgit\b[^|&;]*--no-verify(?!-)/,
    why: "--no-verify skips the pre-commit/commit-msg hooks (git commit) or the pre-push hook (git push).",
    origin: "hook-bypass enforcement, 2026-07-09",
  },
  {
    id: "GG-18",
    // Scoped to `git commit` (adjacency, so a recognized global option in between still
    // normalizes away and blocks) so this does NOT match `git push -n` (=--dry-run) or
    // `git merge -n` (=--no-stat) — those are NOT hook-skips and stay allowed. Single-
    // dash only (`(?!-)` excludes `--no-edit`/`--dry-run`); the nested [a-z0-9]*n[a-z0-9]*
    // shape catches bundled short flags (`-nm`, `-an`) wherever `n` sits in the cluster.
    re: /\bgit\s+commit\b[^|&;]*\s-(?!-)[a-z0-9]*n[a-z0-9]*\b/,
    why: "git commit -n is --no-verify (skips hooks). Note: -n means --dry-run on push and --no-stat on merge, which are NOT hook-skips and stay allowed.",
    origin: "hook-bypass enforcement, 2026-07-09",
  },
  {
    id: "GG-20",
    // Persistent form (`git config` / `git config set`, git >= 2.46) — errs safe: a bare
    // read of the same key (`git config core.hooksPath` with no value) is also blocked,
    // accepted (rare; override/manual path exists).
    re: /\bgit\s+config\b[^|&;]*core\.hookspath/,
    why: "git config core.hooksPath persistently rebinds the hooks path to disable hooks.",
    origin: "hook-bypass enforcement, 2026-07-09",
  },
];

// ---- raw-string high-risk rules (quote-evasion hardening) ---
// A deliberate, narrow addition alongside the QUOTE-STRIPPING invariant above (which
// stays the general, accepted trade-off): matched against `rawForQuoteRules` (the RAW,
// non-quote-stripped, non-global-opt-normalized command, arming prefix excluded — see
// below) so a small high-risk list of quoted destructive forms is caught without a full
// engine revamp. Same shape/contract as UNION_BLOCKERS (id/re/why/origin), evaluated in
// the same matched-loop, so override/ledger semantics apply unchanged.
/** @type {Array<{id: string, re: RegExp, why: string, origin: string}>} */
const RAW_BLOCKERS = [
  {
    id: "GG-14",
    // raw-string rule: interpreter/remote wrapper with quoted destructive
    // payload — e.g. `ssh host "rm -rf /config"`, `bash -c "git reset --hard"`.
    re: /\b(?:ssh\s+\S+[^|&;]*|(?:ba|z|da)?sh\s+(?:[^|&;]*\s)?-c\s*|pwsh(?:\.exe)?\s+[^|&;]*-c\w*\s*|powershell(?:\.exe)?\s+[^|&;]*-c\w*\s*|cmd(?:\.exe)?\s+\/c\s*)["'][^"']*(?:git\s+push\b[^"']*(?:--force|\s-f\b|\s\+\S+)|git\s+reset\s+[^"']*--hard\b|git\s+clean\b[^"']*\s-{1,2}[a-z]*f|rm\s+(?:[^"']*\s)?-{1,2}[a-z]*r[a-z]*\b[^"']*(?:\.git\b|\/config\b)|git\s+(?:checkout|restore)\b[^"']*--\s+(?:\.|\*)|git\s+branch\s+(?:-d{1,2}|--delete)\b[^"']*\b(?:main|master)\b)/,
    why: "Raw-string rule: a quoted interpreter/remote wrapper (ssh/bash -c/pwsh -c/cmd /c) carrying a quoted destructive git/rm payload — quote-stripping alone would hide this from the union rules above.",
    origin: "quote-evasion hardening",
  },
  {
    id: "GG-15",
    // raw-string rule: git add with a quoted protected target (GG-11 list).
    re: /\bgit\s+add\b[^|&;]*["'][^"']*(\.env|(?<![a-zA-Z0-9_])secrets\.yaml\b|id_ed25519\b|id_rsa\b|\.pem\b|\.key\b)/,
    why: "Raw-string rule: git add with a quoted protected target (GG-11 list) — quote-stripping alone would hide the staged secret. secrets.yaml boundary-anchored, same fix as GG-11.",
    origin: "quote-evasion hardening",
  },
  {
    id: "GG-16",
    // raw-string rule: recursive rm/Remove-Item with a quoted protected target.
    re: /\brm\s+(?:[^|&;]*\s)?-{1,2}[a-z]*r[a-z]*\b[^|&;]*["'][^"']*(\.git\b|\/config\b)|\bremove-item\b(?=[^|&;]*\s-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?\b)[^|&;]*["'][^"']*(\.git\b|\.storage\b|(?<![a-zA-Z0-9_])secrets\.yaml\b)/,
    why: "Raw-string rule: recursive rm/Remove-Item with a quoted protected target (.git/.storage/secrets.yaml) — quote-stripping alone would hide the target. secrets.yaml boundary-anchored, same fix as GG-11.",
    origin: "quote-evasion hardening",
  },
];

// ---- pre-normalization deny rules (matched against `c` — BEFORE normalizeGlobalGitOptions;
// hook-bypass enforcement, 2026-07-09) -----------------------------------
// `c` is quote-stripped (protects prose mentions, same as UNION_BLOCKERS) but NOT
// global-opt-normalized. This is the ONLY bucket with both properties, and GG-19 needs
// exactly that combination:
//   - normalizedC is wrong: normalizeGlobalGitOptions() strips the `-c <arg>` token
//     itself (lib/git-cmd.mjs GIT_GLOBAL_OPT_SPACE_ARG) BEFORE normalizedC is built —
//     matching against normalizedC would mean the guard never sees the `-c
//     core.hooksPath=...` form it exists to catch.
//   - rawForQuoteRules is wrong: that string is NOT quote-stripped, so a commit message
//     or a doc that literally mentions "core.hooksPath" in prose would self-block a
//     session with no human present to run the override.
/** @type {Array<{id: string, re: RegExp, why: string, origin: string}>} */
const PRENORM_BLOCKERS = [
  {
    id: "GG-19",
    // Matches `-c core.hooksPath[=...]` AND both `--config-env=core.hooksPath=...` and the
    // git-accepted space form `--config-env core.hooksPath=...` (critic L1: the equals-only
    // form left a real, undocumented bypass). Anchored to `\bgit` with a segment-scoped
    // `[^|&;]*` so a non-git command like `grep -c core.hooksPath` is NOT false-blocked
    // (critic L1). No trailing `=` required, so a value-less `-c core.hooksPath` (git treats
    // a bare -c key as boolean true) is also caught.
    // Quoted-value form `git -c "core.hooksPath=..."` is a documented, accepted
    // NOT-BLOCKED trade-off (guard header above) — quote-stripping already emptied the
    // content before this regex runs, same as everywhere else in this guard.
    re: /\bgit\b[^|&;]*(?:-c\s+|--config-env(?:=|\s+))["']?core\.hookspath/,
    why: "-c / --config-env core.hooksPath rebinds the hooks path to disable hooks.",
    origin: "hook-bypass enforcement, 2026-07-09",
  },
];

// ---- per-project extra denies (config, not fork) ----------------------------------
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const authority = resolveProjectAuthorityPaths({ rootDir: projectDir });
const guardConfigRelPath = authority.status === "ready"
  ? authority.guardConfig
  : (existsSync(join(projectDir, NEUTRAL_GUARD_CONFIG)) ? NEUTRAL_GUARD_CONFIG : LEGACY_GUARD_CONFIG);
const guardAuditRelPath = authority.status === "ready"
  ? authority.guardAudit
  : (existsSync(join(projectDir, NEUTRAL_GUARD_AUDIT)) ? NEUTRAL_GUARD_AUDIT : LEGACY_GUARD_AUDIT);
// Same resolve-then-fall-back shape the two paths above use. Read ONLY by the GG-03
// signed-push admission below; an unreadable/absent State is simply "no approval", never
// an allow.
const guardStateRelPath = authority.status === "ready"
  ? (authority.state ?? NEUTRAL_STATE)
  : (existsSync(join(projectDir, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
const configPath = join(projectDir, guardConfigRelPath);
const warnings = [];
/** @type {Array<{id: string, re: RegExp, why: string, origin: string}>} */
const EXTRA_BLOCKERS = [];
let projectConfig = null;
let rawConfig = null;
try {
  rawConfig = readFileSync(configPath, "utf8");
} catch {
  // File absent → union only. Fail-safe and silent: this is the normal case.
}
if (rawConfig !== null) {
  try {
    const cfg = JSON.parse(rawConfig);
    projectConfig = cfg;
    const list = cfg?.extraDenyPatterns;
    if (list !== undefined && !Array.isArray(list)) {
      warnings.push('"extraDenyPatterns" is not an array -> ignored');
    }
    for (const [i, entry] of (Array.isArray(list) ? list : []).entries()) {
      if (typeof entry?.pattern !== "string" || entry.pattern === "") {
        warnings.push(`extraDenyPatterns[${i}]: missing/empty "pattern" -> entry skipped`);
        continue;
      }
      try {
        EXTRA_BLOCKERS.push({
          id: typeof entry?.id === "string" && entry.id !== "" ? entry.id : `PX-${i + 1}`,
          re: new RegExp(entry.pattern, "i"),
          why:
            typeof entry?.reason === "string" && entry.reason !== ""
              ? entry.reason
              : `Project deny pattern matched: ${entry.pattern}`,
          origin: `project guard-config (${guardConfigRelPath})`,
        });
      } catch (e) {
        warnings.push(`extraDenyPatterns[${i}]: invalid regex (${e.message}) -> entry skipped`);
      }
    }
  } catch (e) {
    warnings.push(`unparseable JSON (${e.message}) -> union rules only`);
  }
}

const KNOWN_RULE_IDS = new Set([
  ...UNION_BLOCKERS.map((r) => r.id),
  ...RAW_BLOCKERS.map((r) => r.id),
  ...PRENORM_BLOCKERS.map((r) => r.id),
  ...EXTRA_BLOCKERS.map((r) => r.id),
]);

// ---- override mechanism: arming parse ------------------------------------------------
// Accepted grammar (normative): parsed from the RAW command, before quote-
// stripping — the reason segment may contain spaces (bash quoted / PowerShell quoted).
const BASH_ARM_RE = /^PIPELINE_GUARD_OVERRIDE=(?:'([^']*)'|"([^"]*)"|(\S+))\s+([\s\S]*)$/;
const PS_ARM_RE = /^\$env:PIPELINE_GUARD_OVERRIDE\s*=\s*(?:'([^']*)'|"([^"]*)")\s*;\s*([\s\S]*)$/i;

function parseInlineArming(rawCmd) {
  const bash = rawCmd.match(BASH_ARM_RE);
  if (bash) return { value: bash[1] ?? bash[2] ?? bash[3] ?? "", remainder: bash[4] ?? "" };
  const ps = rawCmd.match(PS_ARM_RE);
  if (ps) return { value: ps[1] ?? ps[2] ?? "", remainder: ps[3] ?? "" };
  return null;
}

/** Split "<rule>|<token>|<reason>" on the FIRST TWO "|" — reason may itself contain "|". */
function splitOverrideValue(value) {
  const firstPipe = value.indexOf("|");
  if (firstPipe === -1) return null;
  const secondPipe = value.indexOf("|", firstPipe + 1);
  if (secondPipe === -1) return null;
  return {
    rule: value.slice(0, firstPipe),
    token: value.slice(firstPipe + 1, secondPipe),
    reason: value.slice(secondPipe + 1),
  };
}

const notices = [];
const inlineArm = parseInlineArming(cmd);
// raw (NOT quote-stripped, NOT global-opt-normalized), lowercased, with the inline
// override arming prefix excluded so an arming REASON text can never trip RAW_BLOCKERS.
const rawForQuoteRules = ((inlineArm && inlineArm.remainder) ?? cmd).toLowerCase();
const envArmRaw = process.env.PIPELINE_GUARD_OVERRIDE;
let armingRaw = null;
if (inlineArm) {
  armingRaw = inlineArm.value;
  if (envArmRaw) {
    notices.push(
      "[git-guard] Note: inline PIPELINE_GUARD_OVERRIDE prefix takes precedence over the session-level env var; the env arming is ignored.",
    );
  }
} else if (envArmRaw) {
  armingRaw = envArmRaw;
}

/** @type {null | {malformed: true, reason: string} | {malformed: false, rule: string, token: string, reason: string}} */
let arming = null;
if (armingRaw !== null) {
  const parsed = splitOverrideValue(armingRaw);
  if (process.env.PIPELINE_REQUIRE_TYPED_HUMAN_OVERRIDE === "1") {
    arming = { malformed: true, reason: "the Codex adapter requires a digest-bound attended Human override capability" };
  } else if (!parsed || parsed.rule === "" || parsed.token === "" || parsed.reason === "") {
    arming = { malformed: true, reason: "fewer than three segments, or an empty rule/token/reason" };
  } else if (!KNOWN_RULE_IDS.has(parsed.rule)) {
    arming = { malformed: true, reason: `rule id "${parsed.rule}" is unknown to the union and the loaded guard-config` };
  } else {
    arming = { malformed: false, rule: parsed.rule, token: parsed.token, reason: parsed.reason };
  }
}

// ---- override mechanism: consumption ledger -------------------------------------------
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function overrideTarget() {
  let coordinator;
  try { coordinator = realpathSync(projectDir); } catch { return { ok: false }; }
  const roots = new Set([coordinator]);
  // An override ledger may be written only when every git invocation is bound to
  // the coordinator's one physical project root. `-C` can be confirmed with a
  // realpath comparison below. `--git-dir` and `--work-tree` can each select a
  // different repository/worktree without a safe root proof in this hook, so an
  // armed override rejects them before either consumption lookup or append.
  // GIT_DIR/GIT_WORK_TREE have the same target-selection power even when passed
  // through a shell assignment or env wrapper, so they are rejected as well.
  // (Detection intentionally covers both --option=value and --option <value>.)
  const targetCommand = inlineArm?.remainder ?? cmd;
  if (/(?:^|[\s;&|])(?:GIT_DIR|GIT_WORK_TREE)\s*=|\$env:(?:GIT_DIR|GIT_WORK_TREE)\s*=/iu.test(targetCommand)) return { ok: false };
  for (const segment of targetCommand.split(/[;&|]+/u)) {
    if (!/\bgit\b/u.test(segment)) continue;
    const gitIndex = segment.search(/\bgit\b/u);
    const gitTail = segment.slice(gitIndex + 3);
    if (/(?:^|\s)--(?:git-dir|work-tree)(?:\s|=|$)/u.test(gitTail)) return { ok: false };
    for (const match of segment.matchAll(/(?:^|\s)-C\s+((?:"[^"]*"|'[^']*'|[^\s;&|])+)/gu)) {
      const raw = match[1];
      const value = (raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'")) ? raw.slice(1, -1) : raw;
      try { roots.add(realpathSync(resolve(coordinator, value))); } catch { return { ok: false }; }
    }
  }
  if (roots.size !== 1 || !roots.has(coordinator)) return { ok: false };
  return { ok: true, root: coordinator, sha256: sha256(coordinator) };
}
function ledgerPath(target) {
  return join(target.root, guardAuditRelPath);
}
function readLedgerEntries(target) {
  let raw;
  try {
    raw = readFileSync(ledgerPath(target), "utf8");
  } catch {
    return []; // absent/unreadable ledger -> nothing consumed yet
  }
  const entries = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // corrupt line — ignore it (read side stays fail-open); appends are unaffected.
    }
  }
  return entries;
}
function findConsumption(rule, token, target) {
  return readLedgerEntries(target).find((e) => e && e.rule === rule && e.token === token && (!e.targetSha256 || e.targetSha256 === target.sha256)) ?? null;
}
function appendLedger(entry, target) {
  try {
    appendFileSync(ledgerPath(target), JSON.stringify(entry) + "\n");
    return true;
  } catch {
    return false; // fail-closed: caller must NOT apply the override
  }
}

// ---- override mechanism: what an arming is bound to, and how long it lives -------------
// R2 of specs/sprint-nova-epic/implementation/one-approval-all-layers-design.md. The token
// used to be spent by the MATCH — before anything downstream had decided whether the
// command would run at all — so a harness refusal or a remote's own ruleset burned an
// authorization the human had already given (measured twice in the v0.5.3 release). The
// ledger entry now records WHAT was authorized (`commandSha256`, `candidateCommit`) and how
// long the arming lives (`expiresAt`); a re-presentation that reproduces all of it exactly
// is admitted again and appended as a `retry`, so the audit trail gains detail rather than
// losing it. Everything that differs — a different command, a moved HEAD, an expired
// arming, another physical target — needs a fresh token exactly as before, and so does
// every entry written before this change (they carry no `commandSha256`, so they can never
// satisfy the retry test: a pre-existing ledger does not become re-usable).
const OVERRIDE_ARMING_TTL_DEFAULT_SECONDS = 3600;
function overrideArmingTtlSeconds() {
  const configured = projectConfig?.overrideArmingTtlSeconds;
  return typeof configured === "number" && Number.isFinite(configured) && configured > 0
    ? configured
    : OVERRIDE_ARMING_TTL_DEFAULT_SECONDS;
}
/** One git object id read out of the confirmed physical target, or null. Never throws. */
function gitObjectId(root, args) {
  try {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 5000 });
    if (result.error || result.status !== 0) return null;
    const value = String(result.stdout ?? "").trim();
    return /^[0-9a-f]{40,64}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}
function observedCandidateCommit(target) {
  return gitObjectId(target.root, ["rev-parse", "--verify", "--end-of-options", "HEAD"]);
}
/**
 * May an arming that is already in the ledger be presented again?
 *
 * Stricter than the design's letter in exactly one place, stated so nobody reads it as an
 * oversight: an UNOBSERVABLE candidate (no repository, no git, an unreadable HEAD → `null`)
 * never admits a retry, although two nulls are trivially "identical". "The same authorized
 * act" is an argument ABOUT a candidate; where there is none to compare, the one-time rule
 * stands unchanged.
 */
function admitsRetry(prior, { commandSha256, candidateCommit, target, nowMs }) {
  if (!prior || typeof prior.commandSha256 !== "string" || prior.commandSha256 !== commandSha256) return false;
  if (typeof candidateCommit !== "string" || prior.candidateCommit !== candidateCommit) return false;
  if (prior.targetSha256 !== target.sha256) return false;
  const expiresAtMs = Date.parse(prior.expiresAt ?? "");
  return Number.isFinite(expiresAtMs) && nowMs < expiresAtMs;
}

// ---- GG-03: a verified push signature IS the confirmation ------------------------------
// R1 of the same design, under ADR-0061 Decision 0. `OVERRIDE GG-03` after a verified,
// per-commit, per-destination Ed25519 approval for `kind: push` prevents no agent behaviour
// the signature does not already prevent: the signature names the commit AND the
// destination ref, cannot be produced by the agent, and is verified against an anchor
// committed at gate strength. The typed phrase only asks the human to decide again.
//
// Scope, deliberately narrow:
//   - GG-03 must be the ONLY matching rule. A `--force`/`+refspec`/`--no-verify` push
//     carrying a perfectly valid approval still blocks on ITS rule — the "every matching
//     rule must be the single admitted rule" invariant is untouched.
//   - No arming may be present. An armed (or malformed) `PIPELINE_GUARD_OVERRIDE` keeps
//     today's token route exactly as it is; the two mechanisms never interleave.
//   - The command must be one plain `git [-C <same root>] push <remote> <src>:<dst>`. A
//     deletion (`--delete main`, `:main`) or an implicit destination cannot be matched
//     against an attestation, because an approval names a ref and guessing one is how a
//     verifier turns into a rubber stamp. The denial now says so instead of leaving the
//     operator to infer it.
// Failure of ANY kind — unparseable command, unconfirmed target, unreadable candidate,
// unreadable State, absent anchor, unwritable ledger, a throw — leaves the refusal exactly
// as it was. There is no path here that converts an error into an allow.
const PUSH_SAFE_FLAGS = new Set([
  "--dry-run", "--porcelain", "--verbose", "-v", "--quiet", "-q", "--atomic", "--no-atomic",
  "--set-upstream", "-u",
]);
const SIGNED_ROUTE_HINT =
  "A push approval that verifies for THIS commit, THIS remote and THIS destination ref lifts GG-03 with no token and no " +
  `typed phrase (record one: node ${pipelineStateScriptRef()} approve-push --by <name> --remote <remote> ` +
  "--destination <full-ref> --proof-request <path> --proof-authority <path> --proof <path>). The push must write its " +
  "destination out (`HEAD:refs/heads/<branch>`): an approval names a ref, and a command that names none cannot be matched against it.";
function parseAttestablePush(rawCmd) {
  let single = false;
  let double = false;
  let escaped = false;
  for (const ch of rawCmd) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && !single) { escaped = true; continue; }
    if (!single && (ch === "$" || ch === "`" || "*?[]{}~".includes(ch))) {
      return { ok: false, reason: "the command contains shell expansion or glob syntax" };
    }
    if (ch === "'" && !double) single = !single;
    else if (ch === '"' && !single) double = !double;
  }
  if (single || double || escaped) return { ok: false, reason: "the command's quoting is incomplete or ambiguous" };
  if (/&&|\|\||[;|\n\r`<>]|\$\(/.test(stripQuotedSegments(rawCmd))) {
    return { ok: false, reason: "the push must be a standalone command (no shell bundle, pipe, redirection or substitution)" };
  }
  const tokens = tokenizeArgv(rawCmd);
  if (tokens[0]?.toLowerCase() !== "git") return { ok: false, reason: "the command is not a bare `git` invocation" };
  let i = 1;
  // A `-C <path>` is tolerated here ONLY because overrideTarget() proves separately that
  // every git invocation in the command names the one coordinator root; any other global
  // repository override is refused below with the rest of the option surface.
  if (tokens[i] === "-C") i += 2;
  if (tokens[i]?.toLowerCase() !== "push") {
    return { ok: false, reason: "only `git [-C <path>] push` can be matched against an approval" };
  }
  i += 1;
  const positionals = [];
  for (; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (PUSH_SAFE_FLAGS.has(token)) continue;
    if (token.startsWith("-")) return { ok: false, reason: "the push carries an option that cannot be bound to one source commit" };
    positionals.push(token);
  }
  if (positionals.length !== 2) {
    return { ok: false, reason: "the push must name exactly one remote and exactly one explicit `<source>:<destination>` refspec" };
  }
  const [remote, refspec] = positionals;
  const colon = refspec.indexOf(":");
  if (colon === -1) return { ok: false, reason: "the push does not write out its destination ref" };
  const source = refspec.slice(0, colon);
  const destination = refspec.slice(colon + 1);
  if (!remote || !source || !destination || source.startsWith("+")) {
    return { ok: false, reason: "the refspec is deleting, forced, or source-ambiguous" };
  }
  return { ok: true, remote, source, destination };
}
async function admitSignedPush() {
  const binding = parseAttestablePush(cmd);
  if (!binding.ok) {
    return { admitted: false, note: `Signed-approval route: not applicable — ${binding.reason}. ${SIGNED_ROUTE_HINT}` };
  }
  const target = overrideTarget();
  if (!target.ok) {
    return {
      admitted: false,
      note: `Signed-approval route: not applicable — command target and audit target are not one confirmed physical project. ${SIGNED_ROUTE_HINT}`,
    };
  }
  const commit = gitObjectId(target.root, ["rev-parse", "--verify", "--end-of-options", `${binding.source}^{commit}`]);
  const tree = commit === null ? null : gitObjectId(target.root, ["rev-parse", "--verify", "--end-of-options", `${commit}^{tree}`]);
  if (commit === null || tree === null) {
    return { admitted: false, note: `Signed-approval route: refused (PUSH-PROOF-CANDIDATE-UNRESOLVED). ${SIGNED_ROUTE_HINT}` };
  }
  let state;
  try {
    state = JSON.parse(readFileSync(join(projectDir, guardStateRelPath), "utf8"));
  } catch {
    return { admitted: false, note: `Signed-approval route: refused (PUSH-PROOF-STATE-UNREADABLE). ${SIGNED_ROUTE_HINT}` };
  }
  // Loaded lazily: this module chain (policy reader, request digests, Ed25519 verifier) is
  // needed by roughly no Bash call at all, and this hook runs on every one of them.
  const { authorizeRecordedPush } = await import("../lib/critical-action-authorization.mjs");
  const verdict = authorizeRecordedPush({
    projectDir,
    anchorDir: projectDir, // the governed session root IS the confirmed target here
    state,
    candidate: { commit, tree },
    remote: binding.remote,
    destination: binding.destination,
    now: new Date().toISOString(),
  });
  if (verdict.authorized !== true) {
    return { admitted: false, note: `Signed-approval route: refused (${verdict.code}). ${SIGNED_ROUTE_HINT}` };
  }
  // The authorization this admission relied on, in the same ledger as every override — with
  // the raw command deliberately reduced to its digest. `remote` is any positional the
  // command supplied and can be a credential-bearing URL (SEC-01, and the reason guard-push
  // refuses to echo it either); the audit question here is "which approval did I believe",
  // which the fields below answer without transporting the operand.
  const appended = appendLedger({
    ts: new Date().toISOString(),
    rule: "GG-03",
    route: "signed-push-approval",
    reason: "a verified human push approval for this candidate, remote and destination ref",
    commandSha256: sha256(cmd),
    candidateCommit: commit,
    status: "authorized",
    keyReference: verdict.keyReference,
    forCommit: commit,
    destination: binding.destination,
    targetSha256: target.sha256,
  }, target);
  if (!appended) {
    return {
      admitted: false,
      note: `Signed-approval route: NOT applied — the audit ledger (${guardAuditRelPath}) could not be written, so the ` +
        "verified approval is not acted on (fail-closed, exactly like an override without an audit record).",
    };
  }
  return { admitted: true, keyReference: verdict.keyReference, forCommit: commit, destination: binding.destination };
}

// ---- override mechanism: Phoenix canonical human authority ----------------------------
// Restored from 998a609 (dropped wholesale by the 0.5.2 integration merge 75b8361). In a
// Phoenix-governed repository an agent-invented one-time token is NOT authority: the
// override additionally requires a checkpoint-bound canonical human-governance decision,
// scoped to this exact repository, candidate, rule and guard artifact digest, and it is
// consumed in the append-only human stream. This ADDS a requirement on top of the local
// consumption ledger below — it must FALL THROUGH to that ledger's per-command binding,
// retry admission and TTL rather than exiting in its place, or Phoenix governance would
// create a second, weaker way to permit the same class of command the ledger below
// refuses (fixed 2026-08-27: an earlier version exited immediately on a successful
// Phoenix consumption, so the local ledger's commandSha256/candidateCommit/target binding
// and audit record were never reached for a Phoenix admission). The canonical decision's
// OWN scope binds repository/candidate/packageId/action/environment/artifacts but not the
// literal command text, so it is deliberately treated as single-shot here too: this block
// always re-attempts consumption fresh (it never skips based on the local ledger's retry
// admission), so a second presentation of the identical command is refused by the
// canonical decision's own single-use disposition before the local ledger is even
// consulted — the local ledger's retry admission therefore only ever matters for
// non-Phoenix overrides. `nowEpochMs`/`observedAtEpochMs` sent to the governance-authority
// CLI are this process's own clock reading, never the agent-supplied reference file's
// claim, so the canonical decision's TTL cannot be defeated by an agent asserting a
// friendlier "now".
function exactKeys(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function phoenixGovernedProject() { return existsSync(join(projectDir, "governance", "events", "registry.json")); }
function currentCandidate() {
  const invoked = spawnSync("git", ["-C", projectDir, "rev-parse", "HEAD", "HEAD^{tree}"], { encoding: "utf8", timeout: 5000 });
  const lines = invoked.status === 0 ? invoked.stdout.trim().split("\n") : [];
  return lines.length === 2 && /^[a-f0-9]{40,64}$/u.test(lines[0]) && /^[a-f0-9]{40,64}$/u.test(lines[1]) ? { commit: lines[0], tree: lines[1] } : null;
}
function readPhoenixOverrideReference(reference) {
  if (typeof reference !== "string" || reference === "" || reference.length > 512) return null;
  let value;
  try { value = JSON.parse(readFileSync(reference, "utf8")); } catch { return null; }
  if (!exactKeys(value, ["schema", "authorityRequest", "consumption"]) || value.schema !== PHOENIX_OVERRIDE_REFERENCE_SCHEMA
    || !exactKeys(value.authorityRequest, ["schema", "repositoryFingerprint", "decisionId", "candidate", "checkpoint", "nowEpochMs"])
    || value.authorityRequest.schema !== "pipeline.governance-authority-request.v1"
    || !exactKeys(value.consumption, ["decisionId", "eventId", "idempotencyKey", "observedAtEpochMs"])) return null;
  return value;
}
function invokeGovernanceAuthority(flag, request) {
  const invoked = spawnSync(process.execPath, [GOVERNANCE_AUTHORITY_CLI, "--repo", projectDir, flag, JSON.stringify(request)], { encoding: "utf8", timeout: 5000 });
  if (invoked.status !== 0) return null;
  try { return JSON.parse(invoked.stdout); } catch { return null; }
}
function consumePhoenixOverrideAuthority(reference, rule) {
  const expectedCandidate = currentCandidate();
  if (!expectedCandidate) return "the current repository candidate could not be read";
  // `nowEpochMs` drives the canonical decision's own TTL check (resolveHumanGovernanceAuthority
  // denies "expired" once nowEpochMs > validity.expiresAtEpochMs); it is deliberately this
  // process's real clock reading, never `reference.authorityRequest.nowEpochMs` as parsed from
  // the agent-supplied reference file, or an agent could assert a friendlier "now" and defeat
  // the TTL entirely. The rest of authorityRequest is untouched -- only the trust-sensitive
  // clock field is substituted.
  const authority = invokeGovernanceAuthority("--request-json", { ...reference.authorityRequest, nowEpochMs: Date.now() });
  const scope = authority?.scope;
  let guardDigest;
  try { guardDigest = createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"); } catch { return "the guarded artifact digest could not be read"; }
  if (authority?.granted !== true || authority.decisionId !== reference.authorityRequest.decisionId
    || !exactKeys(scope, ["repositoryFingerprint", "candidate", "packageId", "action", "environment", "artifacts"])
    || !exactKeys(scope.candidate, ["commit", "tree"])
    || scope.candidate.commit !== expectedCandidate.commit || scope.candidate.tree !== expectedCandidate.tree
    || scope.action !== `OVERRIDE.${rule}` || scope.environment !== "local"
    || !Array.isArray(scope.artifacts) || !scope.artifacts.some((artifact) => exactKeys(artifact, ["path", "sha256"]) && artifact.path === "plugins/pipeline-core/hooks/guard-git.mjs" && artifact.sha256 === guardDigest)) {
    return "the canonical human-governance decision does not authorize this exact override tuple";
  }
  const consume = {
    schema: "pipeline.governance-authority-consume-request.v1",
    repositoryFingerprint: reference.authorityRequest.repositoryFingerprint,
    decisionId: authority.decisionId,
    decisionDigest: authority.decisionDigest,
    candidate: expectedCandidate,
    checkpoint: reference.authorityRequest.checkpoint,
    // Same substitution as above and for the same reason: the liveness re-check performed
    // under the append lock (human-governance-ledger.mjs assertAppend) re-runs the TTL check
    // against this value, so it must be real time too, not `reference.consumption.observedAtEpochMs`.
    observedAtEpochMs: Date.now(),
    consumption: {
      decisionId: reference.consumption.decisionId,
      eventId: reference.consumption.eventId,
      idempotencyKey: reference.consumption.idempotencyKey,
    },
  };
  const consumed = invokeGovernanceAuthority("--consume-request-json", consume);
  if (consumed?.consumed !== true || consumed.outcome !== "appended" || consumed.decisionId !== authority.decisionId) return "the canonical human-governance decision could not be consumed";
  return null;
}
// Adapted, NOT verbatim: at 998a609 the authority reference was a fourth segment produced
// by splitOverrideValue. That parser is a merge-introduced binding whose three-segment
// contract (guardrails/git.md GIT-04, "the reason may itself contain |") the protected
// suite relies on, so it stays untouched; the same split is performed one level later and
// only on the Phoenix path. Semantics are identical to 998a609:531-543: everything before
// the third "|" is the reference, everything after it is the reason. Both halves must be
// non-empty, otherwise there is no reference and the fail-closed block below fires.
function phoenixAuthorityArming(reasonSegment) {
  const thirdPipe = reasonSegment.indexOf("|");
  if (thirdPipe === -1) return { reference: null, reason: reasonSegment };
  const reference = reasonSegment.slice(0, thirdPipe);
  const reason = reasonSegment.slice(thirdPipe + 1);
  return reference === "" || reason === "" ? { reference: null, reason } : { reference, reason };
}

// ---- verdict -------------------------------------------------------------------------
function formatBlockHeader(rule) {
  return (
    `BLOCKED (git-guard, plugin pipeline-core): ${rule.why}\n` +
    `Rule ID: ${rule.id}\n` +
    `Rule origin: ${rule.origin}\n` +
    `Command: ${cmd}`
  );
}
function overrideProcedureText(rule) {
  const phoenixReference = phoenixGovernedProject()
    ? `\n  Phoenix:    PIPELINE_GUARD_OVERRIDE="${rule.id}|<token>|<authority-reference.json>|<reason>" <command>\n  The reference must resolve and consume a canonical decision scoped to OVERRIDE.${rule.id}.`
    : "";
  return (
    `Override: if this is genuinely intended, run the double-confirmation procedure (guardrails/git.md GIT-04) — ` +
    `explain the command and the reason, get the PO's confirmation, then their explicit "OVERRIDE ${rule.id}", ` +
    `then arm and re-run:\n` +
    `  Bash:       PIPELINE_GUARD_OVERRIDE="${rule.id}|<token>|<reason>" <command>\n` +
    `  PowerShell: $env:PIPELINE_GUARD_OVERRIDE='${rule.id}|<token>|<reason>'; <command>` + phoenixReference + `\n` +
    `Fallback (mechanism unavailable): the PO runs the command manually in their own terminal — the guard binds agents, not humans.`
  );
}
function emit(code, lines) {
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(code);
}
function blockNormal(rule) {
  const lines = [formatBlockHeader(rule), overrideProcedureText(rule)];
  if (arming?.malformed) {
    lines.push(`[git-guard] WARN: override malformed (${arming.reason}) -> ignored, rule evaluation unaffected.`);
  }
  lines.push(...notices);
  emit(2, lines);
}
function blockOverrideConsumed(rule, priorEntry) {
  const lines = [
    formatBlockHeader(rule),
    `Override rejected: the token "${arming.token}" for rule ${arming.rule} was already consumed ` +
      `(one-time use${priorEntry?.ts ? `, at ${priorEntry.ts}` : ""}) — arm a fresh token.`,
    "An arming is re-presentable only for the byte-identical command, against the same candidate commit, in the same " +
      "physical project, and before it expires; anything else is a second authorized act and needs a second authorization.",
    overrideProcedureText(rule),
    ...notices,
  ];
  emit(2, lines);
}
function blockLedgerFailure(rule) {
  const lines = [
    formatBlockHeader(rule),
    `Override NOT applied: the audit ledger (${guardAuditRelPath}) could not be written — ` +
      `fail-closed, an override without an audit record is never applied.`,
    overrideProcedureText(rule),
    ...notices,
  ];
  emit(2, lines);
}
function blockTargetBindingFailure(rule) {
  emit(2, [
    formatBlockHeader(rule),
    "Override NOT applied: command target and ledger target are not one confirmed physical project — fail-closed.",
    overrideProcedureText(rule),
    ...notices,
  ]);
}
function allowWithOverride(status, expiresAt) {
  const lines = [
    status === "retry"
      ? `[git-guard] OVERRIDE APPLIED (retry of the same arming — identical command, same candidate, valid until ${expiresAt}): rule ${arming.rule}, token ${arming.token}.`
      : `[git-guard] OVERRIDE APPLIED (one-time, this arming is valid until ${expiresAt} for this exact command and candidate): rule ${arming.rule}, token ${arming.token}.`,
    `Reason: ${arming.reason}`,
    `Ledger: ${guardAuditRelPath} (appended).`,
    ...notices,
  ];
  emit(1, lines);
}
// Restored from 998a609:722-724 (verbatim) — the Phoenix authority refusal.
function blockHumanAuthorityFailure(rule, reason) {
  emit(2, [formatBlockHeader(rule), `Override NOT applied: ${reason}.`, overrideProcedureText(rule), ...notices]);
}
// Adapted from 998a609:725-735: at 998a609 this was the canonicalAuthority=true branch of
// allowWithOverride, and it used to exit here directly. It no longer does (2026-08-27 fix):
// a Phoenix admission must still pass through the local consumption ledger below (per-command
// binding, retry admission, TTL, and an actual audit record) exactly like a local-token
// admission — this function only records that the additional canonical-decision requirement
// was satisfied and lets control fall through; `arming.reason` is narrowed from the raw
// "<reference>|<reason>" pair to just the clean reason so the ledger entry and the eventual
// allow message below record the human-readable reason, not the reference file path.
function noteConsumedPhoenixAuthority(reason) {
  notices.push(
    `[git-guard] Phoenix canonical human-governance decision consumed (additional requirement, one-time): rule ${arming.rule}, token ${arming.token}.`,
  );
  arming = { ...arming, reason };
}

// All deny rules are always evaluated; consumption is decided on the FINAL verdict
// (evaluation order and consumption semantics) — never exit on first match.
// ---- GIT-03: correlation data must not enter commit metadata -------------------------
//
// Deliberately evaluated BEFORE the deny-rule union and deliberately NOT overridable. The
// override mechanism exists for rules whose violation is recoverable; this one's is not.
// A commit that reaches a public remote carrying a session URL cannot be un-published, and
// this repository has the receipts: 53 of 74 such commits were already public and
// unrewritable by the time a human noticed by reading them.
//
// The marker half (`AI-Assisted: true`) is config-gated and defaults to off -- see
// ../lib/commit-message-policy.mjs for why the two halves are not the same kind of rule.
let inspection;
{
  const markerMode = markerPolicyMode(projectConfig);
  inspection = commitMessageFindings(cmd, {
    readFile: (path) => {
      // Message files are resolved against the invoking PROCESS cwd, not CLAUDE_PROJECT_DIR.
      // In a worktree-isolated subagent, CLAUDE_PROJECT_DIR (== projectDir above) is the MAIN
      // checkout while the process cwd is the worktree -- a `-F scratch/msg.txt` written inside
      // the worktree was looked for in the main checkout and refused as
      // GIT-03-UNREADABLE-MESSAGE-FILE even though the file existed (2026-08-28, backlog/items/
      // 2026-08-28-a-relative-commit-message-file-is-unreadable-from-a-worktree.md). The
      // containment boundary is likewise derived from the cwd's OWN repository root (`git
      // rev-parse --show-toplevel`, which inside a worktree yields the worktree itself, never
      // the main checkout) rather than projectDir -- deliberately narrower than "anything under
      // the main root", which would admit a sibling worktree's files. A cwd that is not inside a
      // git repository at all (e.g. a hermetic test fixture) falls back to the cwd itself. A `-F
      // ../../elsewhere` is still not followed: this check exists to read what is about to be
      // committed here. A refusal here is not a pass -- commitMessageFindings reports it as
      // GIT-03-UNREADABLE-MESSAGE-FILE, a blocking finding, precisely because "outside the
      // project" is where an agent's own scratch directory usually lives (2026-08-06 Critic
      // round, F3).
      const commitCwd = process.cwd();
      let commitRoot = resolve(commitCwd);
      const toplevel = spawnSync("git", ["-C", commitCwd, "rev-parse", "--show-toplevel"], { encoding: "utf8", shell: false, timeout: 5000 });
      if (!toplevel.error && toplevel.status === 0) {
        const out = String(toplevel.stdout ?? "").trim();
        if (out) commitRoot = resolve(out);
      }
      const absolute = resolve(commitCwd, path);
      if (!absolute.startsWith(`${commitRoot}${sep}`) && absolute !== commitRoot) {
        throw new Error("outside the project");
      }
      return readFileSync(absolute, "utf8");
    },
    requireMarker: markerMode !== "off",
  });
  const blocking = inspection.findings.filter((f) => f.code !== "GIT-03-MARKER-MISSING" || markerMode === "blocking");
  const warningOnly = inspection.findings.filter((f) => f.code === "GIT-03-MARKER-MISSING" && markerMode === "warn");
  if (blocking.length > 0) {
    emit(2, [
      `BLOCKED (git-guard GIT-03, plugin pipeline-core): this commit message carries ${blocking.map((f) => f.detail).join(" and ")}.`,
      `Codes: ${blocking.map((f) => f.code).join(", ")}. Inspected: ${inspection.sources.join(", ")}.`,
      "guardrails/git.md GIT-03: the anonymous `AI-Assisted: true` marker is the COMPLETE assistance signal.",
      "Provider or model co-author trailers, session URLs or IDs, and account identifiers turn public history into a correlation index, and public history cannot be unpublished.",
      "There is no override for this rule. Rewrite the message.",
    ]);
  }
  if (warningOnly.length > 0) {
    notices.push("[git-guard] WARN: commit message carries no `AI-Assisted: true` line (GIT-03; commitTrailerPolicy is \"warn\").");
  }
}

// ---- GIT-01: the commit subject must start with an admitted Conventional Commit type -------
//
// Independent from GIT-03 above: `emit()` calls `process.exit()`, so this only runs at all
// when the GIT-03 block above did not already exit. `inspection.message === null` correctly
// skips the check for an editor commit (CMP7's "not looked at, never clean" case) and for a
// non-`git commit` command -- no new special-casing needed.
if (inspection.message !== null) {
  const subjectLine = inspection.message.split("\n")[0];
  const typeCheck = commitTypeFindings(subjectLine);
  if (typeCheck.findings.length > 0) {
    emit(2, [
      `BLOCKED (git-guard GIT-01, plugin pipeline-core): ${typeCheck.findings.map((f) => f.detail).join(" and ")}.`,
      `Codes: ${typeCheck.findings.map((f) => f.code).join(", ")}.`,
      "guardrails/git.md GIT-01: the subject line must start with an admitted Conventional Commit type.",
      "Rewrite the message with an admitted type prefix (feat/fix/docs/refactor/test/chore/build/ci/perf/style).",
    ]);
  }
}

// ---- GG-22: a commit must not leave an earlier backlog status-flip unreconciled since ----
// the last backlog/transitions.ndjson touch -------------------------------------------------
//
// Stateless, recomputed fresh every invocation from repository STATE (staged diff + recent
// history) -- shells out to git via spawnSync exactly like the GG-03 push-verification code
// above (`gitObjectId`), never a regex against the raw command text. Debt detection is bounded
// to commits since the last reconciliation, never a scan of the whole item corpus. This is a
// plain deny, never wired into the override-arming machinery: the fix is always cheap and
// mechanical (run reconcile-backlog-ledger.mjs --activate, then commit its output), so there
// is no legitimate reason an agent would need to bypass it with `OVERRIDE GG-22`.
//
// Gated on `inspection.message !== null` (already computed above for GIT-03/GIT-01) rather
// than a fresh isGitCommit() call: that helper is private to ../lib/commit-message-policy.mjs
// (not exported), so re-deriving "is this a git commit" here would duplicate GIT-01's already-
// landed detection instead of reusing it. Same accepted edge case GIT-01 already lives with one
// block above: an editor-invoked commit with no -m/-F/heredoc message is not inspected
// (`inspection.message === null`) and is therefore not gated by GG-22 either -- this
// repository's own commit discipline (guard-lifecycle-ready's one-simple-command grammar)
// already requires -m/-F for every agent-issued commit, so this is not a practical gap for the
// agents this guard governs.
if (inspection.message !== null) {
  try {
    const root = resolve(projectDir);
    const run = (args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 5000 });

    const lastReconcileRun = run(["log", "-1", "--format=%H", "--", "backlog/transitions.ndjson"]);
    if (lastReconcileRun.error) throw lastReconcileRun.error;
    // Bootstrap case: the ledger file has never been touched in this repository's history --
    // no-op the rule entirely until it exists once, rather than diffing against an empty ref.
    const lastReconcile = lastReconcileRun.status === 0 ? String(lastReconcileRun.stdout ?? "").trim() : "";
    if (lastReconcile !== "") {
      const range = `${lastReconcile}..HEAD`;
      const touchedRun = run(["diff", "--name-only", range, "--", "backlog/items/"]);
      if (touchedRun.error) throw touchedRun.error;
      const itemsTouchedSinceReconcile = touchedRun.status === 0
        ? String(touchedRun.stdout ?? "").split("\n").map((line) => line.trim()).filter(Boolean)
        : [];

      // Mirrors the frontmatter `status:` key check-backlog-state.mjs/reconcile-backlog-ledger.mjs
      // already parse; a `-status: <old>` line paired with a differently-valued `+status: <new>`
      // line in the same file's diff is a real status change. A Triage-only edit never touches
      // this line, so it never creates debt.
      const STATUS_DIFF_LINE = /^([+-])status:\s*(.+?)\s*$/;
      const debtPaths = [];
      for (const path of itemsTouchedSinceReconcile) {
        const fileDiffRun = run(["diff", range, "--", path]);
        if (fileDiffRun.error) throw fileDiffRun.error;
        if (fileDiffRun.status !== 0) continue;
        let removedStatus = null;
        let addedStatus = null;
        for (const line of String(fileDiffRun.stdout ?? "").split("\n")) {
          const match = STATUS_DIFF_LINE.exec(line);
          if (!match) continue;
          if (match[1] === "-") removedStatus = match[2];
          else addedStatus = match[2];
        }
        if (removedStatus !== null && addedStatus !== null && removedStatus !== addedStatus) debtPaths.push(path);
      }

      if (debtPaths.length > 0) {
        // Scope the check to the paths THIS COMMIT actually names, not the shared index
        // (marker: pipeline.gg-22-scopes-debt-check-to-the-commit-pathspec;
        // backlog/items/2026-09-03-gg-22-reads-the-shared-index-so-a-concurrent-dispatch-blocks-an-unrelated-ledger-commit.md).
        // Under concurrent dispatch the index holds every agent's staged work, not just
        // this commit's own content -- reading `git diff --cached` unconditionally made an
        // unrelated agent's staged files block a correct, narrowly-pathspec'd ledger commit,
        // and each side's remediation was the other side's forbidden action (a genuine
        // deadlock, not a delay).
        //
        // `tokenizeArgv` is the SAME tokenizer already imported and used by
        // commitMessageFindings (above, GIT-03/GIT-01) to confirm this command is a git
        // commit -- reused here, not re-derived. This block does not re-answer "is this a
        // commit" (already known: we are inside `inspection.message !== null`); it only
        // asks a NEW question that block never needed: did the commit name an explicit
        // pathspec? Per this repository's own commit discipline (agent-obligations.md
        // §6: `git commit -F <msgfile> -- <paths>`), a pathspec always follows a literal
        // `--` token. A `-m`/`--message`/`-F`/`--file` flag consumes the token immediately
        // after it as its VALUE, so a `--` occurring there is message content, not a
        // separator, and is skipped when locating the real one.
        const commitTokens = tokenizeArgv(cmd);
        const PATHSPEC_VALUE_CONSUMING_FLAGS = new Set(["-m", "--message", "-F", "--file"]);
        let separatorIndex = -1;
        for (let idx = 0; idx < commitTokens.length; idx += 1) {
          if (commitTokens[idx] !== "--") continue;
          if (idx > 0 && PATHSPEC_VALUE_CONSUMING_FLAGS.has(commitTokens[idx - 1])) continue;
          separatorIndex = idx;
          break;
        }
        // Strip a leading "./" only (never resolve "../") so `-- ./backlog/STATUS.md`
        // compares equal to the repo-relative form the ledger/backlog-items checks below
        // expect -- without it, a harmless "./" prefix would false-block a legitimate
        // pathspec'd commit the old, staged-index-only code never had to worry about.
        const explicitPathspec = separatorIndex === -1
          ? null
          : commitTokens.slice(separatorIndex + 1)
              .map((token) => token.trim())
              .filter(Boolean)
              .map((token) => (token.startsWith("./") ? token.slice(2) : token));

        // A bare `git commit` (no pathspec, or a trailing `--` naming none) commits
        // whatever is staged -- the staged index genuinely IS this commit's content, so
        // `git diff --cached` remains the right question for that case, unchanged from
        // before this fix.
        let commitPaths;
        if (explicitPathspec !== null && explicitPathspec.length > 0) {
          commitPaths = explicitPathspec;
        } else {
          const stagedRun = run(["diff", "--cached", "--name-only"]);
          if (stagedRun.error) throw stagedRun.error;
          commitPaths = stagedRun.status === 0
            ? String(stagedRun.stdout ?? "").split("\n").map((line) => line.trim()).filter(Boolean)
            : [];
        }
        const LEDGER_PATHS = new Set(["backlog/transitions.ndjson", "backlog/STATUS.md", "backlog/index.json"]);
        // Allowed set = every backlog/items/*.md path (any item, not just debtPaths -- batched
        // multi-item closures across several commits before one shared reconciliation commit
        // are an established, legitimate pattern) UNION the ledger files themselves.
        const disallowed = commitPaths.filter((path) => !path.startsWith("backlog/items/") && !LEDGER_PATHS.has(path));
        if (disallowed.length > 0) {
          // Remediation order (marker: pipeline.gg-22-remediation-order-is-reconcile-last;
          // backlog/items/2026-08-29-gg-22s-own-remediation-order-creates-unclearable-ledger-debt.md):
          // item edits commit FIRST (batching several closures into one commit is fine), the
          // reconciler runs ONCE, and the ledger commit lands LAST. The inverse order (reconcile
          // before every pending item edit is committed) makes the reconciler consume working-tree
          // transitions that have not landed yet, so committing those item edits afterwards creates
          // fresh, unreconcilable debt -- confirmed live 2026-08-29. This mirrors the comment above:
          // "batched multi-item closures across several commits before one shared reconciliation
          // commit are an established, legitimate pattern."
          emit(2, [
            `BLOCKED (git-guard GG-22, plugin pipeline-core): an earlier commit changed ` +
              `${debtPaths.join(", ")}'s status without a matching ledger reconciliation since ` +
              `${lastReconcile || "repository start"}.`,
            "Commit any pending backlog/items/ status edits first (batching several closures into one commit is fine),",
            "then run: node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate",
            "then commit the resulting backlog/STATUS.md / backlog/index.json / backlog/transitions.ndjson changes last.",
          ]);
        }
      }
    }
  } catch {
    // fail-open: guard is a safety net, not a prison (matches this file's existing discipline) --
    // any spawnSync error, timeout, or unexpected git output must never itself become a source
    // of an unrecoverable stuck repository.
  }
}

const matched = [];
for (const rule of UNION_BLOCKERS) if (rule.re.test(normalizedC)) matched.push(rule);
for (const rule of RAW_BLOCKERS) if (rule.re.test(rawForQuoteRules)) matched.push(rule);
for (const rule of PRENORM_BLOCKERS) if (rule.re.test(c)) matched.push(rule);
for (const rule of EXTRA_BLOCKERS) if (rule.re.test(normalizedStripped)) matched.push(rule);

if (matched.length > 0) {
  const overrideCoversAll = arming && !arming.malformed && matched.every((r) => r.id === arming.rule);
  // The signed-push route runs only where the token ritual is the ONLY thing standing
  // between a verified human approval and the push it names: GG-03 alone, no arming of any
  // kind in play. Anything else falls through to the mechanism below, unchanged.
  let signed = null;
  if (armingRaw === null && matched.every((r) => r.id === "GG-03")) {
    try {
      signed = await admitSignedPush();
    } catch {
      signed = { admitted: false, note: "Signed-approval route: refused (PUSH-PROOF-ROUTE-ERROR) — the admission path threw, so the rule stands." };
    }
  }
  if (signed?.admitted) {
    emit(0, [
      `[git-guard] GG-03 lifted by a verified push approval (key ${signed.keyReference}) for candidate ${signed.forCommit} -> ${signed.destination}.`,
      `Audit: ${guardAuditRelPath} (appended). No override token was armed or consumed.`,
      ...notices,
    ]);
  }
  if (signed) notices.push(signed.note);
  if (overrideCoversAll) {
    const target = overrideTarget();
    if (!target.ok) blockTargetBindingFailure(matched[0]);
    // Phoenix-governed repository: the target binding above is necessary but NOT
    // sufficient. Restored from 998a609:748-753 — an ADDITIONAL requirement layered on top
    // of the local consumption ledger below, never a replacement for it (2026-08-27 fix: it
    // used to `emit()`/exit here on success, so the ledger's per-command binding, retry
    // admission and TTL below were never reached for a Phoenix admission — this can now only
    // ADD to what the ledger below permits/refuses; every exit in this block is still
    // emit()'d, and a success here falls through instead of exiting). This block always
    // re-attempts consumption fresh rather than skipping on a would-be retry: the canonical
    // decision is single-use at its own layer, so a second presentation of the identical
    // command is refused right here by the decision's own disposition, before the local
    // ledger's retry admission is ever consulted.
    if (phoenixGovernedProject()) {
      const phoenix = phoenixAuthorityArming(arming.reason);
      const authorityReference = readPhoenixOverrideReference(phoenix.reference);
      if (!authorityReference) blockHumanAuthorityFailure(matched[0], "a closed Phoenix authority reference is required");
      const authorityFailure = consumePhoenixOverrideAuthority(authorityReference, arming.rule);
      if (authorityFailure) blockHumanAuthorityFailure(matched[0], authorityFailure);
      noteConsumedPhoenixAuthority(phoenix.reason);
    }
    const prior = findConsumption(arming.rule, arming.token, target);
    const armedAt = new Date();
    const commandSha256 = sha256(cmd);
    const candidateCommit = observedCandidateCommit(target);
    const retry = prior !== null
      && admitsRetry(prior, { commandSha256, candidateCommit, target, nowMs: armedAt.getTime() });
    if (prior && !retry) {
      blockOverrideConsumed(matched[0], prior);
    } else {
      // A retry never extends the window: the lifetime belongs to the FIRST admission.
      const expiresAt = retry
        ? prior.expiresAt
        : new Date(armedAt.getTime() + overrideArmingTtlSeconds() * 1000).toISOString();
      const appended = appendLedger({
        ts: armedAt.toISOString(),
        rule: arming.rule,
        token: arming.token,
        reason: arming.reason,
        command: cmd,
        commandSha256,
        candidateCommit,
        status: retry ? "retry" : "armed",
        expiresAt,
        targetSha256: target.sha256,
      }, target);
      if (appended) allowWithOverride(retry ? "retry" : "armed", expiresAt);
      else blockLedgerFailure(matched[0]);
    }
  } else {
    const blocking = arming && !arming.malformed ? (matched.find((r) => r.id !== arming.rule) ?? matched[0]) : matched[0];
    blockNormal(blocking);
  }
} else {
  if (arming?.malformed) {
    notices.push(`[git-guard] WARN: override malformed (${arming.reason}) -> ignored, rule evaluation unaffected.`);
  }
  if (notices.length > 0 && warnings.length === 0) {
    emit(1, notices);
  }
  if (warnings.length > 0) {
    emit(1, [
      ...notices,
      `[git-guard] WARN in ${configPath}: ${warnings.join("; ")}\n` +
        `Fail-open: command NOT blocked, union rules stayed active — but project denies may be missing. Fix the guard-config.`,
    ]);
  }
  process.exit(0);
}
