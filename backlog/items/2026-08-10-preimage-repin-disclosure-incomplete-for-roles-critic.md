---
schema: pipeline.backlog-item.v1
id: pipeline.preimage-repin-disclosure-incomplete-for-roles-critic
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "Critic review of candidate nova-b60 (4d0f8038..e2a3072f), finding F4 (minor), cross-checked directly by the Elephant against the live file hash and commit 7172a15b's diff."
---

# `codex-isolated-critic-protected-preimage.v1.json`'s `roles/critic.md` pin is stale, undisclosed, and hidden behind an already-known stale pin

## Description

`plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`
pins nine files' SHA-256 hashes as the isolated-Critic-review protected
baseline. The `roles/critic.md` entry (line 38-39) pins `7bdcc71d…`; the file's
actual current content hashes to `8d7919f9…` (confirmed directly via
`sha256sum`). Commit `7172a15b` re-pinned two other entries in the same file
(`agents/critic.md`, `skills/critic-review/SKILL.md`) as "deliberate, disclosed
content change" but never touched or mentioned the `roles/critic.md` entry,
even though that file had already drifted from its pin by then.

`docs/state.md` (around line 2823) already records one stale pin in this same
inventory — `harness/review-protocol.md` — as "incidental, pre-existing,
invisible to the gate" (the test is not registered in `verify.mjs`). That note
predates this finding and only names the one pin. Running
`codex-isolated-critic-protected-preimage.test.mjs` directly confirms why the
second one stayed invisible even to someone reading the test's own output:
the check loop uses `assert.equal` per entry and throws on the first mismatch
(`harness/review-protocol.md`, first in file order), so the run never reaches
the `roles/critic.md` entry to report it. A pin nothing checks is not a pin;
a check that stops at the first failure hides every pin after it, too.

## Triggering situation

Critic review of candidate nova-b60, finding F4: "preimage re-pin disclosure
incomplete." No guardrail rule is violated — the Critic notes both stale
pins predate the reviewed range — but it is a claims-accuracy gap under the
Critic's trajectory duty (ADR-0014) and under the honesty of the inventory's
own name ("protected preimage").

## Affected artifact

`plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`
(the `roles/critic.md` entry) and its test,
`codex-isolated-critic-protected-preimage.test.mjs` (the assertion loop's
fail-fast-on-first-mismatch behavior). Secondarily, `docs/state.md`'s existing
note, which should eventually name both stale pins, not just the first one
the test happens to reach.

## Proposal

Two independent, separable fixes:

1. Re-pin the `roles/critic.md` entry to its current hash (`8d7919f9…`), the
   same way commit `7172a15b` re-pinned the other two entries for that same
   round of edits — or, if the drift is itself a disclosed/deliberate change,
   disclose it the same way.
2. Change the test's assertion loop to collect every mismatch before failing
   (e.g. assert per-entry inside a loop that accumulates failures, then one
   final `assert.equal(failures, [])`) so a second stale pin is never masked
   by the first one again — independent of whether this specific suite ever
   gets registered in `verify.mjs`.

Neither fix is registered in `verify.mjs` today (per the existing
`docs/state.md` note), so neither failure blocks a candidate; this item exists
so the gap is tracked rather than rediscovered by the next person who reads
the test's output and stops at the first line.

## Triage (filled in by the Elephant of the next Pipeline session)
