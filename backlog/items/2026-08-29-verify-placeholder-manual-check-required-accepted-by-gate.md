---
schema: pipeline.backlog-item.v1
id: pipeline.verify-placeholder-manual-check-required-accepted-by-gate
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains harness/scripts/verify.mjs pipeline.reject-unreplaced-manual-check-placeholder
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md §7), cited by scratch/greenfield-triage-2026-08-29.md finding F19, observed during the 2026-08-29 three-runner greenfield test."
---

# `verify.log` containing only the unreplaced placeholder "Manual check required." was accepted by the verify gate

## What happened

A run's `verify.log` contained only the literal string "Manual check
required." — the placeholder text a project scaffold writes when no real
verify command exists yet — and it was never replaced with an actual
verification result. The verify gate accepted this file as satisfying the
mandatory verify step anyway.

This pairs directly with a sibling finding (F11 in the same triage,
`scratch/greenfield-triage-2026-08-29.md`, authored as its own backlog item
by a sibling dispatch in this same session): a static project with no test
suite gets stuck at the mandatory verify step because greenfield onboarding
asks for a verify command before anything exists to verify. F19 is the
observable consequence once an agent works around that stuck state: it (or
the scaffold) writes the placeholder text expecting it to be filled in
later, and the gate never checks that the placeholder was actually replaced
— so the two findings describe the same underlying gap from opposite ends,
one at the point verify has nothing to run (F11) and one at the point verify
silently accepts having nothing to show for it (F19). A fix to either should
be designed with the other in view; the sibling item's exact filename was
not assumed here per this dispatch's briefing.

## Where it is

Searched this repository for the literal string "Manual check required."
across the whole tree and found no occurrence — it does not originate from
`harness/scripts/verify.mjs` or any `plugins/pipeline-core/scripts/*.mjs`
checked in this repository. It is very likely written by consumer-project
scaffolding (project onboarding for a repository with no real test/verify
command yet) rather than by anything in this control repository's own
source — **this could not be located and confirmed in this repository**, so
the exact write site is not asserted here.

What IS confirmed by reading `harness/scripts/verify.mjs`: it is the
Pipeline's own verify orchestrator, registers suites, and produces the final
Overall pass/fail line consumed by the push gate — but nothing in its own
suite-registration/output-checking logic was found (in the portions read for
this dispatch) that treats a `verify.log` containing exactly an unreplaced
placeholder string as different from a genuine "nothing to check, this
passed" result.

## Proposal

Wherever the actual placeholder-writing scaffold lives (a future session
should locate it, likely in project onboarding for a test-suite-less
project), the corresponding acceptance path should refuse to treat an
unreplaced placeholder as a passing verify result: either (a) a project with
genuinely nothing to verify gets an explicit, distinct `status` (e.g.
"verify not applicable, PO acknowledged") rather than a literal placeholder
string masquerading as log output, or (b) the gate that reads `verify.log`
specifically rejects the exact unreplaced placeholder text as a fail rather
than a pass. Add a marker `pipeline.reject-unreplaced-manual-check-
placeholder` at the point this rejection is added.

## Acceptance

- A future session locates the actual write site of the "Manual check
  required." placeholder and records it in this item before closing.
- A `verify.log` (or equivalent) containing exactly that unreplaced
  placeholder text is treated as a verify FAILURE (or an explicit,
  distinguishable non-pass state), never silently accepted as passing.
- A genuinely test-suite-less project has a real, honest way to satisfy
  verify without either being permanently stuck (F11) or silently waved
  through with placeholder text (F19) — the fix for F19 should be checked
  against F11's own resolution once that item exists, per the pairing noted
  above.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Directly observed by the audit; the exact write site
  remains unlocated in this repository (see Where it is), which is recorded
  honestly rather than guessed at.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate — a gate that
  accepts an unreplaced placeholder as a pass is a false-green on the
  mandatory verify step itself.
- **Date:** 2026-08-29

## Investigation update (NVA-R26-VERIFYPREP, 2026-08-29)

Repo-wide search for the literal string `"Manual check required."` (grep
across `*.md`/`*.mjs`/`*.json`/`*.yaml`/`*.yml`) found it ONLY inside this
item's own prose, its sibling F11 item's prose, and their worktree copies
under `.claude/worktrees/**` — zero occurrences anywhere in this
repository's actual source, including `harness/scripts/verify.mjs` (traced
in full, all 863 lines) and every `plugins/pipeline-core/scripts/*.mjs`
checked in this repository. `docs/pipeline-analysis.md` and
`docs/pipeline-audit-claude-session.md`, the two documents this item and its
sibling cite as sources, do NOT exist in this repository either (confirmed
via `find`) — they were almost certainly produced in a downstream/consumer
project workspace during the actual three-runner greenfield test, not in
this control repo.

Conclusion, with the specific evidence above: **no mechanism inside this
repository's own committed source treats the placeholder as passing** — not
because a placeholder-aware branch exists and was bypassed, but because
`verify.mjs` never parses any log's free-text content at all (identical
finding recorded on sibling item F11). The proposal's own fallback
hypothesis is therefore the confirmed one: it "passes" only in the sense
that nothing in this repo is placeholder-aware to begin with. The exact
write site the Acceptance criteria ask to locate is outside this
repository and was not reachable within this dispatch's scope (a read-only
Pipeline-repo dispatch; the downstream project workspace was not provided
as a context file).

A complete, ready-to-paste drafted diff for `harness/scripts/verify.mjs`
rejecting the exact unreplaced placeholder text (marker
`pipeline.reject-unreplaced-manual-check-placeholder`) was produced and
proven against a scratch fixture
(`scratch/nva-r26-verifyprep/manual-check-logic.test.mjs`, 7/7 passing) but
NOT landed — `verify.mjs` is TP-3 protected and needs a signed
human-guard-override ceremony (see
`evidence/dispatch-record-NVA-R26-VERIFYPREP.json` for the full drafted
text).

## Landed, 2026-08-29 (Elephant, PO-signed ceremonies, commit `3cfc7160`)

The drafted mechanism is now live: `computeManualVerifyStep()` in
`harness/scripts/verify.mjs` (~line 754 onward) rejects a `verifyManualStatus`
value containing the exact unreplaced string `"Manual check required."` as a
FAILURE (`exitCode: 1`, logged as `VERIFY-MANUAL-CHECK-PLACEHOLDER`) — this
item's Acceptance criterion 2 is mechanically met, at the point named. This
also gives the test-suite-less case (Acceptance criterion 3) an honest
non-pass route via the same mechanism's `not-configured-yet` state (see
sibling item `2026-08-29-mandatory-verify-gate-has-no-path-for-a-project-
with-no-tests-yet.md`'s matching "Landed" note — the two share one
mechanism, as this item's own pairing note anticipated).

**Not yet closing.** Acceptance criterion 1 — locate the actual write site of
the "Manual check required." placeholder and record it here — remains
genuinely outside this repository's own source (confirmed twice now, by two
separate dispatches' repo-wide searches): it is written by a downstream
consumer project's scaffolding during onboarding, not by anything in this
control repository. This item cannot close on that criterion from inside
this repo; closing would need either a session with access to the actual
downstream workspace, or a PO decision that the mechanism-level fix (now
landed) supersedes the need to locate the specific write site. Left `open`
pending that decision, plus the same missing-dedicated-test gap the sibling
item records.
