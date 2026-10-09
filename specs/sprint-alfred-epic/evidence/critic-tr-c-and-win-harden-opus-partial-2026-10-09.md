# Critic reports: TR-C (Opus, G) and WIN-HARDEN (Opus, S), first rounds, both PARTIAL — 2026-10-09

Persisted by the Elephant (the Critics have no Write tool). Both were stopped by the budget hook at counted call 20 of
an enforced 25 (the briefings said 30 + 5). Route pre-checks passed (`claude-opus-5-5`, from the runtime prompt).
Verdicts withheld.

## TR-C (`4e661fe61`, `1774bf07a`, `162bf1468`) — findings so far, all minor

- **F1** `--trailer` in `PATHSPEC_EXCLUSIVE_SAFE_VALUE_FLAGS` feeds the look-behind skip at post-image
  `hooks/guard-git.mjs:1308`, which treats a token as a value whenever the previous token is a value-taking flag, even
  if that token was itself consumed as a value. `git commit -m "…" --trailer --trailer -i -- <ledger>` keeps
  `pathspecIsExclusive` true (`:1333-1334`) while git reads `-i` as `--include`. The same capability already exists via
  `-m -m -i` (`:1258`), so the diff adds spellings, not a capability; the claims "a source-path pathspec and `-i` still
  block" and "widens nothing (I3)" hold only for the pinned order. Root cause: a pre-existing GG-22 fail-open at `:1308`.
- **F2** `TR-C-F-MANIFEST.md:108-110` tells the ceremony to compare `git hash-object <target>` with 64-hex sha256
  digests (`:17-18`); no git blob id of either guard pre-image is recorded, so the stale-base check cannot pass as
  written.
- **F3** The new `Why:` line is emitted on every `!pushBinding.ok` refusal (post-image `hooks/guard-push.mjs` ~1797-1804)
  but its cause (markers / nested shell) is true only for the expansion, quoting and bundle reasons (`:395`, `:400`,
  `:404`), false for the prefix, global-option, `-C`, push-option, refspec and repository reasons (`:408-451`).
- **F4** `--help` was added to `GIT_GLOBAL_OPT_FLAG` (`lib/git-cmd.mjs`, in place, live) with no pin; row T85 names only
  `--version`/`version`; two consumers of `normalizeGlobalGitOptions` were not run. No push widening by reading.
- **F5 (provisional)** `TR-C-MANIFEST.md:21` carries a machine-specific absolute WSL path, against its own `:5`.
- Candidate, not a finding: `TR-C-F-MANIFEST.md:3` names the implementor's model and effort.
- Cleared: spec fidelity T38/T80/T42/T51/T82/T85 and Ruling 81; scope (post-image deltas exactly as declared); relief
  needles reachable; test integrity (only the declared substitution); `--version`/`--help` edge cases; no secrets; marker
  set unchanged; QG-06; SEC-04; ADR-0011; directory contract; authorship.
- Briefing observation (accepted by the Elephant): Phase A item 6 of the dispatch named the diff's admissions — a
  dispatcher hunt pointer (toil T122).
- Not reached: TR-C-F `baseline.txt`, `git-cmd-before/after.txt`, the green.txt tail and guard-push total, guardrail files
  from disk, freshness of the live guards against the `162bf1468^` pre-images, redirect-served bytes vs committed
  post-images, `git-dangerous-policy.mjs` / `codex-pretool-guard.test.mjs`.

## WIN-HARDEN (`16057306b`, `5a72c9b61`) — no finding survived

- Established: the fix reads `Access,Owner` via `[IO.Directory]::GetAccessControl`, keeps protection, owner reset and the
  single FullControl ACE, persists once via `SetAccessControl`; resulting SDDL `D:PAI(A;OICI;FA;;;<sid>)`, protected,
  one ACE, no SACL (`mechanism.txt:29`); old routes `[0,1,1]`, new `[0,0,0]` with and without a child; production three
  of three secure at two spawns per call; a missing path is `unavailable` with a typed reason; native 12/3 → 14/1
  (WPS013 only), WSL typed skips, exit 0.
- Cleared: spec fidelity (owner persisted every call: kept pre-fix behaviour, needs WRITE_OWNER each call — residual
  note); scope; reachability (all callers use the one export); test integrity; edge cases (owner and DACL in one write;
  failure text regex-limited); security (no failure maps to `secure`; assessment after hardening still runs); QG-06;
  SEC-04; ADR-0011.
- Trajectory: consistent for the examined artifacts; after-runs at `c754022f6`, dirty, not tied to the committed state.
- Not reached: `WIN-HARDEN-T` `before.txt`/`wsl.txt`, the consumer before/after pairs, the skip reasons in
  `after-hardened-private-directory.txt`, the store failure detail (`after-governance-event-store.txt`), guardrail files,
  ADR-0063, the `registerTestCaseCompletion` accounting of the runtime skips.
