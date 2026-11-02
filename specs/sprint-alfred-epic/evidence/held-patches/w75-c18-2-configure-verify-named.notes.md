# W75 / C18-2 held patch: the verify refusals name configure-verify and submit-plan warns on a null verify command

Patch: `w75-c18-2-configure-verify-named.patch` (git diff --binary against c9a73fb80). `git apply --check` against the repository HEAD: exit 0. Criterion binding: AC-140 (the closest existing accepted criterion; the PRD and Spec are unchanged).

## What
- `plugins/pipeline-core/scripts/verify-evidence-producer.mjs`: the three `VEP-NO-COMMAND` refusals share one message, `noVerifyCommandMessage(mode)`, which names `pipeline-state.mjs configure-verify --verify-command <project verify command>` and says a direct edit of `project/pipeline.json` is refused (GS-10).
- `plugins/pipeline-core/hooks/guard-gate-strength.mjs`: the GS-10 and GS-11 refusal reasons name the same sanctioned route before the mirror-file sentence.
- `plugins/pipeline-core/scripts/pipeline-state.mjs`: `submit-plan` prints a non-blocking `Warning:` on stderr when the calibration verify command is missing or still the seeded placeholder, naming `configure-verify`. The submission continues.
- Tests: `verify-evidence-producer.test.mjs` (the five-mode VEP-NO-COMMAND case also pins the named route), `guard-gate-strength.test.mjs` GST41 (both mirror refusals name the route), `pipeline-state.test.mjs` (submit-plan with a null verify warns and still returns 0).

## Why
Consumer run (candidate 18 plan, C18-2): `verify: null` was found late, at the first critic Verify, and neither refusal named the sanctioned way to set it; editing `project/pipeline.json` directly hit GS-10. Only `pipeline-state inspect` named `configure-verify`.

## Tests
- `guard-gate-strength.test.mjs`: tests 1, pass 1 (script-style suite, exit 0).
- `verify-evidence-producer.test.mjs`: tests 52, pass 52, fail 0.
- `pipeline-state.test.mjs`: tests 1, pass 1 (script-style suite; the new C18-2 block asserts inline).

## Not changed
The wording of every other refusal, the configure-verify command itself, and intake (the plan also asks the intake to ask for the verify command: that is a separate slice with the intake references).

## Not proven
The RED state of the new assertions was not run against the original texts separately (the assertions name strings that did not exist before). Critic review and Full Verify remain with the Coordinator.

## Operator flow
`git apply`, commit as the PO (protected plugin source), stamp, install.
