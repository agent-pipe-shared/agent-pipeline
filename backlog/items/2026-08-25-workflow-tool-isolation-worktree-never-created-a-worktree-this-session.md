---
schema: pipeline.backlog-item.v1
id: pipeline.workflow-tool-isolation-worktree-never-created-a-worktree-this-session
type: defect
owner: pipeline
status: open
created: 2026-08-25
sprint: nova-b
source: "Elephant, 2026-08-25, live incident this session: three parallel Agent-tool dispatches with isolation: \"worktree\" all wrote into the SAME shared checkout, causing zero-commit truncations and a detached-HEAD incident; root-caused and recovered same session"
done_when: manual
---

# `isolation: "worktree"` (Agent tool) did not create separate worktrees this session — three parallel dispatches raced on one shared checkout

## Description

Three Goldfish dispatches (AGY-PRDGATE-1, AGY-HGOGWM-1, AGY-PUSHDEFAULT-1)
were launched in parallel via the Agent tool, each with `isolation:
"worktree"` in the tool call, and each briefing carrying the mandatory
CLAUDE.md self-heal block (check `git rev-parse HEAD` against an expected
SHA; on mismatch, `git checkout --detach <sha>`).

`git worktree list`, run immediately after the launch per CLAUDE.md's own
instruction ("After launching any worktree-isolated dispatch, still run
`git worktree list` immediately"), showed only the single main worktree —
checked twice across the incident, never more than one entry. No separate
worktree was ever provisioned for any of the three dispatches. All three
edited files directly in the Elephant's own shared checkout.

## Consequences observed

1. **All three dispatches truncated at the harness `maxTurns: 50` cliff with
   ZERO commits.** Not simple slowness: each was implicitly racing the
   others for the same working tree, and `dispatch-authorship-verify`-style
   commit-then-checkpoint discipline never got a chance to fire because no
   dispatch reached a stable point to commit from without another dispatch's
   concurrent edits also being present in the same tree.
2. **A detached HEAD incident.** A retry dispatch's self-heal step (written
   for the case where its OWN isolated worktree's HEAD might be stale)
   instead ran `git checkout --detach <sha>` in the Elephant's shared
   checkout, detaching the Elephant's own HEAD mid-session. The self-heal
   block's premise — "the worktree shares this repo's object database, so
   this SHA is already present locally, safe because the fresh worktree has
   no work of its own yet" — assumes a FRESH, otherwise-empty worktree; it
   is not safe to run against a checkout that has other live, uncommitted
   work in it, which is exactly what a shared (non-isolated) checkout is by
   definition.
3. **A `fork`-type subagent (used to resume a truncated dispatch via
   SendMessage) launched two FURTHER, unplanned dispatches on its own
   initiative** ("Part A, split retry" / "Part B, split retry"), most likely
   because a fork inherits the full parent conversation context AND the
   parent's full toolset (including the Agent tool), and the fork call in
   question was given a garbage placeholder prompt (`Agent` was called with
   `subagent_type: "fork"` and `prompt: "placeholder"` by operator error) —
   with no concrete instruction, it appears to have acted on inherited
   context describing an intended HGO/GWM split, launching that split
   itself. This compounded the shared-checkout race further.

Recovery (same session): all six live/rogue dispatches stopped
(`TaskStop`); the git DAG was reconstructed by hand (`sprint_agy` branch was
never lost — `checkout --detach` does not move a branch ref); one genuinely
complete, tested piece of work was cherry-picked onto `sprint_agy`; a second
complete, tested piece of work sitting uncommitted in the shared working
tree was reviewed and committed; a third, incomplete piece of work (passed
review but broke 12 pre-existing tests, no CLI wiring) was reverted rather
than committed. No work was silently lost, but recovery cost a large fraction
of the session.

## Impact

`isolation: "worktree"` cannot currently be trusted to actually isolate a
dispatch in this environment/session type. Any briefing that assumes real
isolation — in particular a self-heal step that runs `git checkout
--detach` — is unsafe to hand to a dispatch running in what turns out to be
the shared checkout, because the detach lands on the dispatcher's own HEAD,
not a disposable one.

## Proposal

1. **Before relying on `isolation: "worktree"` again in this environment,
   verify it actually works** with a single, low-stakes dispatch and confirm
   via `git worktree list` that a SECOND entry actually appears — not just
   "run the check," but treat a single-entry result as a hard stop condition
   for further worktree-isolated dispatches this session, not a note to
   move past (CLAUDE.md already says to run the check; it does not yet say
   what to do when the check fails).
2. **Until worktree isolation is confirmed working, parallel dispatches into
   the same repository must be serialized** rather than launched
   concurrently via the Agent tool — this directly trades off against a PO
   preference for parallelism, and should be surfaced to the PO as a
   real constraint rather than silently worked around.
3. Consider whether the self-heal block itself should detect "am I actually
   in a distinct worktree" (e.g. compare `git rev-parse --show-toplevel`
   against a path the dispatcher provides) before ever running `checkout
   --detach`, so a misconfigured non-isolated dispatch fails closed instead
   of detaching a shared checkout's HEAD.
4. Investigate why `isolation: "worktree"` silently produced no worktree at
   all rather than an error — a silent no-op here is strictly worse than a
   loud failure, since nothing signaled the dispatcher that isolation had
   not actually been granted.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** root-caused and recovered from within this session; the
  underlying "why does isolation: worktree no-op here" question needs
  investigation this session did not have budget left for after recovery.
  Filed so the next session does not re-discover this the same expensive
  way.
- **Assignment (if accepted):** next available slot — this affects any
  future parallel dispatch in this repository, not scoped to one sprint.
- **Date:** 2026-08-25

### Predicate note, 2026-08-29 — a paragraph in CLAUDE.md is not the remedy

A predicate of the form `contains CLAUDE.md "containment check performed
BEFORE"` was briefly declared here and reported satisfied. It has been
replaced with `manual`, because it measured the wrong thing.

That CLAUDE.md text is real and it is useful: it tells a dispatch to compare
its own `git rev-parse --show-toplevel` against the briefed worktree path
before running any `checkout --detach`, and it tells the dispatcher to run
`git worktree list` immediately after launching. Both were written after a
worktree-isolated dispatch detached a live session HEAD. But it is instruction
text, and this repository's own operating principle is that a rule agents keep
violating needs a guard, not another paragraph of prompt. Nothing mechanically
checks that the instruction was followed, and nothing at all detects the
original defect — that `isolation: "worktree"` was requested and silently not
granted.

Treating the paragraph as the remedy would have closed this item while the
failure mode remained fully live, which is the precise drift the `done_when`
field exists to catch. It is `manual` until a mechanical detection step exists
— the honest candidate being a post-launch check that compares the worktree
count against its own pre-launch baseline, since an unchanged count is the
observable signal that isolation was not granted. Presence alone is not that
signal: roughly two dozen abandoned worktrees from earlier runs are already
registered in this repository, so "a worktree exists" is true whether or not
this dispatch got one.

### Progress note, 2026-08-29 (NVA-W7-WORKTREECOUNT) — the count-comparison logic exists and is tested, wiring is drafted only

The exact candidate the 2026-08-29 Predicate note above names is now real,
standalone, committable code, not yet wired into a running hook:
`plugins/pipeline-core/lib/worktree-count-check.mjs` (+ 33-case test suite,
`worktree-count-check.test.mjs`, `node worktree-count-check.test.mjs` ->
33/33 passed, including real-`git worktree add` cases, not just injected
fakes). It implements exactly the mechanism this item's Predicate note asked
for: a pre-launch baseline (`registerWorktreeIsolationLaunch`, fired when an
Agent/Task `isolation: "worktree"` field or a Workflow-script-embedded
`agent()`/`parallel()` call declaring `isolation: 'worktree'` is detected) and
a post-launch resolution on the next tool call in the same orchestrator
transcript (`resolveWorktreeIsolationLaunch`), with `delta <= 0` yielding the
`not-isolated` verdict this item's whole proposal turns on. Also handles the
`parallel()` multi-dispatch case (a `partial` verdict when the count increased
but by fewer than the number of isolated dispatches declared in one Workflow
call). Honest limits (documented in the module's own header): this is a COUNT
delta, not a per-dispatch identity check, so it can be fooled by unrelated
worktree churn in the same window; and only one pending baseline is tracked
per orchestrator transcript, so two isolation-flagged dispatch calls fired
back-to-back with zero intervening tool calls resolve the first one against
the count observed right before the second one launches (tested, WTC22) —
both are inherent to a count-based signal, not implementation gaps.

**Not done**: actually wiring this into a running hook. `hooks/hooks.json` is
TP-4 protected, so this dispatch could not add the PreToolUse stanza for
real — a complete, ready-to-paste unified diff for that insertion, plus the
full text of the small hook wrapper script it points at
(`hooks/guard-worktree-isolation.mjs`, not yet created — a thin stdin-JSON
adapter around the tested module above, advisory-only: warns on stderr,
never blocks, since it observes a mismatch only after the dispatch already
ran) are both recorded verbatim in
`evidence/dispatch-record-NVA-W7-WORKTREECOUNT.json`'s
`stopCondition.draftPatch` / `stopCondition.draftCompanionHookScript` fields
for the next human-cleared TP-4 override ceremony (same pattern as this
session's other R16/R26/R27 draft-only dispatches). Separately, and
unrelated to this item's own content: this dispatch found that NO commit
could land in this shared checkout at all — `guard-git` GG-22's backlog-ledger
reconciliation precondition is itself blocked by three unrelated backlog
items (2026-08-28-the-readiness-guard-blocks-the-recovery-command-it-names.md,
2026-08-29-signing-fails-without-a-tty-and-the-error-reads-as-a-wrong-passphrase.md,
2026-08-29-undocumented-transcript-fallback-selects-wrong-file-by-mtime.md)
carrying malformed closure metadata (`closure_repository` missing / a
`closure_commit` of `PENDING`). See the dispatch record's log for the exact
guard output; this is out of scope for this dispatch to fix (different items,
data this briefing does not carry) and is reported to the Elephant as a
separate, repo-wide blocker.

**Status stays `open`** (not `closed`): `done_when: manual` is unchanged
because the mechanism is not yet mechanically enforcing anything — the
detection LOGIC exists and is tested, but nothing calls it during a real
session yet. Closing this item is appropriate only once the hooks.json
wiring actually lands and at least one live run has been observed to
surface (or correctly not surface) a mismatch.

### Progress note, 2026-08-30 — hooks.json wiring landed via signed TP-4 override, live-run confirmation still outstanding

The PreToolUse stanza drafted in `evidence/dispatch-record-NVA-W7-
WORKTREECOUNT.json` landed byte-for-byte, commit `0859afe6`, via a signed
`guard-human-override.mjs` ceremony (`mode: pipeline-author-repair`,
request `11b92119cf69daeecca0fa4b5e7ad7643602ceb31ba57471d9fdb65eac02ed26`,
refrozen plan `e8163f011b1ac83244ed64ed1def8c5c59139f2cf46fbd2fd02417fb8381b68e`
after a concurrent background dispatch moved HEAD mid-ceremony, PO signature
verified against trust anchor `2de20a39…`). The companion hook wrapper
(`hooks/guard-worktree-isolation.mjs`) was already committed separately
(`8760f07a`) and did not need this ceremony. `worktree-count-check.test.mjs`
re-run clean, 33/33, after the wiring edit.

**Status still stays `open`.** This item's own bar is "wiring lands AND at
least one live run has been observed to surface (or correctly not surface)
a mismatch" — the second half is unmet: Claude Code hooks enforce only
after a plugin-cache refresh and session reload (this repo's own
cache-enforcement-latency discipline, `docs/state.md`), which has not
happened yet this session. Close only after that live observation.
