---
schema: pipeline.backlog-item.v1
id: pipeline.kickoff-promotion-cleanup-readback-has-no-in-session-recovery
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Command-level analysis of the PO's private Codex + 0.5.4 greenfield test run, 2026-08-09 (Codex rollout, main thread), read from the rollout JSONL. The design/PRD/spec content itself was correct throughout; only the post-promotion pipeline state readback failed."
due: 2026-08-16
---

# `kickoff promote apply` can return `partial` with no agent-executable recovery, only an attended-host dead end

## What happened, in sequence

1. PO approved the kickoff→feature promotion ("ja"). The agent ran
   `project-onboarding-v3.mjs kickoff promote apply --root … --profile feature
   --id mini-runes-game --plan-path … --prd-path … --spec-path …
   --design-input-path … --runner codex --plan-sha256 … --activate`.
2. The transaction **did write** the promoted PRD/spec/continuity metadata —
   confirmed independently from `.git/agent-pipeline/onboarding/continuity-history.json`,
   which carries both the original `kickoff` transaction and the follow-up
   `kickoff-promotion` transaction with matching PRD/spec SHA-256s and the
   correct before/after handover hashes. `docs/state.md` was rewritten
   correctly, naming the promoted package as the kickoff directory's
   successor (the exact defect class filed as
   `2026-08-09-the-promotion-supersedes-the-handover-and-leaves-it-saying-otherwise.md`
   does **not** reproduce here — that part is fixed).
3. Despite the successful write, the command exited 1 and returned
   `"status": "partial"`, `"continuity": {"status": "unavailable", …}`, and:
   ```json
   {"path": "$.authority.sessionCleanup",
    "code": "cleanup_recovery_observation_unavailable",
    "message": "cleanup recovery authority could not be observed safely",
    "guidance": "repair private cleanup-state read access before retrying"}
   ```
   with `nextAction` pointing at `session-cleanup.mjs plan-human-recovery`.
4. Running that `nextAction` produced a `decision-required` plan
   (`SESSION-CLEANUP-PRIVATE-CAS`) with exactly two candidates:
   `retain-and-observe` (leave the pipeline partially blocked) and
   `attended-host-recovery` (mutation:false at this step, but the only path
   that could actually resolve anything).
5. The agent asked the PO for permission, correctly reassured them the
   *design* was untouched and correct ("Die Designinhalte selbst sind nicht
   falsch und bereits geschrieben; betroffen ist nur die private Pipeline-
   Sitzungsmetadaten-Readback"), got a "yes", read
   `skills/pipeline-start/references/private-overlay.md` per its own
   instruction, and ran the prescribed
   `session-cleanup.mjs plan-privatization --repo … --runner codex`.
6. That command was **blocked by the Pipeline's own PreToolUse guard**:
   ```
   BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-LIFECYCLE-NOT-READY:
   Pipeline session readiness is partial. Re-run the typed project-onboarding-v3
   inspection with intent session and use only its returned nextAction.
   Guard recovery route: {"status":"external-operator-required",
   "code":"HGO-EXTERNAL-REPOSITORY-OBSERVATION",
   "nextAction":{"kind":"external-operator","executionBoundary":"attended-host-terminal",
   "invocation":"user-copy-only", …,
   "reason":"the host repository preimage cannot be attested inside this guard process"}}
   ```
   No PO confirmation, however granted, changes this: the guard's own recovery
   route requires a literal human at an attended terminal, outside the agent
   sandbox entirely. The session ended shortly after without resolving
   anything further.

## Why this is a dead end, not just friction

Every step the agent took was the one the Pipeline's own reference material
told it to take (read `private-overlay.md`, ask the PO, run the prescribed
command). The failure is not a missing instruction or a missing PO
confirmation — it is that **the only mutation-capable candidate
(`attended-host-recovery`) cannot be executed from inside any agent session**,
Codex or otherwise, once the guard's git-root/common-dir attestation
(`HGO-GIT`/`HGO-ROOT`/`HGO-COMMON-DIR`, `codex-pretool-guard.mjs:497-513`)
fails. There is no third candidate and no typed in-session repair — exactly
`retain-and-observe` (stay blocked) or a human who isn't there.

## This is a known, already-acknowledged failure class — not a new one

Two design artifacts already name this exact state as a target the Pipeline
has not yet closed:

- `specs/sprint-nova-epic/design/rebase-readiness-0.4.7.md:110-115`: "The
  lifecycle then returned `partial` with `cleanup_recovery_observation_unavailable`
  and exposed no `nextAction`."
- `specs/sprint-nova-epic/implementation/issue-acceptance-matrix.md:72-77`
  lists "a generated `cleanup_recovery_observation_unavailable` state with no
  typed repair action" explicitly among the **failing acceptance outcomes**
  Issue `#57`/`NVA-B61-7` (canonical delivery/status reconciliation,
  platform-neutral capability diagnostics) is supposed to close.

So this run did not discover a new defect class; it reproduced a named,
tracked one against the actual 0.5.4 candidate. It is still live because
Nova A (which owns #57/NVA-B61-7) is, per today's `docs/state.md`, "still
paused on genuine ADR-gated/evidence-gated blockers" — the fix was never
reached, not fixed-and-regressed.

## A plausible mechanical trigger, worth checking directly

Not independently confirmed, but consistent with everything observed: Codex's
default sandbox marks the repository's `.git/` read-only
(`permission_profile.file_system.entries` in the rollout's `turn_context`
shows `.git` at `"access":"read"` against the project root's `"access":"write"`).
Since the Pipeline stores all private onboarding/session-cleanup state under
`.git/agent-pipeline/`, *every* write there — including this one — must go
through Codex's `sandbox_permissions:"require_escalated"` exec path (visible
on the `kickoff promote apply` call itself). If the guard's git-root/common-dir
attestation cannot reliably run from inside that escalated-exec process
boundary, every private-state write in Codex is one attestation hiccup away
from this exact dead end. Worth measuring directly rather than assumed: does
the same command, run through the *ordinary* (non-escalated) Codex exec path,
still trip `HGO-GIT`/`HGO-ROOT`/`HGO-COMMON-DIR`?

## Why it is filed rather than fixed here

`codex-pretool-guard.mjs`'s HGO branching and `onboarding-continuity.mjs`'s
`SESSION-CLEANUP-PRIVATE-CAS` handling are exactly the class of guard/lifecycle
code this session's PO instruction did not authorize touching (candidate
under test, not to be modified pending its own release decision). Filed for
whichever session picks up #57/NVA-B61-7, or as its own narrowly-scoped
guard fix if the escalated-exec attestation gap is confirmed as the trigger.

## Direction

1. Confirm or rule out the escalated-exec attestation trigger above.
2. Either fix the attestation path so it doesn't degrade to
   attended-host-terminal from a legitimately escalated (not malicious) exec
   context, or give `plan-human-recovery` a third, genuinely in-session
   candidate for this specific cause.
3. At minimum, `cleanup_recovery_observation_unavailable` should say which of
   the two outcomes (stay blocked vs. needs a human at a terminal) applies
   *before* the agent spends a full round-trip (PO question, reference read,
   blocked command) discovering it has no agent-executable path at all.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
