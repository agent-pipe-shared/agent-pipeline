# w212: the human-override denial path marks its phases in the authority trace

Evidence: three trace lines of `guard-lifecycle-ready` on native Windows with exit code 2 and identical counters (220 native observations, 238 custody inspections, memo 4273 hits and 194 misses; 144, 126 and 131 s). Each lies in the run time of a Goldfish that was refused a read of a missing project file (`templates/prompts/agent-obligations.md`); the other refusals of the same runs cost 0.5 to 4.6 s. That the refused read is the cause is inferred from time stamps and the Goldfish reports, not proven.

The source of `GUARD-READ-TARGET-MISSING` (`lib/guard/read-scope.mjs`) uses the plain file system only; the 52 `read-source`, 7 `publish` and 4 `remove` observations fit the eligible-denial path of `recordHumanGuardDenial` (policy and plugin identity hashing, request file, lock) better. w210 (no journaling without a command) probably does not touch that cost.

## Change

`lib/human-guard-override.mjs` (protected file): `recordHumanGuardDenial` marks `hgo-start:<tool>:<guard reason codes>`, `hgo-eligibility:<eligible | code>`, `hgo-observed`, `hgo-policy`, `hgo-policy-done`, `hgo-plugin-identity`, `hgo-publish-wait`, `hgo-publish-held` through `admissionProgress` (w211). Closed text only: the tool name and the part of each guard reason before the first colon, characters outside `[A-Za-z0-9_.,:-]` replaced; never a command, a path or an input. Without the opt-in trace the calls do nothing.

## Test

`guard-handoff-offer.test.mjs`: an eligible denial marks every step in order; a denial that is not eligible marks start, eligibility and observation and builds no request; no mark contains a path, a command or a file name.

## Result in the work clone

guard-handoff-offer 12/12.

## Open

Independent Critic review (guard path), after the greenfield proof. The marks are a measurement, not a fix: the next Windows run with a refusal of the missing read decides what to change.
