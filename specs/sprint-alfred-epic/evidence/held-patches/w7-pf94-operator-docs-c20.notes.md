# W7-PF94-OPERATOR-DOCS-C20 notes (CHECKPOINT 2, 2026-10-28)

State: all five text edits are made in the scratch clone and the patch `w7-pf94-operator-docs-c20.patch` (20770 bytes) holds them plus the four pin cases.
`git apply --check` in clone2 at the candidate: exit 0. GREEN and baseline runs were STARTED but their logs were NOT read: NOTHING is verified green yet.

## Changes (per file)
- `plugins/pipeline-core/lib/critic-course-admission.test.mjs`: 4 new cases CCA062..CCA065 `PF94 DOCS (a)..(d)` (help, FPR sentences, finalizer repair text and help, SKILL/continuation section). RED run `red1` (log scratch/agent-out/w7cn/logs/red1.log): exit 1, all four failed (lines 69-72 of the log), the 61 baseline cases not named as failing there (full counts line not read).
- `plugins/pipeline-core/scripts/register-feature-package.mjs` help: usage line lists all four flags; new blocks "Critic delta request route (PF-94)" (7 steps, five input keys with one-line meaning, map rule and FPR-DELTA-MAP) and "Late lineage". No behaviour change; the FPR-ARGS usage reason text is untouched.
- `plugins/pipeline-core/lib/feature-package-registration.mjs`: both lineage refusal reasons (FPR-LINEAGE-TRANSPORT/COMPILE, former lines 528 and 549) keep their text and add the takeover sentence.
- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs`: `SessionCriticFinalizerError` and `fail` take an optional message (default unchanged); `SCF-TAKEOVER-REQUEST` (both raise sites) now carries `expected request keys: schema=<schema of the called verb>, featureId[, digestSha256, reason]; the file must be a regular .json file in the repository scratch` (under the 200-char detail cap; the full JSON examples are in `CLI_HELP`, 4 new lines for the two takeover verbs, and in SKILL). Code, status and exit code unchanged.
- `plugins/pipeline-core/skills/critic-review/SKILL.md`: new section "Continuing a Critic course after the first round (PF-94)" (about 34 lines, 8-step order, 7-code table; every code and meaning read where raised: critic-generic-batch.mjs 740-775, critic-course-admission.mjs 48/49/483/570/590).
- `plugins/pipeline-core/skills/pipeline-start/references/implementation-continuation.md`: one paragraph pointing to that section.

## Remaining (not done)
1. Read counts of `scratch/agent-out/w7cn/logs/green1.log` (clone, started) and `base1.log` (clone2 baseline, started): expect 65 cases (61 + 4) all passing in clone, 61 in clone2; compare failing-name sets.
2. Run and read counts: `session-critic-finalizer.test.mjs` (expect 79, 78 pass, 1 known fail; CLI_HELP or message pins may break), `critic-generic-batch.test.mjs` (34), `harness/scripts/check-verify-case-completion.test.mjs` (32; VCR01 pinned number of row `critic-course-admission-tests` MUST change to the printed actual, +assertions of the four new cases; NOT yet changed, so the patch leaves that test red until fixed), `lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs` (24). Driver: `node scratch/agent-out/w7cn/driver.mjs run LABEL <file>`.
3. If VCR01 changes: edit it in the clone, rerun `driver.mjs patch` and `check`, then `driver.mjs cleanup` (clones are still in place, w7cl/w7cm untouched).
4. Not done: Verify run, batch Critic (parent-owned), native Windows, real consumer retest, PO acceptance.

## Proposed commit message
`docs(critic): document how to continue a Critic course (takeover, lineage, delta request) and name the late-lineage repair in the refusal texts (PF-94)`

## Operator flow (finished slice only)
Apply the diff, `git add -u` with a path limit (plugins/pipeline-core harness), one `--no-verify` commit, then stamp and install.

## Protected paths
None of the eight allowed files matches TP-1..TP-13 of `templates/prompts/agent-obligations.md` section 2.
