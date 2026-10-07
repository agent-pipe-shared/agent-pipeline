# Signed package for the 0.7.0 candidate — protected-path slices

Protected-path changes cannot be committed in-session (pre-commit `PB-GUARD-HOOKS`, protected test paths TP-*, kernel
paths). Each slice below is staged here as an exact patch of Goldfish-authored work (or listed as still to be authored),
so the PO can review and sign them together at one attended ceremony. Applying a patch and committing it under the
signed human-guard-override is part of that ceremony; nothing here is applied yet.

| Slice | Paths | State | Source |
|---|---|---|---|
| ENVDUMP-F wiring | `plugins/pipeline-core/lib/guard/env-dump-lane.mjs` (new), `plugins/pipeline-core/lib/guard/evaluate.mjs` | patch staged: [`envdump-f.patch`](envdump-f.patch); pins `069813bf3` 36/36 with it applied (`evidence/envdump-f.txt`) | dispatch ENVDUMP-F (record `evidence/dispatch-record-ENVDUMP-F.json`) |
| Verify registrations | `harness/verify-suites.json` (TP-13), `harness/scripts/verify.mjs` (TP-3) | to author: test-private-tmp, scratch-retention, scratch-sweep, design-consistency-check, design-review-receipt, design-approval-binding, Q11/T33 | execution order |
| R7-6 protected parts | `harness/scripts/pipeline-state.mjs` | to author: approve-push anchor checks (AA G2/G3), local push scratch route, `set-po-key-directory` catalogue entry | `plans/r7-6-multi-key-aa.md` |
| R1 catalogue, R7-11e hooks.json, decision K/Q lanes, A-S3/C-S4 catalogue | per execution order | to author | execution order |
| ADR-0085 P0–P9 protected slices | per `plans/adr-0085-implementation-plan.md` | to author | ADR-0085 plan |

The ENVDUMP-F diff is also still staged in the shared working tree (not committed). Dispatches commit only their own
paths (`git commit -- <paths>`), so it is not swept into another commit.
