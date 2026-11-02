# Candidate 19 plan (opened 2026-11-02, after the Full Verify 5 of candidate 18)

Status: working list, ordered by what can start without the PO. The topics and their reasons are in `candidate-19-seed-2026-11-02.md`; this file tracks the work. Candidate 18 is closed on the Elephant side (Full Verify 5: 4 red, all open by design, no real finding). The PO runs the greenfield tests of candidate 18 in parallel; their findings are added here as they arrive.

Method: the held-patch route of candidate 18 (clone slices under `scratch/`, `wNN-*.patch` + notes + check test, one PO apply script `po-apply-0.7-candidate19.sh`, derived-files refresh as the last step of that script, stamp after the apply). Numbering continues at w115. Elephant builds small items directly (PO exception, valid for candidate 18 only; for 19 the rule is re-confirmed or dispatch via the pipeline Goldfish agents).

## A. Can start now (no PO decision needed)

| ID | Item | Source | State |
|---|---|---|---|
| A1 | Case-completion tools `run-cc` / `cc-sync` in `scripts/clone-slice/` + `docs/operating-tools.md` entry | seed, Full Verify observations | done, `6e93f0350` (no derived-files refresh yet, see end note) |
| A2 | A suite that declares more case ids than its effective policy must fail in a normal run, not only in the Full Verify. Design question first: the declared ids exist only at run time (`registerTestCaseCompletion` cases), so a static registry check cannot see them; options are (a) `registerTestCaseCompletion` compares its ids with the effective policy when no descriptor is announced, (b) a light registry check that runs each required suite's declaration step, (c) a post-run check in `verify.mjs` | seed | design open |
| A3 | Make `g23-read-help-tests` (case G23C001, `ls -lh ../`) and `agy-item-delivery-tests` independent of the clone location (green below the home directory), or skip with a stated reason | open-by-design reds of 18 | not started |
| A4 | Full Verify keeps bounded logs of red suites in the run record | seed | not started |
| A5 | Full Verify resume from the progress journal | seed | not started |
| A6 | Deferred items of 18: G1, G8 / A18-M5 (check first), C18-5 allowlist rule, C18-12 `--plan`, C18-6 rest (heal defers while a member is armed; needs a decision, tests encode the opposite) | state.md deferred list | not started |

## B. Needs a PO decision before it starts

| ID | Item | Decision needed |
|---|---|---|
| B1 | Ponytail best practices for the Goldfish (seed section 1) | (1) paragraph in the generated briefing generator vs only in the agent definitions; (2) a bloat finding class for the Critic |
| B2 | Elephant builds small items directly in 19 | re-confirm the candidate 18 exception or dispatch pipeline Goldfish agents |

## C. From the greenfield tests of candidate 18

Not known yet. Read, map and triage when the PO's report arrives; each finding gets an ID here.

## Order of work

A3 and A2 first (both remove noise from every future Full Verify), then A4/A5, then A6, then B1 when decided. Greenfield findings jump the queue by severity.

## End note: derived files

Adding or removing a script, suite or skill drifts the inventory baseline and the Reader inputs (`node scripts/refresh-derived-files.mjs --check` reports `inventory-baseline: DRIFT` since A1). The refresh touches `plugins/pipeline-core/` and is therefore part of the PO apply script (last step), not a separate commit by the Elephant.
