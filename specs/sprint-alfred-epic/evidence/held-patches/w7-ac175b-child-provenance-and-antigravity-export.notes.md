# Held patch notes: AC-175 part B, child provenance and Antigravity export

Slice W7-AC175B-CHILD-PROVENANCE-AND-AGY-EXPORT-20261030 (item `pipeline.forensics-and-audit-evidence-not-reconstructable`, PO decision D210). Built only in the prepared clones; the patch is a cumulative diff against the stacked candidate-12 commit and was apply-checked on the plain clone. It touches no file of AC-175 part A (`dispatch-briefing.mjs`, `audit-index.mjs`, `close-coordinator.mjs`), so the two patches apply in either order. Nothing was committed by the dispatch.

## What the patch changes

Production (two files):

- `plugins/pipeline-core/scripts/runner-transcript-recovery.mjs`
  - `childSessions` is now a list (empty when the runner records none) or a typed reason, never `"not-inferred"` for Claude or Codex.
    - Claude: children are read from `<project directory>/<sessionId>/subagents/agent-<id>.jsonl` with `agent-<id>.meta.json` (`agentType`, `toolUseId`, `spawnDepth`), the layout `guard-dispatch-budget.mjs` and `usage-ledger.mjs` already rely on. A child is listed only when its own records declare the parent session, the project and (when present) its own agent id. Its turn span comes from matching the meta `toolUseId` to the parent's `tool_use` and `tool_result` blocks.
    - Codex: children are the project-authenticated sessions whose own `session_meta` declares `source.subagent.thread_spawn.parent_thread_id` equal to the exported session (a fork, `forked_from_id`, is not a child). Turn span: the parent's `spawn_agent` call and output give the start, the last parent call or output that names the child gives the end.
    - Each child entry carries `childId`, `agentType`, `spawnDepth`, `startTurnIndex`, `endTurnIndex`, `transcript` (`sha256`, `byteLength`, `recordCount`, `unparsedLineCount`, first and last timestamp) and `usage`. No path, no free text (the meta `description` is dropped), no file name.
  - New top-level `turns`: `{ model, count, markersTruncated, markers: [{ index, record, timestamp }] }`, bounded to 500 markers. Turn model per runner: Claude one distinct assistant `message.id`, Codex one `event_msg` `task_started`, Antigravity one `turn.started`.
  - Antigravity: `exportRunnerTranscript` with runner `antigravity` reads the current conversation's transcript from the host context option `antigravityArtifactHost` (the shape `antigravityArtifactHostContext` produces from the pretool envelope) and from nowhere else. No directory is listed or guessed. Screens: the shared brain-layout predicate, a physical non-symlink single-link transcript, the shared credential screen (`isCredentialReadTarget`, `PASSIVE_READ_CREDENTIAL_ROOTS`) on the transcript and the artifact root, exact workspace match for the project, the claimed current session checked against the host conversation (typed identity conflict), and the requested session id must equal the host conversation id (own session only). Absent context stays typed unavailable (`antigravity-host-context-unavailable`); a context that fails any screen is `antigravity-host-context-invalid`. Child sessions: typed `antigravity-child-sessions-not-recorded`.
  - New incomplete reasons: `child-session-rejected`, `child-bound-reached`, `child-records-skipped`, `nested-workflow-children-not-listed`. New typed reasons: `child-storage-unavailable`.
  - The CLI argv shape is unchanged, so `lib/guard/sanctioned-args-scripts.mjs` needs no change. The CLI cannot receive the host context (no admitted flag, no environment variable carries it), so the CLI export for Antigravity answers `antigravity-host-context-unavailable`; the library route is for the in-process caller that holds the hook envelope.
- `plugins/pipeline-core/lib/current-session-artifact-export.mjs` (kernel module): pure extraction. The layout checks of `isCurrentSessionArtifactExport` moved verbatim into the exported `antigravityArtifactLayoutIsValid(host, root)`, and `physical` is exported as `artifactPathIsPhysical`. Admission is unchanged (artifact-export suite 7/7, cross-runner suite 4/4, identical to the baseline).

Tests: `plugins/pipeline-core/scripts/runner-transcript-recovery.test.mjs` only (six new cases named `AC-175B: ...`, no new test file, so no new suite registration; the file is already registered in `harness/scripts/verify.mjs` as `runner-transcript-recovery-tests`).

## Adapted existing assertions (written justification, tied to the Acceptance "merges segments, child sessions and turn boundaries ... for all three runners")

1. Three `childSessions === "not-inferred"` assertions (completeness test and the candidate-bound test) now expect `[]` for a session without children: the runner records children, so the old value is no longer a possible answer.
2. The pinned top-level key set of the Codex merge test gained `turns`.
3. The test "export of an Antigravity or unknown runner stays typed unavailable because no storage layout is established" is renamed and split by runner: Antigravity without a host context now names `antigravity-host-context-unavailable` (its layout is established); the unknown runner keeps `runner-transcript-source-unavailable` unchanged.
4. The completeness test title now says "a session without children lists none".
5. Helper `codexSegment` gained an optional `metaExtra` field (default `{}`), additive.

No existing case was weakened, skipped or deleted.

## Callers and consumers swept (each with the pin or the reason it is unaffected)

| Consumer | Effect | Pin / reason |
|---|---|---|
| `main()` in the script (CLI `export`) | argv unchanged; Antigravity answers the precise reason | CLI case in the recovery suite |
| `lib/guard/sanctioned-args-scripts.mjs` | unchanged (argv shape unchanged) | recovery suite CLI case; no table edit |
| `hooks/codex-session-start-hint.mjs` | hint text names `list` and `read` only, not `export` or the changed fields | `codex-session-start-hint.test.mjs` 9/9 and the Claude hint pin 13/13, green in both trees |
| `lib/guard/constants.mjs`, `hooks/guard-lifecycle-ready.test.mjs` | path of the script only | c2 run (see report) |
| `lib/runner-own-session-audit.mjs` and its pin | `audit-current` lane untouched | `codex-own-session-audit-export-missing.test.mjs` 14/14 |
| `hooks/antigravity-pretool-guard.mjs`, `lib/guard/evaluate.mjs` | consume `antigravityArtifactHostContext`, `crossRepositoryDenialReason`, `isCurrentSessionArtifactExport`; behavior unchanged | artifact-export 7/7, cross-runner 4/4 |
| `lib/guard-maintenance-window.mjs` | lists the kernel path; the file stays a kernel path | c2 run (see report) |
| skills, templates, agents, docs | no text names `exportRunnerTranscript`, the export fields or the reasons (only the capability inventory lists the Verify suite id) | text sweep; the script's own header block is the only reference text and was updated |
| `harness/scripts/check-verify-case-completion.test.mjs` | not edited | VCR01 is red with the identical failing name and identical count diff in the baseline clone and the edited clone (pre-existing on the candidate); the artifact-export case count (7) and the pin (20) stay consistent because no case was added there |

## Assumptions not verified against a live store

- Codex child linkage (`source.subagent.thread_spawn.parent_thread_id`, `depth`, `agent_role`), the `task_started` turn marker, and the `spawn_agent` output carrying `agent_id`: the same unverified spellings `runner-own-session-audit.mjs` carries. Where a runner does not record a field the entry says `null`.
- Claude child records must declare `sessionId` and `cwd` like the parent segments; a live child lacking `cwd` would be rejected and surfaced as `child-session-rejected`, never listed.
- Claude children nested under `subagents/workflows/` are not listed (`nested-workflow-children-not-listed`).
- Antigravity record kinds (`turn.started`, `turn.completed` with `usage`) are the ones the existing usage extractor already names.
- Older Claude layouts that stored subagent files directly in the project directory would still be merged as parent segments (existing behavior, not changed here).

## Revert proof scope

The driver's `config.json` lists only the script as a production file. The revert therefore restores the script and not the kernel module; this is sound because the kernel change is a pure extraction proven by the unchanged artifact-export and cross-runner suites, and the reverted script does not import the new helpers.

## Still pending (parent-owned)

Full Verify, batch Critic, the native Antigravity run (the host-context route needs a live envelope) and PO acceptance.
