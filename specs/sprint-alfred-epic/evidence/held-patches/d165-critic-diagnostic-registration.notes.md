# D165 CDR held patch: register Critic diagnostic evidence in the feature manifest

Patch: `d165-critic-diagnostic-registration.patch` (28154 bytes, six files, 229 insertions, 7 deletions).
Preimage: repository files at candidate 14a10e53b317a15c0f46773cc288ee526cf9b1b3; the six files are byte-identical at repository HEAD 68ef0c043 (verified by empty `git diff` between 6bd5e6063 and 68ef0c043 on them). `git apply --check` exits 0 in a fresh clone of that HEAD.

## Cause

`critic-dispatch-preflight` admits a first Critic review only from diagnostic evidence listed in the feature manifest. No sanctioned command added such evidence, so the manifest was hand-edited and admission ended in CCA-DETERMINISTIC-UNAVAILABLE (backlog item 2026-10-26-critic-diagnostic-evidence-has-no-sanctioned-route-into-the-feature-manifest, wanted A and C, acceptance points 1, 3, 4; AC-127).

## Changes (the preflight and Critic path still never write a manifest)

- `lib/feature-package-registration.mjs`: new `addCriticDiagnosticEvidence({root,state,path,readAcceptedDeliveryContract?})`. Refusals FPR-DIAG-PATH (outside `specs/<id>/evidence/`, missing, symlink, `..`), FPR-DIAG-SCHEMA, FPR-DIAG-CANDIDATE (commit/tree do not resolve), FPR-DIAG-MEMBER (log missing or altered), FPR-DIAG-IMMUTABLE (registered path with other bytes; also named when the digest break makes the manifest invalid). Statuses `diagnostic-added` (json + log entries, class candidate-evidence, immutable, non-authority, `commitPaths` returned) and `already-registered`. The manifest is restored on any failure.
- `scripts/register-feature-package.mjs`: 4-token shape `--root <root> --add-diagnostic-evidence <path>`; any other shape FPR-ARGS.
- `lib/critic-course-admission.mjs`: REPAIRS entry for CCA-DETERMINISTIC-UNAVAILABLE naming the producing and the registering command (`deterministic()` untouched).
- `lib/guard/command-catalogue.mjs`: `sanctionedRegisterFeaturePackageArgs` admits length 4 with `--add-diagnostic-evidence` and a clean relative path.
- `lib/critic-course-admission.test.mjs`: cases CCA028..CCA035 (D165-CDR (a)..(h)); `diagFixture()` builds on `unitFixture({late:false})` and, because the writer refuses a manifest that does not validate, extends the working-tree manifest with closed keys (candidate/supersedes null) plus prd/acceptance/result/candidate-evidence artifacts. This fixture extension is test-only and was needed since validateFeaturePackage rejects the minimal fixture manifest.
- `lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs`: catalogue pin cases for the new shape (6 lines).

Preimage SHA-256 (repository, before the patch):

- plugins/pipeline-core/lib/critic-course-admission.mjs 481f77e4a942e5f4c553471326831ace334a0970257265bc74898f2a834c906b
- plugins/pipeline-core/lib/critic-course-admission.test.mjs 77b8cf1c205f2a7423c8c3735de6899ec83def54257edd6ea3797ce263a1ab29
- plugins/pipeline-core/lib/feature-package-registration.mjs 7ad2d2c806435bcd0a89a23f6c13f30ee2efd9ae20885258ed21389a59a0ae97
- plugins/pipeline-core/lib/guard/command-catalogue.mjs 586ed58246f39a76b452dd573dad6605d0248dd48362b44a9f4cda8c381920e4
- plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs ad1d5d73efba03a4215f2289e4c8476c44fea00dc588edfb78e05dd745997e12
- plugins/pipeline-core/scripts/register-feature-package.mjs 00f23cb114026a711a959e1f02363782dc17b20b09e48c75b423b3db5a7f0ec3

## RED and GREEN

- RED (earlier run C1, against original code): D165-CDR cases red as reported by C1 (not re-run by this continuation; the production edits were already present when this run began).
- This run, first execution with production edits and the minimal fixture: 6 of 8 red (a)-(f) (FPR-MANIFEST-CONFLICT, fixture manifest invalid); (g),(h) green.
- GREEN after fixture extension and the FPR-DIAG-IMMUTABLE ordering fix (case (f) expected IMMUTABLE for altered registered bytes; the digest break made the manifest invalid first; production now names IMMUTABLE; case (f) unchanged): critic-course-admission.test.mjs exit 0, CCA028..CCA035 all pass, PF75B cases unchanged and green; critic-dispatch-preflight.test.mjs exit 0; critic-round-cap pin exit 0; claude-background-goldfish pin exit 0; repair-map.test.mjs exit 0; guard-maintenance-window-kernel-closure 11 passed, 0 failed.
- Baseline-red at HEAD without the patch (fresh clone, same failures, so NOT caused by the change): `catalogue-admit-prescribed-lifecycle-verbs.test.mjs` case "D64 model-role bootstrap ... stays refused here" (bootstrap: catalogue); `consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs` case (g) PF-34 (regex "earliest base a Critic review of this feature course can use"). Both stay red with the patch; all other cases in those two files pass.

## Operator flow

1. In the repository: `git apply specs/sprint-alfred-epic/evidence/held-patches/d165-critic-diagnostic-registration.patch`.
2. `git add -u`.
3. Commit with `--no-verify`, message: `feat(critic): register Critic diagnostic evidence in the feature manifest through a sanctioned command`.
4. Stamp, then install.

## Review gate

`lib/critic-course-admission.mjs`, the manifest writer (`lib/feature-package-registration.mjs`) and `lib/guard/command-catalogue.mjs` are custody and guard paths; independent Critic review stays a parent-owned batch gate. Full Verify and PO acceptance are pending.

## Documentation still to do (not in this patch)

SKILL.md step and a `docs/push-release-flow.md` paragraph describing `register-feature-package.mjs --root <root> --add-diagnostic-evidence <path>`.
Also open: the two baseline-red pin cases above (pre-existing).
