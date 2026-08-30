---
schema: pipeline.backlog-item.v1
id: pipeline.blind-session-zero-followable-steps-on-push-path
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-30
closure_repository: self
closure_commit: e0bc0cc84ccd14be116f71365fa3f6e3501d11ce
closure_evidence: backlog/evidence/2026-08-30-blind-push-driver-closure.md
created: 2026-08-28
sprint: nova-a
tracking: "NOW / Nova A — measured, not argued: a fresh session gets 15 chained commands on the onboarding path and 0 on the feature/push path. PO 2026-08-28: the paths must be tested without the Pipeline's context knowledge, because a greenfield session does not have it."
source: "Measured 2026-08-28 at HEAD 129d8c8e by scratch/smoke-blind-push.mjs: a genuinely fresh repository onboarded to ready through the real driver, then walked following ONLY structural nextAction objects, exactly as onboarding-init.mjs does. The walk is deliberately ignorant -- it may never reach for a command name it was not handed."
done_when: manual
---

# A blind session gets zero followable steps on the feature and push path

## Why it was measured this way

The obvious test — walk the push path by hand and see what breaks — proves nothing,
because whoever walks it already knows which command comes next. A fresh greenfield
session does not. So the walk was made blind: it may follow only a structural
`nextAction` (`{kind, executable, argv}`), and where it stops is the finding.

## The measurement

| path | chained commands a blind session can follow |
| --- | --- |
| onboarding (`project-onboarding-v3.mjs`) | **15** |
| feature/push (`pipeline-state.mjs`) | **0** |

It stops on the very first command. `pipeline-state.mjs inspect` on a freshly onboarded,
ready project returns:

```
status:     (no status field at all)
nextAction: "## Next action\n\nReview the PRD and specification, then submit the plan
             for PO approval:\n`pipeline-state submit-plan --by <name> --profile
             <epic|feature|mini>`.\nImplementation writes stay refused until the plan is
             approved and the phase is switched to `implementation`.\n"
```

## Three separate defects in one field

**1. The same field name carries two incompatible contracts.** In the onboarding CLI
`nextAction` is an executable action object the driver runs. Here it is a rendered
markdown section (`nextActionSection()`, `lib/onboarding-continuity.mjs`). Elsewhere in
this same file it is a bare state-machine label — `nextAction: "review"`,
`nextAction: "close"` inside `preimage`/`postimage` projections. One file, three meanings.
Exactly one structural action object exists in the whole of `pipeline-state.mjs`, in a
legacy V2 recovery branch.

**2. The command inside the prose carries unfilled placeholders.** `--by <name>
--profile <epic|feature|mini>` is not runnable. The already-filed rendering item
(`2026-08-28-po-facing-commands-are-not-uniformly-rendered-break-safe.md`) records "a
placeholder read literally" as one of five measured transfer failures from the greenfield
run. This is that same defect, still live, on the first step of the path.

**3. There is no `status` field**, so a blind session cannot even tell whether it is
done. The onboarding CLI's driver distinguishes `ready` from everything else on exactly
that field.

## The failure mode is not a dead end. It is a fork with no marker.

The blind walk stops, because it is built to. **A real agent does not stop — it
chooses.** That is the actual damage, and it is worse than a stall (PO, 2026-08-28: *"das
ist ja das Ding, dass er immer mehrere Routen zur Wahl hat und oft die falsche geht"*).

The prose above even names a command, so an agent reads it, finds the placeholders
unfilled, and improvises the rest from a menu of 59 equally-reachable siblings. Nothing in
the output says which is correct, and nothing says *do not choose*.

This is already recorded happening, at the worst possible step:

- `2026-08-27-a-runner-improvised-the-po-signature-instructions.md` — an agent handed the
  PO a repository-relative path for a command to be run in a *different* repository, then,
  having no working command, **invented a `sign-digest` subcommand that does not exist**
  and told the PO it might not exist. A signing ceremony is precisely where the human
  cannot check the agent's work, because the whole point is that the human contributes a
  secret the agent must not see.
- `2026-08-28-the-codex-runner-needed-three-sessions-for-one-small-feature.md` and
  `2026-08-09-two-minor-happy-path-retries-in-the-final-codex-run.md` — the same class,
  measured as wasted sessions rather than as a wrong command.

So "publish a `nextAction`" is necessary but not sufficient. The property that actually
closes this is **exactly one published next step per reachable state, runnable as given**
— so that choosing is not a thing the agent is invited to do at all. A menu with a
recommendation still leaves an agent free to take the wrong item; a single published
action does not.

## The surface a fresh session actually faces

`pipeline-state.mjs --help` lists **59 commands** in one flat, unordered line, with
nothing indicating which is first, which is reachable now, or which belong to the same
ceremony. The onboarding CLI has roughly half that and was given a driver because walking
it by hand was too expensive. This one has had no equivalent.

## Progress and the next wall (2026-08-28, HEAD 292dd3ec)

`inspect` now publishes a real `status` (`draft`) and a real `collect-input` instead of
prose with placeholders, and the two human gates are published as stops carrying no
`input` a driver could use to satisfy them. The first stop is honest about why it must
ask: neither the submitter's name nor the delivery profile is recorded anywhere the
command can read.

Re-measured with the harness now ANSWERING the answerable questions from their own
guidance rather than stopping at the first one — and the answer is refused:

```
step 1: inspect -> status=draft, nextAction=collect-input
    HUMAN: submit-plan --by "Blind Walk" --profile mini -> exit 2
           Error: submit-plan blocked by PO-PROFILE-RECEIPT-INVALID.
```

Fifteen rounds, same state, no progress. **This is the same defect one layer in:** the ask
names a command, the command is run exactly as named, and it is blocked by a precondition
the ask never mentions. A published next step that is not runnable as given is what this
whole item is about; publishing it in the right SHAPE did not make it runnable.

The precondition itself is diagnosable — `po-gate-authority.mjs` pairs the code with a
repair, "Run `node setup.mjs --publish-po-profile` from the canonical primary checkout,
then retry." Two readings, both worth checking before fixing, and this item does not
choose between them:

1. **Onboarding gap.** The project reached `ready` and its very next action fails.
   Onboarding does collect a profile answer (`--profile mini`, at intake consent), so the
   answer exists while the receipt does not — the two mechanisms are not connected.
2. **The check is wrong for a consumer.** The receipt binds a "canonical primary checkout"
   and a repository fingerprint, which is a multi-checkout topology concept. A standalone
   consumer project may legitimately have no such thing, in which case the gate is
   importing a Pipeline-internal precondition into a consumer path.

Either way, a state reported as `ready` whose next published action cannot run is not
ready, and the ask must name every precondition it depends on.

## Scope: the happy path, not all 59 commands

Making every one of the 59 speak the protocol is not this item. The bounded piece is the
path a first feature actually walks — `inspect` → `submit-plan` → `approve-plan` →
`set-phase` → `approve-push` — with the two genuine human decisions published as
`collect-input` stops rather than prose:

- **plan approval** — a judgement about a document, so the ask names the PRD and spec by
  path and sha256 and states what the human is deciding, in the shape
  `collectPrdAcknowledgementAction()` already established;
- **the push signature** — the detached Ed25519 proof, which stays irreducibly human and
  must never gain a driver-executable satisfying action.

## The naming collision has to be resolved deliberately

`nextAction` cannot mean three things. Either the prose and label uses are renamed
(`nextActionText`, `queueAction`) and `nextAction` is reserved for the protocol, or the
protocol field is renamed on the onboarding side. The first is far cheaper and keeps the
driver unchanged, but it touches a field other code reads — including
`syncStateMdNextAction`, which writes the prose into the handover on purpose. Whichever
way it goes, a blind driver must never receive a string where it expects an action.

## Acceptance criteria

- `scratch/smoke-blind-push.mjs` reports a chained-command count greater than zero, and
  every stop it reaches is a genuine human decision rather than a missing field.
- **Exactly one** next step is published per reachable state on the happy path — not a
  ranked menu, not a recommendation among alternatives. A test asserts singularity, since
  that is the property that removes the choice rather than merely informing it.
- No command a blind session is handed contains a placeholder. Every published action is
  runnable as given. A test asserts no published argv element matches a `<...>` placeholder
  shape — the improvised-`sign-digest` incident began with exactly such a gap.
- `nextAction` has exactly one meaning wherever a driver can read it, and a test asserts
  no result publishes a non-action value under that name.
- The push signature remains a stop no driver-executable action can satisfy, asserted by
  a test rather than by convention.

## Progress, 2026-08-29 (dispatch NVA-R34-BLINDPUSHPATH, commit `d3dc13b4`)

This dispatch hit its 80-turn limit before writing its own report; the
Elephant independently reviewed the diff and re-ran its tests before
committing (`pipeline-state-inspect.test.mjs` 11/11,
`pipeline-state.test.mjs` green, `check-consumer-safe-paths.test.mjs`
9/9) — this note is from direct inspection, not a trusted self-report.

**Landed:**
- The `PO-PROFILE-RECEIPT-INVALID` root cause is diagnosed with file/line
  references (`resolveDraftProfileReceiptAction()`, `pipeline-state.mjs`):
  reading 1 confirmed (an onboarding gap — the repair mechanism
  `po-gate-profile-repair.mjs apply --activate` exists but nothing in the
  deterministic onboarding chain ever invokes it). The `draft` branch of
  `buildInspectNextAction` now surfaces the repair as a real
  driver-executable `command` when it plans cleanly, or names the exact
  precondition code/reason when it cannot — never a silent `submit-plan`
  failure on an undiscoverable precondition.
- One part of the `nextAction` naming collision is resolved: the bare
  `"review"`/`"close"` queue-state label is renamed to `queueAction`
  throughout `pipeline-state.mjs`. The rendered-prose meaning already had
  its own field (`nextActionText`), so no rename was needed there.

**Left open — not done by this dispatch:**
- Wiring the profile-receipt repair into onboarding's own apply chain (so
  a receipt exists BEFORE a project ever reaches `ready`, eliminating the
  gap at the source rather than making it discoverable/repairable) —
  disclosed as deliberately out of scope.
- No re-run of `scratch/smoke-blind-push.mjs` confirming a
  greater-than-zero chained-command count on the full path end to end.
- No test asserting singularity ("exactly one next step per reachable
  state") across the WHOLE happy path, nor a blanket placeholder-argv test
  across all of it — only the two new profile-receipt-specific tests exist.
- The push-signature-remains-a-stop property is not newly tested by this
  dispatch (may already be covered elsewhere; not re-verified here).

Left `status: open` — real progress on the diagnosed blocker, but the
item's own Acceptance criteria are not fully met.

## Re-verification, 2026-08-29 (dispatch NVA-CF-ITEM32RELEVANCE)

Phase 1 of this dispatch's own briefing required re-checking all four "Left open"
sub-items above LIVE against current HEAD before touching anything, rather than
trusting them at face value (heavy same-day churn). Result: **all four are still
genuinely open**, but (b)'s re-measurement surfaced a new, more severe blocker.

- **(a) profile-receipt repair wired into onboarding's apply chain — still open.**
  Confirmed by grep: `po-gate-profile-repair.mjs apply --activate` is invoked nowhere
  in `onboarding-init.mjs`'s automated chain or `project-onboarding-v3.mjs`'s
  subcommand table. Not attempted by this dispatch either, per its own explicit
  exclusion (larger onboarding-chain change).
- **(b) re-run of the smoke test confirming a greater-than-zero chained-command
  count — still open, finding changed.** `scratch/smoke-blind-push.mjs` could not
  even complete its own Phase 1 (onboarding) on first re-run: `onboarding stopped:
  pending-asks`. Since `NVA-V3-PENDINGASKS` (unrelated 2026-08-29 work) the
  onboarding driver can stop at a new `outcome: "pending-asks"` result
  (`pushApprovalPreference`/`verifyCommand`/`trustAnchorPointerRepairAcknowledged`)
  the smoke script's own hand-rolled onboarding loop had no case for — a harness
  regression, not evidence this item was fixed. Repaired the smoke script in place
  to reuse the already-tested `measureFreshRepoOnboardingTurns()`
  (`plugins/pipeline-core/scripts/measure-fresh-repo-onboarding-turns.mjs`, its own
  `chainPastPendingAsks()`) instead of reimplementing pending-asks handling a
  second time (the fix lives only on disk — `scratch/` is gitignored, so nothing to
  commit for it). With that repair, Phase 1 now reaches `ready`, and Phase 2 (the
  actual blind walk of `pipeline-state.mjs`) now runs — but stops on its SECOND
  step: `inspect`'s `nextAction` chains straight into `submit-plan --by "Blind
  Walk" --profile mini`, which now fails with a **different** precondition than the
  one this item diagnosed: `PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING` (exit 2, raw
  stderr, non-JSON) instead of `PO-PROFILE-RECEIPT-INVALID`. The walk's own
  step counter nominally reads `chained commands (kind=command): 1` (step 1's
  `nextAction` WAS correctly a structural command object, so the count is
  technically >0), but the chain still breaks one step later on an unstructured
  stderr crash rather than a discoverable `collect-input` stop — this item's own
  core complaint, on a newly-surfaced precondition. This looks like the
  plan-approval/`collectPrdAcknowledgementAction()` gate the Acceptance criteria
  already anticipate, surfacing as a raw error instead of the structured ask the
  criteria call for — but its root cause was not diagnosed by this dispatch.
- **(c) singularity test across the whole happy path — still open.** `grep -c
  singular` on both `pipeline-state.test.mjs` and `pipeline-state-inspect.test.mjs`
  returns 0 in each.
- **(d) blanket placeholder-argv test across the whole happy path — still open.**
  `grep -c placeholder` returns 4/5 hits in the two suites respectively, but every
  hit is unrelated (docs/state.md fixture text, PRD-acknowledgement substitution
  prose, the two existing profile-receipt-specific cases already named in the
  2026-08-29 note above) — no blanket check exists.

Given (b)'s re-measurement surfaced a new, undiagnosed blocker
(`PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING`) one step earlier than the diagnosed
profile-receipt gap, and neither this new gate's root cause nor a fix for it were
in this dispatch's briefed scope, this dispatch stopped here rather than attempting
(c)/(d) against a happy path that does not yet reach past step 2 — building the
fixtures those tests would need first requires diagnosing/working around this new
gate, itself a larger, undiagnosed piece of work outside this dispatch's budget and
briefed scope. Left `status: open`.

## Closure, 2026-08-30

Closed against `backlog/evidence/2026-08-30-blind-push-driver-closure.md`
(`closure_commit` `e0bc0cc84ccd14be116f71365fa3f6e3501d11ce`).  The durable
TOFU Driver test now follows only returned actions from an empty local project
through `signed-push-recorded`; it replaces the untracked hand-maintained
smoke probe with a registered regression.  The shared Driver path is also
green for Claude, Codex, and Antigravity.  The test preserves genuine
human-only stops and does not claim an actual `git push` hook interception.

## Related

- `2026-08-28-the-push-path-has-no-driver-so-its-five-layers-are-walked-by-hand.md` — the
  driver this unblocks; that item ranked itself Nova B, and this measurement is the reason
  to reconsider.
- `2026-08-28-po-facing-commands-are-not-uniformly-rendered-break-safe.md` — the
  placeholder defect, measured here still live on step one.
- `2026-08-28-the-design-to-implementation-path-has-no-driver.md` — its own item asked for
  exactly this measurement before designing; this is that measurement.
