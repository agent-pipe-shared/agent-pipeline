---
schema: pipeline.backlog-item.v1
id: pipeline.four-critic-preimage-pins-drifted-or-never-valid
type: defect
owner: pipeline
status: open
created: 2026-08-12
source: "NVA-BL-42-FIX dispatch, 2026-08-12, while fixing the single stale critic.md pin this item's sibling (NVA-BL-42) named. The fix measured all 9 pins against their baseline-creation commit and found 5 non-matching, not the 1 originally believed."
---

# Four of nine Critic protected-preimage pins are stale or were never valid, not just the one already fixed

## What happened

`NVA-BL-42-FIX` (commit `fcc195e0`) corrected the `plugins/pipeline-core/agents/critic.md`
entry in `codex-isolated-critic-protected-preimage.v1.json`, which the
briefing believed was the single stale pin invalidated by a later commit.
The fix independently measured every one of the file's 9 pins by raw
SHA-256 against the file bytes AS OF the baseline-creation commit `a6cafed5`
(2026-08-01) and found the picture is worse and different in kind:

- `harness/review-protocol.md` and `roles/critic.md` — genuinely drifted
  since `a6cafed5` (real staleness, same class as `critic.md`'s already-fixed
  entry).
- `codex-critic-dispatch.schema.json` and `codex-critic-host.mjs` — **were
  already wrong at `a6cafed5` itself.** These pins have never matched their
  named file, from the moment the baseline was created.
- `SKILL.md`'s entry was also wrong at creation but was corrected later by
  an unrelated commit, so it is fine today.

`node --test` on the preimage's own test suite fails at exit 1 — but on
`harness/review-protocol.md`, which iterates before `critic.md` in the
suite's loop and aborts it, so the fix's own already-correct `critic.md`
entry never gets a chance to report as passing in a full suite run (it was
confirmed green independently, outside the aborted loop).

## Why this needs its own decision rather than a blanket re-pin

Re-pinning all 4 non-matching entries to their current bytes would make the
suite pass, but conflates two different problems:

1. **Drifted entries** (`review-protocol.md`, `roles/critic.md`): the file
   changed after a valid pin was set. Re-pinning to current bytes is the
   normal remedy, provided the current content is itself reviewed as safe
   to trust as the new preimage.
2. **Never-valid entries** (`codex-critic-dispatch.schema.json`,
   `codex-critic-host.mjs`): the pin never described the file it claims to
   protect. This is not drift — it means the protected-preimage baseline
   was defective from its own creation commit, and re-pinning alone would
   silently paper over that the baseline never actually protected these two
   files at all, for the entire time it has existed (`a6cafed5` to now).

`NVA-BL-42-FIX` deliberately did not touch any of these four, consistent
with its own briefing's prohibition on "reflexive re-pin" of unreviewed
files (the same discipline `7172a15b`, 2026-08-10, already applied when it
partially re-pinned only the entries its own commit touched).

## Direction, not a design

Not designed here. At minimum:

1. For the two never-valid entries, investigate whether the intended
   content that SHOULD have been pinned at `a6cafed5` can be identified
   (e.g. from that commit's own diff or PR context) — if so, that is
   evidence for what the correct preimage always should have been, not
   simply "whatever the file contains today."
2. For the two drifted entries, review the current file content before
   re-pinning to it, the same care the already-fixed `critic.md` entry
   received.
3. Separately: no gate has ever run this preimage's own test suite (search
   `harness/scripts/verify.mjs` for `codex-isolated-critic-protected-preimage`
   — no match), which is consistent with — and plausibly the root cause of
   — this baseline having silently drifted/been-wrong for its entire
   lifetime without anyone noticing. Registering it (TP-3/PO-only ceremony)
   is the standing gap this connects to; see
   `backlog/items/2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
