---
schema: pipeline.backlog-item.v1
id: pipeline.lifecycle-inspect-omits-current-plan-spec-digests
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Actual installed guard admission and workspace inspect on candidate 914270f1, independently traced to omitted physical PRD/Spec observations in the inspect callsite."
sprint: none
done_when: manual
---

# Lifecycle inspect reports current submission without observing current Plan/Spec bytes

## Confirmed behavior

On `914270f1a9e372af3213c09d3cf4160fbba22dcf`, the ordinary workspace
`pipeline-state.mjs inspect` reports `PLAN-LIFECYCLE-CURRENT` and
`awaiting-approval`. The installed write guard reports `draft` and requests
`reopen-design` for the same feature. The guard reads the actual PRD/Spec
digests; inspect calls `derivePlanLifecycle(base)` without those observations.
The stored submission is structurally valid but its source digests are stale.

Observed source bindings:

| Source | Submitted SHA256 | Current SHA256 |
| --- | --- | --- |
| PRD | `0e30f76bac4b8f5842f2b49be73ce7620e4f4cf77bb504c9e221c1949d43f76b` | `c98674205a6342059319355e314601544baae81c06295b74be51dbda1bec4ace` |
| Spec | `167b99e5a565e204a13cc4f1cd4312b70dfe631b78236dc75bb0e061d09a73b9` | `828f786ea61fe94fd175e097906d7280539b1c8e9472533faeef190cfa8476ad` |

The corresponding derive functions in the installed and workspace libraries
are identical. Their unrelated retained-approval difference does not explain
this observation. This is a misleading diagnostic and recovery result; the
write guard still refuses the stale submission. No gate bypass is claimed.

## Correction and acceptance

- Observe the actual submitted Plan/Spec paths before deriving inspect status,
  and use the same observed result for the structured recovery action.
- Changed PRD and changed Spec each report digest drift with the proper
  sanctioned recovery, instead of a false `PLAN-LIFECYCLE-CURRENT` result.
- Missing/unreadable source cannot be promoted to an unobserved current source.
- An unchanged valid submission retains its correct lifecycle result.
- Keep inspect read-only: do not rewrite, rebind, reopen or approve a plan as a
  side effect of inspection.
- Record meaningful regressions and the committed implementation evidence;
  manual closure only after integration and verification.

## Evidence and scope

Independent source report:
`scratch/installed-guard-lifecycle-difference-914270f1.md`, SHA256
`8d6eb23bc3c0e098abfc0df7f63cc396b2776720fdcb7e44580c6fe1b6707b30`.
It cites `pipeline-state.mjs:11810`, `guard-devplan.mjs:474`–491 and
`plan-spec-state-v2.mjs:453`/575–624. This evidence preserves the public source
digests and the independently established cause, without publishing private
runtime contents.

The exact repair signatures were consumed and the 25-surface host-readiness repair committed as `8b5dcf4fbe4fc39f914118885d642fc0952d9210`; this diagnostic correction remains separately pending.

A two-file correction is prepared in `scratch/inspect-source-digest-correction-914270f1/`. Actual host-authorized tests passed 26/26 (a8cd00); source patch SHA256 `24952b6f8dedac0431ea0c75db6bd0c25c1ac49c764a1c0e5c34ade686bedd9a`. Prepared tests and scratch source are not productive integration or manual closure evidence.
