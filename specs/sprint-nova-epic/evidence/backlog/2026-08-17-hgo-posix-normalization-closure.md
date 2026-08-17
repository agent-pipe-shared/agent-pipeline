# Closure evidence: `human-guard-override.mjs`'s POSIX backslash-normalization bug (`NVA-HGOFIX-1`)

Backlog item:
- `backlog/items/2026-08-17-human-guard-override-shares-the-po-human-approval-posix-normalization-bug.md`

## Timeline

- `a4aeaca4` (dispatched `NVA-HGOFIX-1`, goldfish-deep) — added a
  `separatorNormalized()` helper (win32-only rewrite) and applied it at the
  three call sites the item named: `safePath()` (`:696`) and
  `crossBoundaryTarget()` (`:777`/`:780`). Confirmed, not merely suspected: the
  dispatch traced `crossBoundaryTarget()`'s single caller (`classifyPath`) and
  found a genuine fail-open reachability defect — an in-root symlink literally
  named `..\x` pointing at this repository's own `.git` was, pre-fix,
  misclassified as a `cross-repository-target`, skipping both `safePath()`'s
  in-root symlink-safety walk and `eligibility()`'s relative-path
  `hardBoundaryPath()` refusal (that class deliberately runs neither). Two
  POSIX-only regression tests added, one per direction. Reproduced RED before
  the fix (38/45 pass) and GREEN after (40/45 pass); the 5 residual failures
  are the pre-existing, out-of-scope `HGO-EXTERNAL-MARKETPLACE` failures on
  this host, identical in count and identity before and after.
- Critic review (`claude-opus-5` at `max`): verdict **PASS**, three findings,
  all **minor**:
  - **F1:** `separatorNormalized()` reads `process.platform` directly rather
    than taking an injectable `platform` parameter, unlike the sibling fix
    (`po-human-approval.mjs`'s `outside()`) it was modeled on — the win32
    branch is unprovable from either host's own test run.
  - **F2:** the third changed call site (`:792`,
    `hardBoundaryPath(separatorNormalized(absolute))`) has an undisclosed,
    untested POSIX behavioural delta: a hard-boundary-sensitive out-of-root
    candidate whose final path component merely contains a backslash (e.g.
    `..\secrets`) is no longer refused by the sensitive-pattern regex at that
    site. Judged correct by the regex's own component-anchored semantics (no
    capability gained), but shipped without a test or a comment.
  - **F3 (out-of-scope disclosure, not counted against this diff):** the same
    unconditional-backslash-normalization pattern survives in two places
    outside this item's three-site enumeration:
    `scripts/guard-human-override.mjs`'s `externalJson()` (line `58`, the
    ADR-0059 Decision 1 "proof supplied outside the repository" check — POSIX
    fail-open direction, bounded by Ed25519 verification so this only
    relocates where a proof may live, not an authorization bypass), and
    `lib/human-guard-override.mjs:1385` (`token.replace(/\\/gu, "/")`,
    POSIX-side fail-closed only).
  - One process finding, not a defect of the diff: QG-01 — the diff was
    dispatched to the Critic while `human-guard-override-tests` (the very
    suite this diff touches) was red in `evidence/verify-latest.json`.
    Independently re-verified by the Critic as the same 5 pre-existing
    `HGO-EXTERNAL-MARKETPLACE` host-registration failures, present
    identically pre-fix, with no code path through the changed functions —
    not discounting the PASS, but recorded here as a QG-10 process gap (the
    marketplace check should classify this host-environmental fact as
    reported-not-blocking at the source) rather than re-litigated.

## Disposition

PASS with only minor, non-blocking findings. Per this session's triage
discipline (fix blocking findings before closure, file deferrable ones as
follow-ups rather than auto-fixing the full list), F1+F2 and F3 are filed as
separate follow-up backlog items rather than reworked into this commit:

- `backlog/items/2026-08-17-hgofix-1-separatornormalized-has-no-injection-seam-and-line-792-has-no-test.md`
  (F1 + F2 — same file, same fix shape, cheap to bundle).
- `backlog/items/2026-08-17-guard-human-override-cli-and-a-second-site-still-normalize-backslashes-unconditionally.md`
  (F3 — a different file/function family from the reviewed diff).

No third Critic round needed; this was a first-round PASS.
