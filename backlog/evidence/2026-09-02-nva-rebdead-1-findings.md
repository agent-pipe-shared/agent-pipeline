# NVA-REBDEAD-1 — findings registry, round 1

Independent Critic review of commit `10d11e588f9c5ced9b3334afe1c2007f2ee0c0ea`.
Eight findings. F2, F4 and F6 were dispatcher-side and are closed in `e67968f0`.
The four below are against the diff and are open.

## F1 — `apply_patch` on the conflict path remains deadlocked (major)

The specification requires admitting `Edit`/`Write`/`apply_patch` on a path in
`conflictPaths`. Both new reliefs are keyed on `WRITE_TOOLS`, which is
`["Edit", "Write", "NotebookEdit"]` — `apply_patch` is not a member.

For a runner whose write tool is `apply_patch`, readiness throws,
`WRITE_TOOLS.includes("apply_patch")` is `false`, `toolName === "Bash"` is
`false`, so `admitted` is `false` and the refusal stands. The reported deadlock
is unfixed on that lane.

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:244` — the `WRITE_TOOLS` definition
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:4037-4040` — the readiness relief's tool test
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:4377` — the writer-owned-State block's tool test
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:1562-1572` and `:1602` — the same trap and its remedy, already documented and implemented in this file for the restart-required lane
- No `apply_patch` case exists among `rebdead positive-1..5`

## F5 — Readiness is lifted, not re-based on `orig-head` (major)

The specification states the framing decision explicitly: readiness for these
actions resolves against `orig-head` rather than against the conflicted
worktree. No `orig-head`-rooted readiness resolution exists in the diff. The
implementation matches an error shape and skips the observation.

The condition is `PORG-NOT-READY` with `intent === "session"` and no
`lifecycleStatus` constraint, unlike every sibling exemption in the same catch
block, each of which pins one status. Any not-ready session state is therefore
bypassed for the rebase surface whenever a validly-resolved rebase exists,
including `restart-required`, whose own narrower exemption sits lower in the
same block and is now unreachable for any tool the rebase relief already
admitted.

The resolver validates the plan lifecycle at `orig-head`. It does not establish
onboarding readiness — continuity, kickoff, repository control, runtime.

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:4031-4047` — the condition and the return
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:4074-4081` — the `restartRequired` sibling

## F7 — Shipped guard source cites a gitignored, unresolvable path (minor)

Six comment citations in the plugin source and its test point at
`scratch/spec-rebase-deadlock.md`. `/scratch/` is gitignored, so the referenced
file is not in the repository and is not in the distributed plugin. The durable
pointer to the rationale for a guard admission is unresolvable for consumers and
for later maintainers.

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:68-72`, `:4018`, `:4399`
- the notice docstring and the test-section header in
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
- `.gitignore:38` — `/scratch/`

## F8 — `.claude/pipeline-state.json` as the conflict path is untested (minor)

The specification names both lifecycle state files. Every added case fixtures
the conflict on `project/pipeline-state.json`; `.claude/pipeline-state.json`
appears only as the refused negative control. The code path looks symmetric, so
this is a coverage gap rather than an evidenced defect.

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` — `rbdFixture()` and `rebdead negative-1`

## Round-1 categories examined and found in order

Spec fidelity for the remaining acceptance items; scope; reachability through
the real entry point; test integrity (purely additive, one modified import line,
no test weakened or skipped); the `conflictPaths`-membership design decision;
guardrails and security surface (no secrets, no remote mutation, push and
force-push still refused, no HGO/GMW substitution); no TODO/FIXME introduced;
no new dependency; language assignment; and commit-trailer authorship.
