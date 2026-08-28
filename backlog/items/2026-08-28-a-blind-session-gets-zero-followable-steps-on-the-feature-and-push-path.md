---
schema: pipeline.backlog-item.v1
id: pipeline.blind-session-zero-followable-steps-on-push-path
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — measured, not argued: a fresh session gets 15 chained commands on the onboarding path and 0 on the feature/push path. PO 2026-08-28: the paths must be tested without the Pipeline's context knowledge, because a greenfield session does not have it."
source: "Measured 2026-08-28 at HEAD 129d8c8e by scratch/smoke-blind-push.mjs: a genuinely fresh repository onboarded to ready through the real driver, then walked following ONLY structural nextAction objects, exactly as onboarding-init.mjs does. The walk is deliberately ignorant -- it may never reach for a command name it was not handed."
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

## The surface a fresh session actually faces

`pipeline-state.mjs --help` lists **59 commands** in one flat, unordered line, with
nothing indicating which is first, which is reachable now, or which belong to the same
ceremony. The onboarding CLI has roughly half that and was given a driver because walking
it by hand was too expensive. This one has had no equivalent.

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
- No command a blind session is handed contains a placeholder. Every published action is
  runnable as given.
- `nextAction` has exactly one meaning wherever a driver can read it, and a test asserts
  no result publishes a non-action value under that name.
- The push signature remains a stop no driver-executable action can satisfy, asserted by
  a test rather than by convention.

## Related

- `2026-08-28-the-push-path-has-no-driver-so-its-five-layers-are-walked-by-hand.md` — the
  driver this unblocks; that item ranked itself Nova B, and this measurement is the reason
  to reconsider.
- `2026-08-28-po-facing-commands-are-not-uniformly-rendered-break-safe.md` — the
  placeholder defect, measured here still live on step one.
- `2026-08-28-the-design-to-implementation-path-has-no-driver.md` — its own item asked for
  exactly this measurement before designing; this is that measurement.
