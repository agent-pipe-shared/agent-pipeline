# Critic — PR-S1 delta (d34d89da1, 5b67e05cb; previous reviewed cf9ed9f53)

Route claude-opus-5-5, functional-equivalent-read-only. Complete review (18 tool uses). Verdict **FAIL** (one major).
Trajectory consistent (19 RED in d34d89da1 → 58/58 in 5b67e05cb; changedFiles match; trailers GIT-03 clean).

## Registry dispositions

- PR-F1: not fully resolved — see PR-D1.
- PR-F2: resolved for the enumerated forms of ruling 28(c). Name-only `export GH_REPO` and PowerShell `Set-Item env:GH_REPO`
  are outside the enumerated forms (disclosed, not flagged).
- PR-F4: resolved (two deliveries refused `DELIVERY-PR-BINDING-INCOMPLETE` across `&&`, `;` and a `sudo` wrapper).

## Findings

- PR-D1 (major): the marker rule (ruling 28b) in `hasGhMarker` (`lib/gh-cmd.mjs`, added in 5b67e05cb) requires the
  delivering subcommand to follow the gh token immediately, without skipping redirection tokens as ruling 28(a) does.
  `winpty gh 2>/dev/null pr merge 1` and `strace -f gh >/dev/null pr merge 1` classify `none`, while the pinned
  `winpty gh pr merge 1` is refused. Same class: a glued short option (`flock /tmp/l -c'gh pr merge 1'`,
  `env -S'gh pr merge 1'`) yields a token `-cgh`/`-Sgh` that fails the gh-token match and classifies `none`.
  Severity capped at major because the module is not wired yet.

## Deliberately not flagged

`echo gh pr merge 1 | sh` (unchanged behaviour, outside ruling 28); `git commit -m "document gh pr create"` refused
(disclosed fail-safe over-refusal); the cross-repo residual shapes above.

## Dispatcher disposition (2026-10-08)

Ruling 43: the marker scan skips redirection tokens exactly as ruling 28(a) does, and a glued short option of a known
command-string wrapper (`-c<payload>`, `-S<payload>`) is split into option and payload before the scan; both shapes
refuse like their spaced counterparts. Pins first (PR-S1-T3), then the fix (PR-S1-F3); per the delta-only rule the
dispatcher self-verifies after the fix (no further Critic round).
