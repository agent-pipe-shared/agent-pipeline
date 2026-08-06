# Release 0.5.2 readiness

> Agent-Pipeline · Sprint Nova · as of 2026-08-06

This document is a decision aid for the PO, not a status report: for every
item it states whether the 0.5.2 candidate is ready, and on what evidence.
It draws only on `docs/state.md`'s `2026-08-06` section, the two ADRs this
candidate carries, and the gate evidence files cited below — nothing here is
asserted from memory.

`VERSION` currently reads `0.5.2`. Candidate commit
`2d8a4258e20789bd4fc07bbd2ca1b1c2cfd002a4`, tree
`08b45d076c7ee1e0ba4c8c74900a2eff17e6e034`, branch
`feat/sprint-nova-codex-v046`. Not on `main`; no tag exists.

## Ready, with evidence

**Both gates green and candidate-bound.** `evidence/verify-latest.json`:
`exitCode: 0`, `registeredSuiteCount: 236`, `terminalReceiptCount: 236`,
`status: "passed"`, candidate `binding: "exact"`, start and finish both
`status: "clean"` at commit `2d8a4258e20789bd4fc07bbd2ca1b1c2cfd002a4` /
tree `08b45d076c7ee1e0ba4c8c74900a2eff17e6e034`. `evidence/security-latest.json`:
`exitCode: 0`, `findings: []`, same commit and tree, gitleaks/semgrep/
license-check all `status: "PASS"` with `findingCount: 0` (osv-scanner
`SKIPPED`, "no package sources found"), snapshot method
`git-detached-worktree.v1` with `verifiedBeforeAfter: true`. Both evidence
files are bound to the exact same commit/tree as the candidate above.

**Two independent T1 Critic rounds ran.** The first round (candidate
`59e942c`) returned **verdict FAIL**, six findings (F1–F6; F1/F2/F4 major/
major/minor, F3 major, F5/F6 minor). This is stated plainly, not softened:
the candidate this readiness document describes failed an independent
review before it passed one. The second round (remediation re-review, scope
`59e942c..aea5882`) discharged the FAIL for the three findings dispositioned
"fix" — F1, F2, F4 — each reconfirmed against artifacts the Critic
constructed itself, and separately confirmed F3/F5/F6 as accurate
"not fixed" dispositions. It also raised two new findings, N1 (major) and
N2 (minor), both fixed in `c4d4034`. Both Critic dispatches recorded their
own coverage boundaries (see `docs/state.md`, 2026-08-06) and both disclosed
a contamination of their own admissible-input contract, accepted and
recorded as an Elephant process error in each case, not corrected away.

**The runner-identity work this candidate exists for.** Bootstrap preflight
now resolves plugin identity through the invoking session's own runner
(`4221989`), removing the inversion that made Claude read a stale build as
`ready`. The shared admission gate (`requireProjectOnboardingReady`) no
longer uses an environment variable as runner authority (`a2089cd`,
finding F-A); two production gate callers missed by that change were fixed
as a regression (`f5e4174`). The rebind recovery path threads the invoking
runner through the PO-authority-rebind V4 readback (`7514fb9`). Every
production gate caller and both hook spawn sites were checked for the
`guard-lifecycle-ready.mjs` invariant this candidate touches: the Critic's
first round found a second, previously undocumented, production caller in
`guard-apply-patch.mjs` (finding F4) and the second round found the same
false single-caller claim still standing in `codex-pretool-guard.mjs`
(finding N2); both are corrected, and both callers pass `--runner codex`,
so the safety property held throughout even while the comment was wrong.

## Not ready, with the blocker named precisely

**The verify-gate registration gap.**
`plugins/pipeline-core/scripts/pipeline-state-rebind-runner.test.mjs` is the
sole proof for the rebind-runner threading landed in `7514fb9`, and it is
not registered in `harness/scripts/verify.mjs`. The green "236/236" gate
above therefore does not cover it — this is Critic finding F3 (major, not
fixed), and the second round independently reconfirmed it as factually
accurate. A dispatch attempted the registration during this session and was
blocked by the `guard-testpath` hook, rule TP-3, whose refusal message
names the only sanctioned route: "the PO edits `project/guard-config.json`
(or the test file itself) directly, outside this session." This blocker is
**structural and PO-only, not a matter of briefing quality** — it was
proven by an actual blocked attempt, not assumed. The wider figure, also
recorded in `docs/state.md`: 69 of 288 `*.test.mjs` files are unreferenced
in `verify.mjs` with no aggregator importing them; eight of the relevant
suites (including the rebind-runner one) were individually proven green
standalone. This is **unregistered-but-green coverage loss**, not hidden
breakage — but it does mean the Full Verify green above is evidence of
236 registered suites passing, not of the full corpus passing.

**Backlog ledger.** `check-backlog-state.mjs` exits 2 with 35 failures
across two classes: roughly 27 items whose status does not match their
final ledger transition (pre-existing, already tracked as
`pipeline.backlog-delivery-status-reconciliation`), and 8 with no ledger
entry at all, including every item created 2026-08-05/06.
`migrate-backlog-state.mjs` fails closed with "closed legacy records
require a reviewed explicit migration and are not auto-migrated" — the
ledger is append-only and hash-chained, so this cannot be forced. Stated
explicitly: **`check-backlog-state.mjs` is not a Verify gate. It blocks no
0.5.2 gate.** It is a records-integrity item, tracked separately from
release readiness.

**Residual open items carried in `docs/state.md`'s `2026-08-06` section:**
the local-plugin-install attestation binding gap, tracked as backlog item
`2026-08-06-local-plugin-install-attestation-does-not-bind-external-marketplace-root.md`
(owner PO, due 2026-09-06) — the attestation hashes this checkout's
manifest and plugin-source tree but never observes the external
`agent-pipeline-local` marketplace root or where its symlink/junction
points, a gap made live (not merely theoretical) by the F1 fix that
restored the override's liveness; and roughly fourteen normative documents
that still name `.claude/pipeline.json` as the calibration path, now known
(per ADR-0053's own investigation) to be a larger question than a simple
repoint, because roughly a dozen executable files including
`harness/scripts/verify.mjs` genuinely still read that legacy tier, making
Option 1 (retire the legacy tier) of the
`claude-dir-leftovers-defeat-runner-neutral-project-migration` backlog item
impossible as written.

## Explicitly out of scope, and why

Merging to `main` and cutting a release tag are **explicitly out of scope
of this document and of this candidate's session**. The PO's standing
scope limit, recorded in `docs/state.md`, is feature-branch work only —
no `main` merge, no release — and the same session recorded three
independent refusals of release-adjacent actions (a stop-hook challenge
argued a merge/tag was needed "for the release" and was refused; the
auto-mode classifier independently denied `release-preflight.mjs`; and the
`verify.mjs` registration mutation/dispatch were independently denied,
above). A release is irreversible and outward-facing. This document
prepares that decision; it does not make it.

## Consumer-facing changes needing PO acceptance before publication

This candidate carries two decisions that change published, consumer-facing
surfaces and therefore need explicit PO acceptance before any publication,
independent of the gate and Critic results above:

1. **ADR-0052** restores `"agent-pipeline"` as the published marketplace
   `name` and moves local development to a separate, non-committed
   marketplace root outside the checkout. This is a change to the
   published marketplace identity — exactly the surface
   `docs/marketplace-supply-chain-threat-model.md` defines as a
   supply-chain change (the trusted path from a reviewed commit through the
   marketplace coordinate to plugin bytes loaded at runtime). ADR-0052's
   own Consequences section states this needs PO acceptance before
   publication; its symlink/junction arrangement was validated with
   `claude plugin validate` only, not with a live `install` run — recorded
   there as unverified, not proven end to end.
2. **ADR-0053** changes which configuration tier `setup.mjs` writes to
   (resolver-derived, neutral or legacy, instead of a hardcoded legacy
   path) — a change to which tier newly and previously onboarded consumer
   projects receive their compiled calibration from. Its own remediation
   note (Critic finding F2) records that the initial version of this
   change would have silently orphaned a legacy consumer that never
   adopted the optional manifest; that gap is fixed, but the decision that
   pristine projects are seeded at the neutral tier remains a design
   judgement ADR-0053 names as such, not a mechanical fix.

Both landed on a feature branch as a candidate, not a release; neither has
had PO acceptance yet.

## What the PO must do to release

1. **Decide the verify-registration gap (F3).** Only the PO can lift TP-3
   on `harness/scripts/verify.mjs` (edit `project/guard-config.json` or the
   test file directly, outside this session) or explicitly accept the
   unregistered-but-green risk as-is. Evidence that would close it: a green
   Full Verify run with `pipeline-state-rebind-runner.test.mjs` present in
   `verifyRun.registeredSuiteCount`.
2. **Accept or reject ADR-0052 and ADR-0053 as consumer-facing changes.**
   Only the PO can accept a published supply-chain identity change and a
   configuration-tier change for publication. Evidence: a recorded PO
   acceptance decision, and — for ADR-0052 specifically — a first confirmed
   `claude plugin install` (or `add`/`update`) run against a real separate
   local marketplace root, which ADR-0052's own Follow-up section still
   asks for.
3. **Decide the backlog ledger.** Only the PO can authorize
   `migrate-backlog-state.mjs`'s reviewed explicit migration for the 8
   ledger-less closed records, or accept the 27-item status/ledger
   mismatch as tracked debt. Evidence: `check-backlog-state.mjs` exiting 0,
   or an explicit PO acceptance recorded in `docs/state.md`.
4. **Decide the local-plugin-install attestation gap.** Only the PO (or a
   dispatch the PO authorizes) can close backlog item
   `2026-08-06-local-plugin-install-attestation-does-not-bind-external-marketplace-root.md`
   (due 2026-09-06); until then, the attestation's stated scope (this
   checkout only) must be treated as the true scope, not the external root.
5. **Only once 1–4 are decided:** authorize the `main` merge and release
   tag. Both remain outside this document's and this candidate's scope by
   the PO's own standing limit.

---

## Deutsche Lesefassung (nicht normativ)

Beide Gates (Full Verify, Security) sind für den genauen Kandidaten
`2d8a4258…` grün; zwei unabhängige T1-Critic-Runden liefen, die erste mit
Verdikt FAIL (sechs Findings), die zweite mit teilweiser Entlastung. Nicht
freigabereif: die Verify-Registrierungslücke (strukturell, nur durch die PO
lösbar), das Backlog-Ledger (kein Verify-Gate, aber ungelöst), sowie
mehrere offene Punkte aus `docs/state.md`. Merge nach `main` und ein
Release-Tag bleiben ausdrücklich außerhalb des Geltungsbereichs dieses
Dokuments. ADR-0052 und ADR-0053 verändern konsumentenseitig sichtbare
Flächen und benötigen vor Veröffentlichung eine ausdrückliche
Freigabeentscheidung der PO.
