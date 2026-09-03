# Nova-B batch 1 — closure verification

One verification pass, 2026-09-03, covering four items closed together. Each
section records what was checked by the dispatcher directly, not what the
implementing dispatch reported. Where the two differ, the check below is the
record.

The reason for checking rather than accepting: three of the four closures rest on
a dispatch's own account of its work, and a dispatch that reports a green suite
has, by construction, no way to report a suite it did not run.

## `pipeline.entry-point-reachability-check-substring-matches-whole-source-files`

Closed against `4a9a40d60aa7ff069ed0d27cb944f504b758fb4f`.

Re-ran `node --test harness/scripts/check-product-capability-inventory.test.mjs`
in the dispatcher's own session after the commit landed: **24/24, exit 0**.

Two assertions carry the closure rather than the count:

- `HAW-B06` is the new regression, built from the measured false positive: a
  comment citing an evidence filename that merely contains a script's stem is no
  longer read as an admission. It pairs that negative with a positive case, so it
  fails if the rule is tightened into uselessness as well as if it is loosened.
- `HAW-B01` asserts that this repository's own entry points are still reachable —
  never named-but-refused, never admitted-but-unnamed. This is the assertion that
  matters for a tightening change: it is the one that would go red if the new,
  stricter `admitted` test had dropped a genuine admission. It passes.

The dispatch left `named` and `namedInBootstrap` as substring tests and documented
why in the source: the prose corpus they scan has no single idiom to anchor a
stricter pattern on. That is a stated limitation, not an oversight, and it is
narrower than the defect that was fixed.

## `pipeline.the-handover-size-guards-header-comment-contradicts-its-own-registration`

Closed against `3c7c5d5f38e44afd54af8005960144bb965b0785`.

`git show --stat` confirms a single file, 4 insertions and 6 deletions, entirely
within the header comment block — the comment-only property the task required,
verified from the diff rather than from the report. `node --test
plugins/pipeline-core/hooks/guard-handover-size.test.mjs` passes.

The dispatch confirmed the live registration itself before writing the
correction, and reported the line and matcher it found (`hooks.json:115`,
`Edit|Write|NotebookEdit`) rather than repeating the item's claim — which was the
point of asking, since the item's premise being wrong would have inverted the fix.

**Defect carried by this commit:** it has no `AI-Assisted:` trailer. `git log -1
--format='%(trailers:only=true,unfold=true)'` returns empty for it. The cause is
the dispatcher's own briefing, which instructed that no blank line separate the
trailers from the body — the separator git uses to find the trailer block. This
is recorded as instance eight in
`backlog/items/2026-09-01-every-stage-0-commit-loses-its-assistance-marker-to-a-blank-line.md`.
The commit's content is correct; its provenance marker is not, and eight commits
are stacked on it so amending is unavailable.

## `pipeline.dispatch-records-are-written-to-a-name-the-verifier-cannot-find`

Closed against `bb079c96f8e56531635cfc0d1c3385fbd3536156`.

The contract conflict is resolved in the direction the code runs: every rule that
tells an agent where to write a dispatch record now names
`evidence/dispatch-record-<TASK_ID>.json`, the one path
`dispatch-authorship-verify.mjs` can read. ADR-0063 carries an explicit carve-out
naming the verifier as the reason.

Two locations were found that the dispatcher's own briefing had not listed —
`harness/checklists/goldfish-dispatch.md` and
`plugins/pipeline-core/skills/close-block/SKILL.md`, both carrying a bare
`dispatch-record.json`. The briefing had told the dispatch to search rather than
trust the list, which is why they were found.

`node harness/scripts/generate-vendored-canon.test.mjs` (8/8) and
`node harness/scripts/check-doc-contracts.mjs` (1273 files, 1235 links, no errors)
both pass, which settles the vendored-copy obligation this repository leaves to a
gate run.

**What this closure does NOT settle,** stated so it cannot be cited later as
having settled it: whether durable provenance belongs in a gitignored directory at
all. That question is coupled to
`backlog/items/2026-09-01-fourteen-evidence-files-are-tracked-inside-a-gitignored-directory.md`,
which stays open. This item was about agents writing to a name nothing reads; that
is fixed.

## `pipeline.three-onboarding-suites-pass-locally-and-fail-in-ci`

Closed against `6262d408aa616651232b46ab8ecbfd88ce4055b0`.

Closed on evidence already recorded in the item itself, not on new work: CI run
`33595311782` ran the `verify` workflow on the released `0.6.1` commit and
reported zero for all three suites this item is named for —
`project-onboarding-v3-tests`, `trust-anchor-bootstrap-circularity-repro-tests`,
`onboarding-init-tests`. That satisfies the item's own acceptance criteria 1
through 3.

That CI run still failed, on three other suites. They are deliberately not this
item's subject and are filed as their own items, so this one closes on what it
established instead of becoming a standing container for "CI is red".

Surfaced by the predicate campaign (`NVA-B-PREDICATE-1`), which declared `manual`
here rather than a machine predicate, on the correct ground that any faithful
predicate of this item's ask would already be true and would immediately report
STALE-OPEN. It flagged the item as reading resolved and left the closure judgment
to the dispatcher, which is the right division: a dispatch forbidden from changing
status should not decide a closure.
