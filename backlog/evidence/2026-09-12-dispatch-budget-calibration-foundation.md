# Dispatch-budget calibration foundation

On 2026-09-12, commit
`c70fe7d41a3a6811f90241ba64bb119f87fc87ac` (tree
`98037aa5be12a123d26c9a27d398bc99609ba649`) added the runner-neutral,
side-effect-free dispatch-budget calibration evaluator. This evidence records
what that foundation proves and the work that remains.

Critic review found a major omission in that foundation. JavaScript array
iteration with `forEach` and `map` skips holes, so a non-empty sparse `samples`
array could bypass per-sample validation and produce a favorable summary
without containing a real observation. Correction commit
`7b580b396a52312e3b2990bffe6eead26385e77a` (tree
`7bfcce830bc7d7048b4434068b15a95aa58db608`) replaced the skipping validation
with an integer-index loop. Every index must now be an own property before its
sample is validated; fully and partially sparse arrays fail with
`DBC-SAMPLES`. The correction adds a regression covering both shapes.

## Closed, sanitized contract

The evaluator accepts one exact rule object and a non-empty array of exact
sample objects. Unknown fields are rejected, so callers cannot attach prompts,
paths, transcript text, repository identifiers, model responses, credentials,
or other prose to the calibration input.

The rule schema is `pipeline.dispatch-budget-calibration-rule.v1` and contains
exactly:

- `schema`;
- non-negative safe-integer `fixedCalls`;
- `callsPerFile`, with exactly the non-negative safe-integer keys
  `correction`, `documentation`, `implementation`, `investigation`, and
  `review`;
- `maxTurnsByTier`, with exactly the positive safe-integer keys `mechanic`,
  `implementor`, and `deep`.

Each sample uses schema `pipeline.dispatch-budget-calibration-sample.v1` and
contains exactly `schema`, `tier`, `taskClass`, `fileCount`, `observedCalls`,
and `outcome`. The tier and task class must come from the closed sets above;
`fileCount` is a non-negative safe integer, `observedCalls` is a positive safe
integer, and `outcome` is either `terminal` or `truncated`.

The result uses schema `pipeline.dispatch-budget-calibration-result.v1`. Its
top-level fields are `schema`, `status`, `sampleCount`, `undercutCount`,
`truncatedCount`, `closingAllowance`, and `evaluations`. Each evaluation
contains only the sanitized input dimensions and derived numeric or enum
fields: `tier`, `taskClass`, `fileCount`, `observedCalls`, `outcome`,
`proposedBaseCalls`, `workingCap`, `effectiveBaseCalls`, `requiredBaseCalls`,
`undercutsObservedBound`, `tierLimited`, and `classification`. Result objects,
the evaluation array, and its entries are frozen. Unsafe arithmetic and any
malformed or expanded input fail with a typed calibration error.

## Conservative truncated-sample rule

A terminal sample establishes that its observed call count was needed. A
truncated sample establishes only that more than its observed call count was
needed. The evaluator therefore adds one call to the observed completion bound
for a truncated sample, then adds the fixed five-call closing allowance. A
proposal that clears this lower bound is classified
`clears-truncated-lower-bound`, while the overall result remains
`inconclusive-truncated`. A truncated sample can never validate budget
sufficiency. Tier working caps are applied to the proposed formula so a large
formula cannot hide a tier that would still truncate the dispatch.

## Focused verification

Both focused commands ran against the recorded implementation on 2026-09-12:

```text
node plugins/pipeline-core/lib/dispatch-budget-calibration.test.mjs
```

Result after correction commit
`7b580b396a52312e3b2990bffe6eead26385e77a`: exit 0, 6 tests, 6 passed, 0
failed. The cases cover the terminal
lower bound and closing allowance, weak formulas and limiting tier caps,
conservative truncated observations, mixed sanitized summaries, and rejection
of non-exact or arithmetically unsafe input. The sixth case proves that fully
and partially sparse sample arrays cannot bypass validation.

```text
node plugins/pipeline-core/lib/dispatch-budget-core.test.mjs
```

Result: exit 0, 9 tests, 9 passed, 0 failed. The cases cover authenticated,
absent, and malformed caller classifications; agent-type normalization;
working and closing caps; work and closing decisions at their boundaries;
zero-floor behavior; safe-integer bounds; and typed invalid results.

These are focused validation results for the evaluator correction and its
unchanged policy dependency. They are not a Critic PASS or an overall release
verdict.

## Remaining limits

No broader multi-run empirical sample has yet been supplied to the evaluator,
so this evidence does not validate any production estimation formula. No live
dispatch budget or runner limit changed. Authenticated Codex and Antigravity
live-call adapters remain absent. Native Codex sandbox/App Server execution
under WSL is deferred; it is neither exercised nor needed by this pure
runner-neutral evaluator. The associated backlog item remains open.
