# Closure evidence: `guard-lifecycle-ready.mjs`'s `apply-partial-authority`/`adopt-remote` allowlist gaps

Backlog item:
- `backlog/items/2026-08-17-lifecycle-guard-allowlist-still-misses-apply-partial-authority-and-adopt-remote.md`
  (gaps 2 and 3 only; gap 1 rejected as mischaracterized before dispatch,
  see the item's own Triage section)

## Timeline

- `a1baf289` (dispatched `NVA-LCGUARD-1`, goldfish-deep, opus at max) — added
  the missing `apply-partial-authority` and `adopt-remote` branches to
  `sanctionedOnboardingArgs()`, each mirroring an exact `commandAction`/
  `applyAction` construction site in `lib/project-onboarding-v3.mjs` (`:470`,
  `:4111`, `:4198`). 91/91 tests pass.
- Round-1 Critic review: verdict **FAIL**. Finding 1 (major, evidence gap):
  no full-Verify run had been bound to the exact commit under review.
  Finding 2 (minor, precision): `--source` and `--ref` were admitted loosely
  (non-empty, not flag-shaped) rather than pinned to the exact values the
  construction sites can ever emit.
- `cdc85435` (dispatched `NVA-LCGUARD-2`, goldfish-deep, opus at max) —
  `--source` pinned to the literal `"canonical-fresh-v3"`
  (`lib/project-onboarding-v3.mjs:88`/`:439`, the only value
  `planProjectPartialAuthorityAdoption` ever lets reach `applyAction`
  construction); `--ref` pinned to the `refs/heads/<branch>` regex
  `lib/project-onboarding-v3.mjs:3988`'s `REMOTE_REF_RE` already enforces.
  Two misdescribing comments corrected. Two new negative regression cases
  added; positive `adopt-remote` fixtures narrowed from bare `main` to
  `refs/heads/main`. 91/91 tests pass. A fresh full-Verify run was bound
  exactly to this commit (`binding: "exact"`), closing round-1 Finding 1.
- Round-2 Critic delta review (`cdc85435`, bounded, prior F1/F2 registry
  supplied as neutral evidence): verdict **FAIL**.
  - **F-A (major):** the full-Verify run bound to `cdc85435` was itself red
    (`exitCode: 1`) — `human-guard-override-tests` (known, pre-existing,
    already-triaged marketplace-symlink gap, unrelated) and
    `backlog-state-check` (`exitCode: 2`). Per QG-01/QG-10, a Critic dispatch
    against a red gate, and any tolerance of a "known pre-existing" failure
    at the consumer/gate layer rather than at the check itself, is out of
    contract regardless of whether the reviewed diff is otherwise correct.
  - **F-B (minor):** the new `--ref` check mirrored `REMOTE_REF_RE` alone,
    but `validRemoteAdoptionRequest` (`lib/project-onboarding-v3.mjs:3988-3990`)
    additionally refuses `..`, a doubled slash, a trailing slash, and a
    `.lock` suffix before either `adopt-remote` command is ever constructed
    — a safe-direction superset (no legitimate command became unreachable),
    but a residual gap against the "admit only what a real construction site
    emits" contract.
  - The reviewed code itself was otherwise explicitly accepted on its merits
    (spec fidelity, scope, authorship, test integrity, edge cases, security
    surface, no briefing-hunt contamination).

## Elephant self-verification (two-round Critic cap reached; no third dispatch)

Both round-2 findings were investigated and fixed directly, per this
session's standing two-round-cap policy:

- **F-A root cause, confirmed by direct source read:** `backlog-state-check`
  was failing not for the historical 38-event drift already covered by
  `NVA-BLDRIFT-01`/`NVA-BLDRIFT-02`'s DRIFT classification, but for four
  unrelated, genuinely malformed backlog items — three closed items
  (`gmw-install-...`, `hgo-signed-admission-...`,
  `po-human-approval-outside-check-...`) carrying an abbreviated 8-char
  `closure_commit` instead of the required full 40-char OID, and one open
  item (`gs-1-signature-ceremony-...`) carrying `type: enhancement`, which is
  not in the canonical taxonomy (`workflow-improvement | tooling-radar |
  defect | idea`). `check-backlog-state.mjs` silently drops any item that
  fails its own metadata validation from the loaded item set
  (`plugins/pipeline-core/scripts/check-backlog-state.mjs:502`), which
  cascaded into ten unrelated "id does not name a current backlog item"
  ledger findings for every event touching those four items. Fixed in
  `9ed3b48d` (all four `closure_commit`/`type` values corrected; `STATUS.md`/
  `index.json` regenerated via `check-backlog-state --write`).
- **F-B fix:** `2d287221` — the guard's `adopt-remote` `--ref` check now
  additionally refuses `..`, `//`, a trailing `/`, and a `.lock` suffix,
  matching `validRemoteAdoptionRequest` exactly. Four new negative
  regression cases added for the newly-refused shapes.
- **Re-verification, both fixes, 2026-08-17:**
  - `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
    → 91/91 pass.
  - `node plugins/pipeline-core/scripts/check-backlog-state.mjs` → clean
    (only the two already-triaged, non-blocking DRIFT findings: ledger event
    403's short evidence-commit hash, and one closure_commit/ledger-evidence
    mismatch already tracked under its own backlog item).
  - Fresh full-Verify run bound exactly to `2d28722138a8a378f9ec93a60247caea5536adbf`
    (`evidence/verify-latest.json`, `binding: "exact"`): **only
    `human-guard-override-tests` remains red** — the known, pre-existing,
    already-triaged marketplace-symlink gap
    (`backlog/items/2026-08-17-this-hosts-local-marketplace-copy-is-not-symlinked-to-source.md`),
    explicitly deferred to its own dedicated design/Critic pass, unrelated to
    this item's scope. `backlog-state-check` is confirmed green.

## Disposition

Both accepted gaps (2, 3) are fixed, tested, and re-verified against a clean
gate modulo the one pre-existing, independently-tracked, explicitly-deferred
suite. No third Critic round dispatched (two-round cap); the round-2
findings were process/gate-state and a minor code residual, both closed by
direct, evidence-backed self-verification rather than re-litigated by a
further review round.
