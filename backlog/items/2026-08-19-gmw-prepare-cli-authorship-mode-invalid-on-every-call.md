---
schema: pipeline.backlog-item.v1
id: pipeline.gmw-prepare-cli-authorship-mode-invalid-on-every-call
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "Discovered incidentally by PHX-WP-GMW-LEDGER-EMISSION while writing regression tests for the install/close ledger-emission wiring; disclosed in that dispatch's report and in backlog/items/2026-08-07-gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger.md's progress note, 2026-08-19."
---

# GMW CLI's `prepare` command fails `GMW-AUTHORSHIP-MODE-INVALID` on every call

## Description

While building regression tests for the GMW install/close ledger-emission
wiring, `PHX-WP-GMW-LEDGER-EMISSION` found that
`plugins/pipeline-core/scripts/guard-maintenance-window.mjs`'s `prepare`
subcommand fails with `GMW-AUTHORSHIP-MODE-INVALID` on every invocation, in
this checkout, independent of anything that dispatch's own task touched. The
dispatch routed around it in its own test fixtures (using a differently
prepared window rather than the CLI's `prepare` step) rather than
investigating or fixing it, since it was out of that dispatch's briefed
scope (install/close only).

## Triggering situation

Incidental discovery during `PHX-WP-GMW-LEDGER-EMISSION` (2026-08-19), not
independently reproduced or root-caused yet — this item exists to make the
finding trackable rather than lost in that dispatch's own report.

## Affected artifact

`plugins/pipeline-core/scripts/guard-maintenance-window.mjs`'s `prepare`
subcommand and whatever `authorshipMode`-forwarding logic produces
`GMW-AUTHORSHIP-MODE-INVALID`.

## Proposal

Not investigated yet. First step for whoever picks this up: reproduce
directly (`node plugins/pipeline-core/scripts/guard-maintenance-window.mjs
prepare --root <repo> ...` with whatever minimal flags the CLI's own usage
text names) to confirm the finding still holds and get the actual error
detail, then trace what value `authorshipMode` is receiving vs. what the
validator expects.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
