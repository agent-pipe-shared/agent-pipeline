# Batch C5 — full Critic review, result record (2026-10-14)

Briefing: [C5-full.md](C5-full.md). Route requested and observed: claude-sonnet-5-5 at high
(the Critic quoted its own runtime prompt). Lane: functional-equivalent-read-only; OS isolation
not asserted. The Critic's own notes write was refused
(`DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE: critic-notes-partial-held`), so the Coordinator
records the returned report here.

## Outcome

**PARTIAL review — pass/fail withheld.** The Critic stopped at the 80 % budget checkpoint
(24 of 30 counted calls, 4 of them guard refusals).

| Commit | Patch | Reached | Result |
|---|---|---|---|
| `f822dcc85` | ALF-C-P1-10 | yes (both source files) | **F1 major** |
| `1db8f1f69` | ALF-C-HK-01C | diff and test text, preimage hash | no finding; producer-equivalence, callers and importer sweep **not reached** |
| `2436a1c01` | ALF-C-P2-15B | diff and preimage hash only | no finding; consumers, pin and AC-234 cross-check **not reached** |

## Finding F1 (major) — ALF-C-P1-10

The patch packages two guard-admission lanes that the item, the commit and the pin do not declare
or test:
- `isContainedGitShowObject` plus a `gitShowObject` branch in `isBoundedReadOnlyPipeline`
  (admits `git show HEAD|<hex>:PATH | head -N`);
- `isFormattedStatReadArgs` / `STAT_METADATA_FORMATS` and a stat routing block in
  `isReadOnlySimpleWords` (admits `stat -c|--format "%a %s %n"|"%a %s %h %n" <paths>`).

The Critic found no exploit on the merits (both lanes are bounded and contained), so this is major,
not a blocker. The gap is undeclared guard-tier admission widening without regression pins, which
the record the PO signs from would also omit. Spec-ref: AC-128 (delivered as its own original
acceptance states).

**Disposition (Coordinator):** P1-10 stays OUT of the 2026-10-14 interim candidate. A correction
either narrows the patch to the three rg flags or declares and pins both extra lanes; that is a
correction-diff round within the C5 budget.

## Checked and found in order (Critic)

- Preimage blobs of all four targets match HEAD.
- No unresolved identifiers in the new P1-10 code.
- rg changes: `--no-heading` output-only; `-m` bounded to 500, `=` forms still refused; repeated
  `-g` still requires the bounded filename filter and still feeds the external-recursive refusal.
- No new third-party dependency; new artifacts are English (ADR-0011).

## Trajectory

Not verifiable: GREEN counts and the timing claim have no tracked mechanical artifact. Authorship:
`2436a1c01` and `1db8f1f69` carry Dispatch plus `Commit-Act: orchestrator`; `f822dcc85` is a
stage-0 packaging commit of prepared postimages whose producing dispatch records are not retained.

## Briefing remarks (Critic)

- The criticality row characterised the risk (a hunt hint); not used as evidence.
- Commit messages carry implementor claims; treated as unverified.

## Part 2 (briefing [C5-full-part2.md](C5-full-part2.md); commits `2436a1c01`, `1db8f1f69`)

**PARTIAL review — pass/fail withheld; no finding passed the evidence gate.** Checkpoint at counted
call 19 of 20; notes persistence refused again (`critic-notes-partial-held`). Examined: both patch
preimages equal HEAD; P2-15B is a one-line Windows separator normalisation (identity on POSIX) whose
AC-234 acceptance bullets 1-3 map to pin cases; HK-01C adds only early `null` returns before the
inspection, so in the read caller (`devplan-shell-lane.mjs`) it can only tighten; the new test keeps a
verbatim legacy oracle and weakens nothing; producer sites read in `project-onboarding-v3.mjs` use
absolute script constants or `process.execPath`. Below the gate: producer-shape assumption only
partly confirmed; two open items in the HK-01C commit message without owner/expiry. Not reached:
the guardrail texts (categories 7/9), the AC-128 backlog item, callers other than
`devplan-shell-lane.mjs`, and the remaining `commandAction` producer call sites.

**Disposition (Coordinator, 2026-10-14):** P2-15B and HK-01C go into the interim LOCAL candidate as
working-tree patches with `independent review: partial, no finding; completion pending` stated
explicitly. This is a local test candidate, not acceptance. P1-10 stays out (F1).

## Remaining review scope (copied from the Critic's closing statement, mechanics only)

Commits `2436a1c01`, `1db8f1f69`; `f822dcc85` residual. Paths: `lib/protected-baseline.mjs`,
the P2-15B pin, `lib/guard/command-catalogue.mjs`, `lib/guard/devplan-shell-lane.mjs`,
`lib/guard/shell-grammar.mjs`, `lib/guard/path-containment.mjs`, `guardrails/quality-gates.md`,
`guardrails/security.md`, `roles/goldfish.md`, `docs/adr/0063-repository-directory-contract.md`.
Base cap 20 with exact single-file Read/Grep targets; no directory Grep, no `git grep`.
