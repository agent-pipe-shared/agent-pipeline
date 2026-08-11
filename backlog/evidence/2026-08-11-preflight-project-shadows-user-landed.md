# Evidence: project-scope shadows user-scope, landed

**Item:** `backlog/items/2026-08-11-preflight-user-and-matching-project-scope-still-collide-as-ambiguous.md`
**Closure commit:** `c307e4b5e96a2f5cff0d31a27c01d5999b6055d5` (cherry-picked from GF-115's worktree commit `5f5808f60291a98c480b55d2c2c1e9801cf27d20`)

## PO decision

2026-08-11: "was ist die Empfehlung? ich würde sagen project > lokal weil das
bei Team-Arbeiten sauberer ist?" — option 2 (project shadows user) selected
over option 1 (stay ambiguous) and option 3 (collapse on agreement, not
offered for this decision).

## Change

`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`'s
`installedPipelineIdentityClaude` gains a `shadowProjectScope()` helper
applied to both `localMatches` and `officialMatches`: when an id-class's
cwd-eligible entries include one or more `scope: "project"` entries, only
those project-scope entries count toward that id-class's ambiguity total —
coexisting `user`/`local`/absent-scope entries for the same id no longer
force `ambiguous: true`. Two-or-more eligible `project`-scope entries for the
same id (a genuine registry duplicate) still resolve `ambiguous: true`,
unchanged.

`plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`: the
former "still coexists ... as ambiguous" test (and its comment) is rewritten
to assert the new shadowed/`ready` outcome; a new test covers the
genuine-duplicate (two project-scope entries, same id, same cwd) case,
confirming it still resolves ambiguous.

## Verification

```
$ node --test plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

Run directly against the integrated commit `c307e4b5` on
`feat/sprint-nova-codex-v046` (not only inside GF-115's isolated worktree).

## Dispatch note

GF-115's first attempt correctly self-aborted rather than edit against a
stale worktree base (created from `origin/main`, not this session's branch
tip) — a session-wide worktree-provisioning defect documented in
`docs/state.md`'s current block, not a defect in this backlog item or its
briefing. Full dispatch log: `evidence/dispatch-record-GF-115.json`.
