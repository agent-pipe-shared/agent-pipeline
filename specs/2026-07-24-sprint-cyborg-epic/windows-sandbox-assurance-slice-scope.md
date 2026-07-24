# Windows/sandbox-assurance slice — scope sketch

**Status:** design-phase scope sketch (EL-04 decision-register entry), NOT yet
PO-gated and NOT yet dispatched to any Goldfish. Drafted 2026-07-25 as Elephant
design work per the PO's 2026-07-24 directive to start Windows-side Cyborg
work in parallel with the pending 0.4.2 release. See `docs/state.md` for the
full diagnostic trail (decision D, CYB-0, the two new PO-gate-authority
findings) this sketch consolidates.

## Purpose and boundaries

This slice is **not** one of the numbered CYB-1..CYB-9 packages from
`specs/2026-07-24-sprint-cyborg-epic/spec.md` — it originates from decision D
(native-Windows push-channel blocker) and the CYB-0 follow-up, not from a
`sprint:cyborg`-labeled GitHub issue. It runs alongside the epic as its own
PO-gated scope addition, the same pattern already used for the Sentinel
Windows extension (`specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md`,
issues #34-#37). It does not reopen or redefine those five records; where this
slice's findings are the SAME root cause as an existing #34/#35/#37 item, it
extends that item rather than duplicating it. Where a finding is a genuinely
distinct root cause in the same code area, it gets its own new backlog item,
cross-referenced.

## In-scope items (confirmed)

| Class | Suites / findings | Backlog record | Root cause | Priority |
| --- | --- | --- | --- | --- |
| Native-Windows DACL/durability | `afk-ledger`, `advisory-host-bridge`, `codex-isolated-critic-contract` | `pipeline.windows-directory-durability` (#34), `pipeline.windows-private-state-assurance` (#35) — both already `open` | Directory-fsync/DACL assurance genuinely unavailable/untyped on native Windows | P0 |
| PO-gate-authority path canonicalization | `approve-plan` → `PO-GATE-AUTHORITY-UNAVAILABLE` | `pipeline.po-gate-authority-path-canonicalization` (NEW, this sketch) | `resolvePoGateRepositoryTopology` strict path equality breaks under Windows cwd case drift — **confirmed** by direct reproduction | P0 (same code path as #35, blocks a real pipeline operation today) |
| PO-gate-authority receipt readback | Publish succeeds, immediate re-validate rejects | `pipeline.po-gate-authority-receipt-readback` (NEW, this sketch) | **Unconfirmed** — plausibly same DACL/durability gap class as #34/#35, not yet isolated | P1 (needs repro before it can be sequenced) |
| Trusted-tool resolution | `security-scan`, `repository-freshness` | `pipeline.windows-trusted-tool-resolution` (#37) — already `open` | Conflicting `binary_missing` results without a shared trust-bound resolver | P1 |
| Brittle-test hygiene | `feature-package-topology`, `license-contract` | `pipeline.windows-verify-brittle-test-hygiene` (NEW, this sketch) | Stale fixture assertions, not platform defects | P2 (quick win, no dependency on the rest) |

## Explicitly out of scope for this slice

- **Codex-host-on-Claude-session suites** (`public-core-observation`,
  `codex-private-overlay-activation`, `codex-advisory-bootstrap`): these fail
  because a Codex-specific bridge is being exercised from a Claude runner
  session, a different class of gap than native-Windows portability. They are
  not folded into this slice; they need their own scoping decision (candidate:
  a runner-neutral test-isolation fix, or explicit skip-with-reason when the
  active runner cannot satisfy a Codex-only precondition).
- **`guard-push` PG26a fixture failure**: confirmed fixture-only — the real
  push origin (`git@github-share:…`, the calibrated SSH host-alias) is
  correct; the fixture's assumption about "anonymous-public transport" does
  not describe this host's actual configuration. No action needed beyond
  noting it; do not spend slice budget here.
- **Decision D's underlying "is git on PATH" question**: already resolved as
  a stale-shell artifact, not a defect (CLAUDE.md's own "git missing from
  PATH = stale shell" rule) — confirmed not to require code changes.

## Sequencing (adapted from the existing #34→#35→#37→#36 order)

1. **Brittle-test hygiene** (P2 but zero dependencies) — can land first as a
   low-risk warm-up, shrinking the red count without touching product code.
2. **`pipeline.po-gate-authority-path-canonicalization`** — small, isolated,
   already has a confirmed repro and a concrete fix direction; unblocks
   `approve-plan` end-to-end on this host.
3. **`pipeline.windows-directory-durability` (#34)** then
   **`pipeline.windows-private-state-assurance` (#35)** — the real DACL/durability
   primitive work; #35 should absorb the receipt-readback investigation
   (`pipeline.po-gate-authority-receipt-readback`) once reproduced, since it
   is plausibly the same gap class.
4. **`pipeline.windows-trusted-tool-resolution` (#37)** — independent resolver
   lane, can run in parallel with step 3.
5. Re-run native Windows `verify` at the resulting HEAD; only then is a
   revised "N suites remain red, classified as X" statement meaningful.

## Gate

Per `docs/state.md`'s own framing ("foundational scope decision → EL-04
register + PO gate"), this slice needs an explicit PO gate before any
Goldfish implementation dispatch (EL-19) — the same gate discipline as any
other epic-adjacent scope addition. This sketch is the artifact the PO reviews
to grant or adjust that gate; no dispatch happens before "approved."

## Non-claims

This sketch does not claim implementation, verification, or closure of any
listed item. It records scope and sequencing only. The three NEW backlog
items it introduces stay `status: open` until triaged per
`backlog/README.md`.
