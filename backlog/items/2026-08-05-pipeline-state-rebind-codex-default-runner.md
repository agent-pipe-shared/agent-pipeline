---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-state-rebind-codex-default-runner
type: defect
owner: pipeline
status: closed
created: 2026-08-05
source: "Read-only skills audit, Sprint Nova session 2026-08-05 (finding 1 of 6); re-raised as T1 Critic finding F-B (major) against candidate 8d9b3df for lacking a dated tracking artifact"
closed_at: 2026-08-06
closure_repository: self
closure_commit: 7514fb95f23d6b30bd42bbed2435f2dc4d76ca61
closure_evidence: backlog/evidence/2026-08-06-second-reconciliation-pass.md
---

# `po-authority-rebind-apply` force-rolls-back a Claude session on a false App-Server failure

## Description

`plugins/pipeline-core/scripts/pipeline-state.mjs:4470-4473`:

```js
const inspectV4 = deps.v4Inspection
  ?? ((request) => inspectProjectOnboardingV3({ ...request, deps: inTransactionV4Deps }));
const v4Readbacks = ["bootstrap", "session", "dispatch"]
  .map((intent) => inspectV4({ rootDir: deps.dir, intent, deps: inTransactionV4Deps }));
```

No `runner` key is passed, so `inspectProjectOnboardingV3`'s own
`runner = "codex"` default applies — inside a transaction whose failure mode is
a forced rollback. This feeds `postimageEvidence.predicates.v4Intents`
(line 4492), and line 4507 requires `.every((readback) => readback.ok)`
(`ok = status === "ready"`) before `runPoAuthorityRebindApply` commits
(lines 4211-4463).

Only the `"onboarding"` intent is App-Server-exempt in `observeReadyAppServer`;
`"bootstrap"`/`"session"`/`"dispatch"` are not, and `"codex"` is not in
`RUNNERS_WITHOUT_APP_SERVER` (only `"claude"` is). A genuine Claude Code
session running this recovery command with no reachable Codex App-Server
daemon therefore gets non-`ready` statuses and the entire rebind is
force-rolled-back — a false failure caused purely by runner misidentification.

`guard-lifecycle-ready.mjs:636` allow-lists exactly this recovery flow
(`po_authority_rebind_unavailable` → plan → apply), so it is a realistic path,
not a theoretical one. `pipeline-state.mjs` contains zero references to
`CLAUDECODE` anywhere in the file, and
`scripts/pipeline-state-result-rebind.test.mjs` never mentions `runner`.

This is the same defect class ADR-0051 governs and that commits `cc272ea` /
`9167175` fixed elsewhere — it was simply out of those commits' scope.

## Triggering situation

Found by the read-only "harden all skills" audit dispatched in the Sprint Nova
session, 2026-08-05 (finding 1 of 6, classified **live/reachable**). Initially
recorded only as prose in `docs/state.md`. The subsequent T1 Critic review of
candidate `8d9b3df` raised that as finding **F-B (major)** under QG-06: a known
live gap carried forward with no owner, no expiry, and an explicit "either
dispatch a fix or record a backlog item" that permitted doing neither is a
finding, not a mitigation. This item is that missing tracking artifact.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-state.mjs:4470-4473` (primary).

Two cosmetic siblings from the same audit, tracked here rather than separately
because they share a cause and a fix session:

- `plugins/pipeline-core/skills/pipeline-start/SKILL.md:35` — prints
  `"Agent Pipeline source: local-development · registered local Codex
  marketplace"` unconditionally in every local-dev bootstrap. The only
  marketplace file in the repo is `.claude-plugin/marketplace.json`
  (at the time of this finding self-described `"agent-pipeline-local"`, "for
  Claude Code"; since renamed to `"agent-pipeline"` by ADR-0052/`d3db4a0`, see
  the sibling backlog item); there is no separate Codex marketplace file, so a
  Claude Code session printed a factually wrong claim.
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md:72-75` — instructs
  treating `executionBoundary: "host-authorized-wsl"` with Codex-sandbox
  vocabulary ("never first retry it in the Codex workspace sandbox"), while
  `pipeline-start-preflight.mjs:126` computes that boundary purely from
  `WSL_DISTRO_NAME`/`WSL_INTEROP` with no runner gating. A Claude Code session
  under WSL therefore receives Codex-specific instructions with no documented
  Claude-side equivalent.

## Proposal

1. Thread an explicit runner into the three `inspectV4` readbacks in
   `pipeline-state.mjs` — but resolve it at that command's own boundary, **not**
   via a `process.env.CLAUDECODE` fallback inside shared code (see
   `backlog/items/2026-08-05-ready-gate-env-var-runner-authority.md`, which is
   the Critic finding against exactly that shortcut).
2. Add a regression test asserting a Claude-runner rebind reaches `ready`
   without an App-Server daemon.
3. Make the two `pipeline-start/SKILL.md` lines runner-conditional, or reword
   them runner-neutrally with an explicit Claude-side equivalent (ADR-0051's
   "paired explicit path" shape).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted; the code half is delivered.
- **Rationale:** Commit `7514fb9` adds an explicit `--runner claude|codex` to
  `po-authority-rebind-apply`, resolved at the CLI boundary from `CLAUDECODE`
  when absent, threaded into all three `inspectV4` intents; a Claude-runner
  rebind now reaches `ready` without an App-Server daemon, matching Proposal
  steps 1-2. The same commit also rewords `pipeline-start/SKILL.md`'s
  local-marketplace line to be runner-neutral and scopes the sandbox-boundary
  MUST's Codex-specific clause explicitly to Codex, addressing Proposal step
  3. `po-authority-decision-apply`, which shares the same apply helper, is
  deliberately left byte-for-byte unaffected (no runner passed, same internal
  `"codex"` default as before) since it was out of this fix's scope.
- **Assignment (if accepted):** Delivered by commit `7514fb9`, dispatch
  `REBIND-RUNNER-04` (goldfish), Sprint Nova session, 2026-08-06. No further
  assignment needed for the code half.
- **Date:** 2026-08-06
