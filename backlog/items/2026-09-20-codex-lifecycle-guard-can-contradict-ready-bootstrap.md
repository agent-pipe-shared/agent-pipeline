---
schema: pipeline.backlog-item.v1
id: pipeline.codex-lifecycle-guard-can-contradict-ready-bootstrap
type: defect
owner: pipeline
status: closed
created: "2026-09-20"
closed_at: "2026-09-20"
closure_repository: "self"
closure_commit: "0aeaef18f6e14edd2dc7271e36e4784237408ad6"
closure_evidence: "plugins/pipeline-core/lib/worktree-lifecycle.mjs"
source: "Live 0.7 candidate bootstrap on 2026-09-20: pipeline-start-preflight, onboarding, hook freshness and governance all returned ready, while the nested Codex lifecycle guard denied an ordinary Git read as partial."
sprint: nova-b
done_when: manual
---

# Codex lifecycle guard can contradict a ready bootstrap

## Description

The Codex pre-tool adapter independently executes guard-lifecycle-ready after the durable bootstrap has already reported ready. The two paths can disagree and prevent even read-only diagnosis or the guard's own recovery actions.

## Triggering situation

On 2026-09-20 the installed 0.7 candidate reported ready onboarding, current hooks, CAS-READY and passed observation governance, then denied a Git read with GUARD-LIFECYCLE-NOT-READY.

## Affected artifact

plugins/pipeline-core/hooks/codex-pretool-guard.mjs, plugins/pipeline-core/lib/worktree-lifecycle.mjs, and guard-lifecycle-ready.mjs.

## Proposal

Replace the duplicated nested readiness decision with one authoritative, tested readback. The temporary Codex bridge disable must be reviewed before any re-enablement.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Root cause analysis:**
  1. An interrupted or orphaned atomic write file (`.capability-*.tmp`) in `.git/agent-pipeline/session-descriptors/active/` caused `listActiveSessionDescriptors` in `worktree-lifecycle.mjs` to throw `WT-SESSION-DESCRIPTOR-DIRECTORY` on the unexpected non-`.json` entry.
  2. This failure caused `inspectProjectOnboardingV3` to fall back to `cleanupHumanRecoveryAction` with `status: "partial"`, which triggered `guard-lifecycle-ready.mjs` to block write tools and commands.
  3. The Codex pre-tool guard was temporarily bypassed (`lifecycleShouldRun = false`) during triage.
- **Resolution:**
  1. Cleaned up the stale `.tmp` fragment in `.git/agent-pipeline/session-descriptors/active/`, immediately restoring repository status to `ready`.
  2. Hardened `writeAtomic` in `plugins/pipeline-core/lib/worktree-lifecycle.mjs` to unlink temporary files upon failure.
  3. Added a defensive filter in `listActiveSessionDescriptors` to ignore hidden temporary files matching `^\..*\.tmp$`, preventing orphaned temporary files from invalidating descriptor directory enumeration. Added regression test `D0-TMP-IGN` in `worktree-lifecycle.test.mjs`.
  4. Restored `lifecycleShouldRun` in `plugins/pipeline-core/hooks/codex-pretool-guard.mjs`.
  5. Updated `createReadyLifecycleFixture` in `codex-pretool-guard.test.mjs` to align with the runner-permission decoupling from ALF-UPDATE-PERMISSIONS.
  6. Verified: all 37 tests in `codex-pretool-guard.test.mjs`, all 253 tests in `guard-lifecycle-ready.test.mjs`, and all 44 checks in `worktree-lifecycle.test.mjs` pass.
