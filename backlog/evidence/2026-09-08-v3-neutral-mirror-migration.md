# V3 neutral authority mirror migration — evidence

The sanctioned V3 migration now reads declared neutral authority mirrors only
when they already exist as regular, contained files. Those present bytes enter
the normal authenticated plan and transaction with their real preimages;
missing `project/*` mirrors produce no target and are never created.

The apply boundary now accepts a declared mirror only when its transaction
entry has a present preimage. It still requires every canonical runtime target
(or the established host-managed-Codex subset), source-last ordering, and a
unique target list. Foreign, absent, and duplicate targets remain invalid.

The direct migration test covers a drifted YAML and JSON mirror, preserving
unowned bytes, source preservation, repeat no-op, changed-since-plan refusal,
unsafe symlink rejection, absence, and an interrupted mirror transaction whose
authenticated recovery restores both mirror preimages.

The historical red captures remain at
`scratch/NVA-B-GATE-MIRROR-MIGRATION-1/mirror-migration-full.txt` and
`scratch/NVA-B-GATE-MIRROR-MIGRATION-1/mirror-migration-rerun.txt`. Their test
fixture rendered a quoted `human_facing` scalar, which the production baseline
parser correctly rejects. They do not establish a pre-existing onboarding
failure: parent comparison found the fresh-onboarding cases passed at clean
`94bbc6a6`.

The resumed scratch probe isolated the actual regression: present project
mirrors correctly appeared in the migration plan, but the former fixed-only
target-boundary validator rejected them as incomplete. Lifecycle consequently
reported its generic runtime-target transaction failure. The correction is in
the migration validator; `project-onboarding-v3.mjs` requires no caller change.

`scratch/NVA-B-GATE-MIRROR-MIGRATION-1/mirror-migration-final.txt` is the
terminal green capture for:

`node --test plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs plugins/pipeline-core/lib/runtime-projection-v3.test.mjs harness/scripts/check-consumer-safe-paths.test.mjs`

It reports 51 migration checks and 31 projection checks; Node's 11 passing
test entries comprise those two file wrappers plus 9 consumer-path tests
(exit 0). The dispatch did not apply a source-repository migration.

After commit `f0bb049bc54fcaf088b8a595c80c28f48f32802b`, the parent reviewed
and applied the sanctioned local plan. Its only changed target was the
existing project YAML mirror; source and other target hashes were unchanged.
The resulting language and authority-tier checks pass in
`scratch/candidate-authority-agreement-20260908.txt`. The generated manifest
commit was refused by GS-3 and is reserved for the human operator; that
uncommitted projection is not represented as part of a completed candidate.
