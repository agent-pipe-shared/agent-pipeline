---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-status-drifts-from-code-across-compaction-with-no-hardening
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "PO, live, 2026-08-19: 'irgendwas stimmt da einfach nicht mit dieser SDLC pipeline und der umsetzung. sobald ein compact dazwischen kommt, wird der status in den items nicht sauber aktualisiert. Es wird etwas umgesetzt und dann aber nicht im backlog kommentiert. Das braucht unbedingt eine haertung weil diese backlog cleaning jobs finden hier pro session 5x statt und kosten viel budget.' Triggered directly by two incidents in the same session: (1) 7 Wave-4 items were closed (commits 0f8bdafc, 8d3fd44f) without closed_at/closure_commit/etc. frontmatter or a ledger reconciliation pass, only caught because a verify run happened to fail; (2) a stale '15/17 Wave-4 closed' claim was carried forward across a mid-session compaction and written into docs/state.md as fact without being re-checked against the actual item files (true figure: 7/17)."
---

# Backlog status drifts from code across compaction, with no structural hardening

## Description

Two distinct, compounding failure modes let a backlog item's recorded state
(`status:`, closure metadata, ledger entries) drift away from both the
actual code and from prose claims made about it, with nothing structural
catching the drift until an unrelated check (verify) happens to trip over
it — or a human notices.

**Mode 1 — mechanical ledger drift.** Closing an item (flipping `status:` to
`closed`) and running `reconcile-backlog-ledger.mjs --activate` to record
the closure metadata + ledger entry are two separate, manually-sequenced
steps. Nothing enforces doing the second after the first. `verify.mjs`
DOES catch the resulting drift (`backlog-state-check`,
`backlog-ledger-reconciliation-tests`) — but only when verify happens to
run, and only after the drift already exists. On 2026-08-19, 7 items were
closed this way and the gap sat undetected until a full verify run.

**Mode 2 — semantic drift across compaction.** A session's own prose
summary of backlog progress (e.g. "15/17 Wave-4 items closed") can survive
a context compaction as a trusted fact and get written into `docs/state.md`
without anyone re-deriving it from the actual item files. `docs/state.md`
itself instructs re-verifying inherited "still open" claims (a rule already
added after prior incidents — see the CLAUDE.md hard-rules list, "Re-verify
an inherited 'still open'/'still needed' claim before dispatching work on
it"), but this is a text instruction, not a technical guard, and it was
missed again this session (the true Wave-4 figure was 7/17, not 15/17).

The PO's stated cost: this class of problem forces a full ad hoc
backlog-cleaning/re-verification pass roughly 5 times per session, each one
expensive (a 14-agent, 98-item Workflow verification pass was run this same
session purely to re-establish ground truth).

## Proposal (two independently shippable pieces, not necessarily one design)

1. **Automate Mode 1 away entirely.** A git hook (or a `check-doc-contracts`
   -style guard extension) that runs on any commit touching
   `backlog/items/*.md`: if the diff includes a `status:` flip to `closed`
   (or any status change), require the SAME commit to also update
   `backlog/transitions.ndjson`/`backlog/STATUS.md`/`backlog/index.json`
   consistently (i.e. `reconcile-backlog-ledger.mjs` was actually run before
   the commit) — fail closed otherwise. Removes the "forgot the second
   step" failure mode structurally rather than relying on verify to catch
   it after the fact.

2. **Add a numeric-claim linter for `docs/state.md`.** A small script that
   scans `docs/state.md` for "`N/M` closed"-shaped claims near backlog
   references and cross-checks `N` against a live count derived from
   `backlog/index.json`/the actual item files, flagging any mismatch. Could
   run as its own verify suite, or as a pre-compact/pre-candidate-stamp
   check. This targets Mode 2 specifically — the exact shape of claim that
   drifted twice in the same session (this incident, and CLAUDE.md's own
   documented "three separate stale-claim incidents in one 2026-08-18
   session block" footnote).

Needs a design pass before implementation (exact hook mechanics for #1;
false-positive rate and claim-pattern matching for #2) — not a same-session
ad hoc patch, given both touch commit-time or gate-relevant tooling.

## Triage

Not yet triaged — filed live during an active verification pass; the PO
has not yet chosen between implementing #1, #2, both, or a different
approach.
