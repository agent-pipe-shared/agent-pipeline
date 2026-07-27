# 047-LCY focused test evidence

Host-authorized focused checks executed on 2026-07-27:

- `node plugins/pipeline-core/lib/continuity-state.test.mjs` — exit 0,
  92/92 passed.
- `node harness/scripts/pipeline-state.test.mjs` — exit 0, 245/245 passed.
- `node --check plugins/pipeline-core/lib/continuity-state.mjs` — exit 0.
- `node --check harness/scripts/pipeline-state.mjs` — exit 0.
- `git diff --check` — exit 0.

The State-writer suite includes AC-047-27 exact-preimage, release, artifact,
lock, replay, pre/post-rename durability, and malformed/drifted postimage
readback cases. These are focused implementation checks only. No real legacy
adoption apply, normal feature close, 0.4.7 activation, version change, tag,
release, or push has run.
