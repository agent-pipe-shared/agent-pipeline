# Critic budget at the push gate: why a consumer feature cannot publish (N10, N12, N13)

Status: read-only recon, 2026-10-29. No code changed. Source: the PO's relay of a consumer session (the consumer's own handover file is not in this repository) plus a read of `plugins/pipeline-core` by a read-only subagent; the two load-bearing lines were re-read by the Elephant (`lib/critic-verify-lifecycle.mjs:74`, `scripts/push-prepare.mjs:747-754`). Item: `backlog/items/2026-10-29-scan-exception-commits-spend-the-critic-correction-budget.md` (raised to P1, 0.7.0). Every file below is a protected kernel path (`NEVER_LIFTABLE_KERNEL_PATHS`, `lib/guard-maintenance-window.mjs:124`), so each fix is a held patch under the PO's Guard Maintenance Window.

## The chain that blocks the consumer

1. The push gate (`scripts/push-prepare.mjs:747`, `checkCurrentCriticBoundVerify`) needs a private Verify lifecycle record that binds a consumed Critic receipt with `reviewPass === true` to the exact candidate (`lib/critic-verify-lifecycle.mjs:74-76`). A failed round (R1) can never satisfy it.
2. A second round needs course admission. Every commit after a consumed round except an exact manifest-registration commit counts as a correction commit (v1 classifier `lib/critic-course-admission.mjs:190-263`, v2 classifier `:458-467`, `:495`, `:575`). The limit is 3 (`lib/review-economy.mjs:31-42`, `RE-CORRECTION-LIMIT` `:191`). The consumer is at the limit, so admission returns `CCA-REVIEW-BUDGET-EXHAUSTED`.
3. That code is labelled "PO decides" (`PO_DECIDES`, `:51`; `criticCourseRepair` returns `route: "none", decidedBy: "PO"`), but it is a label only. There is no verb.
4. A course-decision mechanism exists in continuity state (`pipeline-state.mjs continuity-record-course-brief | continuity-select-course | continuity-apply-decision`, `lib/review-economy.mjs:790-936`, schema `scripts/course-decision.schema.json`), and its brief accepts the gate trigger `budget-exhausted`. But its option kinds (`COURSE_KINDS`, `:6-13`) are bounded-diagnosis, scope-split, authority-rebaseline, preauthorized-route-change, defer and stop. None means "close the course, residual findings accepted", the selection binds to a continuity blocker rather than to a Critic receipt or the push candidate, and neither the push gate nor the lifecycle reader consults it. No production producer of a budget-exhausted brief is wired to the refusal (unverified for the manual route).
5. The push-init refusal text comes from `push-prepare.mjs:751-752`: for `private-critic-binding-unavailable` it sends the user to `critic-dispatch-preflight.mjs --base <merge base>`, which itself ends in the budget refusal. The code is emitted by `lib/critic-verify-readiness.mjs:41,50` (no private lifecycle record) and knows nothing about the budget. Pinned by `scripts/push-prepare.test.mjs:818-833`.

## The three items

| # | Wanted | Touched files (all kernel) | Decision needed first |
|---|---|---|---|
| N13 | The refusal must say "if the preflight refuses with `CCA-REVIEW-BUDGET-EXHAUSTED`, this is a PO decision, not a retry". Text-only variant: no new dependency, one remedy sentence plus the pin. Fuller variant: evaluate course admission inside `push-prepare` and name the budget state. | `scripts/push-prepare.mjs`, `scripts/push-prepare.test.mjs` | none for the text-only variant |
| N12 | A PO-attested "course closed, residual findings accepted" record, bound to {candidate commit, tree, Critic packet and receipt sha, the open finding ids}, which `recordCriticVerifyLifecycle` accepts in place of `reviewPass === true`, so the existing push-gate reader qualifies the candidate unchanged. | `lib/review-economy.mjs`, `scripts/course-decision.schema.json`, `scripts/pipeline-state.mjs`, `lib/critic-verify-lifecycle.mjs`, (`lib/continuity-state.mjs` if the blocker type changes), tests | yes: trust semantics (below) |
| N10 | A second budget-neutral commit class so Pipeline-forced documentation, spec, state, rebind and receipt commits stop spending the budget. | `lib/critic-course-admission.mjs` (v1 `:256`, v2 `:495`, `:575`), `lib/review-economy.mjs` if records change, `lib/critic-verify-lifecycle.mjs` if carry-forward must tolerate it, six test files and three pins | yes: trust semantics and grandfathering (below) |

## Hazards the analysis found (N10)

- `lib/critic-course-admission.mjs:576` requires `record.course.correctionCommitCount === allCorrections.size` for every retained historical record. Reclassifying commits retroactively breaks retained courses (`CCA-HISTORIC-COUNTER-BINDING`). The new class needs a versioned rule so already retained records keep their count. How retained records encode a version is not verified.
- `lib/critic-verify-lifecycle.mjs:149-161` (carry-forward) still treats a docs-only range as "unreviewed content" (`CVL-CARRY-CONTENT-CHANGED`). Whether a documentation-only commit may sit behind a PASS Critic is a trust-model question, not a counting question.
- If every commit in a range turns neutral, `CCA-CORRECTION-RANGE` (`:326`, `:586`) would fire on an empty correction set.

## Recommendation (Elephant)

1. **N12 first.** It is the only one of the three that unblocks the consumer at once, and the consumer needs the new candidate installed either way. Smallest shape: a new course kind `accept-residual` whose receipt is signed with the same detached-signature mechanism as the push approval (the PO decides in chat and signs; `gates.push_approval` style, ADR-0056), bound to the candidate commit, tree and the Critic receipt sha, and listing the accepted finding ids. The lifecycle gate accepts it only for a Critic receipt with `reviewPass === false` whose every open finding is listed. A new finding class stays blocking.
2. **N13 in the same patch** as text-only (cheap, pin update), so the user lands on the right verb.
3. **N10 as a separate, later patch.** It touches the counting of retained courses and the carry-forward trust model; it should not ride on the unblock. Interim for the consumer: N12 closes the current course.

## Open design questions for the PO

- Is a signed PO acceptance (detached signature, like the push approval) the right authority for N12, or is a chat-recorded acceptance enough here as an attribution record? (The push approval has both modes, ADR-0056.)
- May an accepted-residual course be closed over **any** open finding, or only P2 and below? (The recommendation: P0 and P1 findings cannot be accepted away; they need a fix or a scope split.)
- N10: which paths count as "code"? A closed list (for example documentation, specs, handover/state, backlog, evidence) versus everything else, versioned in the course record.

## Unknowns

Whether test files are on the kernel list; how retained records version the correction counter; whether `continuity-record-course-brief` is fed by anything budget-aware; whether `critic-dispatch-preflight.mjs` shows `CCA-REVIEW-BUDGET-EXHAUSTED` to the user as such.
