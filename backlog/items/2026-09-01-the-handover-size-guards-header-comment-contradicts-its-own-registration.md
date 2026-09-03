---
schema: pipeline.backlog-item.v1
id: pipeline.the-handover-size-guards-header-comment-contradicts-its-own-registration
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-03
closure_repository: self
closure_commit: 3c7c5d5f38e44afd54af8005960144bb965b0785
closure_evidence: backlog/evidence/2026-09-03-nova-b-batch-1-closure-verification.md
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "scratch/critic-contract-round-G.md, D-2 (declared deviation: the header comment is stale and known false, correcting it out of that package's scope). Verified live 2026-09-01 against plugins/pipeline-core/hooks/guard-handover-size.mjs and plugins/pipeline-core/hooks/hooks.json."
---

# `guard-handover-size.mjs`'s header comment says it is not wired into `hooks.json` — it is

## What the header claims

`plugins/pipeline-core/hooks/guard-handover-size.mjs`'s top-of-file comment
states, in full:

> NOT wired into `hooks.json` by this dispatch (that file is TP-4 protected,
> `.claude/guard-config.json` -- no ad-hoc edit is possible, and there is no
> in-session override for this class of protected file). This file is built
> and fully unit-tested, ready for an authorized session to wire in; see the
> exact matcher/command snippet in the NVA-HANDOVER-ROT-1 dispatch report.

## What is actually registered

`plugins/pipeline-core/hooks/hooks.json` registers the guard as a PreToolUse
hook on the `Edit|Write|NotebookEdit` matcher (verified live 2026-09-01,
`grep -n "guard-handover-size" plugins/pipeline-core/hooks/hooks.json`, line
115):

```
{
  "matcher": "Edit|Write|NotebookEdit",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/guard-handover-size.mjs\"",
      "timeout": 10
    }
  ]
}
```

The guard is registered and, per the header's own PreToolUse input-contract
description, is live on every Edit/Write/NotebookEdit call in this repository.
The comment's claim that it is "NOT wired into `hooks.json`" and "ready for an
authorized session to wire in" is false as of the current tree.

## Consequence for a reader

A reader who trusts the file's own header — the normal way to learn whether a
guard is active without independently grepping `hooks.json` — is told the
handover size cap enforcement described in the same comment block (ADR-0066
Decision 3(b)/4, ADR-0073 Decision 1(b)) is not yet live and is waiting on a
wiring ceremony. It is in fact already enforcing. This is the inverse of a
silent gap: the protection is present, but a reader relying on the header
would wrongly conclude it is absent and could raise a duplicate "please wire
this in" request, or fail to account for its behaviour (the net-size-decrease
admission rule, the fail-safe-on-undeterminable-size rule) when reasoning
about what currently blocks a handover write.

## Origin, per the source review

`scratch/critic-contract-round-G.md`'s D-2 records this as a known, declared
deviation from the package that shipped the guard: the comment was already
stale and known false at that time, and correcting it was explicitly out of
that package's scope, deferred rather than silently left unnoted.

## Remedy

Update the header comment to state the guard is registered in `hooks.json`
(citing the matcher/line, as done above) rather than pending. This is a
comment-only fix inside `guard-handover-size.mjs`, not a `hooks.json` change —
`hooks.json` itself is already correct and does not need to move.
