---
schema: pipeline.backlog-item.v1
id: pipeline.verify-gate-suite-fails-on-where-a-second-boundary-falls
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Hit during the 0.5.4 candidate's closing Verify run on 2026-08-09: guard-push-tests failed, the same suite passed unchanged on the immediate re-run, and the diff between the two runs was a commit hash."
due: 2026-08-16
closed_at: 2026-08-11
closure_repository: self
closure_commit: 635f348b4c29d52ab2db0672719421abd96ba4f7
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
---

# PG11e passes or fails on where a second boundary falls, inside the Verify gate

## What happens

`PG11e` in `plugins/pipeline-core/hooks/guard-push.test.mjs` pins a real property:
`state?.pushApproval?.lastApproved` walks the same optional chain whether
`pushApproval` is absent entirely or present-but-empty, so both states must
produce **byte-identical** stderr. It pins it by building two separate fixture
repositories and comparing the two guard outputs directly.

The refusal names the pushed source commit. The two repositories have identical
content, author, message and branch — so their commit hashes are equal **only
when both `git commit` calls land in the same second**, because the timestamp is
the only input that differs. When they straddle a second boundary the hashes
differ, the byte comparison fails, and the suite reports a failure that has
nothing to do with the property under test.

Observed directly: the suite failed inside a full Verify run, and passed 150/150
on an immediately following unchanged run. The failure text is the two messages
side by side, differing only in a 40-character hash.

## It fired twice in one afternoon

Two separate full-Verify runs on 2026-08-09 died on this, hours apart, each
passing 150/150 on the immediate unchanged re-run. That is two full gate cycles
spent on a coin flip, and it is the reason this is filed as a defect rather than
as a note: at roughly this rate it will land on whoever runs the gate next, and
the correct-looking response — re-run it — is the response that must never become
a habit.

## Why this is worse than a missing assertion

A flaky check **inside a gate** teaches that a red gate can be re-run away. That
is the opposite of what the gate exists to establish, and it costs a full Verify
cycle each time it fires. It also lands on whoever happens to be running, not on
whoever caused it, so it reads as "your change broke guard-push" when nothing did.

## Direction

Normalize each fixture's own commit out of both strings before comparing — the
property is that the two STATES produce the same message, not that two
repositories produce the same hash:

```js
const withoutCommit = (text, commit) => text.replaceAll(commit, "<source-commit>");
if (withoutCommit(withoutKey.stderr, head) !== withoutCommit(withEmptyObject.stderr, headC)) { … }
```

Both `head` and `headC` are already in scope. The assertion keeps its full
strength: every other byte of the two refusals must still match exactly.

## Why it is filed rather than fixed

`guard-push.test.mjs` is TP-5 protected — it gates the push-enforcement hook, and
the session that found this had just changed that hook's seed. A test change by
the session whose implementation the test gates is exactly what TP-5 exists to
refuse (QG-04, `roles/goldfish.md` GF-04). **The guard was right**, and the fix
belongs in its own briefed test-change task with the clearance that requires.

## Worth checking in the same task

Whether any sibling suite compares outputs across two independently created
fixture repositories in the same way. The construction is easy to repeat and the
failure only appears on a fraction of runs, so a second instance would have gone
unnoticed the same way this one did.

## Fixed

2026-08-09, same-session follow-up once the PO explicitly cleared the TP-5
override this required (`guard-push.test.mjs` gates itself): applied exactly
the normalization from "Direction" above — each fixture's own commit is
replaced with a fixed placeholder in both stderr strings before comparing,
leaving every other byte still pinned exactly. 152/152 in `guard-push.test.mjs`
including this case; the fix needed no other file. Status stays `open` here
pending the formal ledger transition (`backlog/README.md` triage rules); the
work itself is done and verified.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
