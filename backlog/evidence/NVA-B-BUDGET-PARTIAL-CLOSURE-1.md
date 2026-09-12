# NVA-B-BUDGET-PARTIAL-CLOSURE-1 — dispatch-budget partial closure

Date: 2026-09-12  
Inspected repository commit: `40a2339e397b0fbaa0929425d8407539fc4ca2c2`  
Scope: committed, runner-neutral budget policy, shipped agent limits and
briefing contracts. Native Codex Sandbox/App Server behavior under WSL is
deferred and is neither acceptance evidence nor a blocker for this audit.

## Criteria now evidenced

1. **A dispatch is briefed against its actual tier limit.** The shipped agent
   definitions declare `maxTurns: 50` for Goldfish implementor and mechanic,
   `maxTurns: 80` for Goldfish deep, and `maxTurns: 30` for Critic. The
   canonical Goldfish and Critic templates name those limits, require a
   different tier to be rescaled, and keep the work budget plus five closing
   calls below the limit. The vendored prompt copies carry the same text.
   This completes proposal 1 of
   `pipeline.briefed-tool-budgets-are-estimated-too-low-and-nothing-enforces-them`.

2. **The reserve arithmetic has one runner-neutral implementation.** Commit
   `96eb1208` added `dispatch-budget-core.mjs`. Its
   `dispatchWorkingCap(maxTurns)` reserves five closing calls and ten further
   safety calls, has a zero floor, and rejects invalid limits. Its transition
   function counts every attributable call and returns typed exhausted or
   invalid-input decisions. The original implementation restricted post-cap
   call shape but did not limit the number of closing calls. The correction
   below supplies that missing bound; the original six-case result did not
   prove enforcement of the five-call closing allowance.

3. **The Claude adapter consumes the common rule without copying the
   formula.** The existing guard test resolves each shipped Goldfish agent's
   own `maxTurns` and checks its persisted `workingCap` against
   `maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN)`. This is evidence for the
   Claude adapter only. The templates correctly describe Codex and Antigravity
   base caps as briefing duties until authenticated live-call adapters exist.

## Criteria still open

- The proposed estimate of roughly four calls per touched documentation file
  plus ten fixed calls is only a small historical observation. No implemented
  estimator or broader empirical calibration proves it for different task
  shapes. Proposal 2 therefore remains open; this bounded audit makes no
  closure claim for the separate earlier-slicing proposal.
- Codex and Antigravity still lack authenticated live payload adapters that
  attribute and count calls through the shared core. The runner-parity budget
  item therefore remains open. A pure shared policy function is not live
  enforcement.
- This audit does not use the deferred native Codex WSL lane to prove or
  disprove either point.

## Verification

```text
node --test plugins/pipeline-core/lib/dispatch-budget-core.test.mjs
```

Historical initial result on 2026-09-12: six registered cases passed, exit code
0. Superseded for the corrected core by the machine-written receipt below.

```text
cmp templates/prompts/goldfish-task.md plugins/pipeline-core/templates/prompts/goldfish-task.md
cmp templates/prompts/critic-review.md plugins/pipeline-core/templates/prompts/critic-review.md
```

Result on 2026-09-12: both pairs were byte-identical, exit code 0.

## Closing-cap correction and machine receipt

NVA-B-BUDGET-CLOSING-CAP-CORRECTION-1 corrects the Critic Major without changing
the existing result vocabulary. Calls whose `nextCount` is at or below
`workingCap` return `working`. Thereafter only a closing act with
`nextCount <= workingCap + 5` is admitted. The sixth post-cap attempt and every
later attempt return `allowed: false, decision: "exhausted"`, even when
`isClosingAct` is true. The existing adapter persists `nextCount` for denied
attempts too, so such attempts consume reserve slots; they cannot renew the
allowance. The working-cap formula and its existing zero floor are unchanged.

Missing, malformed, fractional, negative, non-finite, or unsafe counters fail
closed with the existing `invalid-input` decision and
`DISPATCH-BUDGET-INPUT-INVALID` code. Missing whole input also returns a typed
denial. Non-object whole input adds the reason
`budget-call-input-must-be-an-object`, with no new decision or code.

NVA-B-BUDGET-CLOSING-CAP-CORRECTION-2 then aligns the Claude adapter's contract
text and denial messages with that bound. A denied work attempt reports the
number of closing slots still available after counting the attempt. Once none
remain, the denial says no further tool calls are permitted and directs the
dispatch to emit its closing report without another tool call. The historical
claim that closing calls were unbounded is removed. Closing-shape recognition,
identity handling, persistence, exit codes, and admission decisions are
unchanged by this adapter correction.

NVA-B-BUDGET-CLOSING-CAP-EVIDENCE-1 reran the checks after the coordinator
committed both corrections in `40a2339e`. Refreshed machine-written artifact:
`backlog/evidence/NVA-B-BUDGET-PARTIAL-CLOSURE-1.receipt.json`.
It retains executable names and digests, repository-relative argv, timestamps,
exit/signal, stdout/stderr byte counts and SHA-256 digests for:

```text
node --test --test-reporter=tap plugins/pipeline-core/lib/dispatch-budget-core.test.mjs
node --test --test-reporter=tap plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs
cmp templates/prompts/goldfish-task.md plugins/pipeline-core/templates/prompts/goldfish-task.md
cmp templates/prompts/critic-review.md plugins/pipeline-core/templates/prompts/critic-review.md
```

Results: **9/9 core cases**, **41/41 Claude adapter cases**, both template
comparisons equal; all commands exit **0**, with no skipped or cancelled test
cases. The core regression covers pre-/at-/post-working-cap transitions, all
five closing slots and refusal after the final slot, denied-attempt accounting,
zero-floor caps, safe-integer boundaries, and invalid or missing input.
The added adapter integration sequence admits five work calls followed by
exactly five closing-shaped record writes, then denies the sixth closing write
with `DISPATCH-BUDGET-EXHAUSTED` and persisted count 11. A subsequent `git add`
shape also fails, with count 12. Message assertions cover both available slots
and final exhaustion; a separate case verifies that a denied work attempt
consuming the last slot reports exhaustion immediately.

The receipt was generated at `2026-09-12T02:01:22.353Z` and binds actual HEAD
`40a2339e397b0fbaa0929425d8407539fc4ca2c2` and commit tree
`4df66fa080909db30a819676bf7e12ba43643260`. Both corrections are **committed**.
The receipt requires no execution-source delta from this candidate before or
after testing, compares every cited source blob with the commit, and checks
unchanged contents across 1,310 tracked execution-source paths. Their digest is
`a644e668908cd0f60c4f31e6714312282895ced8168da67245c948bbd144232a`.
The commit tree contains the tested correction; no uncommitted source patch is
being presented as committed evidence.

Receipt publication used exact byte readback and verified `payloadSha256`
against recursively key-sorted compact JSON excluding that field. Its value is
`402d024a7112d2ca3f25fd06bfd5f943233bb848b9b228bdfdd97267da2fc4b0`.
Its `supersedes` field records the pre-commit adapter-correction receipt's
payload digest,
`ea6b18492672e4a539bab2ca549530d13768e597f045423920f3cc5608af7fd7`,
and prior artifact digest. The refreshed receipt contains the actual nine-case
core and 41-case adapter TAP terminal summaries.

The publication projection was regenerated from the validated capture without
rerunning tests. It replaces local absolute paths with location classes and
removes raw process outputs while retaining their original digests and byte
counts. Executable digests are explicitly timestamped as observed during
sanitization. The source-capture digest remains in `publication`; no private
raw capture is part of this versioned receipt. The scoped evidence path check
and exact readback/self-digest verification passed.

`git diff --check` after the correction and evidence updates: exit **0**.

The adapter-text residual from the first correction is resolved by the second
correction and its integration regression. No live Codex/Antigravity
enforcement, aggregate item closure, or native WSL acceptance claim follows
from these tests. The separate CI-PATH receipt was also regenerated by
NVA-B-BUDGET-CLOSING-CAP-EVIDENCE-1 against this same committed candidate.

The second correction changes exactly:

- `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs`
- `plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs`
- `backlog/evidence/NVA-B-BUDGET-PARTIAL-CLOSURE-1.md`
- `backlog/evidence/NVA-B-BUDGET-PARTIAL-CLOSURE-1.receipt.json`

## Disposition

Both aggregate backlog items stay `open`. The completed maxTurns/reserve/core
subcriteria are recorded here so they are not dispatched again; the remaining
work has independent acceptance conditions.
