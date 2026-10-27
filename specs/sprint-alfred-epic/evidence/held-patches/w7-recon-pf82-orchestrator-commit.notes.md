# Recon notes: PF-82 and D52 (D43, D45), background Goldfish host commit and the orchestrator commit route

Slice W7-RECON-PF82-ORCHESTRATOR-COMMIT-C1-20261027. Read-only recon, no patch, no test change. Candidate 3cf8c81a2. Rows: `pipeline.glossover.pf82-host-commit-never-completes-for-background-goldfish`, `pipeline.toolbox.d52-elephant-cannot-commit-intermediate-states`.
Budget note: the run was cut at the 80 % checkpoint (counted call 28 of 35); items marked NOT REACHED were not read.

## 1. Current behaviour: the launch sequence

All paths under `plugins/pipeline-core/`.

1. PreToolUse, `hooks/guard-dispatch.mjs:1012-1057`. A prompt carrying the `pipeline-native-goldfish-host-commit` marker calls `prepareNativeGoldfishHostState` (`lib/native-goldfish-host-state.mjs:184-253`, call at `guard-dispatch.mjs:1020`).
   - Claude background is admitted only when `run_in_background` is `true` or absent AND the `SubagentStop` hook is registered (`state.mjs:199-201`). Registration is read from the `hooks.json` BESIDE the running guard module (`guard-dispatch.mjs:227-244`; the repo copy registers it at `hooks/hooks.json:143-154`).
   - On success it writes a pending state keyed by `sessionId + toolUseId` with `completionRoute: subagent-stop` (`state.mjs:248-251`).
   - On failure: an item-governed dispatch is BLOCKED (`guard-dispatch.mjs:1040-1050`); otherwise it records a typed prepare-failure code (`:1053`, PF-26B) plus a stderr WARNING, and the dispatch CONTINUES with no pending state.
2. PostToolUse at launch, `lib/native-goldfish-host-finalizer.mjs:238-261`.
   - Pending found, route `subagent-stop`, result `async_launched`: returns `awaiting-subagent-stop` (message "completes when this child stops", `hooks/native-goldfish-host.mjs:27-30`).
   - Pending NOT found: returns `NGHF-PENDING-UNAVAILABLE` with `reason: async-launch` whenever `async_launched` or `run_in_background true` (`finalizer:251`).
3. SubagentStop (the completion), `finalizer:263-272`, helpers `:57-148`. It needs `agent_type` in the Goldfish set, an absolute `transcript_path`, and `agent_id`. The launching `toolUseId` is resolved from `<transcript>/subagents/agent-<id>.meta.json` (spawnDepth at least 1, agentType match). The pending state must exist and be `subagent-stop`. The contract is read from `last_assistant_message` or from the last `SubagentHandback` tool_use in the child's own transcript (`:94-130`). A replay is refused through `subagentStopAlreadyObserved` (`:35-47`). Then comes `assessAgyHostCommit` admission against the launch baseline (`:285-287`) and the commit and v4 record (`:299` onward, not read further).
4. Foreground is the same pending state without `completionRoute`; PostToolUse reads the return itself (`:262`).

## 2. Where the background case loses the completion

Key finding that corrects the relayed premise. `NGHF-PENDING-UNAVAILABLE` at launch does NOT mean "no final return reached the hook". It means NO PENDING STATE EXISTS at PostToolUse time. A healthy background launch reports `awaiting-subagent-stop` instead. The hook text (`native-goldfish-host.mjs:33`) states for every async launch that "no final return reached this hook", which blames the wrong layer and hides the real cause. The real cause is one of the following. Which one fired in the consumer and in this session is NOT measured here.
- H1. Preparation failed at PreToolUse and the dispatch was not item-governed, so it went on with a WARNING. The code is stored by PF-26B and appended to the message only when present (`native-goldfish-host.mjs:36`). If it is absent, the failure was not typed.
- H2. The running plugin copy has no registered `SubagentStop` entry, so `NGHS-CLAUDE-FOREGROUND-REQUIRED` applies. The guard reads the hooks.json beside the running module, and hooks execute from the installed marketplace copy, not the repo. A stale installed copy would explain "every return, every session". Measurement to run: compare the installed `hooks.json` SubagentStop entry with the repo one.
- H3. Pending was written, but the SubagentStop completion fails later. That would be visible as `awaiting-subagent-stop` at launch, not as PENDING-UNAVAILABLE, so it is NOT the reported symptom. It is a separate risk: the stop result only goes to hook stderr (`native-goldfish-host.mjs:69-71`), which the Elephant never sees. Failures leave only a `stop-failure-*.json` diagnostic (`finalizer:151-169`, PF-61, read by `scripts/dispatch-briefing.mjs:705`; PF-83 covers its creation after success).
- H4 (shared checkout). Admission is against the launch baseline (`state.mjs:235`, `finalizer:285`). If the Elephant or another dispatch commits between launch and stop in the shared checkout, HEAD no longer equals the candidate and completion refuses (`NGHF-COMMIT-ADMISSION` or similar). Plausible for a session that commits intermediate states; not measured.

## 3. Can SubagentStop complete a background commit today?

By design yes (the code path exists and has pins in `hooks/guard-dispatch.test.mjs:847-1013`). Input it needs is listed in section 1 item 3. It carries no resolved model; the receipt names the weaker assurance `host-observed-subagent-stop-correlation-model-not-observed` (`finalizer:52`). Not shown: a live end-to-end success in a real background session in this recon.

## 4. dispatch-record-write requirements

- `scripts/dispatch-record-write.mjs:204-216`: any v4 record with runner `claude` or `codex` and `outcomeClassification.kind: authored-commit` is refused unless it comes through `writeHostObservedNativeGoldfishDispatchRecord`, which reopens the private host observation receipt (`inspectNativeGoldfishHostObservation`, `lib/native-goldfish-host-observation.mjs`). The CLI route (`:490-501`) cannot satisfy it. This is why the Elephant's hand-written record is refused.
- v3 path (`:221-228`) still requires the recorded model to match the agentType; a NEW terminal v3 needs a non-empty log (`:180`). Whether a v3 record is still accepted as Critic-admission or push evidence was NOT reached. The hook message (`native-goldfish-host.mjs:37,40`) tells the Elephant to write the record via this script, which the v4 rule makes impossible for an authored Claude commit: the message and the writer contradict each other.
- Other v4 kinds the writer already accepts without host observation of authorship: `read-only`, `stopped-without-commit`, `completed-undelivered` (`:243-252`, Agy-only for the last two). So the schema already has a precedent for a kind that records a weaker fact under its own name.
- Admissibility of an orchestrator-commit record WITHOUT weakening the rule: yes, if it is a NEW kind (working name `orchestrator-committed`), never `authored-commit`. Binding: the hand-back payload sha256, the commit sha, the `Dispatch: <id> (goldfish)` trailer, `parent == candidateCommit`, changed paths within the briefed write scope (the same `assess` the host uses), and an explicit `assurance: orchestrator-attested`. Readers (`dispatch-authorship-verify`, Critic admission, the signed push check) must show it as attested, not host-observed. The host-observation rule for `authored-commit` is untouched.

## 5. Commit gates the Elephant meets on an intermediate commit

- GIT-03 (`guardrails/git.md:30-47`): final contiguous trailer block, `Dispatch:` plus `AI-Assisted: true`. A `(goldfish)` trailer is verified by `dispatch-authorship-verify` against a terminal record whose changedFiles cover the commit (`agent-obligations.md` section 6); with no record it cannot be verified. Other admitted bindings: `stage-0 (elephant)` (at most 2 files and about 25 lines), `design (elephant)` (at most 10 paths, design phase), `administrative (elephant)` (`git.md:50-65`: only backlog items, `backlog/transitions.ndjson`, STATUS and index projections, planning Markdown under `specs/<topic>/`; evidence, code, tests and runtime state are excluded), `D<n> (elephant-exception)` (needs a recorded PO decision).
- GG-17 (`git.md:150-152`): `--no-verify` has no agent override. D43/D45/D52 is therefore a real gap: `docs/state.md`, pipeline files and intermediate states of a feature fit none of the Elephant bindings above, except through a PO-recorded exception.
- NOT REACHED: the exact pre-commit snapshot rule and which hook produced the refusal that led to `--no-verify`; the semantics of `Commit-Act: orchestrator` (the string appears in `lib/native-goldfish-host-state.mjs`, `lib/close-authorship-record.mjs` and the Goldfish prompt templates, not read). D45 was reportedly solved in 757cc2f (not checked).

## 6. Gap list

| # | Gap | Tag |
|---|-----|-----|
| G1 | Hook message blames "no final return" for an async launch whose real condition is "no pending state"; typed prepare-failure code is optional | code-fixable-here |
| G2 | Hook message points at `dispatch-record-write.mjs` for a record the writer refuses (v4 authored claude) | code-fixable-here |
| G3 | No record kind for an orchestrator-committed Goldfish result; Critic admission and signed push have no evidence | code-fixable-here (shape) plus po-decision (is attested evidence acceptable) |
| G4 | SubagentStop outcome is invisible to the Elephant (stderr only; failure file read only by the briefing builder) | code-fixable-here (surface it in the next PostToolUse or `pipeline-state` readback), partly native-host-only (no injection field) |
| G5 | Installed plugin copy possibly lacking the SubagentStop entry (H2) | measure first; a repair is an installation step, not code |
| G6 | Shared-checkout HEAD movement between launch and stop voids completion (H4) | po-decision (serialise commits vs. rebase baseline) |
| G7 | No Elephant binding for `docs/state.md`, pipeline files and intermediate states (D43/D45/D52) | po-decision |
| G8 | The runtime never calls the SubagentStop hook for a background child on some builds | native-host-only (unproven; only a live probe can show it) |

## 7. Minimal slices for the code-fixable items

- Slice A (G1, G2): `hooks/native-goldfish-host.mjs`, `lib/native-goldfish-host-commit-execution.test.mjs`. RED: async-launch PENDING-UNAVAILABLE with a stored prepare code names that code and does not say "no final return reached"; the message never recommends a writer route that refuses the record. Subject: `fix(hooks): say why a background launch has no pending host-commit state`.
- Slice B (G3): `lib/dispatch-record.mjs` (new kind, validator), `scripts/dispatch-record-write.mjs` (an orchestrator-attested writer that rechecks commit, trailer, parent and scope in Git), `scripts/dispatch-authorship-verify.mjs` (label as attested), plus the Critic admission reader (NOT located in this run). RED: attested record accepted with matching commit and trailer; `authored-commit` without host observation still refused; out-of-scope path, wrong parent, missing trailer refused; reader never labels it host-observed. Subject: `feat(evidence): record an orchestrator-committed Goldfish result as attested evidence`. Depends on the PO decision below.
- Slice C (G4): surface the newest `stop-failure-*.json` code in the PostToolUse launch message and in the next pipeline readback. RED: a stop failure present shows its code. Subject: `feat(hooks): show a failed background host commit to the Elephant`.
- Slice D (G5): a read-only check comparing installed and repo SubagentStop registration; run as a measurement first.

## 8. PO decisions needed

1. Is an orchestrator-attested record (new kind, never `authored-commit`) acceptable evidence for Critic admission and the signed push? Recommendation: yes, shown as `orchestrator-attested`, with the Critic told the weaker assurance.
2. Which sanctioned Elephant binding covers `docs/state.md`, pipeline files and intermediate feature states without `--no-verify`? Options: widen `administrative (elephant)` by named paths, or a feature-scoped `intermediate (elephant)` binding bound to a plan. Recommendation: a narrow named-path extension for `docs/state.md` plus the pipeline files, not a general binding; intermediate feature states stay with the Goldfish records.
3. Shared checkout: forbid Elephant commits while a native background Goldfish is pending, or let the baseline follow HEAD. Recommendation: first measure H4; decide only if confirmed.

## 9. Confidence

- High: the launch sequence and the message mis-attribution (read at line level); the record-writer refusal; the GIT-03 binding list.
- Medium: that H1/H2 rather than H3 explains the symptom; the orchestrator record shape.
- Low or open: the real cause in the consumer sessions (needs the stored prepare code or the installed hooks.json), the pre-commit snapshot source of the `--no-verify` need, and whether a v3 record still serves as admission evidence.
