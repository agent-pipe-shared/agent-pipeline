---
schema: pipeline.backlog-item.v1
id: pipeline.readiness-guard-blocks-its-own-recovery
type: defect
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: 8c9146d3
closure_evidence: plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
sprint: nova
done_when: manual
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

## Closure (2026-08-29, NVA-W4-READYGUARDTEST)

All three acceptance criteria are met in live code, verified this dispatch:

- AC-1 (the typed recovery inspection is admitted at every readiness status, including
  `partial` and `migration-required`): already true in the live `guard-lifecycle-ready.mjs` /
  `guard-command-grammar.mjs` before this dispatch — confirmed by running the pre-existing
  182-test suite, all green, and by the new sweep test below passing against unmodified guard
  code.
- AC-2 (a test asserts the property, not one hard-coded example): added by this dispatch —
  `guard-lifecycle-ready.test.mjs`, test "NVA-W4-READYGUARDTEST: the recovery inspection named
  by a non-ready denial is admitted at every controlling status". It iterates every status in
  `PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES` (28 statuses) and asserts
  `evaluateLifecycleReadyGuard` admits `node <ONBOARDING_SCRIPT> inspect --root <root> --intent
  session` (exitCode 0) at each one.
- AC-3 (no mutating command becomes admitted as a side effect): unaffected — no production
  guard code was touched by this dispatch (test-file-only change), and the full pre-existing
  suite (182 tests covering refused mutating/near-miss shapes) plus the new test all still
  pass.

Evidence: `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` → 183/183
pass, exit 0. `node --test harness/scripts/check-consumer-safe-paths.test.mjs` → 9/9 pass,
exit 0 (required because this dispatch touched a file under `plugins/pipeline-core/`).

## Related

- `2026-08-28-a-consumer-project-must-allowlist-every-runner-lane-itself.md` — the second
  blocking layer that turned this from an inconvenience into a total stop.
- `2026-08-28-a-discarded-feature-is-an-unrecoverable-dead-end.md` — one way into the
  `partial` state; fixed, but not the only way in.
