# PF-94 c21: the export result names the lineage registration (held patch notes)

Patch: `w7-pf94-export-next-hint-c21.patch` (2 files, 3480 bytes). It is an INCREMENT that applies AFTER the operator documentation bundle v4
(`w7-pf94-operator-docs-bundle-v4-2026-10-28.patch`); it was diffed against the bundle v4 state staged on the candidate commit dc9f6f796.

## Cause

After `session-critic-finalizer.mjs export` an operator makes correction commits; only `register-feature-package.mjs --help` said the lineage of round N
must be registered before the next correction commit. By then `--add-review-lineage --packet <id>` can no longer succeed (FPR-LINEAGE-TRANSPORT /
CCA-TRANSPORT-SOURCE-DRIFT). The export result, the last thing read before those commits, carried no hint (Toolbox report D69).

## Changed lines

- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs`, `exportSessionCriticEvidence`: the frozen result gains one additive string field `next`
  (+1 line, after `indexSha256`). One line, no newline, no absolute path, uses `<root>` as a literal placeholder and the literal packetId. Order: (1)
  register the lineage NOW, `before the next correction commit`, `register-feature-package.mjs --root <root> --add-review-lineage --packet <packetId>`;
  (2) commit the manifest and the lineage file it names; (3) if correction commits already follow, continue with `inspect-course-takeover` and
  `supersede-course-takeover` and rerun round 1 on the course path. Schema constant, file list and other fields are unchanged.
- `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`: new case `PF94 export (1) the export result names the lineage registration before the
  next correction commit` directly after the export case `export publishes a consumed review ...`; plus ONE added assertion on `output.next` in the CLI case
  `the export verb runs from a scratch request with no git on PATH ...`. No assertion weakened.
- Section name: the real heading is `Continuing a Critic course after the first round (PF-94)`; the short form `Continuing a Critic course` is used because the
  briefing specified it.

## Evidence (logs under scratch/agent-out/w7cp/logs, machine written by the driver)

| Run | tests | pass | fail | failing names |
|---|---|---|---|---|
| RED, clone, whole finalizer file (`red.log`) | 80 | 77 | 3 | known failure; new PF94 case; extended CLI case |
| GREEN, clone (`green.log`) | 80 | 79 | 1 | known failure only |
| baseline, clone2 at bundle v4 (`base.log`) | 79 | 78 | 1 | known failure only |
| `harness/scripts/check-verify-case-completion.test.mjs`, clone (`cca.log`) | 32 | 32 | 0 | none (the finalizer test file has no pin row; confirmed by 32 of 32) |
| `plugins/pipeline-core/lib/critic-course-admission.test.mjs`, clone (`adm.log`) | 65 | 65 | 0 | none |

Known pre-existing failure, identical in clone and clone2: `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`.
Failing-name sets are identical (baseline versus patched); the new cases are the only difference in the case list. Apply check: `git apply --check` of the
patch in clone2 (bundle v4 baseline, candidate dc9f6f796): exit 0. The patch touches exactly the two files above (two `diff --git` headers).

## Protected-path classification

Neither touched file matches TP-1 to TP-13 of the agent obligations; both are ordinarily editable. Nothing under `plugins/` was edited in the repository.

## Not done

Full Verify, batch Critic review (parent-owned batch gate), native Windows qualification and PO acceptance. Targeted delivery: green; not "done".

## Proposed commit message

feat(critic): name the lineage registration in the export result so it happens before the next correction commit (PF-94)

## Operator flow

1. Apply bundle v4 first and commit it.
2. `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pf94-export-next-hint-c21.patch`
3. `git add -u -- plugins/pipeline-core/scripts`
4. `git commit --no-verify -F <message file>` with the message above.
5. Stamp (`scripts/stamp-candidate.mjs`), then synchronize the installed plugin copy and run `refresh-mandatory-hooks.mjs` per `docs/push-release-flow.md`.
