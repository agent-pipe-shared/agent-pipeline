---
schema: pipeline.backlog-item.v1
id: pipeline.inode-identity-decides-deletion-in-a-second-rollback-path
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "NVA-B-CIGREEN-1's own follow-up recommendation after fixing the same shape in plugins/pipeline-core/lib/project-onboarding-v3.mjs at 9a7c309b; the second occurrence is named as sameIdentity and removeRecordedTree in plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs."
---

# Inode identity still decides a deletion in a second rollback path

## The defect

`9a7c309b` fixed one instance of a pattern: a rollback that deletes a file
decided whether the file was still its own by `{dev, ino}` alone. ext4
reallocates the lowest free inode in the block group, so a file created
immediately after an `unlink` commonly inherits the freed inode number. The
predicate therefore cannot distinguish a foreign file at the same path from
the file the transaction published, and the rollback deletes content it does
not own.

The same shape remains in `plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs`,
in `sameIdentity` and `removeRecordedTree`. It was left untouched on purpose:
no repro exposed it, and root-cause-only discipline applied to the dispatch
that found it.

## Why it is worth its own item

`codex-onboarding-capabilities-tests` is intermittently red in CI. It failed
in run 33551001455's first execution and passed in a second execution of the
same commit `266d691f`, and it is green locally in every environment measured
so far: ordinary PATH, the workflow's synthetic PATH, tmpfs and ext4.

An ownership predicate exposed to inode reuse produces exactly that
signature. Reuse depends on what else the filesystem allocated and freed in
the same block group at the same moment, which is why it can fire on one run
of a 505-suite verify and not the next. That makes this a plausible cause of
the intermittency, and worth measuring before it is treated as flakiness with
no owner.

Stated honestly: this is a hypothesis with a mechanism behind it, not a
confirmed diagnosis. The failing assertion inside that suite has not yet been
identified — the CI reporter truncated it away, which `e066a1b7` has since
fixed, so the next red run will name it.

## Direction

1. Identify the failing test from the next red CI run, now that the reporter
   keeps failure lines.
2. Audit `sameIdentity`/`removeRecordedTree` for the reuse exposure, using the
   deterministic injection pattern `9a7c309b` established: inject an
   `lstatSync` returning the same `{dev, ino}` for a replacement file and
   assert the rollback does not delete foreign content.
3. If the audit confirms it, apply the same content-binding remedy rather than
   a second bespoke fix.

## Progress, 2026-09-02 — the three sites inside `project-onboarding-v3.mjs` are closed

Commit `7eb9192c` corrected the three remaining sites in that file:
`cleanupRuntimeProbe`, the manifest-repair temporary cleanup in
`applyProjectOnboardingManifestRepairV4`, and `rollback`. Each gained a
deterministic inode-reuse regression test through its own entry point, each
confirmed RED before its fix. The `rollback` digests are taken from the bytes
actually written rather than re-read from disk, since a re-read can adopt
foreign content as the transaction's own.

Two residuals inside that same file are named here rather than left in a
gitignored artifact, per QG-06:

- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:3195` unlinks a
  temporary file with **no identity and no content check at all**. It sits
  directly beside the corrected site. The exposure is small — the path carries
  24 hex characters of randomness, so a foreign file at exactly that path is
  implausible — but "no check" contradicts the reasoning the adjacent docblock
  now states, and that inconsistency is what makes it worth naming.
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:5276` unlinks inside a
  `row.kind === "file"` loop and was never measured either way.

What this item still owns is unchanged: the same pattern in
`plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs`
(`sameIdentity`, `removeRecordedTree`), and the question of whether it explains
that suite's intermittent CI failure.

## Acceptance

- The failing test in `codex-onboarding-capabilities-tests` is named, from
  machine output, not inferred.
- Either the reuse exposure is confirmed and fixed with a deterministic
  regression test, or it is measured and ruled out, and the intermittency's
  actual cause is recorded.
- A full verify runs green on a clean candidate across two consecutive CI
  runs of the same commit.
