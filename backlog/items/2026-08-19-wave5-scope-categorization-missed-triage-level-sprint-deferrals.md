---
schema: pipeline.backlog-item.v1
id: pipeline.wave5-scope-categorization-missed-triage-level-sprint-deferrals
type: defect
owner: pipeline
status: closed
created: 2026-08-19
source: "Self-observation, 2026-08-19, this session: a manual sweep of the Wave-5-scope work list found 12 of 54 items already explicitly deferred to another sprint by their own Triage text, none of which the automated categorization pass had excluded."
---

# The Wave-5 scope categorization checked verification-run evidence text for other-sprint mentions, not the backlog items' own Triage sections — 12 already-deferred items leaked into the work list

## Description

Wave 5's scope was built via a 14-agent code-first verification Workflow
(each agent producing a `{id, verdict, evidence}` record per backlog item),
then a regex-based categorizer (`scratch/categorize-verify-results.mjs`)
sorted all 98 open items into `closeNow` / `resolvedButIntentionallyOpen` /
`otherSprint` / `wave5Scope` / `needsReview` by scanning each record's
`evidence` string for `Sprint (Alfred|Nightwing|Phoenix)`-shaped text.

The `evidence` field is the VERIFICATION AGENT's summary of what it found in
the CODE — it only mentions a sprint name if the verifying agent happened to
quote the item's Triage in its evidence prose, which is incidental, not
structural. The categorizer never read the backlog item FILE itself for its
own `## Triage` → `Decision: ... deferred to Sprint X` line, which is the
actual, authoritative disposition.

## Confirmed impact

A manual `grep -l "Sprint Alfred\|Sprint Nightwing\|Sprint Phoenix"` sweep
of all 54 `wave5Scope` item files, followed by reading each hit's actual
Triage `Decision:` line, found **12 of 54** items already explicitly,
formally deferred to another sprint, none excluded by the automated pass:

- `2026-07-27-recovery-preview-ack-unstable-getter-poisons-replay-ledger.md` (Alfred)
- `2026-08-02-unified-human-authorization-ux.md` — **correction, 2026-08-19: full exclude, not partial.** Originally listed here as "partial" on the assumption real current-scope work remained; re-reading the item's own 2026-08-17 "Sprint deferral" section during Wave 5 round 4 found it explicitly states the ENTIRE remaining scope (PRD-approval migration, the adoption-enforcement check — everything not already delivered by ADR-0055/0056) is deferred to Sprint Alfred, not just part of it. Should have been a full exclude from the original sweep; no implementation action taken on it in Wave 5.
- `2026-08-07-maintenance-window-selectivity-is-untested-at-both-levels.md` (Alfred)
- `2026-08-07-technical-lock-for-pipeline-consent-before-onboarding-complete.md` (Alfred)
- `2026-08-07-lifecycle-guard-does-not-know-the-human-signing-commands.md` (Alfred) — a Wave-5-round-1 dispatch (NVA-W5-06) implemented part of it anyway before this gap was noticed; see that item's own 2026-08-19 note
- `2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md` — partial: one bounded undeferred piece remains (kept in Wave 5)
- `2026-08-08-orchestrator-authored-production-commits-have-no-deterministic-control.md` — partial: Direction 1 only remains undeferred (kept in Wave 5, narrowly)
- `2026-08-08-the-authority-decision-offers-two-candidates-and-one-of-them-is-a-literal.md` (Alfred)
- `2026-08-08-the-authority-gate-reads-the-worktree-so-its-verdict-need-not-survive-a-checkout.md` (Alfred)
- `2026-08-08-the-bootstrap-skill-grows-by-budget-raise-instead-of-by-module.md` (Nightwing)
- `2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-calls-it.md` (Alfred, all 3 remaining points)
- `2026-08-09-guard-denial-escalates-benign-commands-to-human-in-terminal.md` (Nightwing)
- `2026-08-12-shared-verify-evidence-slot-corrupted-by-concurrent-dispatches.md` (Alfred)
- `2026-08-12-stale-checkout-runs-outdated-human-approval-ceremony-against-current-trust-policy.md` (Nightwing)
- `2026-08-17-no-pre-dispatch-check-catches-a-model-deviating-from-configured-routing.md` (Alfred)

(15 hits total; 3 are partial/kept, so 12 are full exclusions.)

## Affected artifact

`scratch/categorize-verify-results.mjs` (a scratch script, not a durable
repo artifact, but the pattern it embodies — classify by scanning a
generated evidence string rather than the source-of-truth item file — is
worth naming so it is not repeated by a future ad hoc categorization pass).

## Proposal

Not designed here. For any FUTURE code-first backlog re-verification sweep
that needs to separate "this sprint's scope" from "already deferred
elsewhere": read each item's own `## Triage` section directly (grep the
item file for `Sprint (Alfred|Nightwing|Phoenix)` and confirm it is inside
an actual `Decision:`/`Assignment:` line, not incidental text) as an
independent categorization pass, never inferred from a verification agent's
free-text evidence summary. A partial-deferral item (some directions
deferred, others not) needs the categorizer to read enough of the Triage to
tell which — a blanket file-level match is not sufficient by itself
(confirmed here: 3 of the 15 sprint-mentioning hits were partial, not full,
deferrals).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding and the
  concrete corrected exclusion list above, which this session used directly
  to correct `scratch/categorized-results.json`'s `wave5Scope` array before
  continuing Wave 5 dispatch rounds.
- **Rationale:** real categorization defect with a confirmed, measured
  impact (12/54 items wrongly in-scope); the fix belongs to a scratch
  tooling script, not a durable repo artifact, so it does not need urgent
  guardrail-tier treatment — but the PATTERN (trust a generated summary
  over the source-of-truth file) is worth a durable note in case a similar
  categorization pass is built again.
- **Date:** 2026-08-19

## Closure, 2026-08-19

PO decision: close, no new canon note (Option 1 of the two offered). The
corrected exclusion list already proved itself twice more since filing —
once continuing the Wave 5 dispatch rounds, once again during this
session's fresh 51-item backlog-scope audit, both times by reading each
item's own `## Triage` section directly rather than trusting a generated
evidence summary. CLAUDE.md's existing hard rule ("Re-verify an inherited
'still open'/'still needed' claim before dispatching work on it") already
covers the general case this incident is a specific instance of; a
separate durable canon sentence would be redundant. `scratch/categorize-verify-results.mjs`
remains a scratch script, not durable canon, and needs no further
treatment.
