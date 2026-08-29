---
schema: pipeline.backlog-item.v1
id: pipeline.expires-at-rejects-a-non-round-trip-timestamp-and-the-doc-says-otherwise
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Handover-rotation extraction pass over Phoenix checkpoint 69, 2026-08-27; the defect itself was hit live during a push ceremony on 2026-08-19"
done_when: contains plugins/pipeline-core/scripts/po-human-approval.test.mjs GF-080 Gap B: --expires-at accepts any parseable ISO-8601 timestamp and normalizes it to the exact Date#toISOString() form used everywhere downstream
---

# `authorize-critical --expires-at` rejects any timestamp that is not an exact `toISOString()` round-trip, and the flow doc claims the opposite

## What happens

`authorize-critical`'s `--expires-at` validation accepts only the exact
`new Date(x).toISOString()` round-trip form, milliseconds included. A timestamp
that is a valid ISO-8601 instant but not byte-identical to that form is
rejected outright.

`docs/push-release-flow.md` states such a value is **normalized, not rejected**.
That claim is wrong for this CLI validation path.

## Evidence

Recorded in Phoenix checkpoint 69 (2026-08-19) by the session that hit it — the
PO's first `authorize-critical` attempt failed on exactly this during a live
push ceremony, and the corrected timestamp then succeeded. The checkpoint itself
flags the doc as wrong and explicitly notes it was "not yet corrected in the
doc", so this has been a known-uncorrected defect since then.

Surfaced again 2026-08-27 by the handover-rotation extraction pass, which is the
only reason it did not disappear with the checkpoint.

## Why it is worth fixing rather than living with

The cost lands on a human, mid-ceremony, at the most expensive possible moment:
the PO is at the terminal performing a signature step, and the failure message
is a validation rejection that the governing document says cannot happen. The
next person to read the doc will make the same mistake.

## Proposal

Two independent halves, either of which helps on its own:

1. Correct `docs/push-release-flow.md` so it describes what the CLI actually
   does. Cheapest, and removes the actively misleading claim.
2. Decide whether the CLI should normalize rather than reject. Normalizing is
   friendlier, but rejection is defensible for a signed-intent input where the
   exact bytes matter — if rejection is kept deliberately, the error message
   should say what form it wants and show the corrected value.

Fixing only (1) is a legitimate outcome. Fixing only (2) is not: the doc would
still be wrong about the flow.

## Triage

- **Decision:** open, unassigned. Half of it is a one-line documentation fix on
  a path that has already cost one live PO ceremony attempt.
