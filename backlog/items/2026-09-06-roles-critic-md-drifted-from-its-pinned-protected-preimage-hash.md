---
schema: pipeline.backlog-item.v1
id: pipeline.critic-md-protected-preimage-drift
type: defect
owner: pipeline
status: open
created: 2026-09-06
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
