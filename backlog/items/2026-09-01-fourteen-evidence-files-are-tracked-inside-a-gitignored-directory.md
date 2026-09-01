---
schema: pipeline.backlog-item.v1
id: pipeline.fourteen-evidence-files-are-tracked-inside-a-gitignored-directory
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Surfaced during the 2026-09-01 pre-release cleanup attempt for the 0.6.0 release: the dispatcher moved files out of evidence/ by wildcard without first checking which were tracked, and restored them on discovering closure_evidence citations pointed at four of them."
---

# Fourteen files are tracked by git inside `evidence/`, a directory `.gitignore` declares ignored

## Measurement

`git ls-files evidence` (run 2026-09-01) returns exactly fourteen tracked files:

```
evidence/NVA-R18-SCANBOOT-check-consumer-safe-paths.txt
evidence/NVA-R18-SCANBOOT-project-onboarding-v3-test.txt
evidence/NVA-R18-SCANBOOT-security-scan-test.txt
evidence/cb-1a-measurement.md
evidence/dispatch-record-NVA-B-SCANNER.json
evidence/dispatch-record-NVA-BL-24.json
evidence/dispatch-record-NVA-BL-25.json
evidence/dispatch-record-NVA-BL-28.json
evidence/dispatch-record-NVA-BL-32.json
evidence/dispatch-record-NVA-GF-PREPUSH.json
evidence/dispatch-record-NVA-GF-SCRATCH.json
evidence/dispatch-record-NVA-GF-TWINDRIFT.json
evidence/dispatch-record-NVA-J-PROFILERECEIPT.json
evidence/dispatch-record-NVA-R18-SCANBOOT.json
```

`.gitignore:52` is `/evidence/`, anchored to the repository root, with a comment
(`.gitignore:44-51`) stating explicitly that "already-tracked files stayed
visible because git does not re-evaluate ignore rules against them" — this is
exactly that case. The rule ignores new writes into `evidence/`; it has no
effect on files git already tracks there, and none of the fourteen were ever
untracked once added.

Of the fourteen, four carry a frontmatter `closure_evidence:` citation from
another backlog item, found by grepping `backlog/items/` for
`closure_evidence:` lines whose value resolves under `evidence/` (as opposed to
a prose mention of the path, which is not load-bearing):

| Cited file | Citing item | Citing item's `status` |
|---|---|---|
| `evidence/dispatch-record-NVA-BL-24.json` | `2026-08-10-agent-never-asks-po-for-key-directory-invents-one-instead.md` | `closed` |
| `evidence/dispatch-record-NVA-BL-25.json` | `2026-08-08-a-dispatch-reported-creating-a-record-it-never-created.md` | `closed` |
| `evidence/dispatch-record-NVA-BL-28.json` | `2026-08-08-an-agent-talks-itself-out-of-the-pipeline-and-starts-before-the-answer.md` | `closed` |
| `evidence/dispatch-record-NVA-BL-32.json` | `2026-08-09-the-security-scan-looks-for-its-license-allowlist-in-the-pipelines-own-repository.md` | `closed` |

The remaining ten (three `NVA-R18-SCANBOOT-*.txt` files, `cb-1a-measurement.md`,
and the `dispatch-record-NVA-B-SCANNER` / `NVA-GF-PREPUSH` / `NVA-GF-SCRATCH` /
`NVA-GF-TWINDRIFT` / `NVA-J-PROFILERECEIPT` records) drew no `closure_evidence`
hit in the same grep and are not confirmed load-bearing by this measurement.

**What makes the four load-bearing:** `plugins/pipeline-core/scripts/check-backlog-state.mjs`
validates `closure_evidence` only for items whose `status` is `closed`
(lines 647-653, 898-903). For each closed item it requires the cited path to
exist as a regular repository file (`regularFile`) AND to be tracked by git
(`repositoryTrackingState` / `trackedPaths`); an existing-but-untracked citation
fails with `untrackedEvidenceFinding` — "closure_evidence ... exists but is not
tracked by Git — the citation resolves only in this working tree". All four
citing items above are `status: closed`, so the checker actively depends on
these four files staying tracked. It does not check anything about the other
ten, which have no citation to check.

## Triggering situation, stated plainly

During the 2026-09-01 pre-release cleanup attempt for the 0.6.0 release, the
dispatcher moved files out of `evidence/` by wildcard, without first checking
which of them were tracked by git. Discovering that `closure_evidence`
citations pointed at four of the moved files, it restored them. This item
exists because that was a near miss, not because the near miss caused damage:
had the wildcard move landed instead of being caught, four `closed` items'
citations would have gone untracked, and `check-backlog-state.mjs` would have
started failing them.

## Relation to prior items

- `backlog/items/2026-08-17-evidence-gitignore-left-dozens-of-durable-artifacts-untracked.md`
  and `backlog/items/2026-08-16-gitignore-evidence-rule-swallows-durable-spec-artifacts.md`
  are the mirror-image defect, not the same one: both concerned the unanchored
  `.gitignore:evidence/` rule (fixed 2026-08-17, commit `13811594`) wrongly
  matching `specs/*/evidence/` and `backlog/evidence/` at any depth and
  swallowing durable artifacts that should have been tracked but were not yet.
  Both are closed; their fix anchored the rule to `/evidence/` (root only) and
  curated ~145-plus previously-untracked files into `backlog/evidence/` and
  `specs/sprint-phoenix-epic/evidence/`.
- This item is the opposite shape: files tracked *inside* the now-correctly
  anchored, root-only ignored `evidence/` directory, left over from before (or
  around) that anchoring — the anchor fix only ever stops new files from being
  ignored-then-tracked-by-force; it does nothing to a file already tracked
  there. It is not a recurrence of the same bug; it is the leftover state the
  anchor fix could not itself clean up, in the one directory ADR-0063's table
  designates as machine-regenerated and ignored, not durable-citation storage.

## ADR-0063 tension

Per `docs/adr/0063-repository-directory-contract.md`'s directory-kinds table:
root `evidence/` is "Evidence, machine-regenerated ... ignored — regenerated
per Verify run, never a durable audit trail," and its own "not" column states
plainly that anything a gate or a backlog `closure_evidence` field cites
durably "belongs in the row below instead" — `backlog/evidence/` or
`specs/*/evidence/`, tracked. Every one of the fourteen files is, under one
reading or the other, in the wrong place: the four cited ones are durable
citation targets sitting in the directory ADR-0063 reserves for regenerated,
disposable snapshots; the other ten are tracked inside a directory declared
ignored, with no citation establishing they are anything but stray. Neither
governing rule — "ignored" or "durable, tracked" — actually describes any of
the fourteen as they stand today.

## Directions, none pre-selected

1. **Move the four cited artifacts to a tracked location** (`backlog/evidence/`,
   consistent with the closure pattern most other `closure_evidence` citations
   already use) **and update their citing items' `closure_evidence` paths.**
   Cost: a `closure_evidence` path is a field `check-backlog-state.mjs`
   validates — changing it is not a free edit; each of the four closed items'
   frontmatter must be edited and re-verified against the checker, and the
   move itself must preserve git history association (`git mv`) rather than
   delete-and-recreate.
2. **Untrack the ten uncited files** (`git rm --cached`), leaving them on disk
   as ordinary ignored working files if still wanted, or deleting them
   outright if they are stray. Cost: needs a per-file judgment (as the sibling
   items' own triage did) on whether each is genuinely disposable output or
   something nobody has yet cited but someone may still want to; a blind
   `git rm --cached evidence/*` risks discarding something load-bearing that
   simply has no citation yet.
3. **Narrow the `.gitignore` rule** so the tracked subset is no longer
   contradicted — e.g. carve out the ten (or four) specific tracked names, or
   split root `evidence/` into a genuinely-regenerated subpath and a
   deliberately-tracked one. Cost: adds calibration-specific complexity to a
   rule ADR-0063 currently describes as simple and root-scoped, and needs its
   own audit that no other unanchored sibling pattern (per ADR-0063's stated
   follow-up) is reintroduced in the process.

Any direction chosen still has to individually re-verify, after the change,
that `check-backlog-state.mjs` passes for all four closed citing items and
that no dispatch-record correlation elsewhere in the repo silently breaks.

## Why this was not attempted before the 0.6.0 release

Surgery on four `closure_evidence` chains under release time pressure is
exactly how a nachweis (evidence) chain gets broken silently: an edited path,
a `git mv` that git doesn't recognize as a rename, or a checker re-run skipped
under time pressure would leave a `closed` item's citation broken without
anyone noticing until the next full backlog-state check. The near miss above
is the concrete version of that risk — a five-minute wildcard move nearly did
exactly this by accident. This item exists so the fix is deliberate, briefed,
and re-verified rather than done in the margins of an unrelated release
cleanup.
