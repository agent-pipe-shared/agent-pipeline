# Critic record — S2 package 1 registration patches

- Review object (enumerated): `f49a0b9e7`, `665474a45`, `49149b3c3`, `8237226a6`, `a9a98dbd6`, `7fd2eed02`, `6824c4da5`,
  `5df9e2726`, `3634a64c8`, `7f717ad5d`, `9d3995361` (all under `specs/sprint-alfred-epic/design/s2-package-1/`)
- Spec: `specs/sprint-alfred-epic/design/s2-guard-split-plan.md`, `guardrails/quality-gates.md`
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime prompt,
  effort max); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: 80 % checkpoint at call 20 of 24; closing allowance used for notes + hand-back
- **Verdict: pass/fail withheld — partial review** (not reached: see below)

## Findings

### F1 — major: the documented end state leaves a Verify suite red

The package registers `hardened-private-directory-install-tests` and `gitleaks-repair-ignore-cli-tests`, which the
case-completion checker rejects (`VULNERABLE-UNREGISTERED`, `check-verify-case-completion.mjs:604`, exit 2 at
`:651-654`); the README states it as the expected end state ("reports exactly rows 17 and 19 until the PO decides
them", README:184-185, :145, :147) and no disposition is staged. Verify runs that checker as
`verify-case-completion-check` (`harness/scripts/verify.mjs:596`), so applying the package turns a suite that is green
at base red, and the open decision has no owner or expiry. Spec-ref: `s2-guard-split-plan.md:253-256`, `:272`; QG-06.

### F2 — major: package 1 carries far more than the spec admits, spec not amended

Besides the pure move, the package carries 25 suite registrations (only `guard-split-map-tests` belongs to S2), 7
case-completion dispositions and 25 inventory surfaces (README:12, :17-19, :29-54; commits `f49a0b9e7`, `665474a45`);
none of the 11 commits touched the spec. One signature would bind the S2 move to 24 unrelated registrations, and the
full-Verify A/B can no longer show an identical suite-name set. Spec-ref: `s2-guard-split-plan.md:218`, `:230-235`,
`:253-256`, `:272`.

### F3 — major: orchestrator-authored Verify-gate registration content outside the EL-01 stage-0 path

`49149b3c3` and `8237226a6` (stop-fanout case IDs SF15→SF20→SF23) and `3634a64c8` (CHRB008→CHRB009) carry
`Dispatch: stage-0 (elephant)` and change staged `harness/scripts/verify.mjs` registrations (TP-3 content,
`test-registrations.patch:14`, `:64`); `9d3995361` says it was finished by the orchestrator under a Goldfish
`Dispatch:` trailer. Stage-0 is a conjunction and excludes test/CI changes. Spec-ref: `roles/elephant.md:35-36`,
EL-01/EL-16.

### F4 — minor: the package README is inaccurate and incomplete

README:5 says the directory holds only protected-path edits, but the artifact table (:7-12) omits the dispositions and
inventory patches, whose targets match no protected-baseline pattern or TP rule; the suite table (:29-54) has 24 rows
for 25 announced (`hook-currentness-digest-once-tests`, patch :65, missing); README:22-23 is stale against
`s2-package-apply-check.md:26-27`. Spec-ref: `s2-guard-split-plan.md:218`.

### F5 — minor: the patch proofs are not durable machine evidence

README:57, :116, :119, :171 cite ignored `scratch/REGPATCH*/` logs; `7fd2eed02` calls its simulation outputs
model-quoted; README:161 records an apply check as console-only; the tracked APPLYCHK note ran no checker on the applied
state; the stripped APPLYCHK record carries no command/exit data. Spec-ref: QG-03; `agent-obligations.md:117-120`.

## Deliberately not flagged (summary)

Every hunk header of the three patches recomputed and consistent (25 additions); all 25 registered test files tracked;
25 inventory surfaces each once; 7 dispositions sorted; no registration or surface removed or weakened; no secrets,
absolute paths or provider/session trailers; no new dependencies; English; scope limited to the package directory.
Dropped: "22 modules" vs 23 (R-14 fallback admits it); open item without expiry folded into F1.

## Trajectory — not verifiable

Missing: machine-written command/exit artifacts for `git apply --check` after `9d3995361`, any checker run on the
applied state, durable copies of the cited scratch logs. Self-checked claims (hunk arithmetic, file existence) are
consistent.

## Not reached

Case-ID counts against seven test files (`lib/slice-queue.test.mjs`, `scripts/slice-queue.test.mjs`,
`lib/fanout-governor.test.mjs`, `lib/fanout-ledger.test.mjs`, `hooks/stop-fanout.test.mjs`,
`lib/runtime-handover-projection.win-path.test.mjs`, `scripts/clone-hook-readiness.rollback.test.mjs`, all under
`plugins/pipeline-core/`); classification of `lib/hardened-private-directory.install.test.mjs` and
`scripts/gitleaks-repair-ignore.cli.test.mjs`; `check-verify-suite-registration.mjs:434-485`, `:539-558`; changes to
`verify.mjs`, `harness/config/verify-case-completion.v1.json`, `docs/product-capability-inventory.json` after
`9d3995361`; full text of `quality-gates.md:84-108`.

## Briefing violations

None.
