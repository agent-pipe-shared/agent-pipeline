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
| D20 | "Finish everything in scope" (D18) means every Alfred / 0.7.0 item: all open `agent` entries in the delivery matrix are worked off, not only what Full Verify shows red. This supersedes the 2026-10-12 cut for agent work. Items still need Critic review and PO acceptance; entries owned by native-host, po-decision, po-signature or po-acceptance stay with their owners. | whole candidate |
| D19 (Elephant, within scope) | PF-26: under Claude, a native host-commit launch with no `run_in_background` key takes the SubagentStop completion route when that route is registered, because the Claude host launches every subagent asynchronously (observed in the real greenfield run). This reverses the keyless refusal pinned by guard-dispatch GD57/GD63 and NGHS24 (ALF-G2C2A, Critic finding C6g2/F1). The reversal is presented to the next Critic batch. `run_in_background: false` keeps the foreground route. | PF-26 |
| D18 | No further candidate is stamped or pushed until the PO calls for one. Until then the remaining scope of the 0.7.0 candidate is finished: PF-26, PF-27, the known red suites, Full Verify, the Critic batch and the open agent work in the delivery matrix. | whole candidate |

D12 is an Elephant decision within accepted scope (PF-23 asked for a durable fix and a
repair option; only a delivery-side widening is both). It changes the closed criterion
grammar the course writer reads, so it is part of the next Critic batch.
