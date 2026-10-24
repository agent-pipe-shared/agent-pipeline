# K150B-G31-SIGNING inert proposal

## Coordinator readback: revision required

The coordinator could read the capture files through their complete root-relative paths. The RED capture shows 1/3 passing: the long material path refuses and the external-proof formatting returns the scratch path. Final focused GREEN is 3/3, the selected AC-261 P1-P4 pin is 4/4, consumer-safe paths 9/9. These are proposal-only results.

This v1 patch is **held for revision, not integration**. A read-only pure probe with a valid 719-character path is accepted but renders a 743-character line. The existing AC-261 examiner requires every rendered line at most 300 characters. Passing the original short-path fixture does not establish the bounded UI property for newly admitted paths. The repair must preserve compact human disclosure and full authoritative path/digest/readback identity together, without weakening the existing bound or simply rejecting legitimate long roots. No new PO decision is needed to preserve this existing acceptance.

Base: `13ed1539bef27e3d897934ff9ce58e39c01ceb8f` in `scratch/clones/k150b-g31`.
Portable patch: `k150b-g31.patch` (8,751 bytes, SHA-256 `8323ffde3f17131a6c27e82f42ac7bb07d5b0f513d061041a7804780f65c1b0c`). It is the exact `git diff --cached --binary` for all three owned changed paths, including the new test. Nothing committed; main tracked files untouched.

## Changed paths

- `plugins/pipeline-core/scripts/po-human-approval.mjs`: expands the signing review path guard to 32,767 characters, rejects control characters before file use, carries the whole material path through publication/readback/disclosure, and exposes/prints the external critical proof path while retaining the existing scratch mirror result for its pinned push flow.
- `plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs`: pure long-path, malformed path/digest, and human-facing external handoff regressions.
- `plugins/pipeline-core/scripts/po-human-approval.test.mjs`: additional assertion in the original critical authorization examiner that its external result paths point to the durable external artifacts. The original examiner remains intact; this added assertion was not executed because that case uses a signing fixture.

## Observed checks

Each command below ran from the inert clone through `capture-evidence.mjs` at the preflight-declared host boundary. The capture command reported writing the named artifact; subsequent read-only inspection of clone scratch artifacts was refused by the guard, so test counts and RED failure details were not independently read back.

| Purpose | Exact command | Observed exit | Machine artifact |
| --- | --- | ---: | --- |
| RED before source edit | `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/k150b-g31-red.json --label k150b-g31-red -- node --test plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs` | 1 | `scratch/clones/k150b-g31/scratch/k150b-g31-red.json` |
| Focused GREEN after final edit | `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/k150b-g31-green-final.json --label k150b-g31-green-final -- node --test plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs` | 0 | `scratch/clones/k150b-g31/scratch/k150b-g31-green-final.json` |
| Existing AC-261 P1-P4 pure pin | `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/k150b-g31-pin.json --label signing-prompt-pin -- node --test --test-name-pattern=^P[1-4]: plugins/pipeline-core/lib/pins/signing-prompt-prints-the-whole-review-package.test.mjs` | 0 | `scratch/clones/k150b-g31/scratch/k150b-g31-pin.json` |
| Required consumer-safe path check | `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/k150b-g31-consumer-safe.json --label consumer-safe -- node --test harness/scripts/check-consumer-safe-paths.test.mjs` | 0 | `scratch/clones/k150b-g31/scratch/k150b-g31-consumer-safe.json` |

The focused GREEN proves only the pure disclosure/formatting behaviors. It does not qualify a real terminal signing ceremony, external proof consumption by the integrated push gate, stale-material rejection in the full route, native runner integration, Full Verify, independent Critic review, or PO acceptance. Those remain pending with the parent/integrator. No real account key, live signature, run-in/run-quiet, stamp, push, or native host-commit was used. Quick check is unavailable by briefing.

## Boundary and risk

The 32,767-character guard is a finite generous path limit; it does not abbreviate any accepted path. It replaces the 240-character cutoff in the three path gates. A long valid path is printed in full, so the AC-261 compact-output size/line-length property is no longer universal for exceptional paths. The existing P1-P4 pin stayed green on its original short-path material, but a path near the new maximum could make the disclosure much larger. The parent should assess that tradeoff before integration. The push consumer's existing narrowly pinned scratch exception was neither expanded nor removed; the new external path is available for consumers requiring external-only proof.

Guard readback limitation: `cat` and `stat` on clone scratch artifacts, and a later `rg --files` attempt, were refused as `GUARD-READ-COMMAND-UNSUPPORTED` / `HGO-DECISION-RECORD-UNAVAILABLE`. The exact read-only audit recovery returned `status: valid`, but repeating a scratch read still refused. No further identical read retries were made.

Deliberately not changed: the PRD/Spec, `pipeline-state.mjs` proof admission policy, `human-guard-override.mjs`, original acceptance examiners, main tracked tree, protected pins, and lifecycle state.
