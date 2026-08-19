---
schema: pipeline.backlog-item.v1
id: pipeline.four-critic-preimage-pins-drifted-or-never-valid
type: defect
owner: pipeline
status: closed
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

- **Decision:** accepted, deferred to Sprint Alfred. Re-verified live,
  2026-08-17: `node --test plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs`
  still fails at the exact assertion this item describes
  (`harness/review-protocol.md` SHA-256 mismatch, actual
  `184a5140...` vs expected `624852e5...`), and the suite is still absent
  from `harness/scripts/verify.mjs` (`grep` for
  `codex-isolated-critic-protected-preimage` in that file: no match) — both
  facts unchanged since filing.
- **Rationale:** matches Alfred's scope ("mechanical governance, measurable
  rigor, and control integrity") precisely — this is a protected-preimage
  baseline for the Critic isolation mechanism itself. Real but not
  near-term-blocking: the drift has existed since baseline creation
  (`a6cafed5`, 2026-08-01) without being exploited or noticed via any live
  gate, and the item's own "Direction" already correctly scopes this as
  investigation-before-fix (distinguishing drifted vs never-valid entries),
  not a same-session patch.
- **Assignment (if accepted):** next available Alfred slot — dedicated
  `goldfish-deep` investigation plus Critic review, per the item's own
  Direction section.
- **Date:** 2026-08-17

## Closure, 2026-08-19 (verified live against current code, not against status text)

Confirmed resolved in code by an independent, code-first verification pass
(Workflow task wdyd7rk9g, 2026-08-19) run in response to a PO directive to
actively check every open backlog item against current code rather than
trusting frontmatter status. The item's own frontmatter/Triage text had not
been updated to reflect the landed fix; this closure catches that drift.

Ran `node --test plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` directly: all 4 assertions pass (`ok 1..4`), including 'F1 current Critic execution surfaces remain byte-identical to the protected baseline'. The item's own 2026-08-17 Triage recorded a live failing mismatch on `harness/review-protocol.md` (actual `184a5140...` vs expected `624852e5...`); that no longer reproduces. `git log` on `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json` shows commit `0bae45d3` (2026-08-18 00:03, 'fix(codex-isolated-critic-preimage): re-pin roles/critic.md and stop the test hiding later stale pins') and `943d1930` (2026-08-18 17:41, 'fix(codex-isolated-critic-preimage): re-pin the three remaining stale entries') — the latter's commit message explicitly names all three remaining never-valid/drifted entries (`harness/review-protocol.md`, `codex-critic-dispatch.schema.json`, `codex-critic-host.mjs`) and states each was reviewed against its full diff-since-last-pin before re-pinning, matching the item's own Direction guidance. Both commits postdate the item's last 'still fails' Triage entry. Caveat: the suite is still not registered in `harness/scripts/verify.mjs` (grep for the suite name: no match) — but the item's own 'Direction' section explicitly frames that registration gap as 'the standing gap this connects to', pointing at a separate backlog item (`2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`), not this item's own core scope (the four stale/never-valid pins), which is what is now fixed.
