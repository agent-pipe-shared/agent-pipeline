---
schema: pipeline.backlog-item.v1
id: pipeline.scratch-cleanup-mechanism-not-wired-to-any-event
type: defect
owner: pipeline
status: open
created: 2026-08-08
sprint: nova
due: 2026-08-15
source: "SCRATCH-1 dispatch, 2026-08-08, reported as its own open item. The PO had asked the question directly the same night: 'hoffe nur es gibt einen Event der die Sachen auch wieder aufräumt'."
done_when: manual
---

# The scratch cleanup mechanism is built and nothing calls it

## What exists and what does not

`SCRATCH-1` (`7d3904a`, `23a0652`) added a scratch-descriptor lifecycle to
`plugins/pipeline-core/lib/session-cleanup-recovery.mjs`: bind, release, retire —
descriptor-bound, allowlisted, never a broad clear of the directory. 45 tests
green.

**Nothing in the live bootstrap or close flow calls any of it.** The dispatch
reported this itself rather than letting the green suite imply the feature was
live. So today, a session that uses `scratch/` accumulates directories that
nothing removes, and the mechanism that would remove them sits unreached.

This is the same failure shape the scratch directory itself had before this work:
`scratch/` was in `.gitignore` and sketched in the example manifest, and no code
path used it. The mechanism-without-a-caller is one step further along and one
step short of done.

## Why it matters more than it looks

The PO asked the cleanup question directly and the honest answer is "the mechanism
exists, the event does not". A partially wired cleanup is worse than none in one
specific way: it looks finished. A reader who finds `bindScratchDescriptor` and its
tests has no signal that nothing invokes it.

Concretely, unbounded growth is not hypothetical in this repository — the
repo-root `evidence/` directory reached a 128.7 KB file listing under exactly the
same conditions, and is recorded as instance six of
`2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md`.

## Second gap, from the same dispatch

This repository's own live manifests do not exempt `scratch/` from the dev-plan
gate. The exemption was activated in `templates/pipeline.yaml.example` (`34962c1`)
but the repo's own `project/pipeline.yaml` and `.claude/pipeline.yaml` still lack
it. So in a lifecycle state where the dev-plan guard restricts writes, an agent in
*this* repository can still be refused a scratch write it has been told to use.

Note the trap this sits behind: those manifest files cannot be committed by an
agent by name, per
`2026-08-08-a-guard-string-match-makes-a-file-uncommittable-by-any-agent.md`.

## PO correction, 2026-08-08 — close is the wrong event to hang this on

The first draft of this item's direction said "bind on session start, release on
ordinary session close". The PO rejected the second half on a ground that is worth
stating as the governing observation, because it generalizes past this item:

> a close is often not planned or structured — so cleanup actions actually belong
> in the bootstrap of a new session, to keep the new session clean, or tied to a
> push gate, where a human really is transporting a finished state.

This is correct and it inverts the design. A close is the *least* reliable moment
to schedule work: the sessions whose scratch directories most need collecting are
precisely the ones that ended abruptly and never reached a close. Building cleanup
on the close path optimizes for the case that does not need it.

Two events remain, and neither is the close:

1. **Bootstrap of the next session.** A new session is a reliable, frequent,
   already-instrumented moment, and it has the right motive: it is cleaning up
   *before* it starts working, so it begins in a known state rather than
   inheriting whatever the last run left. Orphan retirement stops being an
   exception path and becomes the ordinary mechanism.
2. **The push gate.** The point at which a human transports a finished state
   outward is the one moment where "is this tree actually clean" has a consequence
   beyond tidiness. Cleanup there is not housekeeping; it is part of what the gate
   asserts.

A release-on-close may still exist as a fast path when a close does happen, but
nothing may depend on it. Correctness must come from the bootstrap sweep alone.

## The second gap is no longer theoretical — observed 2026-08-08 in a consumer project

The section above reasoned that "in a lifecycle state where the dev-plan guard
restricts writes, an agent in *this* repository can still be refused a scratch
write it has been told to use." A greenfield Claude session against the 0.5.4
local candidate hit exactly that, in a *consumer* project rather than this one:

```
Write(scratch/resume-card.json)
  → BLOCKED (guard-devplan): the feature is still in draft design
```

The write was not incidental. `skills/pipeline-start/SKILL.md` step 6 instructs
the session to capture a Resume-Hint card when material design input exists, and
the same skill's "Scratch location" section names `scratch/` as "the only
location the containment guard permits without an exception." One shipped
artifact requires the write; another shipped artifact refuses it. The session
resolved the contradiction by skipping the card and saying so — the right call,
and a capability silently lost.

Two things follow that the original section did not state:

1. **The exemption gap is a consumer-facing defect, not a self-hosting quirk.**
   The item recorded it as missing from *this repository's* manifests. It is also
   missing from what a freshly onboarded project gets, which is the population
   that cannot diagnose it.
2. **The draft phase is precisely when the card matters.** A Resume-Hint captures
   material design input before a restart; design input exists during design.
   Exempting `scratch/` from the dev-plan gate in the implementation phase only
   would leave the contradiction standing where it actually bites.

## Direction, not a design

1. **Bind on session start; sweep on the NEXT session's bootstrap.** No step in
   the correctness argument may reference the close path.
2. **Sweep only what a descriptor claims**, never the directory wholesale — a
   bootstrap sweep runs against a tree whose other contents it did not create, so
   the descriptor binding matters more here than it would at close, not less.
3. **Decide what the push gate asserts about scratch state**, and whether an
   unswept scratch directory is a finding, a warning, or silently swept. This is a
   PO-facing question about what the gate promises, not an implementation detail.
4. **Exempt `scratch/` in this repository's own manifests**, which requires the
   guard trap above to be resolved first or a human to make the edit.
5. **Pin the wiring, not just the mechanism.** A test that a bootstrap sweep
   removes exactly what a *previous* session's descriptor claims and nothing else —
   the current 45 tests cover the functions, which is why the gap survived them.
   A test that only exercises bind-then-release within one session would reproduce
   the very assumption the PO just rejected.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Implement both cleanup events together as the item
  recommends (bind on session start, sweep orphans on the NEXT session's
  bootstrap; sweep/assert at the push gate). **Plus a stronger directive
  than originally recommended, from the PO directly:** `scratch/` write
  access must be UNCONDITIONAL, exactly like a host tmp path — writable
  even when the Pipeline/dev-plan gate is not in a `ready`/`implementation`
  state (draft phase included). This directly closes the "second gap" this
  item's own text already documents (a real consumer project's
  `Write(scratch/resume-card.json)` refused by `guard-devplan` in draft
  phase). The dev-plan gate must exempt `scratch/` universally, not only in
  this repository's own manifests but as the default shipped behavior.
- **Rationale:** PO, 2026-08-12: "scratch sollte immer zugelassen werden
  weil wie tmp pfad auch wenn pipeline nicht ready ist muss scratch immer
  gehen."
- **Assignment (if accepted):** SECURITY/GUARDRAIL-adjacent (touches
  `guard-devplan.mjs`'s write-scope logic) — queued for implementation this
  session. Push-gate question (finding/warning/silent cleanup for unswept
  scratch state) resolved per Elephant's recommendation: soft warning, not
  a hard block.
- **Date:** 2026-08-12

### Partial execution (NVA-BL-82, 2026-08-12)

Committed (`c6bcc307`, `49c7b760`): (1) `guard-devplan.mjs` now exempts any
write under `scratch/` unconditionally, before any manifest/lifecycle
read — the real defect was ordering (scratch/ was exempt but not
unconditional; a portable-State check could still block it first), not
absence of an exemption. (2) The bootstrap-sweep half of the cleanup
wiring is live in `pipeline-start-preflight.mjs`.

**Not done, real open items, not stop-condition artifacts:**

1. **The bind half is unreached** — nothing currently supplies a session
   identity (`PIPELINE_SCRATCH_SESSION_ID`) to preflight, and the dispatch
   correctly refused to mint one per-invocation (that would create orphan
   descriptors no later sweep could ever match to a dead process — the
   exact unbounded-growth failure this mechanism exists to prevent).
   Needs the `pipeline-start` skill or a PO-approved `hooks.json`
   SessionStart hook to pass the session's own UUID down.
2. **Regression risk, should be fixed soon:** the sweep unconditionally
   `mkdir`s `scratch/` on every bootstrap, even in a project where it
   doesn't exist yet — this can dirty a consumer project's tree on first
   bootstrap and trip `security-scan.mjs`'s dirty-tree refusal. Described
   by the dispatch as a two-line fix (skip the sweep when `scratch/`
   doesn't already exist).
3. **Push-gate soft warning not built** (budget, not ambiguity) — a
   precise handover exists: integration point is
   `plugins/pipeline-core/hooks/guard-push.mjs` (append to the existing
   advisory `message`, replace the all-green `exit(0)` around line 1800
   with `emit(1, [advisory])`); needs a prerequisite read-only,
   non-mutating observer added to `session-cleanup-recovery.mjs` first
   (`planOrphanScratchRetirement` currently spawns `git` and creates the
   descriptor directory as a side effect, which a push-gate read must not
   do — mirror the existing `{ create: false }` pattern already used by
   `recoveryJournalPaths`).
4. Direction point 4 from this item's own original Proposal (exempt
   `scratch/` in this repo's own manifests) is now moot — the exemption no
   longer depends on manifest config at all.

**Status:** left `open` — points 1-3 above are real remaining work,
tracked together rather than re-splitting into new items since they share
one dispatch's context.

### Sprint deferral (2026-08-17)

- **Decision:** deferred — remaining points owned by Sprint Alfred.

Points 1-3 deferred to Sprint Alfred ("Agent-first architecture, mechanical
governance, measurable rigor, and control integrity" — ADR-0043's
2026-08-17 amendment) — session-identity plumbing and a push-gate advisory
are architecture/control-integrity work, not current-blocking. Not needed
near-term: the unconditional `scratch/` write exemption (the part that
actually unblocked sessions) already landed.

### Sweep re-triage (AGY-SWEEP-scratch-cleanup-mechanism, 2026-08-25)

Revisited per explicit PO instruction to work through deferred backlog
items rather than rubber-stamp the prior deferral. Findings below correct
the record above, which had gone stale by the time of this dispatch — the
codebase moved after the 2026-08-17 deferral note without the note being
updated.

- **Point 2 (regression risk: unconditional `mkdir`) was already fixed,
  contrary to the deferral note above still listing it open.** Landed in
  `84da1fd9` ("fix(scratch): skip bootstrap sweep entirely when scratch/
  does not exist"), 2026-08-12 — predating even the 2026-08-17 deferral
  note. Verified live at `pipeline-start-preflight.mjs:398`:
  `runBootstrapScratchLifecycle` returns `skipped-no-scratch-directory`
  before touching the filesystem whenever `scratch/` does not already
  exist.
- **Point 4** (manifest exemption) remains moot, as already noted above.
- **Point 1 (bind half) is still open, and is not a cheap wire-up.**
  `PIPELINE_SCRATCH_SESSION_ID` is read at
  `pipeline-start-preflight.mjs:415` but nothing in production sets it
  (confirmed by grep across `plugins/pipeline-core/`: only the reading
  site and its own tests reference the name). The tempting cheap fix —
  mint a session UUID in `SKILL.md`'s prose and pass it as an env var to
  the one-shot `node pipeline-start-preflight.mjs` CLI invocation — is
  actively unsafe, not merely undone: `bindScratchDescriptor` records
  `pid: process.pid` of that SAME one-shot CLI process
  (`session-cleanup-recovery.mjs:1662`), which exits within milliseconds
  of the call returning. Any later `retireOrphanScratchDescriptors` /
  `planOrphanScratchRetirement` liveness check against that PID reads
  "dead" immediately, regardless of whether the underlying agent
  conversation is still active — so two sessions bootstrapping around the
  same time (e.g. an Elephant and a Goldfish both starting) would see
  each other's just-bound descriptor as instantly orphaned and delete a
  live session's scratch directory. A correct fix needs either (a) a real
  Claude Code SessionStart hook, which receives `session_id` via hook
  stdin (as `stop-suggest.mjs` / `post-compact-reground.mjs` /
  `guard-lifecycle-ready.mjs` already do) plus a PID/process-identity that
  outlives the hook's own one-shot invocation — i.e. `process.ppid` (the
  long-running host process) rather than `process.pid`, a semantics
  decision not made anywhere in the code today — or (b) a different
  liveness signal entirely. The lowest-risk wiring route, not yet tried:
  extend an EXISTING already-wired SessionStart hook (`staleness-check.mjs`,
  `setup-check.mjs`, or `codex-session-start-hint.mjs`, all already
  registered in `hooks.json`'s `startup|resume|clear` matcher) to also
  read `session_id` from its own hook stdin and bind/sweep using it — this
  avoids editing `hooks.json` itself, which is both
  `NEVER_LIFTABLE_KERNEL_PATHS`-listed and self-declared TP-4 ("edited
  only under explicit PO approval") — but the `process.pid` vs
  `process.ppid` semantics question above still needs resolving before
  that route is safe to build.
- **Point 3 (push-gate soft warning) is still open, but its stated
  prerequisite is already done**, contrary to the 2026-08-12 handover text
  above: `planOrphanScratchRetirement` (`session-cleanup-recovery.mjs:1717`)
  is already exactly the non-mutating, read-only observer that handover
  asked for (no `mkdirSync`, no `physicalScratchRoot` call — mirrors the
  `{ create: false }` pattern the handover named). `guard-push.mjs` itself
  has zero scratch references today (confirmed by grep). So the actual
  remaining work is narrower than the stale handover text suggests: call
  `planOrphanScratchRetirement` from `guard-push.mjs` and append an
  advisory when any entry has `status: "orphan"`. Not attempted in this
  dispatch — no budget remained to locate the current advisory/`exit(0)`
  shape in `guard-push.mjs` (the 2026-08-12 "line ~1800" reference is
  stale and unverified in this pass) and to verify a push-gate
  exit-semantics change safely.
- **Decision for this sweep dispatch: `blocked`.** Not `recommend-close`
  (points 1 and 3 are real, confirmed-open work, not superseded or
  already resolved). Not `implemented` (tool budget for this dispatch was
  spent re-verifying the stale Triage above before any code could safely
  be written and tested — see the point-2 finding, which shows the prior
  Triage cannot be trusted at face value). Not `needs-po-decision` in the
  genuine product/UX sense (the open questions above are technical: PID-
  vs-PPID liveness semantics, and where the SessionStart wiring should
  land) but blocked on a real technical constraint (the direct
  session-identity route runs straight into the TP-4/kernel-protected
  `hooks.json`) combined with this dispatch's remaining budget. Status
  left `open`; not this dispatch's call to close or reassign.

### Progress (NVA-W1-SCRATCHBIND, 2026-08-29) — Points 1 and 3 implemented and tested

Both remaining real gaps from the 2026-08-25 sweep above are now implemented.

**Point 1 (bind half), resolved without touching `hooks.json`.**
`hooks/staleness-check.mjs` -- already a registered `startup|resume|clear`
SessionStart hook, so no new `hooks.json` entry was needed (that file stays
TP-4/PO-approval-only, untouched) -- now reads its own SessionStart stdin for
`session_id` and calls the existing `runBootstrapScratchLifecycle` directly
with `env: { PIPELINE_SCRATCH_SESSION_ID: session_id }`. This is exactly the
"lowest-risk wiring route" the 2026-08-25 re-triage named and left
unimplemented.

**PID-vs-PPID decision, made and implemented (not left a TODO):**
`bindScratchDescriptor` is now called with `deps.pidFn: () => process.ppid`,
not `process.pid`. `staleness-check.mjs`'s own node process is a one-shot
invocation that exits within milliseconds of writing its output; recording
its own `pid` would make the binding read back as "orphan" on the very next
sweep regardless of whether the actual agent session is still running.
`process.ppid` is the long-running per-session host process that invoked this
hook and persists for the session's whole lifetime -- the semantics the
2026-08-25 note already named as the intended fix. A PID-reuse risk still
exists in principle (an unrelated process later reusing the same numeric
pid); that risk is unchanged from before this dispatch and is already
covered by the existing boot_id+start-ticks fingerprint check in
`session-cleanup-recovery.mjs`, not something this dispatch needed to touch.
Proven by five new cases in `hooks/staleness-check.test.mjs` (session_id
resolution, a real bind through a temp git repo asserting
`binding.status !== "unbound-no-session-identity"`, a direct assertion that
the written descriptor's `pid` equals `process.ppid` and NOT `process.pid`,
the no-session-identity fail-open path, and the unusable-root fail-open
path) plus the existing 11 cases, all passing (17/17).

**Point 3 (push-gate soft warning), implemented.** `guard-push.mjs`'s
all-green exit point (`if (allFailures.length === 0)`, formerly a bare
`process.exit(0)`) now calls the already-existing read-only
`planOrphanScratchRetirement` observer against `fallbackProjectDir()` (the
governed session root, matching every other evidence read in that file) and,
when any descriptor verifies as an orphan, emits a **non-blocking**
advisory via `emit(1, ...)` — hooks.json's own documented exit-code
contract (1 = allow + config warning to the user) — before still allowing
the push. No new hard gate; nothing was added to `failures`/
`securityFailures`. The advisory surfaces only `sessionId` and the
already-relative `scratchRelativePath`, never the absolute
`descriptorPath` (SEC-01: this file's existing discipline against leaking
machine-local paths into a message that travels into the session
transcript). `guard-push.test.mjs`/`guard-push-v2.test.mjs` are TP-5
protected (no in-session override); a new sibling file,
`hooks/guard-push-scratch-advisory.test.mjs`, exercises the real
`guard-push.mjs` binary end to end (mirroring the established
`guard-push-external-ledger.test.mjs` sibling-file precedent) with three
cases: no descriptors -> plain allow, an orphaned descriptor -> advisory
(exit 1, still allowed), a live descriptor -> plain allow, no advisory
(3/3 passing). All five existing guard-push sibling suites (168 + 9 + 7 +
3 + 6 = 193 cases) re-run and pass unchanged.

**Not this dispatch's call: closing the item.** Point 2 (the `mkdir`
regression) was already fixed before this dispatch, confirmed live again
at `pipeline-start-preflight.mjs:1162`. Point 4 (manifest exemption)
remains moot, as already noted above. That leaves every point from the
2026-08-25 re-triage addressed in code and covered by a passing test —
but this dispatch could not obtain a `closure_commit` to record here: a
pre-existing, unrelated shared-checkout git-guard state (`guard-git.mjs`
GG-22, a backlog-ledger reconciliation owed by OTHER concurrent
dispatches' backlog edits since the loaded ruleset SHA) blocked every
commit attempted during this session, and running the guard's own named
remedy (`reconcile-backlog-ledger.mjs --activate`) was outside this
dispatch's briefed file scope (it writes `backlog/STATUS.md` /
`backlog/index.json` / `backlog/transitions.ndjson`, none of which this
dispatch was authorized to touch). **Status left `open`** pending either
a successful commit (see the dispatch's own completion report for the
final outcome) or a follow-up session confirming the ledger is
reconciled and re-attempting the commit.
