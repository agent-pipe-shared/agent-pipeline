# Critic record: FANOUT-F5 bounded re-review (`f02a811d8`)

Independent Critic, Opus 5.5 (route pre-check passed, GUARDRAIL subject; effort not observed), ruleset
`0.7.0+claude.20261005202045.7170ed20`. Lane: functional-equivalent read-only, OS isolation not asserted.
`critic-notes.md` could not be written (heredoc, `printf >` all refused; existing backlog item
`2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`); this file, written by the Elephant from the
returned report, is the durable copy.

**Status: partial review, pass/fail withheld** (budget checkpoint at counted call 20 of 24). Not reached:
`guardrails/global.md`, `guardrails/quality-gates.md`, `guardrails/security.md`, `project/pipeline.json`,
`lib/governance-scope.mjs` (whether `observeGovernanceScope` spawns), design §8, the SF08 body.

## Registry status (observed)

- Governor F1: closed — `appendEvent` throws on refusal (`fanout-ledger.mjs:73`, `:218`), the adapter turns it into
  empty output (`stop-fanout.mjs:171-175`), a block is emitted only when its block event was appended in the same
  run (`:176`, `:180-181`); precondition stated in `fanout-governor.mjs:28-33`; governor 33/33 before and after.
- Adapter F2: closed — stop-suggest output shape (`stop-suggest.mjs:309-311`, `:389-391`), mode gate aligned with
  governor rules 4 and 10, `implementationPhaseActive` derived and consulted only when the queue is absent.
- Adapter F5 as worded: closed — early exit (`:140`) before any cwd/commonDir/ledger access; SF20 zero spawns.

## F-A (minor) — design §3.6 "no git" still not met in the default configuration

With fan-out configured but no `commonDir` override (the documented default, `:39`), every orchestrator turn end
spawns `git rev-parse --path-format=absolute --git-common-dir` (`:82-88`, `:144`), hidden but running. Design §3.6
(`fanout-enforcement-design.md:257-258`): "no `git`, no network (stop-suggest's rule)". The header (`:28-31`)
documents the spawn without owner or expiry. Not a regression; residual of F5 against the anchor the fix cites.
Caveat: §8 not reached.

## Dropped candidates (summary)

Append-refusal path verified real; no-queuePath advisory (Q7 open, documented); stale SF08 title (cosmetic);
state file relative to payload `cwd` (fails quiet); `additionalContext` on Stop unmeasured (S8, disclosed); advisory
reason emission; four vs three `changedFiles` (fourth is the ignored record); trailers; one advisory per evaluation.

## Trajectory

Consistent: red 15/20 (SF07, SF17-SF20), green 20/20, governor 33/33 before/after, consumer-safe 9/9. Logs carry no
SHA/timestamp; tied by content.

## Elephant disposition

- F-A → fix slice: derive the common dir without a git child (e.g. require an absolute `commonDir` in the fan-out
  config, written by whoever writes the config, and stay silent without it), or record a ratified exception in the
  S10 canon draft. Decision: prefer the code fix (stop-suggest's rule), as a small follow-up slice.
- Not-reached items → follow-up Critic together with the F-A fix.
