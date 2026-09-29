// SPDX-License-Identifier: SUL-1.0
// Exact shipped dangerous union, independent of governance/conventions.
import {stripQuotedSegments,normalizeGlobalGitOptions} from '../lib/git-cmd.mjs';
export const UNION_BLOCKERS = [
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

export const RAW_BLOCKERS = [
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

export const PRENORM_BLOCKERS = [
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

const BASH_ARM_RE = /^PIPELINE_GUARD_OVERRIDE=(?:'([^']*)'|"([^"]*)"|(\S+))\s+([\s\S]*)$/;
const PS_ARM_RE = /^\$env:PIPELINE_GUARD_OVERRIDE\s*=\s*(?:'([^']*)'|"([^"]*)")\s*;\s*([\s\S]*)$/i;
export function dangerousGitFindings(command) {
 if(typeof command!=='string'||!command)return [];
 const stripped=stripQuotedSegments(command).toLowerCase(),normalized=normalizeGlobalGitOptions(stripped);
 const arm=command.match(BASH_ARM_RE),ps=command.match(PS_ARM_RE);
 const raw=((arm?.[4]??ps?.[3])??command).toLowerCase();
 const configRead=/^\s*git\s+config\s+(?:(?:--local|--global|--system|--worktree|--includes|--no-includes|--show-origin|--show-scope)\s+)*(?:(?:--get|--get-all|--get-regexp|get)\s+)?core\.hookspath\s*$/;
 const segments=normalized.split(/[|&;]/);
 return [...UNION_BLOCKERS.filter(r=>r.id==='GG-20'?segments.some(segment=>r.re.test(segment)&&!configRead.test(segment)):r.re.test(normalized)),...RAW_BLOCKERS.filter(r=>r.re.test(raw)),...PRENORM_BLOCKERS.filter(r=>r.re.test(stripped))];
}
