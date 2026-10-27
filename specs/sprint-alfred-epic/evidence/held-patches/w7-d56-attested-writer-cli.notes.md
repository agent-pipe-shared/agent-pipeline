# Held patch notes: D56 attested-writer CLI (slice c1)

Candidate: 9176a53ef41ca4a1bcade336b5bc422fe1fc94ba. Patch: `w7-d56-attested-writer-cli.patch` (git diff --binary against the candidate, 2 files).
Item/criterion binding: sprint-alfred-epic.2026-10-26-report-05-consumer-findings / AC-142 (generator binding only; the real topic is D56).

## Cause

`writeOrchestratorAttestedDispatchRecord` (dispatch-record-write.mjs ~line 184) existed only as a module export. The CLI knew only the
host route (`--repo-root`, `--request`), so no Elephant could run it, and building a full v4 record by hand is not realistic. A background
dispatch therefore left no record and Critic admission refused with `found 0`. Recon claims re-verified in the clone: the kind and its
validator (`orchestrator-attested`, `attestation` closed object) exist at lines 10-14 and 204-211 of lib/dispatch-record.mjs; the writer
route check and Git verification sit at lines 220-222 and 193-213 of the writer.

## Changed lines (in the patch)

plugins/pipeline-core/scripts/dispatch-record-write.mjs
- import: `reportSha256` added from lib/dispatch-record.mjs.
- new export `runAttestedRequest({repoRoot, attestedRequestPath}, dependencies)`: reads the closed request
  `{schema: pipeline.dispatch-attested-request.v1, briefingPath, handbackPath, commits}`, parses the briefing block after the
  `<!-- pipeline-native-goldfish-host-commit:` marker, builds the full v4 record and calls only `writeOrchestratorAttestedDispatchRecord`.
- `parseArgs` is now exported and accepts exactly one of `--request` / `--attested-request`; both together, or neither, is `usage`.
  Host route return value unchanged.
- main block dispatches to `runAttestedRequest` for `--attested-request`; receipt line and non-zero exit as before.

plugins/pipeline-core/scripts/dispatch-record-write.test.mjs: six new cases DRW26-DRW31 and the corpus count assertion 25 -> 31
(registered-case count only; no existing case touched, weakened or skipped).

Derivation (every field not derivable is refused with a typed error, never defaulted):
- from the briefing: taskId (=dispatchId), runner, agentType, model, effort, rulesetSha, criticDecision (must be the required schema, becomes criticRequired), allowedPaths.
- attestation.briefingSha256 / handbackSha256 = sha256 of the two files' bytes. report.text = hand-back text (a JSON hand-back's `report` string is taken); resultSha256 = reportSha256(text).
- report.changedFiles = sorted union of `git diff-tree` paths of the commits; candidateCommit = last commit; dispatcher "Elephant".
- log = the single entry of the fixture: phase orchestrator-attested, toolUseCount 0, note "tool-use count and worker model not observed".
- Typed codes: attested-request-shape, attested-request-path (absolute, `..`, or not under scratch/ evidence/ specs/), attested-briefing, attested-handback, attested-scope (a commit path outside the briefed allowedPaths; an entry ending in `/` is a prefix, otherwise exact). The writer adds record-attestation-git (missing/duplicate trailer, merge, non-linear chain), record-attestation-scope, record-model, target-exists.

## RED / GREEN

- RED (clone at candidate, new cases only): DRW26-DRW31 all fail (`writerModule.runAttestedRequest is not a function` / `parseArgs`); DRW01-DRW25 pass. 6 failing names.
- GREEN (patched clone): tests 31, pass 31, fail 0.
- Whole-file baseline (clone2, unchanged candidate): tests 25, pass 25, fail 0. Patched failing-name set: empty; baseline failing-name set: empty. Identical.
- No `dispatch-record-validate*` test file exists under plugins/pipeline-core (searched).
- Apply check: `git apply --check` of the patch in clone2 at the candidate: exit 0.
- Logs: scratch/agent-out/w7qv/{red,green,base}.dispatch-record-write.test.mjs.log (untracked scratch).

## Operator flow for the Toolbox case (Elephant)

1. Write the Goldfish report text exactly as received to `scratch/<id>-handback.txt` (it must be the real hand-back; the command cannot check that).
2. Commit the delivery with trailers `Dispatch: <ID> (goldfish)` and `Commit-Act: orchestrator`.
3. Write `scratch/<id>-attested.json`: `{"schema":"pipeline.dispatch-attested-request.v1","briefingPath":"scratch/<id>-briefing.md","handbackPath":"scratch/<id>-handback.txt","commits":["<40-hex>"]}`.
4. Run `node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <repo> --attested-request scratch/<id>-attested.json`; commit the resulting `evidence/dispatch-record-<ID>.json`; rerun admit.

## NOT done

- Sanctioned-args guard (lib/guard/sanctioned-args-scripts.mjs) is NOT edited (another held patch). It must admit this exact argv shape for the Elephant: `node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <path> --attested-request <repo-relative json>` (three flag/value pairs: `--repo-root`, `--attested-request`; flags in any order, each once; `--request` not combined).
- Not checked: that the first commit's parent equals the briefing's candidateCommit (a later-moved base would be legitimate; the writer does not check it either). Not checked: the commit was authored by the worker, the worker's real model, tool-use count, that the hand-back is genuine (all stated as unobserved by the record kind).
- allowedPaths scope refusal is my reading of "allowedPaths as the scope"; an Elephant commit that also adds files outside the briefed scope is refused, not recorded via orchestratorAddedFiles. Flag for the batch Critic if that is too strict.
- The briefed model alias (e.g. `sonnet`) must satisfy `compareRecordedModel` against the agent definition on the writer's attested route; a non-Claude runner is refused there with `record-model`. Not exercised with real git or a real briefing file (injected readers only).
- No end-to-end CLI run of the attested route against real Git; no change to readers (authorship-verify, admission, refusal text). Independent Critic review stays a parent-owned batch gate; Full Verify, PO acceptance pending.

## Operator steps

Apply the diff (`git apply plugins...` patch), `git add -u -- plugins/pipeline-core/scripts/dispatch-record-write.mjs plugins/pipeline-core/scripts/dispatch-record-write.test.mjs`, commit with `--no-verify`, then stamp and install.
Protected-path classification observed: neither changed file matches TP-1..TP-13 (agent-obligations §2); both are ordinarily editable, edited only in the scratch clone as briefed.

Proposed commit message: `feat(evidence): let the Elephant reconstruct an orchestrator-attested dispatch record from the briefing, the hand-back and the commits`
