# w30d1 — the one-shot close runs the Result bootstrap itself when it needs agent authority only (candidate 30d, C30D-G1)

Delta on the 30d chain: the patch is `0501094ac..HEAD` of the slice clone, which starts from the repository state plus the already delivered 30d chain, because it edits the same two files. It does NOT apply to the real
checkout until the 30d chain is applied first; `git apply --check` against the 30d clone is exit 0, against the unchained repository it is expected to fail. Criterion binding: AC-108 is the closest existing accepted
criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.

## What it does

- `scripts/finish-feature.mjs` (`oneShotClose`, stage `result-bootstrap`): a Continuity feature whose `authority.result` is null no longer stops with a five-step repair list (it cost the first Antigravity greenfield run a detour although every step is agent authority). The close now runs the steps itself:
  1. `continuity-result-bootstrap-plan`;
  2. the `applyAction` it returns;
  3. the `reconcileCommand` of the apply's completion, when it needs no proof inputs (an agent-run, result-only reconcile);
  4. `commit-pipeline-owned.mjs --root <root> --agent`.
  Both routes use the same helper: the owner route (`node <owner route> run --root <root> --lifecycle <id> -- <State argv>`, lifecycle opened through `ensureOwnerLifecycle`) and the direct State writer. Every step goes through the injected runner.
- HEAD discipline: the commit moves HEAD, so the close is entered ONCE more (`deps.resultBootstrapped` marks that re-entry), with the resolved Critic packet and the lifecycle. State, the addenda, the acknowledgement and gate-change checks, the acceptance question, the candidate Verify,
  the package moves and the close request are therefore all derived after the commit; nothing binds the old HEAD. A second bootstrap is refused with `ONESHOT-RESULT-BOOTSTRAP-LOOP` (one re-entry at most, never a loop).
- Nothing human is carried over the commit: the re-entry drops `--human-acceptance` (an answer given before this candidate existed is not an acceptance of it; the note on the stop says so), `--human-decline` (a decline with an unbound Result keeps today's stop `ONESHOT-RESULT-NOT-BOUND`, no bootstrap runs, because binding and committing a Result only to retire it is not what the human declined)
  and `--sbom-override-proof` (a signed override names the HEAD it was signed at, so a close that still needs it asks for the new signature). Consequence: the first call of a close that lacked the Result ends at the acceptance question for the new HEAD; the answer comes with the second call. This is the same count of human turns as before, minus the detour.
- Remaining stops (typed, stage `result-bootstrap`):
  - `ONESHOT-RESULT-NOT-BOUND`: the plan was refused or has no agent-runnable apply action, or a decline was given; unchanged code and unchanged manual repair chain, the refusal now in the reason; nothing was written (owner route: nothing in the work tree).
  - `ONESHOT-RESULT-BOOTSTRAP-NEEDS-PO`: the apply's completion prints a `signatureCommand` (or an unavailable one, or a reconcile that needs proof inputs): State and Result are written, not committed; the stop hands over the printed `command` line unchanged (and carries the whole `signatureCommand` in the result), then names reconcile, commit and rerun, and says not to commit or change the tree before the reconcile (the signature names the current commit).
    The same stop exists for a plan that names the PO (nothing written, no apply); the real plan of a null Result prints only an `applyAction` (its payload has no field that predicts the PO need), so that branch is defensive and the real PO case is the completion one.
  - the refusal code of a refused apply (`ONESHOT-RESULT-BOOTSTRAP-APPLY` unless the writer printed a typed refusal), of a refused reconcile (`ONESHOT-RESULT-BOOTSTRAP-RECONCILE`) and `ONESHOT-RESULT-BOOTSTRAP-COMMIT` for a refused commit; each says what is written and not committed and names the next command.
  - every later stop of the re-entered close keeps its code and order (planning gate, Critic standing, earlier findings, acknowledgement, gate changes, SBOM, acceptance); its repair text is prefixed with what the bootstrap committed, so "nothing was written" stays true (it counts from that commit on). The result carries `resultBootstrap: { commit, paths, reconciled }`; a result that is not a stop lists `result-bootstrap` first in `stages`.
- `scripts/finish-feature.test.mjs`: `oneShotFixture` gains `bootstrap` (stand-ins: refused plan by default, agent, reconcile, reconcile-refused, plan-signature, completion-signature, apply-refused, commit-refused, stuck) and `ownerRoute`; the signature stand-in has the shape `reconcileSigningRoute` prints. New cases (injected runner, a real HEAD move in the fixture repository):
  the two-call journey (question at the new HEAD, then Verify, acceptance record and close request on that HEAD, State read after the bootstrap), an answer or decline given too early, the agent-run reconcile and a refused one, the owner route with a later stop and the old wording of a refused plan, the signature stops (plan and completion),
  the refused apply, the refused commit, the loop guard, a stop below the block after the bootstrap (acknowledgement), the SBOM signature after the commit.
  The existing case "C21B ... exact bootstrap chain" is restated in place (QG-04): the one State call the close makes is the plan (this fixture refuses it); the stop code, the manual chain and "no Verify, no package stage" are unchanged.

## Checks

- `finish-feature.test.mjs` through the slice route: 81 of 81 pass (RED before the change: 9 of the first set of cases failed against the unchanged driver).
- `w30d1-the-one-shot-close-binds-the-result-itself.check.test.mjs`: the patch exists, is non-empty and touches only the two files above.

## Consumers outside the two files (reported, not changed)

- `scripts/close-path-e2e.test.mjs` runs the real one-shot CLI and pins today's stop: lines 446-454 (the first close of a project with a bound-Result gap must stop with `ONESHOT-RESULT-NOT-BOUND`, a repair naming `continuity-result-bootstrap-plan`, an unchanged tree and, on the owner-route variant, the lifecycle read from the repair) and 547-549 (the second close after a decline). With this patch the close binds the Result itself and
  stops at the acceptance question instead, so those cases need restating by their owner (the walk then no longer calls `bindResult` by hand for the first close). The run started here did not finish within the dispatch, so the red is expected from the assertions, not measured.
- `skills/close-feature/SKILL.md` line 26 describes `ONESHOT-RESULT-NOT-BOUND` as "no Result is bound yet; ... its repair names each owner-route call": still true for a refused plan, but the close now binds the Result by itself in the ordinary case.

## Not changed / not proven

- `continuity-result-bootstrap-plan`, `pipeline-state.mjs`, `lib/guard`, `commit-pipeline-owned.mjs`, the acceptance question and `lib/close-acceptance-record.mjs` are untouched.
- The real State writer, owner route and `commit-pipeline-owned.mjs` were not run: the cases use stand-ins that answer the shapes the real commands print. A live close of a Continuity feature without a bound Result, on both routes, is the proof this change still needs.
- The agent-run reconcile is run as printed (not on the owner route), as the old repair text said. A completion that prints no `reconcileCommand` is read as nothing to reconcile.
- The full Verify run was not made.
