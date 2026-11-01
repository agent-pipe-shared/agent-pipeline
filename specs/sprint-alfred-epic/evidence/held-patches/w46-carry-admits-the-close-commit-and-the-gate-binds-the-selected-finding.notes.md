# w46 — the Critic carry-forward admits the close commit, and the ignore gate binds the selected finding (16c close hotfix)

Two blockers found by the two real consumer closes after 16a/16b, one per consumer:

1. Second consumer, push: the push needs a Critic-bound release Verify on HEAD. The feature close itself produces one commit after the last
   Critic round (Result, backlog, handover, retrospective, audit bundle, lifecycle, Verify evidence), plus handover-only commits. The carry-
   forward admitted only registration, Critic-export and addendum commits, so these counted as corrections and the carry refused with
   `CVL-CARRY-CONTENT-CHANGED`: a push after any feature close was unreachable (PO decision 2026-11-01: narrow close-commit kind, no Delta-Critic).
2. First consumer, ignore route: `--prepare-gate` worked but `--approve-new` always ended in `stale or forged reproduction gate`, because the
   gate bound the digest of the whole scanner report. On a working root that report holds every finding of the tree (build caches, local files,
   fixtures) in a parallel-scan order that changes between runs (three runs, three digests), so the gate could never verify a second time.

## Change

- `lib/critic-course-admission.mjs`: `criticCloseCommit(root, commit, featureId)`, admitted by `classifyRegisteredEvidenceOnlyCommits` only when
  `admitCriticExports` is set (the Critic carry-forward; course counters are unchanged). A close commit has one parent, is not empty, and every
  changed path is a Markdown file under `docs/` or `backlog/`, anything under `specs/<feature>/` or `audit-bundles/<feature>/` of the carried
  feature, or the State file (`project/pipeline-state.json`, `.claude/pipeline-state.json`); added and modified files are regular, non-
  executable blobs (no symlink, no mode change). The Critic-export subtree `specs/<feature>/evidence/critic/` is excluded: it keeps its own
  receipt-bound classifier (the existing N23 test caught that admitting it would have been a weaker second way in). Any other path stays a
  correction: source, tests, configuration, agent or skill prompts, another feature's directory, a Markdown file at the root.
- `scripts/security-adapters/gitleaks-reproduction-gate.mjs`: `reportSha256` now binds the ONE selected finding (path, rule, line, column,
  digest of the value), which the reproduction has already proven present exactly once; other findings of the tree, and their order, no longer
  matter. The key set of the gate is unchanged; the final readback (`reproductionGateFactsStillMatch` with a raw report) re-derives the same
  digest from the selected finding. Gates written by an earlier build (whole-report digest) no longer verify: prepare them again.
- `skills/close-feature/SKILL.md`: the close-commit rule for the carry-forward.
- Tests (existing suites): `16c` in the critic Verify lifecycle suite (close commit and handover carry; ten refused shapes including source in the
  same commit, agent prompt, foreign feature, symlink, executable file, forged Critic export; mutation to "any path" fails it), one test in the
  gate suite (extra, reordered and fewer findings; moved and changed selected finding refused; mutation back to the whole-report digest fails it).

## Not proven here

- No real push, no real scanner on a consumer project. The consumers must run the Critic-bound Verify and the ignore route themselves.
- Not changed: the push-time "delivery tail" rule (`classifyVerifiedDeliveryTail` keeps admitting handover and Critic-export commits only); the
  scan of a working root still reads local files (`.env.local.bak`, build caches) and writes real secret values into the temporary report
  (a snapshot of the tracked files, as `security-scan.mjs` uses, is 0.7.1); the idea that one signature covers a second push that only adds
  release or close documentation is 0.7.1.
- Spec and PRD files under `specs/<feature>/` ride along unreviewed in a close commit (PO scope: the feature directory). Narrowing it to
  `lifecycle.json` and `evidence/` would need the Result path convention; open question for 0.7.1.
