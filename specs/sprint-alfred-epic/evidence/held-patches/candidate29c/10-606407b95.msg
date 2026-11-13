fix(close): secret-check the close outputs before the irreversible State close

Codex greenfield run 3 (C2): the close wrote state and acceptance before
its own generated artifacts (a briefing copy in the audit bundle) tripped
a new secret finding in the post-freeze scan; the exception commit then
broke the Critic carry and needed a refreeze. PO tile 2026-11-13: scan
the close postimages before the state transition.

- security-scan.mjs --close-postimages <feature>: scans exactly the
  changed and untracked files under specs/<feature>/ and
  audit-bundles/<feature>/ (a copy under scratch/ with the root
  .gitleaksignore, so the reviewed ignore route applies unchanged) with
  the gitleaks adapter. Blocking follows the full scan: a block_on
  finding or a scanner ERROR blocks unless the gate mode is warn/off; a
  missing scanner is coverage, not blocking. One JSON line, exit 2 =
  stop; path, rule and line only, never a value; no evidence file.
- One-shot point A, before the close coordinator starts:
  ONESHOT-CLOSE-POSTIMAGE-SECRET, nothing irreversible written.
- finishFeature point B, after the prepared phase built the audit bundle
  and before the State close: FINISH-CLOSE-POSTIMAGE-SECRET with the
  resume command; the rerun replays the prepared phase without rebuilding
  the bundle, so an ignore line stays bound.
- A modified .gitleaksignore travels in the one close commit.
- Not covered: files written after the State close (tracked-close.json,
  state, handover open-minors text); the post-freeze full scan stays the
  binding gate for them.
- Tests: stop at A and at B, call order of the one-shot.

Checkpoint-Intent: candidate 29c, Codex run 3 C2 (close order)
AI-Assisted: true
Dispatch: stage-0 (elephant)
