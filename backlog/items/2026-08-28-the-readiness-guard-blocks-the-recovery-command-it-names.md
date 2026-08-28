---
schema: pipeline.backlog-item.v1
id: pipeline.readiness-guard-blocks-its-own-recovery
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — a guard that refuses the exact command its own refusal prescribes is a deadlock, and it fired twice in one consumer session"
source: "Consumer project HA, incident report S56 finding B3 (2026-08-28, Windows, Claude runner). The denial text is quoted from the report; the guard's own admission logic has not yet been re-read against it here."
---

# The readiness guard blocks the recovery command its own refusal names

## What was reported

`guard-lifecycle-ready.mjs` refuses commands with:

> Re-run the typed project-onboarding-v3 inspection with intent session and use only its
> returned nextAction.

and then refuses exactly that command. It happened twice in one session:

1. At session start (`readiness=migration-required`). Escape at the time: the same command
   through the PowerShell tool, where the hook did not apply.
2. After a `discard-feature` (`readiness=partial`). This time the PowerShell lane was
   additionally refused by the runner's own auto-mode classifier, so **both lanes were
   closed and the session could not act at all**. The only permitted action left was
   writing the incident report. Resolution required a human in their own terminal.

Ordinary Bash commands (`git status`) stayed permitted while `partial`; the refusal
targets the pipeline scripts specifically — and therefore the recovery too.

## What is already fixed, and what is not

The `partial` readiness in case 2 came from the discard dead end, fixed separately
(`2026-08-28-a-discarded-feature-...`, landed). That removes one way of ENTERING the
deadlock. It does not remove the deadlock: any other cause of a non-ready readiness
reaches the same place, and case 1 was a different cause entirely
(`migration-required`).

## Not yet verified here

The report quotes the denial text but not the guard's admission logic. Before fixing,
re-read `guard-lifecycle-ready.mjs`'s own allowlist against the exact argv of the
inspection it prescribes: it is possible the inspection IS admitted in some form and the
denial came from a different lane (the runner's classifier — see the sibling item), in
which case the fix is different. Do not fix from this description alone.

## Direction

The prescribed recovery must be admitted by construction, not by coincidence. A refusal
that names a command is a promise that the command can be run; the guard should derive
its allowlist from the same typed action it prints, so the two cannot diverge. The
inspection is read-only (`mutation: false`), so admitting it widens nothing.

## Acceptance criteria

- The typed recovery inspection is admitted at every readiness status, including
  `partial` and `migration-required`.
- A test asserts that whatever command a readiness refusal names is itself admitted —
  the property, not one hard-coded example.
- No mutating command becomes admitted as a side effect.

## Related

- `2026-08-28-a-consumer-project-must-allowlist-every-runner-lane-itself.md` — the second
  blocking layer that turned this from an inconvenience into a total stop.
- `2026-08-28-a-discarded-feature-is-an-unrecoverable-dead-end.md` — one way into the
  `partial` state; fixed, but not the only way in.
