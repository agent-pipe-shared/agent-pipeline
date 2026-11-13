fix(critic-carry): carry the push threat model and evidence-only gitleaks appends after the close

The Codex run of 2026-11-13 closed its feature, then the close's own
security scan flagged a public identifier that the generated evidence
and audit bundle copy. The sanctioned gitleaks-repair-ignore.mjs
--approve-new appended two content-v1 lines to .gitleaksignore, and the
push stopped at VEP-CVL-CARRY-CONTENT-CHANGED: the closed course takes
no further review. AGY run 3 (R1) hit the same wall with the push
threat model written after the close.

lib/critic-evidence-carry.mjs now admits, next to the repository-mode
promotion of the calibration twins, exactly two more push-preparation
shapes:
- project/push-threat-model.md added or modified as a regular file
  with a Markdown heading (at most 1 MiB); a deletion stays content;
- an append to the root .gitleaksignore whose every new line is a
  content-v1 entry for a path under specs/<feature>/evidence/ or
  audit-bundles/<feature>/ of a feature in the carry (vetoes and the
  feature list still apply); a removed, rewritten, legacy or comment
  line, or an entry for any other path, stays content.

The close-feature skill names the carried push-preparation paths.

Checkpoint-Intent: candidate 29, PO tile R1 (admit the push-preparation paths in the Critic carry range)
AI-Assisted: true
Dispatch: stage-0 (elephant)
