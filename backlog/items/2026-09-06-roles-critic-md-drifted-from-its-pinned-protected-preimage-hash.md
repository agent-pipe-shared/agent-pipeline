---
schema: pipeline.backlog-item.v1
id: pipeline.critic-md-protected-preimage-drift
type: defect
owner: pipeline
status: closed
created: 2026-09-06
closed_at: 2026-09-06
closure_repository: self
closure_commit: 2c38d704f88685a58e8b580a9a3a9f6e9276e78e
closure_evidence: "backlog/items/2026-09-06-roles-critic-md-drifted-from-its-pinned-protected-preimage-hash.md"
sprint: nova-b
tracking: "Nova B — discovered running the first full verify.mjs gate of this session (last known-green 7cc0b649, 2026-09-02). codex-isolated-critic-protected-preimage-tests fails: roles/critic.md's current content-hash no longer matches the digest pinned in plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json, a preimage snapshot used to detect drift in the Critic role contract for Codex-isolated Critic dispatches."
done_when: manual
source: "Elephant, 2026-09-06, running `node --test plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` while diagnosing the first full verify.mjs gate of this session."
---

# `roles/critic.md` drifted from its pinned protected-preimage hash

## The gap

`plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs`
fails with:

```
Expected values to be strictly deep-equal:
+ [{ path: 'roles/critic.md', expected: '1eed846e...', actual: 'd768eef7...' }]
- []
```

`roles/critic.md`'s content has changed at some point since the pinned
digest in `codex-isolated-critic-protected-preimage.v1.json` was last
updated. This is deliberately a security-relevant integrity check (the
"protected preimage" name and the F1 test in the same suite, "protected
inventory is closed and names the autonomous-Critic policy baseline"), so
this is NOT a routine "just recompute the hash" fix — it exists specifically
to catch an unreviewed or unintended change to the Critic role contract
that Codex-isolated dispatches trust.

## Why this is not a NVA-B-READCONTAIN-1/2/NVA-B-TILDEFIX-1 regression

None of those three dispatches, nor anything in this session's read-scope
work, touched `roles/critic.md`. This drift predates today's read-containment
work; when exactly `roles/critic.md` last changed, and whether that change
was reviewed and is safe to re-pin, is not yet established.

## Acceptance criteria

- `git log -- roles/critic.md` is checked to find the exact commit(s) that
  changed it since the pinned digest was last correct, and that change is
  reviewed for whether it was an intended, approved edit or something that
  slipped through without updating the preimage pin.
- If the change is confirmed intended and safe: the pinned digest in
  `codex-isolated-critic-protected-preimage.v1.json` is updated to match,
  with the commit that changed `roles/critic.md` named in the update's own
  commit message as the justification.
- If the change is NOT confirmed safe: escalated for PO/design review before
  any digest update, rather than silently re-pinned.
- `node --test plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs`
  passes after resolution.

## Closure note (NVA-B-CRITICPREIMAGE-1, 2026-09-06)

Independently re-confirmed via `git log df1665f7..HEAD -- roles/critic.md` and
`git show b72e22b2` that exactly one commit, `b72e22b2` ("docs(critic): give
CR-06-D a proven write command, not just an authorization",
`Dispatch: NVA-B-CRITICWRITE-1 (goldfish)`), changed `roles/critic.md` since
the pinned digest was last correct: a narrow +5-line addition to Sec 5.5,
mirrored identically in the vendored `plugins/pipeline-core/roles/critic.md`
copy (both files confirmed byte-identical to each other now via `diff`).
This is an intended, approved, properly dispatched documentation change, not
an unreviewed drift.

The pinned `rawSha256` for `roles/critic.md` in
`codex-isolated-critic-protected-preimage.v1.json` was recomputed the same
way the test computes it (`createHash("sha256")` over raw file bytes) and
updated to `d768eef70c13df45f3a55a27ef6969d0f4375543c8d6b6270ac765dd49203119`,
matching the "actual" value the test's own failure output already reported.
`node --test plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs`
now passes all 4 checks (evidence:
`backlog/evidence/2026-09-06-nva-b-criticpreimage-1-green.txt`). Closing
commit: `2c38d704`.
