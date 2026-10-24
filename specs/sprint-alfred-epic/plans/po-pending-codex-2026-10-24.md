# Collected PO matters during the Codex fix wave

The PO requested that decision needs and signature-dependent work be collected until available, without blocking independent repairs. This is a queue, not an approval record. No HEAD/tree-bound signing command has been handed out; no signature ceremony is active. PRD and Spec changes are forbidden without separate explicit PO permission and are not requested by these packages.

## Approved application readback

| Package | Reviewable result | Proposed next action | Boundary |
|---|---|---|---|
| K152A native file tools | [Exact patch](../evidence/verify-fixes/k152a-native-tools.diff), [report](../evidence/verify-fixes/k152a-report.md); main integrated synthetic 3/3 | PO approved application and regular checks/commit; source committed `43e04b207` with active hooks | No native AGY qualification |
| K152B explicit native models | [Exact patch](../evidence/verify-fixes/k152b-model-proposal.patch), [report](../evidence/verify-fixes/k152b-model-report.md); combined model/read controls 39/39 | PO approved application and regular checks/commit; source committed `eac1d2dc8` with active hooks | No inferred Gemini-ID-to-native-enum mapping or native receipt |
| G23 scoped reads/help | [Exact applied patch](../evidence/verify-fixes/g23-read-help-proposal.patch), [report](../evidence/verify-fixes/g23-read-help-report.md); focused controls pass | Resolved: PO operator commit `6db0d31f8`, then stamp `16c9e1936` | Installed Codex build `20261024111543.6db0d31` read back ready; no agent bypass |

K146 already received a specific application/ordinary-commit approval and integrated as `a0feac3a4`; it needs no repeated application question. The original automatic approval-review refusal under inert-only scope was resolved by that explicit PO approval, not bypassed.

## Collected operator commit

**Resolved:** the PO performed the complete G23 operator commit as
`6db0d31f8`. The following paragraph preserves why that terminal step was
needed; it is no longer an outstanding request. The requested intermediate
stamp and installation are also complete, with ready Codex bootstrap readback.

The G23 normal commit attempt was rejected for `lib/guard/command-catalogue.mjs`, `lib/guard/evaluate.mjs` and `lib/guard/read-scope.mjs` (all beneath `plugins/pipeline-core/`). The hook explicitly permits no commit-scoped override and seeded nothing. No agent bypass was used. Keep its complete seven-path source package available for the operator; do not partially commit a different composition under its name. The public patch and report identify the exact package. Prepare the final operator command only when the PO is at a terminal and revalidate the source bytes then; there is no live signing command or HEAD-bound ceremony to hold now. Continue independent work in inert clones meanwhile.

## Still agent work before a PO decision

- K150B/G31 v1: revise long-path presentation to preserve the existing compact UI property. The [held report](../evidence/verify-fixes/k150b-g31-report-v1.md) records the failed bound. Do not ask the PO to choose a regression against already accepted behavior.
- G17 v1: establish a working isolated actual launch/finalize route, independent mutation controls and custody compatibility. The [unqualified report](../evidence/verify-fixes/g17-critic-report-v1.md) names the limits. No application request yet.
- G21 v1: finish executable journal-authenticated recovery for old pre-fence postimages. [Partial report](../evidence/verify-fixes/g21-result-report-v1.md). No application request yet.
- G20/K154, G19, G23 and the remaining intake: finish bounded proposals and source confirmation. Record material new architecture/authority choices here only when concrete evidence requires one.

## Later terminal or native-host work

The optional new model-role mapping requests attended confirmation after the
plugin update. Collect it; the validated V3 fallback remains usable and no
implementation work waits for this optional mapping. No signing command has
been issued for it.

Collect actual protected commit/signature requirements after ordinary guarded attempts identify them; do not presume every plugin path requires a signature. Any necessary signing plan is prepared only when the PO can consume it promptly and the candidate is stable. Native Windows/AGY/Codex qualification, integrated Verify, independent Critic, Reader round three and PO acceptance remain separate evidence duties. Stamp, installation, push, release and the scheduled Critic batch still require the PO's explicit call.
