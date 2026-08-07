# Merge plan — plugin candidate 0.5.3 into `sprint_phoenix`

**Status:** planning artifact, no merge performed. Written 2026-08-07 by the
Elephant while the merge itself is on hold per PO instruction (wait for the
push to `main` rather than syncing from the actively-edited local snapshot).

**Purpose.** Establish, before any file is touched, which files a merge may take
wholesale and which must be reconciled by hand. This is the artifact that makes
the difference between a sync and an accident: the previous snapshot merge
(`cca5ad8`) was done file-by-file for exactly this reason, and one concrete
regression is already proven to be waiting (§3).

## 1. What is being merged

- **Target:** `sprint_phoenix`, plugin tree at version `0.5.2`.
- **Candidate observed:** `0.5.3+claude.20260807181921.f667dec`, installed as a
  flat copy with no `.git`. Build commit `f667dec` does not exist in this
  repository, so provenance is the version string alone.
- **Intended real source:** the sibling work pushed to `main`. The flat copy was
  used only to establish scope; the merge itself waits for `main` so there is a
  real ancestor, real SHAs, and the ADRs the code depends on.
- **Substance of 0.5.3:** ADR-0059. `lib/guard-maintenance-window.mjs` is
  byte-identical between the trees — GMW itself did not change.

## 2. Method: union, never replace

Three-way reasoning against the merge base
`6e2c9b2868d164ff3b631ab068fa5df20939e07d` (`git merge-base sprint_phoenix
origin/main`). A file is **safe to take** only when this branch has not touched
it since that base; when both sides changed it, the merge is a manual union.

`git diff --name-only <base>..sprint_phoenix -- plugins/pipeline-core` lists
110 files this branch owns changes in. Intersecting that with the files the
candidate differs on yields the conflict set below.

## 3. The proven regression — why "take the candidate's file" is unsafe

`plugins/pipeline-core/hooks/guard-gate-strength.mjs` is in **both** sets. The
candidate's `GATE_STRENGTH_PATHS` has **no GS-8 entry**, and `rg -n
"GS-8|public-core-origin-allowlist"` over the entire candidate tree returns
nothing at all. GS-8 protects
`plugins/pipeline-core/lib/public-core-origin-allowlist.mjs`, the two reviewed
Public-Core origins the bootstrap readiness gate compares against; it is this
branch's own Part A work and the sibling tree never had it.

Taking that file wholesale would therefore delete the protection Part A exists
to provide — and **no test would fail**, because the candidate's
`guard-gate-strength.test.mjs` carries no GS-8 case either. The regression would
be silent and green.

This is not a hypothetical caution. It is one confirmed instance in a set of
sixteen files where both sides changed, and it is the reason every one of them
needs reading rather than copying.

## 4. Conflict set — both sides changed, manual union required

| File | Why this branch owns changes here |
| --- | --- |
| `hooks/guard-gate-strength.mjs` | GS-8 (Part A) — see §3; candidate adds ADR-0059 HGO routing for GS-1..GS-5/GS-7 |
| `hooks/guard-push.mjs` | WP5/PHX-2 external push-authority ledger |
| `hooks/guard-testpath.mjs` | branch-side changes; candidate adds ADR-0059 signature-mode consumption |
| `lib/feature-package-topology.mjs` (+ test) | branch-side newer version |
| `lib/po-gate-authority.mjs` (+ test) | branch-side newer version |
| `lib/public-core-observation.mjs` (+ test) | Part A origin/content attestation observers |
| `lib/runner-profiles-v3.mjs` (+ test) | branch-side newer version |
| `lib/worktree-lifecycle.mjs` (+ test) | branch-side newer version |
| `scripts/bootstrap-payload-measure.test.mjs` | branch-side newer version |
| `scripts/pipeline-start-preflight.mjs` (+ test) | Part A attestation gate and its cases |
| `scripts/pipeline-state.mjs` | WP5 ledger integration |
| `scripts/pipeline-user-v3.schema.json` | `push_external_ledger` registration (PHX-2) |
| `skills/critic-review/SKILL.md` | branch-side newer version |
| `skills/pipeline-start/SKILL.md` | branch-side newer version (payload budget) |
| `skills/pipeline-start/references/onboarding-recovery.md` | branch-side newer version |

## 5. Safe-to-take set — candidate differs, this branch never touched them

`hooks/codex-pretool-guard.mjs` (+ test), `hooks/guard-lifecycle-ready.mjs`
(+ test), `hooks/guard-testpath.test.mjs`, `hooks/guard-testpath-override.test.mjs`,
`hooks/guard-gate-strength.test.mjs`, `lib/human-guard-override.mjs` (+ test),
`lib/project-onboarding-v3.mjs` (+ test),
`lib/threat-model-approval-request.test.mjs`, `scripts/guard-human-override.mjs`,
`scripts/local-worker-supervisor.test.mjs`, `scripts/po-human-approval.mjs`,
`scripts/reconcile-backlog-ledger.mjs` (+ test),
`scripts/release-preflight-cli.mjs` (+ test).

Two files exist **only** in the candidate and are pure additions:
`scripts/guard-human-override.test.mjs`, `scripts/po-human-approval.test.mjs`.

**Caveat on `guard-gate-strength.test.mjs`:** it is safe to take in the
mechanical sense (this branch never edited it), but taking it does not restore
GS-8 coverage, which neither side has. The GS-8 test case is a gap this merge
should close rather than inherit — see §7.

## 6. Never take from the candidate

Everything under "only in this branch" in the tree comparison is Phoenix's own
governance, ledger, audit and evidence work (`governance-*`, `audit-bundle`,
`external-push-ledger`, `human-governance-*`, `organization-policy`,
`authority-revision-proof`, `phoenix-authority-*`, `public-core-origin-allowlist`,
`ruleset-source`, `agent-decision-journal`, `change-control`, `evidence-view*`,
`external-*`, the `schemas/` and `assets/` directories, and the GMW sibling test
files this branch added). Absence from the candidate is not a deletion signal.

## 7. Open items this merge must not silently inherit

1. **GS-8 has no test on either side.** The merge is the natural point to add
   one; without it the regression in §3 stays undetectable by the suite.
2. **The GMW module cites three documents absent from this checkout** —
   `docs/adr/0058-guard-maintenance-window.md`,
   `docs/guard-maintenance-window-threat-model.md`, and the sibling design
   document (`lib/guard-maintenance-window.mjs:10-13`). The previous snapshot
   merge took guard-kernel code without its governing decision records. Merging
   from `main` should bring them; if it does not, that is a finding, not an
   acceptable carry-over.
3. **ADR-0059 itself is absent here** (`rg -c "ADR-0059"` over `plugins/` and
   `docs/` returns nothing). The same rule applies: the decision record arrives
   with the code or the merge is incomplete.
4. **TP-protected suites are inside the conflict set**, so the merge will hit
   the guard that ADR-0059 exists to make liftable. Sequence matters: the
   ADR-0059 code has to be installed and its signed-override path available
   before the test-file reconciliation can be performed through a sanctioned
   route rather than a workaround.

## 8. Verification required after the merge

Full `verify` (all suites registered per `harness/scripts/verify.mjs`),
`node harness/scripts/check-doc-contracts.mjs`,
`node harness/scripts/check-observation-governance.mjs`, and an independent
Critic review of the merge diff — architecture/guardrail class, so the
higher-capability review model at max, per CLAUDE.md's self-application rule.

## 9. Honest limits of this plan

The classification in §4 and §5 was computed against the **flat local copy**,
not against `main`. The conflict *set* is expected to be close but is not
guaranteed identical: `main` may carry further sibling commits the snapshot
predates. Recompute §4/§5 against `main` before executing, using the same
merge-base intersection method — the method transfers, the specific file list
must be re-derived.
