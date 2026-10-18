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

D12 is an Elephant decision within accepted scope (PF-23 asked for a durable fix and a
repair option; only a delivery-side widening is both). It changes the closed criterion
grammar the course writer reads, so it is part of the next Critic batch.
