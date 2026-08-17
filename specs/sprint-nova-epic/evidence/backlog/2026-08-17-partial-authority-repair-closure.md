# Closure evidence: lifecycle-guard partial-authority-repair omission

Backlog item:
`backlog/items/2026-08-16-lifecycle-guard-omits-the-partial-authority-repair-it-prescribes.md`

## Timeline

- `15cf0e58` — `fix(guard): admit plan-partial-authority in the lifecycle guard's plan* allowlist` (direction 1).
- Round-1 Critic review of `15cf0e58`: verdict **NO**. Finding A (minor, stale line-number citations); Finding B (major, governance checklist item 8 — deferred systemic fix carried no owner/expiry date). Full text: `evidence/critic-report-15cf0e58-round1.json` (gitignored, not durable — summarized here).
- `a27a2ce8` — `fix(hooks): correct line-number citations for plan-partial-authority call sites` (Finding A).
- `bf8803ed` — `docs(backlog): file the deferred allowlist-derivation follow-up with owner and due date` (Finding B; follow-up item `backlog/items/2026-08-16-guard-lifecycle-allowlist-should-derive-from-the-onboarding-cli-table.md`, owner `pipeline`, due `2026-08-30`).
- Round-2 Critic review of `a27a2ce8..bf8803ed` (enumerated: both commits): verdict **yes**. Both findings confirmed resolved by independent re-reading of the code and re-running `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (89/89). Two new minor, non-blocking findings noted (a ledger evidence-commit pointer naming the wrong commit; an inaccurate "per TEMPLATE.md convention" attribution in the dispatch record's own report text) — governance/audit-trail accuracy notes, not blocking, not separately filed as they are cheap textual observations rather than a recurring defect class.

## Independent Elephant re-confirmation, 2026-08-17

- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` → 89/89 pass, re-run directly against the current checkout.
- The fix (`plan-partial-authority` present in `sanctionedOnboardingArgs()`'s admitted list, `guard-lifecycle-ready.mjs:1357`) is confirmed present in this repository's source.
- The PO independently confirmed hitting the identical, pre-fix symptom in a downstream consumer project's session on 2026-08-17, relaying a diagnosis that matched this item exactly — the source fix itself was already correct; the remaining gap is that the locally-installed marketplace copy on that machine had not yet been refreshed with it, a separate, already-tracked, PO-gated action (not this item's concern).
