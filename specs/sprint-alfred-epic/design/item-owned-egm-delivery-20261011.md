# Item-owned EGM delivery: analysis and enforcement design

Date: 2026-10-11. Status: PO-selected direction; implementation and runtime qualification pending. This document records the user's chat instruction. It does not certify installed enforcement, approve an ADR, or accept backlog items.

## Selected direction

One Goldfish owns one AC/backlog outcome through analysis, test-case preparation, implementation, targeted testing and fixes. The same live owner keeps the item's context. The Elephant schedules non-overlapping write scopes, integrates the completed result into Main, resolves incidental merge conflicts, and forms meaningful Critic/Verify batches. File collisions wait instead of launching concurrently. This direction was explicitly selected by the PO in chat; do not reopen it after Compact.

The unit is an independently verifiable outcome. A large AC may require vertical sub-outcomes; analysis, tests and code are not separate dispatches by default. One coherent repair may satisfy several named items, each with its own evidence mapping. The user did not require duplicate dispatches for duplicate causes.

Subsequent explicit PO selections: prioritize this operating change as an intermediate candidate before resuming Alfred fixes; Elephant does not repeat worker targeted tests as an ordinary acceptance ritual; review budget is one full review plus at most THREE correction-diff reviews (four total), stopping on genuine PASS. Original item owners end after tested delivery and integration. A fresh Correction Goldfish owns each coherent batch's findings, tests, repairs and follow-up diff repairs. Apply the contract through Claude Code, Codex and Agy enforcement and consumer-project projections, with Windows, Linux/Unix and macOS coverage. These choices supersede the earlier one-full-plus-one-diff direction; retain historical receipts.

## Diagnosis from this repository

The adopted matrix records 174 open items and zero formal acceptances. It records 59 at 25, 72 at 50, nine at 75 and 34 UNKNOWN; these are evidence stages, not effort percentages. Signed 581-path candidate C1, intermediate installation and later Main repairs demonstrate implementation exists. The bottleneck is converting preparation into integrated, qualified and accepted outcomes. The reported four-day/130% weekly-plan use is the PO's observation; no reliable billing allocation was available for this analysis.

The following sources explain fragmentation and duplication:

| Source | Observed behavior | Required change |
| --- | --- | --- |
| `guardrails/quality-gates.md`, QG-04; `roles/goldfish.md`, GF-04 | Every bugfix separates test author and fix author into two dispatches. | Permit the item owner to add its regression tests; preserve existing acceptance examiners and independent review. |
| `roles/elephant.md`, EL-25a; `templates/prompts/goldfish-task.md`, resource handback | File/tool-count thresholds force subdivision or early handback. | Budget a complete outcome; an exhausted budget blocks/checkpoints that same item rather than silently multiplying new slices. |
| `roles/goldfish.md`, GF-02a | Scope/rule corrections require fresh dispatch even for the active owner. | Add bounded, authenticated amendments; arbitrary chat or a claimed parent never enlarges authority. |
| `plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md` | Elephant reruns each completed Workflow's DoD. | Reuse valid targeted evidence when matching sources and dependencies remain unchanged; run integration checks at the batch boundary. |
| `plugins/pipeline-core/hooks/guard-dispatch.mjs`, `observeFanoutDispatches` | Fanout config is optional, defaults to shadow and can become inactive on invalid configuration. | Effective item-delivery mode resolves from governed project authority; refuse relevant productive admission when its required state is unavailable. |
| `plugins/pipeline-core/lib/slice-queue.mjs`, `readyAndLive` | Non-handback terminal records can derive `done`. | Separate worker delivery, Main integration, batch verification and item acceptance. |
| Root execution pattern in the current checkpoint | Many private preparation owners; Root executes nearly all integrations, tests and business actions. | Goldfish executes its own targeted DoD. Elephant performs integration and batch checks, not repeated item investigation. |

The retrospective does not establish repeated unchanged full Critic reviews as the dominant cost. Preparation defects, inconsistent tracking, late fixture/registration discovery, signature-bound source changes and genuine native failures are documented. Fixing only the Critic count would leave those causes intact.

## Community and engineering comparison

[Anthropic's long-running harness report](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) describes selecting one feature, testing it and leaving durable progress and a clean committed state. It also explicitly leaves the optimal single-agent versus multi-agent arrangement unresolved. This supports outcome ownership, not a universal claim about optimal concurrency.

[Ralph's current README](https://github.com/snarktank/ralph) describes selecting one pending story, implementing it, running checks, committing and updating progress. Stories should fit a context window; large outcomes are split. Its fresh context per iteration supports fresh context between outcomes, not mandatory context replacement between analysis, tests and fixes of one outcome.

[Cursor's scaling report](https://cursor.com/blog/scaling-agents) documents contention with shared coordination and the importance of workers finishing assigned tasks. A separate integrator role was removed because it became a bottleneck. Our Elephant remains responsible for Main integration as the PO requested; integration therefore needs a short queue and deterministic checks, without repeating the worker's entire job. These are engineering observations, not a controlled cost benchmark for this repository.

[Superpowers](https://github.com/obra/superpowers) offers both per-task subagents/reviews and a cheaper inline flow with final branch review. Its tiny-task decomposition and repeated reviews must not be copied wholesale into this pipeline. [Claude Squad](https://github.com/smtg-ai/claude-squad) uses isolated task workspaces for concurrent work; isolation prevents shared working-directory/index interference but does not eliminate later merge conflicts.

[METR's February 2026 update](https://metr.org/blog/2026-02-24-uplift-update/) cautions that selection effects and concurrent-agent time accounting make newer productivity estimates unreliable. We must measure our own accepted/integrated outcomes, waiting time and recorded resource use. More live workers alone is not a throughput result.

## Delivery lifecycle and responsibilities

```mermaid
flowchart LR
  Q[Ready item and reserved paths] --> A[Goldfish: analysis]
  A --> T[Goldfish: test cases]
  T --> C[Goldfish: code]
  C --> V[Goldfish: targeted tests and fixes]
  V --> D[Delivered with matching evidence]
  D --> I[Elephant: Main integration]
  I --> B[Meaningful batch: Critic and Verify]
  B --> X[Criteria checked and item closed]
```

Durable engineering states: queued, active, targeted-green, integrated, batch-verified, closed, blocked. `targeted-green` is not item acceptance. Analysis/test-case/code checkpoints belong to the active item, not separate scheduler tasks. Blocked records retain the failed stage, cause, attempt count, owner and recovery pointer. Existing backlog acceptance remains separately evidenced.

An item envelope names primary/covered AC and backlog IDs, concrete outcome and original criteria, base commit, write/read scopes and dependency fingerprints, owner identity, test commands, required environment, review class, budget and evidence references. Bind records to the actual authoritative dispatch identity. Store only bounded state and references; do not duplicate whole repository inventories for every phase.

Analysis establishes reproduction, required platform, test harness/registration needs and dependencies before coding. Test cases name positive/negative expectations and the original criterion. For a regression, retain a meaningful original RED and corrected GREEN; an import/fixture failure alone is not the intended RED. A documentation item may use appropriate document checks instead of artificial product code.

The owner can create new regression tests and implementation in its declared scope. Existing acceptance examiners remain protected from weakening. A necessary change to an existing examiner is a separately justified bounded amendment, with independent scrutiny; this is not a blanket ban on the owner editing every test. Original failing/acceptance evidence is preserved.

Predeclare the coherent review unit before dispatching its items, then freeze actual members and the integrated range before the full review. A completed item does not automatically trigger a Critic. A singleton unit needs an independently substantial delivery or urgent isolated-risk rationale; arbitrary item counts are not evidence of meaningful scope. After integration the original owner can end. If the full review has findings, dispatch one fresh Correction Goldfish over the batch, retaining that correction owner through tests, repairs and subsequent diff findings until PASS or the three-diff limit. The new owner does not reset the original batch's course. Corrections cannot weaken original examiners or erase unresolved findings.

## Elephant enforcement surfaces

Reuse existing scheduling, dispatch and authenticated state consumers. Do not build another standalone scheduler or require PO terminal commands for lifecycle transitions.

1. Extend the queue contract compatibly with item/criterion IDs, delivery contract and evidence references. `pipeline.slice-queue.v1` is closed-schema today: choose an explicit supported version/upgrade, not ignored extra keys. Existing `slices` may represent complete item deliveries; the name itself need not trigger an estate-wide rename.
2. At authenticated productive admission, atomically reserve item identity and overlapping write scopes across sessions/worktrees sharing the repository. Existing `fanout-ledger.mjs` is an append-only observation log, not a lock: do not claim that check-then-append prevents simultaneous launches. Reuse the sanctioned session-authority boundary/reservation machinery; keep the critical section short.
3. Refuse a second active owner or a colliding path reservation. Prefixes, globs and supported platform case-folding must be considered. Reserve implementation and test files together. Registry/ledger/shared generated surfaces remain Elephant-owned unless explicitly assigned.
4. Validate required stage/evidence transitions before productive actions and delivery. Analysis can be recorded, not mechanically proven to be understood. Test execution must use genuine runner results, not a worker-written `pass: true`. Match results to source and relevant dependency digests.
5. Preserve the same owner through targeted failures. An authenticated scope extension rechecks conflicts before taking effect. Exhausted attempts retain the same item/cause history; a successor dispatch cannot reset the retry budget by changing its ID.
6. Elephant integrates each ready result using its recorded base and actual diff, preserving unrelated Main changes. Check resulting relevant dependencies; changed dependencies invalidate affected test evidence and require Goldfish requalification. Only manual conflict resolution permits Elephant to rerun affected targeted checks. Missing/invalid evidence returns to a Goldfish, not an ordinary Elephant test replay. Retain path reservations until safe integration or explicit cancellation/recovery, so a waiting dependent does not start from stale Main.
7. Batch review/verification names actual integrated revisions and every member item. Existing risk-specific rules must be reconciled explicitly: today's ordinary Rigor 0/1 batching permission does not automatically authorize every guard/security/architecture combination. Use one full Critic plus at most three correction-diff reviews per permitted batch. Every further review is limited to the new correction range; stop on PASS or exhaustion without a new full review or a renamed-course reset.
8. Acceptance consumes criterion-to-evidence mappings plus required review/Verify results. Missing native proof blocks only the dependent outcomes; do not equate a stopped worker, a patch or a batch's unrelated passing tests with closure.
9. Re-entry reconstructs authoritative queue, ownership, stages and ready integrations from sanctioned durable state. It never starts new owners merely because Compact erased conversational memory. Resume should expose the shortest current pointer, not reread all historical preparations.

Runtime integration is distinct by runner. Claude/Codex native paths use `guard-dispatch.mjs` and native Goldfish state/finalization; `elephant-implementation-dispatch.mjs` currently selects the AGY route, not every runner. Wire the common admission contract into each authenticated supported path. Report an unsupported/unproven host boundary honestly; a prompt is not host-wide enforcement.

Concrete reuse points: `session-authority-registry.mjs` exports the exclusive, branded `withSessionAuthorityBoundary`; `native-goldfish-host-state.mjs` already reserves pending authority within it. `native-goldfish-host-finalizer.mjs` is the native delivery boundary. `scheduling-lifecycle.mjs` provides validated transition/replay semantics but does not persist/authenticate admission itself. `pipeline-state.mjs` provides the continuity writer/lock/revision CAS; a caller-supplied lock token alone is not authentication. Extend `post-compact-reground.mjs` to expose the authoritative active outcomes and integration queue, then enforce again on actual admission.

Dispatch records, queue, native/AGY returns and continuity use closed contracts. Continuity also has an 8 KiB bound. Keep detailed evidence in task artifacts and only compact references in continuity. Deliberately version readers/writers together; legacy terminal reports can retain historical meaning but cannot become newly verified delivery evidence.

## Required acceptance scenarios for this change

1. One owner delivers a regression from reproduction through RED, code, GREEN and delivery without a new test-author dispatch.
2. Same-item duplicates and overlapping file/prefix/glob scopes cannot both reserve under simultaneous admission; non-overlapping items can run together.
3. Missing/invalid governed delivery state refuses the relevant productive dispatch, with a repair reason; read-only analysis remains possible.
4. A forged terminal success or synthetic passing report cannot satisfy targeted-green or close the item.
5. Failed targeted tests return to the same active owner; attempts survive a successor identity and Compact.
6. Authenticated scope amendments preserve ownership/context, reject collisions and reject arbitrary message-based expansion.
7. Main integration preserves unrelated edits; changed dependencies or conflict resolution invalidate only affected evidence and trigger the matching checks.
8. A meaningful multi-item batch maps reviewed/verified integrated revisions to each member; unsupported risk combinations do not silently bypass their requirements.
9. Re-entry resumes the correct owner/integration queue and cannot duplicate launches; silent/stale workers are not automatically considered safely cancelled.
10. An item with genuine missing native acceptance remains blocked while unrelated qualified outcomes can close; current installed runtimes are never mislabeled enforced by a source-only change.

## Implementation and rollout

Treat this as one coherent delivery outcome with a Goldfish owner for analysis, tests, code and targeted repairs. It touches shared dispatch/queue/finalizer paths, so do not launch several competing implementation owners into those files. Independent read-only audits are already complete and are not extra formal Critics. Elephant integrates its ready result, then executes the applicable bounded independent review and Verify. Any required protected-source/design approval is bundled through the established approval path; no new per-item PO ceremony is introduced.

Update canonical and packaged Operating Model, QG-04/GF-04, Elephant/Goldfish roles, dispatch template and Workflow guidance together. Wire admission/readiness/re-entry changes into the existing consumers and register meaningful integration tests using the existing harness. Keep previous signed candidate provenance; this document authorizes no changed protected bytes by itself. Universal scope includes consumer repositories and each actual runner adapter; report real Windows/macOS/AGY host qualification separately from Linux or injected-platform contract tests.

For the existing Alfred backlog, map current implementation/evidence to original items first. Do not restart 174 items or discard previously qualified work. Repair the documented 12 missing candidate index mappings and retain exclusions/deferred scope. Choose dependency-ready items whose remaining obligation can actually complete, assign complete owners and keep Main integration moving.

Pilot the model on a small comparable group of existing ready items while retaining their original quality requirements. Record first completed outcome, targeted-green-to-integrated wait, integrated-to-accepted wait, completed items, reopened defects, context restarts, duplicate tests, merge conflicts and available per-item resource counters. Numeric batch/WIP/time limits are tuning hypotheses, not demonstrated speedups. Fill genuinely independent available worker slots; reduce new starts when ready integration/review work is accumulating. Success is qualified outcomes reaching closure, not 15 busy workers.

## Current truth and continuity

This is the selected implementation direction and an analysis/design artifact. Enforcement implementation, tests, Main integration, review, installation and runtime proof for this new contract remain open. No backlog acceptance or operational rollout is claimed. A subsequent Compact must resume from this design and the current progress pointer instead of reverting to horizontal micro-slices.
