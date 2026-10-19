# PO decisions, 2026-10-16 to 2026-10-18 (0.7.0 Alfred candidate)

Decisions taken in the Claude WSL session while the candidate was finished. They extend
[po-decisions-2026-10-12](po-decisions-2026-10-12.md). D9 is not reconstructed here; its
text was not persisted when it was taken.

| # | Decision | Applies to |
|---|---|---|
| D5 | B7 (async model-family admission against the synchronous domain owner) is repaired with lifecycle phases: reserve, the async effect outside the lock, observeEffects, terminal. | B7 |
| D6 | Implement P0 and P1; P2 only as a cheap hotfix; the rest goes to the backlog. Map work to existing backlog items with AC rows; no reopened design, no new AC rows. | whole candidate |
| D7 | P0-4 is the minimum for the candidate. | whole candidate |
| D8 | Platform-specific tests follow the platform-test rules; majors and blockers from Windows tests go into the next stamp. | B5, Windows findings |
| D10 | Blocker and high findings from the real greenfield report are fixed; medium and low go to the backlog. | greenfield report |
| D11 | `design-input.md` is a provenance record; raw material stays in an ignored authoring copy. | PF-14 |
| D12 | The delivery course accepts the criterion renderings a signed consumer spec actually uses: EARS bullet items and compound ids such as `AC-E1-01-09`. The design course naming the admitted renderings before signature is a backlog item, not the repair. | PF-23 |

| D13 | The Antigravity runner view maps the Claude model tiers of the agent files: `sonnet` and `haiku` become `flash`, `opus` becomes `pro`. | Antigravity global install |
| D14 | PF-25 is repaired by a separate registration command (`scripts/register-feature-package.mjs`) that writes the feature package manifest, because `approve-plan` lives in the protected `pipeline-state.mjs`. The `approve-plan` call site follows through a signed package (backlog). | PF-25 |
| D15 | When a consumer feature has no `acceptance.md` or `result.md`, the registration command generates them as Pipeline-owned, non-authoritative, immutable records: acceptance points to the approved Spec and its digest and adds no criterion; result records that implementation is in progress. Existing files are registered as found and never rewritten. | PF-25 |
| D16 | The stamped candidate `cdf72aa2f` (Antigravity hook wiring fix) is not signed or pushed on its own. One bundled candidate carries it together with the PF-26 and PF-27 fixes. | next candidate |
| D17 | GG-11 admits env templates (`.env.example`, `.env.sample`, `.env.template`, `.env.<x>.example`) and also env files under `tests/fixtures/`. Every other `.env*` file stays blocked. | PF-27 |
| D21 | Scope: `critic-scratch-name-randomness-has-no-admitted-command` and the enforcement clause of `design-bootstrap-verify-state-contradicts-deferred-contract` are in 0.7.0. `greenfield-comparisons-need-reproducible-public-evidence` moves after 0.7.0. `implementation-without-dispatch-escapes-review-coverage` is in 0.7.0 in its narrow form: a check reports production commits without a Dispatch trailer as uncovered in the Critic batch; it does not block. | four items |
| D22 | The acceptance re-expressed under D11 replaces the original wording of `design-intake-generator-omits-question-answers`. | that item |
| D23 | Accepted false positives stay: a nested `bash -lc` non-push git command stays refused (Q12 option B, `guard-push-refuses-read-only-git-without-push`), and the remaining nested-quote and redirect-before-push false positives stay blocked (`push-classifier-misses-nested-quotes-and-redirect-before-push`). | two items |
| D24 | `agent-obligations-recommends-a-commit-spelling-guard-push-refuses`: the generator recommends `git commit -F <scratch file> -- <paths>`; guard-push is not widened. | that item |
| D25 | `greenfield-design-course-cost-and-proportionality`: the telemetry clause leaves the 0.7.0 acceptance and becomes its own backlog item; the other clauses are implemented. `declared-system-skill-read-requires-human-override` returns to 0.7.0 (its six clauses are implemented). `scratch-has-no-retention-and-no-durability-check`: both the sanctioned scratch sweep (Pipeline-owned, stale files only) and the non-blocking handover/push durability check are in scope. `parallel-work-in-one-checkout-is-unsafe`: both serial packages and restart liveness are built. | four items |
| D26 | Delegated to the Elephant, each decided with a recorded rationale and presented to the Critic batch: AGY topology option A/B; how a security review fits the dispatch budget (former D1); the Critic round cap versus the original acceptance; the acceptable Elephant context-spend target; the heredoc receiver list boundary beyond decision AF; the AC-109 carrier disposition of the uninstall item; the scope of the remaining Opus-Critic triage points; release of the AC-232 S1-S8 reconstruction. | eight items |
| D20 | "Finish everything in scope" (D18) means every Alfred / 0.7.0 item: all open `agent` entries in the delivery matrix are worked off, not only what Full Verify shows red. This supersedes the 2026-10-12 cut for agent work. Items still need Critic review and PO acceptance; entries owned by native-host, po-decision, po-signature or po-acceptance stay with their owners. | whole candidate |
| D19 (Elephant, within scope) | PF-26: under Claude, a native host-commit launch with no `run_in_background` key takes the SubagentStop completion route when that route is registered, because the Claude host launches every subagent asynchronously (observed in the real greenfield run). This reverses the keyless refusal pinned by guard-dispatch GD57/GD63 and NGHS24 (ALF-G2C2A, Critic finding C6g2/F1). The reversal is presented to the next Critic batch. `run_in_background: false` keeps the foreground route. | PF-26 |
| D18 | No further candidate is stamped or pushed until the PO calls for one. Until then the remaining scope of the 0.7.0 candidate is finished: PF-26, PF-27, the known red suites, Full Verify, the Critic batch and the open agent work in the delivery matrix. | whole candidate |
| D27 (2026-10-19, Q1 a) | The background ALF-* Goldfish dispatches are recorded by the commit's `Dispatch: <id> (goldfish)` and `Commit-Act: orchestrator` trailers plus the orchestrator's counted run. The close route gets a typed path that accepts this record in place of a host-observed `dispatch-record-*.json` (code change, Critic). No record is written retroactively. | close of the 0.7.0 candidate |
| D28 (2026-10-19, Q2) | The one request and `denied` audit entry a test run wrote into this checkout's live HGO ledger stay as a harmless audit trace. | HGO ledger |
| D29 (2026-10-19, Q3 b) | The catalog-bound half of AC-147/209 is required in 0.7.0. It needs a Codex-host session that builds and proves the authenticated catalog carrier, then a signed ceremony on `lib/guard/read-scope.mjs`. This reverses the split proposed in E28. | AC-147, AC-209 |
| D30 (2026-10-19, Q4 b) | AC-264's plan-readiness hand-off clause is required in 0.7.0: a design spike, then a signed ceremony on the protected `scripts/pipeline-state.mjs`. | AC-264 |
| D31 (2026-10-19, G6) | An approved Spec that is edited gets a pre-edit warning, a typed self-revert route that restores the approval, and a Spec amendment route that is approved on its own without reopening the design course. A part that needs the protected `scripts/pipeline-state.mjs` goes through a signed ceremony. | AC-115, Claude P1-6 |
| D32 (2026-10-19, test base) | Test fixtures keep living inside the repository (`scratch/test-tmp/` through `lib/test-tmpdir.mjs`), because a base outside the repository brings back write-guard refusals and unknown host layouts. They are secured instead: a fixture must be its own repository or be refused before any write (containment assertion and tripwire), and production Git discovery must honour the fixture ceiling. This replaces the "runner refuses a TMPDIR inside a checkout" fix shape. | fixture-escape blockers |

The PO also confirmed for G7 that one Goldfish keeps writing both the tests and the
implementation of an item (item-owned EGM, independence from execution and a fresh Critic),
and that the order matters: tests first, then implementation. The exact enforcement is
proposed in the next decision block.

D12 is an Elephant decision within accepted scope (PF-23 asked for a durable fix and a
repair option; only a delivery-side widening is both). It changes the closed criterion
grammar the course writer reads, so it is part of the next Critic batch.
