# The dev-plan gate no longer refuses the scratch directory the shipped guidance sends agents to

Date: 2026-08-09 (closure recorded; the delivering commit is dated 2026-08-08)
Closes: `pipeline.shipped-guidance-sends-agents-to-a-directory-a-gate-refuses`
Closing commit: `6dc5f897fc89609d69ba2991d94bff9add79ecbe` (dispatch GF-057)

## What the item asked for

Two guards, one directory, and only one of them had been asked. The shipped
`pipeline-start` skill called `scratch/` the one location needing no exception —
true of the containment guard, false of `guard-devplan`, whose own
`DEFAULT_EXEMPT_PREFIXES` did not carry it. So a write to `scratch/` in the
`draft` phase, the phase every fresh project starts in, was refused with a
message about plan approval. The item's Resolution names three deliverables: the
prefix added, `DP27`/`DP27b` pinning the observed refusal shape, and the skill's
two claims corrected.

## Which commit answered it

`6dc5f897` — `fix(pipeline-core): stop the dev-plan gate refusing the scratch
directory it sends agents to`. The one line that answers the ask, from
`git show 6dc5f897 -- plugins/pipeline-core/hooks/guard-devplan.mjs`:

```diff
-const DEFAULT_EXEMPT_PREFIXES = ["docs/", "specs/", ".claude/", "backlog/"];
+const DEFAULT_EXEMPT_PREFIXES = ["docs/", "specs/", ".claude/", "backlog/", "scratch/"];
```

The commit adds the reasoning at the constant, in the terms the item used: the
other four prefixes are tracked directories whose contents ship, `scratch/` holds
throwaways, and code smuggled there is not implementation until it moves to a
real source path — which the gate still catches.

## What was actually measured, at the current tip

Not a re-reading of the commit message. `node
plugins/pipeline-core/hooks/guard-devplan.test.mjs` was run at tip
`4be63c87bb43d09139ffd9480f40aa53d04d9c1d`:

- exit 0, `41/41 cases passed.` — the item's Resolution predicted 38 → 41.
- Both new cases are present and green:
  - `PASS  DP27 allow  draft-phase write under scratch/`
  - `PASS  DP27b block draft-phase write to a real source path is unchanged`

`DP27b` is the half that matters for trust: the exemption did not widen into a
general draft-phase write permit.

Raw run output: `evidence/close-2-measurements.json` (untracked working
artifact, `item1_scratchExemption`).

Note for a later reader: the constant is `export const` at the tip rather than
`const` as in the diff above. It was exported by a later commit so
`templates/prompts/agent-obligations.md` can be generated from it instead of
restating it — a second copy of the list being the drift that file exists to
prevent. The membership of `scratch/` is unchanged.

## What this closure does NOT decide

The item's "Not done, and deliberately" section leaves one question open, and
closing the item does not answer it: whether onboarding should append `scratch/`
to a consumer project's `.gitignore` (creating one if absent), or whether writing
into a file the project owns is a line the seed should not cross. The item's own
Triage recorded it as a direction rather than closing it. It is recorded here so
it stays findable now that the item is closed, and it is a candidate for its own
backlog item.
