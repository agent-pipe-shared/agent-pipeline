#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * git-guard — central PreToolUse deny-guard for Bash|PowerShell tool calls.
 *
 * Plugin: pipeline-core (Agent-Pipeline). Canon: docs/adr/0013-git-guard-union.md,
 * docs/operating-model.md §4.1 (gate honesty) + §8 (calibration).
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
 *
 *   One-time semantics: a consumption ledger `.claude/guard-override.log.jsonl` (same
 *   $CLAUDE_PROJECT_DIR lookup as guard-config.json) records one JSON line per
 *   successful override `{ts, rule, token, reason, command}`. A `rule|token` pair
 *   already in the ledger is consumed forever — re-presenting it blocks.
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
 *   HONESTY NOTE (gate honesty, operating-model §4.1/M20): the mechanism cannot
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
 * committed settings.json, NOT in .claude/pipeline.json — operating-model §8):
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
 * WHAT THIS GUARD DOES NOT BLOCK (gate honesty, operating-model §4.1 / M20)
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
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import { stripQuotedSegments, normalizeGlobalGitOptions } from "../lib/git-cmd.mjs";

// ---- read tool input (fail-open) --------------------------------------------------
let cmd = "";
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  cmd = String(input?.tool_input?.command ?? "");
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
    id: "GG-11",
    // Union of all three staging deny-lists. `.env` intentionally without trailing \b
    // so .env.local/.env.production are caught (errs safe: .env.example too).
    re: /\bgit\s+add\b[^|&;]*(\.env|secrets\.yaml\b|id_ed25519\b|id_rsa\b|\.pem\b|\.key\b)/,
    why: "Staging secrets/state (.env*, secrets.yaml, SSH keys, .pem/.key) — these never belong in a repo.",
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
    re: /\bgit\s+add\b[^|&;]*["'][^"']*(\.env|secrets\.yaml\b|id_ed25519\b|id_rsa\b|\.pem\b|\.key\b)/,
    why: "Raw-string rule: git add with a quoted protected target (GG-11 list) — quote-stripping alone would hide the staged secret.",
    origin: "quote-evasion hardening",
  },
  {
    id: "GG-16",
    // raw-string rule: recursive rm/Remove-Item with a quoted protected target.
    re: /\brm\s+(?:[^|&;]*\s)?-{1,2}[a-z]*r[a-z]*\b[^|&;]*["'][^"']*(\.git\b|\/config\b)|\bremove-item\b(?=[^|&;]*\s-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?\b)[^|&;]*["'][^"']*(\.git\b|\.storage\b|secrets\.yaml\b)/,
    why: "Raw-string rule: recursive rm/Remove-Item with a quoted protected target (.git/.storage/secrets.yaml) — quote-stripping alone would hide the target.",
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
const configPath = join(projectDir, ".claude", "guard-config.json");
const warnings = [];
/** @type {Array<{id: string, re: RegExp, why: string, origin: string}>} */
const EXTRA_BLOCKERS = [];
let rawConfig = null;
try {
  rawConfig = readFileSync(configPath, "utf8");
} catch {
  // File absent → union only. Fail-safe and silent: this is the normal case.
}
if (rawConfig !== null) {
  try {
    const cfg = JSON.parse(rawConfig);
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
          origin: "project guard-config (.claude/guard-config.json)",
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
  if (!parsed || parsed.rule === "" || parsed.token === "" || parsed.reason === "") {
    arming = { malformed: true, reason: "fewer than three segments, or an empty rule/token/reason" };
  } else if (!KNOWN_RULE_IDS.has(parsed.rule)) {
    arming = { malformed: true, reason: `rule id "${parsed.rule}" is unknown to the union and the loaded guard-config` };
  } else {
    arming = { malformed: false, rule: parsed.rule, token: parsed.token, reason: parsed.reason };
  }
}

// ---- override mechanism: consumption ledger -------------------------------------------
function ledgerPath() {
  return join(projectDir, ".claude", "guard-override.log.jsonl");
}
function readLedgerEntries() {
  let raw;
  try {
    raw = readFileSync(ledgerPath(), "utf8");
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
function findConsumption(rule, token) {
  return readLedgerEntries().find((e) => e && e.rule === rule && e.token === token) ?? null;
}
function appendLedger(entry) {
  try {
    appendFileSync(ledgerPath(), JSON.stringify(entry) + "\n");
    return true;
  } catch {
    return false; // fail-closed: caller must NOT apply the override
  }
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
  return (
    `Override: if this is genuinely intended, run the double-confirmation procedure (guardrails/git.md GIT-04) — ` +
    `explain the command and the reason, get the PO's confirmation, then their explicit "OVERRIDE ${rule.id}", ` +
    `then arm and re-run:\n` +
    `  Bash:       PIPELINE_GUARD_OVERRIDE="${rule.id}|<token>|<reason>" <command>\n` +
    `  PowerShell: $env:PIPELINE_GUARD_OVERRIDE='${rule.id}|<token>|<reason>'; <command>\n` +
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
    overrideProcedureText(rule),
    ...notices,
  ];
  emit(2, lines);
}
function blockLedgerFailure(rule) {
  const lines = [
    formatBlockHeader(rule),
    `Override NOT applied: the audit ledger (.claude/guard-override.log.jsonl) could not be written — ` +
      `fail-closed, an override without an audit record is never applied.`,
    overrideProcedureText(rule),
    ...notices,
  ];
  emit(2, lines);
}
function allowWithOverride() {
  const lines = [
    `[git-guard] OVERRIDE APPLIED (one-time): rule ${arming.rule}, token ${arming.token}.`,
    `Reason: ${arming.reason}`,
    `Ledger: .claude/guard-override.log.jsonl (appended).`,
    ...notices,
  ];
  emit(1, lines);
}

// All deny rules are always evaluated; consumption is decided on the FINAL verdict
// (evaluation order and consumption semantics) — never exit on first match.
const matched = [];
for (const rule of UNION_BLOCKERS) if (rule.re.test(normalizedC)) matched.push(rule);
for (const rule of RAW_BLOCKERS) if (rule.re.test(rawForQuoteRules)) matched.push(rule);
for (const rule of PRENORM_BLOCKERS) if (rule.re.test(c)) matched.push(rule);
for (const rule of EXTRA_BLOCKERS) if (rule.re.test(normalizedStripped)) matched.push(rule);

if (matched.length > 0) {
  const overrideCoversAll = arming && !arming.malformed && matched.every((r) => r.id === arming.rule);
  if (overrideCoversAll) {
    const prior = findConsumption(arming.rule, arming.token);
    if (prior) {
      blockOverrideConsumed(matched[0], prior);
    } else {
      const appended = appendLedger({
        ts: new Date().toISOString(),
        rule: arming.rule,
        token: arming.token,
        reason: arming.reason,
        command: cmd,
      });
      if (appended) allowWithOverride();
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
