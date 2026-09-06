# Neutral findings registry — adc165bb / e4aeb8fe

Source: T1 Critic review (opus, max; functional-equivalent-read-only) of
commits `adc165bb2cdc7b4875590bf08b7a732429ee640e` and
`e4aeb8fe14154e2836c8d0cbc84d5b1b2a1977ab`. Verdict: **FAIL**.

- **F1** (blocker): no verify-script evidence artifact binds to either
  candidate commit; the only such artifact binds to a different commit.
- **F2** (major): the named downstream suite exercising the changed module
  through a second invocation route was not run.
- **F3** (major): a known silent-disarm hazard is carried forward with no
  owner, expiry, or tracked item.
- **F4** (minor): the new test's child runner imports a bare absolute path as
  an ESM specifier; portability to the second machine is unmeasured.

Plus a briefing violation against the dispatcher (see Disposition).

## Disposition

**F2 — closed.** `node --test plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs`
run at HEAD: **47/47 pass**, including the case that exercises
`guard-dispatch.mjs`'s own check through the nested Antigravity route rather
than through `hooks.json`. The finding was correct that it had not been run;
the risk it names does not materialise. Worth keeping beyond this round: that
route is the runner-neutrality path — the Antigravity guard nests
`guard-dispatch.mjs` rather than duplicating it, and the nesting still works
after the entrypoint gate.

**F3 — closed as a finding, filed as an item.**
`backlog/items/2026-09-06-the-budget-guards-own-test-suite-can-report-green-with-nothing-run.md`.
The hazard is real and its effect is measured rather than argued. It is worse
than the sibling it mirrors, because the suite that could silently pass covers
a guard already confirmed not to fire.

**F4 — open.** Unmeasured on this host and not assertable from here. Belongs
with the next package that touches that test file.

**F1 — open, and the deferral is no longer defensible.** This is the second
consecutive review to raise it (the previous round's F3 was the same finding
about a different commit), and QG-01 is explicit that the gate chain passes
before an LLM review starts, not after. The reasoning for deferring — that a
gate bound to one commit is voided by the next commit in the wave — is true
and is not a licence to hand Critics unverified diffs. The correct sequencing
is to close the wave first and gate once, and until that run is green nothing
in this wave may be reported as verified.

## Dispatcher error: contaminated dispatch, second occurrence today

The Critic recorded that three items I supplied as "bare facts about the
submission state" were pre-formed conclusions rather than properties of the
artifact set, and that two of them map one-to-one onto its own F1 and F3. It
is right. Specifically:

- "No verify-script evidence artifact bound to either commit exists" is a
  finished trajectory conclusion, finding-shaped, handed over instead of
  searched for.
- The sentence relaying what the second dispatch's report said about
  `guard-dispatch-budget.test.mjs` is relayed implementor-report content,
  which the fail-closed reference boundary forbids by name.

The findings survive because the Critic built independent evidence chains for
both, and F2 — the one finding nothing in my dispatch pointed at — is the one
that produced new information. That is the cost of contamination stated
precisely: it does not corrupt the findings, it narrows the search.

**This is the second occurrence in one session.** Earlier the same day I told
a Critic "no RED evidence artifact exists for this task id" as a bare fact;
it existed, and F2 of that round was raised on my false premise. The pattern
is the same both times: an absence or a state I had concluded, presented as an
observation.

**Rule taken from it, for the next dispatch construction:** a "bare fact"
about the submission may only state something a reader can confirm by opening
a named path. If it asserts an absence, or summarises what another agent
reported, it is a conclusion — either strip it, or give the Critic the search
surface and let it conclude.
