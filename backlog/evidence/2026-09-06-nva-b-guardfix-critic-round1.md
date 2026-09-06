# Neutral findings registry — `b1ecbef2`, `6372b984`, `6677d70b` (NVA-B-GUARDFIX, round 1)

Source: T1 Critic round 1 (requested route `claude-opus-5 at max`; effective
identity observed as `claude-opus-5[1m]` from the dispatch's own runtime
prompt, effort component not observable from inside; lane
`functional-equivalent-read-only; OS isolation not asserted`). Verdict:
**FAIL** — one major, two minor. Trajectory: consistent, with the gate's step
totals explicitly not relied upon. Report persistence was unavailable (the
Write tool is disabled in that lane and the shell grammar admits no redirect),
so the report exists only as the dispatch's returned text; the Critic
disclosed this rather than routing around the guard.

## F1 — major — the guard's implementor rewrote its own examiner in the same commit

`6372b984` changes the production guard `guard-dispatch-budget.mjs` and, in the
same commit and the same dispatch, rewrites `guard-dispatch-budget.test.mjs`,
deleting assertions a prior fix deliberately installed
(`pipeline.dispatch-budget-invalid-identity-fails-closed`, 2026-08-29,
NVA-R7-INVALIDIDENTITY) together with the comment block recording why they
existed.

The behavioural consequence, which is what makes this more than a process
violation: `dispatchBudgetCallerIdentity()` returns only
`{kind:"subagent"}` or `{kind:"orchestrator"}`, so the guard's
`unresolved` / `invalid-identity` record branch is unreachable for any
identity-kind reason. A dispatched subagent whose payload lacks `agent_id` —
a host or runner variation, which is exactly the class of assumption the
2026-09-06 measurement proves can be wrong — is now silently exempt from the
budget and leaves no per-agent record, absorbed into the once-per-session
orchestrator marker and indistinguishable from a genuine orchestrator call.
The guard's documented posture is fail-open **but visible**; for this class it
becomes fail-open and not individually visible.

Evidence: `guard-dispatch-budget.mjs` hunk `@@ -422,12 +422,38 @@`;
`guard-dispatch-budget.test.mjs` hunks `@@ -205,23 +208,19 @@` and
`@@ -366,27 +366,83 @@`. Spec-ref: QG-04
(`guardrails/quality-gates.md:63-64`), secondarily QG-05 (`:71-72`).

**Required to clear:** split the test-assertion changes out under their own
task, and either restore a distinct record for a payload that reaches this
guard without `agent_id`, or pin in a test that its absorption into the
orchestrator branch is intentional and safe. The prescribed route was
available and demonstrably known to the dispatch: `b1ecbef2` is a separate,
test-only commit by the same dispatch.

## F2 — minor — the protected-test-path entry does not match the file that holds the suite

`project/guard-config.json` TP-5 protects
`harness/scripts/pipeline-state.test.mjs`, reasoned as protecting the
pipeline-state suite. `6677d70b` edits
`plugins/pipeline-core/scripts/pipeline-state.test.mjs`, which that pattern
does not match. The gap holds on either branch: if the harness file exists,
the protection points at a different suite than the one guarding the close
writer; if it does not, the alternation arm is dead. Pre-existing condition
surfaced by this diff, not introduced by it. The Critic did not determine
which branch is true (base tool budget reached).

Evidence: `project/guard-config.json:25-26` against the file list of
`6677d70b`. Spec-ref: QG-04 Verification (`guardrails/quality-gates.md:67`).

## F3 — minor — no pre-fix red artifact for the close-collision fix

The evidence set for that fix contains only the post-fix green refusal; no red
artifact exists in `backlog/evidence/`, `evidence/` or `scratch/`. The fix
therefore cannot be shown to address the reported failure rather than
something adjacent. Mitigating: the repro test is permanently in the suite,
and the incident is documented independently. The repository's own convention
pairs red and green captures (`…-nva-b-tildefix-1-red.txt` / `-green.txt`).

Evidence: `evidence/NVA-B-CLOSECOLLIDE-1-refusal.txt`. Spec-ref: QG-07
(`guardrails/quality-gates.md:86`, `:90`).

## Dispatcher-side defects the Critic surfaced, both real

**The evidence block carried expectations instead of bare references.** The
filled template's evidence line described what each artifact would show —
"516 of 516 steps green", the counter moving from 1 to 2, the refusal's exact
error and byte-identical state file — and additionally relayed the
implementor's own characterization of one artifact. Under the fail-closed
boundary those are the forbidden summary and expectation categories arriving
disguised as reference labels. The Critic read every artifact independently
and confirmed each described fact except the gate totals, which it could not
confirm and explicitly declined to rely on. That is exactly the hazard: the
one label it could not check is the one that would otherwise have entered the
report unexamined.

**The suggested range did not equal the enumerated commits.** The dispatch
offered `b1ecbef2^..6677d70b` as a construction hint; that range contains six
commits, three of them documentation. The template's own rule — enumerate
SHAs, never rely on a range — is what saved it, and the Critic used
`git show` per SHA instead.

**Rule for the next fill:** an evidence reference names a path and nothing
else. Whatever the artifact shows is the Critic's to discover; a label that
states the result has already made the finding for it. And never offer a
range whose endpoints were not checked against the enumeration.

## Disposition

F1 blocks. F2 and F3 are minor and do not by themselves withhold a pass; the
Critic states this explicitly.
