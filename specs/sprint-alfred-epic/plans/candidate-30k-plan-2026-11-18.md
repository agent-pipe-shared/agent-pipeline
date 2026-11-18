# Candidate 30k: drift reduction, analyses of four big topics, small follow-ups (2026-11-18)

Source: the PO tiles of 2026-11-18 (recorded in [queue C30J status](candidate-30-queue-2026-11-15.md)), the open items of the 30j wave and the [state-machine analysis](state-machine-simplification-analysis-2026-11-17.md). The PO started 30k directly after 30j; 30i and 30j are applied together first.

Goal (PO): reduce duplicated state and drift, add **no new gate**, and take every big topic through an analysis before any code. Build rules are those of the [30j plan](candidate-30j-optimization-plan-2026-11-17.md) section 2 (test first, derive and never store, disjoint scopes, neighbour suites, every repair path reachable, rollback by revert). No Critic and no Full Verify for this repository's candidates (PO rule).

## 1. Analyses first (read-only, one document each, no code)

| Lane | Topic | Output |
|---|---|---|
| K1 | Count the duplicated state and rules (lists kept in two or more places, mirrors, copies, texts that restate a code), rank by how often they block or drift, name the biggest and a derive-never-store removal for each | `plans/duplicated-state-and-rules-count-2026-11-18.md` |
| K2 | Parallel slices per worktree: what a safe fan-out of Goldfish slices needs (isolation, admission, commit surface, integration), where the current clone-slice route is a workaround | `plans/analysis-parallel-slices-per-worktree-2026-11-18.md` |
| K3 | Audit-bundle completeness: what a bundle must contain for each gate and approval, what is missing today, how a reader proves completeness | `plans/analysis-audit-bundle-completeness-2026-11-18.md` |
| K4 | Accepted-PRD-risk coverage: how a risk accepted in a PRD is traced to a test, a gate or a stated residual, and where that trace is lost | `plans/analysis-accepted-prd-risk-coverage-2026-11-18.md` |
| K5 | The vertical-slice gate: what the gate would assert, where it would sit in the lifecycle, how it differs from the existing Verify and acceptance steps, and whether it is needed | `plans/analysis-vertical-slice-gate-2026-11-18.md` |

Each analysis ends with a recommendation, the DO-NOT-DO list that applies and a proposed staged plan. Build only after the PO releases the result.

## 2. Build lanes after their gate

| Item | Content | Gate |
|---|---|---|
| E1-1 | ADR 0104 Option A in code: a HEAD made of the checked candidate plus evidence-only follower commits counts as that candidate for the package record | PO released Option A on 2026-11-18; ADR number allocated at acceptance |
| Browser smoke | A browser smoke step in Verify | PO tile 2026-11-18 |
| J15 residual | The close names ignored Critic addenda paths and the command that stages them | residual of the cancelled J15 |
| Consent question | Shorter first-round consent question, content unchanged | PO tile |
| `push-init` hint | `--transport-reference` hint in the push-init output | queue open item |
| Card wording | The digest-only override route says there is no request file instead of "the request file stays in `scratch/`" | note of J28 |
| Design round | Improvements inside the existing one-turn question round, no second round | queue open item |
| Coordinator rule | Land recovery commits only while no sibling Goldfish runs (written into the dispatch route docs) | queue open item |

## 3. Order

1. K1 to K5 as five clone-slices in parallel (documents only, disjoint files), integrated as held patches.
2. The PO reads the analyses and releases them (tiles). Nothing from an analysis is built before that.
3. The build lanes of section 2 start in the order E1-1, J15 residual, card wording, consent, `push-init` hint, browser smoke, design round; each is one clone on the integrated 30j tree.
4. One integrated suite pass, one chain export, one rehearsal after the 30i and 30j chains, then the PO applies; stamp immediately after "angewendet".
