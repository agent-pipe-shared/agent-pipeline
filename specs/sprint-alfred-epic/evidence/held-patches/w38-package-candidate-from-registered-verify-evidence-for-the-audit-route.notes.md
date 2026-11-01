# w38 — a package gets its candidate from registered Verify evidence, so the feature-close audit route is reachable (PO exception, Elephant-built)

Backlog item `2026-11-01-no-verb-sets-the-package-candidate-or-registers-the-verify-evidence.md` (found by the D229 slice, confirmed on a real consumer: the Toolbox lifecycle stood in `checkpointed` and could not leave `implementing`).
Built by the Elephant on the PO's explicit exception of 2026-11-01 (urgent consumer block, no Goldfish); the patch stays held until the PO applies it.

## The hole

The audit route needs a package in state `completed` with `candidate` equal to HEAD and a registered passing Verify evidence. No shipped verb wrote either:
`feature-package-plan --next-state verifying` previewed a manifest the topology check refuses (`FTP-CANDIDATE`), `--next-state completed` was `invalid-transition`, and no registration mode took Verify evidence.
Without the patch the new chain test fails exactly there: `feature-package-apply refused: postimage failed package validation (FTP-CANDIDATE ...)`.

## What

1. `register-feature-package.mjs --root <root> --add-verify-evidence <path>` (`addVerifyEvidence` in `lib/feature-package-registration.mjs`, modelled on `addCriticDiagnosticEvidence`): registers a file under `specs/<feature>/` as an immutable, non-authority `candidate-evidence` entry.
   Refuses (typed `FPR-VERIFY-*`, manifest untouched): a path outside the package directory, a missing or linked file, a non-JSON or other-schema file, `exitCode` not 0, a candidate commit/tree that does not resolve or differs from the evidence's own `commit`/`tree`, other bytes at an already registered path. Same bytes twice: `already-registered`.
2. `planFeaturePackageTransition` (`lib/feature-package-topology.mjs`): the first move `implementing -> verifying` with `candidate: null` binds the candidate. It takes `options.head` ({commit, tree}, resolved by the caller; the library runs no git) and requires one registered passing `pipeline.verify-evidence.v0` for exactly that commit and tree.
   No head: rejected `head-unresolved`. No such evidence: rejected `verify-evidence-required`, the finding names `--add-verify-evidence`. Otherwise the preview carries `candidate` and operation `set-candidate-and-state`. Every other transition and a package that already has a candidate behave as before (no key added to their plan, so their digests do not move).
3. `pipeline-state.mjs`: `feature-package-plan` and `feature-package-apply` pass the current HEAD (`featurePackageHead`, the existing `defaultGitCandidate`); the apply postimage sets `candidate` from the plan when the plan carries one. A HEAD that moves between plan and apply changes the recomputed plan and is refused as drift.
4. `lib/guard/command-catalogue.mjs` admits the new flag form (one repository-relative path, same rules as the diagnostic form); the admission pin gets the admitted form and five malformed shapes.
5. `register-feature-package.mjs --help` and `skills/close-feature/SKILL.md` name the package-side order: produce evidence, register it (uncommitted), plan/apply `verifying` then `completed`, then plan the close.

## Tests

Four cases appended to `scripts/pipeline-state-rebind-mutable.test.mjs` (a registered suite, no pinned count): registration happy path and idempotence; seven refusal classes plus the immutability refusal, manifest bytes unchanged each time; the planner binding only to the HEAD a registered passing evidence names (no head, no evidence, evidence for an older commit after HEAD moved);
the full chain with real git and the real plan/apply verbs: register, `verifying`, `completed`, nothing committed, and then `planFeatureCloseAudit` with the shipped `pipeline-core-baseline` pack returns `build-required`. Mutation: with the planner and CLI edits set aside, the planner case and the chain case are red (the chain ends in the `FTP-CANDIDATE` postimage refusal above).
Targeted run on the clone (HEAD plus this patch): topology, diagnostic evidence, catalogue admission, audit preflight, kernel closure, rebind-mutable, result bootstrap 92/92; course admission, case completion, close coordinator pins, audit lifecycle, finish-feature 170/170; doc contracts valid.

## Consumer order (what the Toolbox runs, no commit in between)

1. `verify-evidence-producer.mjs --root <repo> --mode candidate --critic-packet-id <id> [--critic-evidence-feature-id <feature>] --out specs/<feature>/<name>.json` (clean tree; carry-forward applies when only registered evidence commits follow the reviewed commit).
2. `register-feature-package.mjs --root <repo> --add-verify-evidence specs/<feature>/<name>.json`
3. `pipeline-state.mjs feature-package-plan --root <repo> --manifest specs/<feature>/lifecycle.json --next-state verifying`, then `feature-package-apply` with the same flags plus `--plan-sha256` from the plan; the same pair with `--next-state completed`.
4. Audit request with `"packs":["pipeline-core-baseline"]` and plain `coreVersion` `x.y.z`, then the coordinator `feature-close-prepared` plan and apply, the State writer, and the one final commit (close-feature skill).

## Not done / open

Native Windows run; a real consumer run (the Toolbox is the first); Full Verify, batch Critic (paused by the PO) and PO acceptance. Not built: a verb for the reverse (`verifying -> implementing` keeps the candidate), a check that `verify-evidence-producer` writes under `specs/<feature>/` by default (the producer's `--out` is the consumer's choice), and a `--critic-verify-lifecycle` hint in the registration output.
