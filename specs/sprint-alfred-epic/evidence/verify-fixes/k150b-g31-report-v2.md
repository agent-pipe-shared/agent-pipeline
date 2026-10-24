# K150B-G31 signing correction — inert proposal

## Coordinator additional fixture check

The coordinator audited the existing signing examiner's fixture-owned repositories, synthetic generated keys, default injected `homedirFn`, explicit synthetic confirmation/candidate, and cleanup. Against this inert v2 source, `node --test --test-name-pattern='^authorize-critical prepares and signs in ONE invocation' plugins/pipeline-core/scripts/po-human-approval.test.mjs` passed 2/2 at the host boundary. This covers actual request/proof verification with synthetic keys, including the new external-path return. No operator key, live approval or terminal signature was used. The broader suite and integrated qualification remain pending. Main G23's separate static-help hunk must be preserved during any later source import.

Base: `13ed1539bef27e3d897934ff9ce58e39c01ceb8f`. The staged three-file patch is `k150b-g31-v2.patch` (10,954 bytes; SHA-256 `9e59ac5d4929a3598cf7778b4acb3ed026c6a45297ee190b59e39892a824934b`). It supersedes the preserved v1 patch and report in this scratch directory. Nothing committed; main tracked files are untouched. This correction continues the original attempt; it does not reset v1 attempt history or cost.

## Result and evidence

Targeted delivery: green for pure presentation and external proof result formatting. The new multi-kilobyte nested path examiner failed against v1 (`red-v2.json`, exit 1) because its disclosure line exceeded 300 characters; it passes after the correction (`green-v2-final.json`, exit 0, 4/4). A prior intermediate GREEN attempt failed due to test assertions that incorrectly required a locator for a still-bounded 251-character path; its evidence is retained in `green-v2.json` (exit 1). The final 251-character case preserves full-line path presentation. The ~2.9k-character case presents an exact filename under `scratch/`, points to the canonical request/material record for the full path, and shows the material digest; every line is at most 300 characters.

| Check | Exact wrapped command | Exit | Machine evidence |
| --- | --- | ---: | --- |
| RED v2 | `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/agent-out/k150b-g31/red-v2.json --label k150b-g31-red-v2 -- node --test scratch/clones/k150b-g31/plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs` | 1 | `scratch/agent-out/k150b-g31/red-v2.json` |
| Final focused GREEN | `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/agent-out/k150b-g31/green-v2-final.json --label k150b-g31-green-v2-final -- node --test scratch/clones/k150b-g31/plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs` | 0 | `scratch/agent-out/k150b-g31/green-v2-final.json` |
| AC-261 P1–P4 pin | `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/agent-out/k150b-g31/pin-v2.json --label signing-prompt-pin-v2 -- node --test --test-name-pattern=^P[1-4]: scratch/clones/k150b-g31/plugins/pipeline-core/lib/pins/signing-prompt-prints-the-whole-review-package.test.mjs` | 0 | `scratch/agent-out/k150b-g31/pin-v2.json` |
| Consumer-safe paths | `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/agent-out/k150b-g31/consumer-v2.json --label consumer-safe-v2 -- node --test scratch/clones/k150b-g31/harness/scripts/check-consumer-safe-paths.test.mjs` | 0 | `scratch/agent-out/k150b-g31/consumer-v2.json` |

`git diff --cached --check` passed (exit 0). Quick route is unavailable by briefing. Actual terminal signing, external proof gate consumption, the broader approval examiner needing a signing fixture, integrated Full Verify, independent Critic and PO acceptance remain pending with the parent. No real key/signature or native session action was used.

## Changed files

- `plugins/pipeline-core/scripts/po-human-approval.mjs`: v1 full-path custody, bounded path guard and external proof output remain; v2 bounds exceptional disclosure lines using an exact filename locator and retains digest/pre-key readback.
- `plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs`: adds the >300/multi-kilobyte behavioral counterexample and preserves malformed control/digest and G31 proof checks.
- `plugins/pipeline-core/scripts/po-human-approval.test.mjs`: v1 additive external-path assertion in original examiner remains intact.

Deliberately not changed: PRD/Spec, external-proof policy, HGO implementation, protected pins and main tracked files. The original acceptance examiners remain unchanged. The full authoritative path is held in the source-owned material reference; the bounded locator requires searching the scratch tree by exact filename and confirming the printed digest if filenames collide. The correction creates no new material alias. This is a presentation limitation for exceptionally nested roots, not a relaxation of proof or signing custody.
