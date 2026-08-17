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

**Superseded in part, 2026-08-09 (PO instruction, same day):** the PO
separately authorized a bounded hardening pass on two adjacent points — (i)
making the `HGO-EXTERNAL-REPOSITORY-OBSERVATION` guidance actionable rather
than hash-only, and (ii) a `guard-lifecycle-ready.mjs` argv-allowlist gap
found by direct code inspection while investigating this item. That
authorization does **not** extend to Direction 1–3 below, which remain fully
open — see the review record.

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

**None of the three items above are closed by the review record below.** They
require the escalated-exec attestation measurement this item's own
"plausible mechanical trigger" section says is still unconfirmed, and remain
assigned wherever #57/NVA-B61-7 lands.

## Review record — GF-059 (FAILED, 2026-08-09)

A first attempt at the bounded hardening (points (i)/(ii) above) was
dispatched as GF-059 and independently Critic-reviewed before merge
(self-application, ADR-0014). **Verdict: FAIL.** Full report:
`scratch/nova-4e164e09/critic-notes.md`. Not merged; commits remain on the
abandoned worktree branch `worktree-agent-a2b2a34b84f687185`
(`f3bbf275`, `20d562bf`).

- **F1 (blocker):** the diff addressed neither this item's Direction 1–3 nor
  anything the dispatch briefing had actually asked for in those terms — a
  scoping error in how this Elephant framed the dispatch, not a Goldfish
  defect. This section (and the split-out allowlist item, see below) is the
  correction.
- **F2 (major, security-relevant):** the guidance-actionability fix ((i)
  above) added the literal denied command to `codex-pretool-guard.mjs`'s
  `hostBoundary` catch branch — exactly the branch reached when
  `human-guard-override.mjs`'s `topology()` throws `HGO-GIT`/`HGO-ROOT`/
  `HGO-COMMON-DIR` *before* the existing secret-eligibility screen's result
  is applied. A secret-bearing denied command could now be echoed verbatim
  into a persisted session transcript, inverting the codebase's own
  hash-only-for-secrets design on this one path. Must be fixed by gating the
  literal command on the already-computed eligibility result, not reverted
  to silence — the human-facing actionability goal (i) is still valid and
  still PO-authorized.
- **F3 (major):** consequence of F1 — the diff touched code this item's own
  "Why it is filed rather than fixed here" section named as
  not-to-be-modified. Resolved by the "Superseded in part" note above; the
  PO's later authorization was for (i)/(ii) specifically, not a license to
  address Direction 1–3.
- **F4 (minor):** the argv-allowlist widening (ii) covered 6 of the
  subcommands `session-cleanup.mjs` documents `--runner` for for, not all of
  them. Split out as its own item (see below) since it is unrelated to this
  item's actual failure chain — the incident's own transcript shows
  `plan-privatization` invoked *without* `--runner` at all
  (`references/private-overlay.md:4` documents it that way), so the
  allowlist gap, while real, did not cause this incident.
- **F5 (minor):** the literal-command payload is an empty string for
  non-Bash tool denials (Edit/Write/apply_patch have no `tool_input.command`)
  — more misleading than the hash-only form it replaced.

**Follow-up:** the allowlist gap (F4) is tracked as its own item —
`backlog/items/2026-08-09-guard-lifecycle-ready-runner-allowlist-incomplete.md`
— since it is a real, independent defect unrelated to this item's root
cause. A corrected rework of (i), fixing F2/F5, is in progress under this
item; Direction 1–3 stay open regardless of that rework's outcome.

## Second confirmed trigger, 2026-08-17 (independent recurrence, different consumer project)

A second, independent recurrence of this exact failure class — PO's Codex
happy-path test on an unrelated project ("Rune_Test1_Codex_055_50" /
"ruinen-browsergame"), relayed as an AI-authored forensic report and
independently re-verified against this checkout's own current source before
being recorded here (never trusted from the relay alone). This time the
precise mechanical trigger IS confirmed, closing this item's own Direction 1
("confirm or rule out the escalated-exec attestation trigger") with a
DIFFERENT, more precise cause than the one hypothesized above — the two are
not mutually exclusive; either can independently produce the same
`recovery-unavailable`/`SESSION-CLEANUP-PRIVATE-CAS` symptom.

`kickoffPromotionCleanupRecoveryPlanCore()`
(`plugins/pipeline-core/lib/onboarding-continuity.mjs:5109`) hard-codes
`state?.continuity?.revision !== 2` as a literal equality check, not a floor
or range. A kickoff's own `revision` is 0 unless it already resumed once
after a host-no-background-wakeup binding (which sets it to 1);
promotion sets `next.continuity.revision = kickoff.revision + 1`. So the
recovery core is reachable only after a revision-1→2 promotion — i.e. only
when the kickoff itself had *already* resumed once before being promoted. A
project's **first, ordinary** kickoff→promotion (revision 0→1) is
structurally outside what the recovery core accepts. This is not a rare
misfortune case; it is the single most common path (a brand-new project's
first promotion) landing outside the only implemented recovery.

In the specific run studied, the proximate mismatch was caused by a private
cleanup binding created *between* kickoff and promotion (for a separately
rejected Advisor dispatch attempt, `PORG-NOT-READY`) that `recognisedKickoff`
never observed because it only reads the private binding from disk when
`continuity.revision === 1` at kickoff-observation time — so the binding
landed post-promotion at revision 1, which the `revision !== 2` check then
rejects. The `plan-human-recovery` → `attended-host-recovery` recommendation
→ `plan-recovery` → `recovery-unavailable` chain reproduced exactly as this
item's original 2026-08-09 incident describes (verbatim transcript evidence:
`plan-recovery` returned `{"schema":
"pipeline.kickoff-promotion-cleanup-recovery-plan.v1", "status":
"recovery-unavailable"}`).

This strengthens Direction 2's existing ask (a third, genuinely in-session
recovery candidate) with a concrete, fixable target: the recovery core's
revision check needs to accept the revision-0→1 case (or, more precisely,
derive its expected before/after revision from the promotion's own history
entry rather than a hardcoded literal), not just the revision-1→2 case it
currently accepts.

**Not independently reproducible: the `plan-privatization: noop` sub-claim.**
The forensic report also claimed `plan-privatization` returned `noop` despite
a demonstrable divergence still being present. Independently checked against
the transcript: by the time `plan-privatization` ran, the divergence had
already been resolved by an unrelated hygiene/cleanup step a few turns
earlier, so `noop` was the correct answer to the question `plan-privatization`
actually asks (whether public tracked state leaked private data into itself)
— a different CAS mechanism than the one that produced the original
mismatch. This sub-claim does not hold up and is not carried forward.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, stays open, current-scope (not deferred).
  `specs/sprint-nova-epic/implementation/issue-acceptance-matrix.md:38`
  confirms Issue `#57`'s canonical-reconciliation writer/ledger work is
  effectively done ("only candidate-freeze, fresh Critic and PO gate
  remain"), but that is a different mechanism than this item's actual
  failure chain. This item depends specifically on `NVA-B61-7`
  (platform-neutral capability diagnostics and reversible reinstall,
  matrix line 70), which the same matrix still describes only as required
  scope, not as delivered — the escalated-exec attestation trigger and the
  in-session recovery candidate this item's Direction 1-3 ask for remain
  unconfirmed and unfixed.
- **Rationale:** cross-checked against the current issue-acceptance-matrix
  rather than assumed stale from the item's own 2026-08-09 date.
- **Assignment (if accepted):** remains assigned wherever `NVA-B61-7` lands,
  as the item already states; not fixed in this triage pass
  (docs/backlog-only, and the item's own text already excludes touching
  `codex-pretool-guard.mjs`/`onboarding-continuity.mjs` outside a dedicated
  authorized pass).
- **Date:** 2026-08-17
