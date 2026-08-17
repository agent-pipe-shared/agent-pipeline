# Closure evidence: manifest-repair/source-recovery runner gate (`NVA-MANIFESTRUNNER-1`)

Backlog item:
- `backlog/items/2026-08-17-manifest-repair-paths-are-hardcoded-to-runners-default-codex.md`

## Timeline

- `a9a170a7` (dispatched `NVA-MANIFESTRUNNER-1`, goldfish-deep) — deleted the
  Codex-only `selectedRunnerIsCodex()` and replaced both its call sites with
  the already-existing, already-used, runner-neutral `sourceEnablesRunner(root,
  fs, runner)`, which both planners already received/echoed as an unused
  parameter (ADR-0051/ADR-0057 pattern). 8 pre-existing test call sites
  updated to pass `runner: "codex"`; 2 new tests added. Landed via a
  non-trivial stale-worktree recovery (documented in the dispatch record and
  commit message): the goldfish's own worktree was created from a stale base
  commit and its diff was never committed, so the Elephant independently
  re-verified the uncommitted diff, re-ran its test suite in the worktree
  (117/117), then manually re-applied the identical change to current HEAD.
  119/119 on main at commit time.
- Critic review (`claude-sonnet-5` at `max` — "standard" criticality per the
  dispatch metadata, not architecture/guardrail/security): verdict **FAIL**.
  - **Finding 1 (blocker):** the only full-chain verify evidence
    (`evidence/verify-latest.json`) was bound to `a9a170a7`'s direct PARENT
    commit (`a4aeaca4`), not `a9a170a7` itself, and that parent-bound run was
    itself red. The dispatch record's own `elephantReVerification` only
    documented a narrow, single-file `node --test
    plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` run — never the
    full `harness/scripts/verify.mjs` chain, at either the stale worktree or
    the reapplied HEAD.
  - **Finding 2 (minor):** the two diagnostics gated by the now-runner-neutral
    check still carried Codex-specific wording ("the current V4 lifecycle
    supports only a Codex-selected authority", "manifest repair requires one
    current Codex-selected V3 source") and one still pointed at
    `$.source.runners.default`, a field the new check no longer reads
    (`runners.enabled`) — actively misleading for a legitimate non-Codex
    session that genuinely fails this gate.
  - **Finding 3 (minor):** the JSDoc comment above `sourceEnablesRunner` still
    said "the two Codex-specific helpers above stay untouched", after this
    same diff deleted one of the two helpers it names.
  - **Finding 4 (minor):** the backlog item's own Triage/Assignment section
    (committed ~58 minutes before the fix) said the work was "queued behind
    the current Windows-hotfix candidate... needs design input (why
    Codex-only) before a goldfish-deep dispatch, not a same-session edit" —
    the fix was dispatched and merged the same session anyway, and neither
    the commit message nor the dispatch record acknowledged the change from
    "deferred" to "implemented now". The Critic noted the "design input"
    question does appear substantively answered by the commit message's own
    investigation, and could not confirm from admissible evidence whether the
    reason for deferral (a queued Windows-hotfix candidate) had already
    shipped by the time of the fix.

## Resolution (no second Critic round; self-verified per this session's
one-round practice)

- **Finding 1 (blocker):** `4af6bb0b` (this closure's own commit, see below)
  has a fresh full `harness/scripts/verify.mjs` run bound EXACTLY to it
  (`evidence/verify-latest.json`, `commit: 4af6bb0b289f6afc3ab95c560e3cd142d795bddc`,
  `binding: "exact"`): only `human-guard-override-tests` is red — the known,
  pre-existing, already-triaged, host-dependent marketplace gap, unrelated to
  this diff.
- **Finding 2:** fixed in `4af6bb0b` — both diagnostics now name "the
  invoking session's own runner" instead of Codex, and the pointer reads
  `$.source.runners.enabled`.
- **Finding 3:** fixed in `4af6bb0b` — the comment now names the one
  remaining helper (`sourceEnablesCodex`) and states that
  `selectedRunnerIsCodex` was deleted by this same work, with both former
  call sites now using `sourceEnablesRunner`.
- **Finding 4:** acknowledged here rather than left unreconciled. The
  "design input" the original triage asked for (why the gate was
  Codex-only) was answered by the dispatch's own source investigation before
  implementation (the Codex-specific helper's exact call sites, and that a
  runner-neutral replacement already existed and was already used
  elsewhere) — that investigation is what actually justified acting
  same-session rather than deferring, even though the item's own words at
  filing time said otherwise. This backlog item's Triage is updated below to
  record that outcome honestly, and the item is closed against `4af6bb0b`
  (the commit that resolves every Critic finding), not `a9a170a7` alone.
- Confirmed by direct re-run, not only by re-reading the record:
  `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` →
  `120 passed, 0 failed` (`assertDiagnostic` only pins diagnostic CODES, never
  message text, so the wording fixes changed no test behavior).

## Disposition

FAIL findings fully resolved: the blocker via fresh exact-bound green
evidence, both minors via direct wording/comment fixes, and the triage-
disclosure finding via this closure and the item's own updated record. No
second Critic round dispatched, per this session's PO-confirmed one-round
practice.
