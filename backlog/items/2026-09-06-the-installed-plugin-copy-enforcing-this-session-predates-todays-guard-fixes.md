---
schema: pipeline.backlog-item.v1
id: pipeline.installed-plugin-copy-stale-vs-repo-source
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
tracking: "Nova B — a T1 Critic reviewing NVA-B-TILDEFIX-1 ran a live reachability probe (a synthetic marker path, never a real credential) and found the shell-expanded tilde was ADMITTED AND EXECUTED by the guard actually enforcing that dispatch's own session — even though the source fix is confirmed present and Critic-approved in the reviewed working tree. Traced by the Elephant: the enforcing hook is loaded from the installed marketplace copy (/home/skar667/agent-pipeline-local-marketplace/plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs), a plain regular file (not a symlink) last modified 2026-09-04 07:42, which diverges from the repo's own copy by roughly six commits and predates NVA-B-READCONTAIN-1 entirely, not only NVA-B-TILDEFIX-1."
done_when: manual
source: "T1 Critic review of NVA-B-TILDEFIX-1 (opus, max), 'Live reachability probe' disclosure section, 2026-09-06; confirmed independently by the Elephant via `stat`/`diff` against the installed marketplace copy."
---

# The installed plugin copy enforcing this session predates today's guard fixes

## What was found

`plugins/pipeline-core/hooks.json`-registered hooks resolve, for this session,
to `/home/skar667/agent-pipeline-local-marketplace/plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
— a separate, ordinary file (confirmed via `stat`: `Links: 1`, not a symlink)
that is NOT kept in sync with edits to this repository's own
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`. A `diff` between the
two, 2026-09-06, shows the installed copy still lacks
`BOUNDED_PIPELINE_ADDITIONAL_ROOTS`, `isApprovedSingleCommandReadArg`'s
containment restoration, and every other change `NVA-B-READCONTAIN-1`
(commits `cbc30756`, `bc00a861`, `177bf884`) and `NVA-B-TILDEFIX-1` (commits
`afc6af70`, `c88c4f1f`, `aa389a17`) landed — six commits, all invisible to
the guard actually enforcing this session's own Bash tool calls.

Live-confirmed (T1 Critic, synthetic marker path, never a real credential):
`cat ~/nva-tildefix-marker.txt` was **admitted and executed** by this
session's enforcing guard, with the shell expanding `~` exactly as the
tilde-expansion item describes, failing only with the marker file's own
"No such file or directory" — not refused by the guard at all.

## Why this happened (as far as this session could determine)

`pipeline-core:pipeline-start`'s own freshness reference
(`plugins/pipeline-core/skills/pipeline-start/references/freshness.md`)
already documents the intended remedy: "Claude uses its marketplace/plugin
update plus `/reload-plugins`" — an **operator-only** action; "the helper
itself never updates, restarts, retargets, checks out, rebases, merges or
copies source." So the general shape of this gap (a self-application
local-development install needing a manual resync after editing the
plugin's own source) is a known, accepted, documented limitation — matching
CLAUDE.md's own "End-to-end install verification on both machines: OPEN
(Phase 4)."

What is NEW here is the measured scale and the fact that the bootstrap's own
staleness check did not catch it: `pipeline-start-preflight.mjs`, run earlier
the same session, reported `status: "ready"` with `loadedIdentity` and
`installedIdentity` both equal to the same `content-sha256` value
(`426b4594a52...`) — i.e. its own freshness check saw no drift, while the
actual enforcing hook file was, by then, six commits and roughly two days
stale. Either that identity hash reflects something coarser than the
individual hook files' current bytes (e.g. a packed/versioned bundle
identity that a loose file edit does not change), or a comparable blind spot
exists elsewhere in the check. This session could not determine which from
inside the guarded checkout.

## Consequences

For the remainder of a session where this divergence exists, EVERY guard-file
fix landed in the repository (however well-verified and Critic-approved in
source) provides NO actual protection for that session's own tool calls
until the operator runs the marketplace/plugin update and `/reload-plugins`.
This includes, but is not limited to, `NVA-B-READCONTAIN-1` and
`NVA-B-TILDEFIX-1` — the read-scope containment restoration this session
spent the day verifying is, at the time of this writing, not live-enforced
for this checkout's own session.

## Acceptance criteria

- The PO/operator is notified (this item, plus the handover) and runs the
  marketplace/plugin update + `/reload-plugins` (or the equivalent for
  whichever runner is in use) to bring the installed copy current.
- After that resync, a live reachability probe using a synthetic marker path
  (never a real credential) confirms the tilde-reject and read-scope
  containment fixes are actually enforced for real Bash tool calls in a live
  session — not only via direct-import unit tests of the repository's own
  copy of the file.
- The same resync is confirmed for `guard-git.mjs`: a live `git commit -i`
  reproduction (the exact case `NVA-B-GG22FIX-1`'s round-1 Critic finding
  used) is refused by this checkout's own enforcing guard, not only by the
  repository's own copy under direct test.
- Investigate and record why `pipeline-start-preflight.mjs`'s freshness check
  reported `ready`/matching identities despite the six-commit, two-day
  divergence: does its identity hash reflect the actual current bytes of
  each registered hook file, or a coarser packed/versioned artifact that a
  loose source edit does not change? If the latter, that is itself a
  separate, generalizable gap in the bootstrap's own drift detection and
  should be filed as its own item once confirmed (do not fold a confirmed
  finding into this item after the fact — a new item, cross-referenced here).
- This item is cross-referenced from the ADR that `NVA-B-READCONTAIN-1`/`-2`
  owe, as a caveat on any claim that the restored containment is "live" —
  the source fix and its live enforcement are two different facts.

## Update, later the same day (2026-09-06): confirmed to also cover `guard-git.mjs`

A later `diff -q` re-check (single bounded command, admitted by the
containment exception) found `guard-lifecycle-ready.mjs`'s installed copy
still stale — now missing everything from `cbc30756` onward, a larger gap
than the "six commits" first measured, since more restoration commits
landed after this item was filed. The same check, run for the first time
against `plugins/pipeline-core/hooks/guard-git.mjs` (never previously
compared), also found ITS installed copy stale: missing at minimum
`fe2d7afe` and `c6ef3425` (`NVA-B-GG22FIX-1`/`-2`, the pathspec-scoping fix
and its `-i`/`--include` correction). So the GG-22 deadlock fix is, like the
read-scope restoration, not live-enforced for this checkout's own sessions
until the same PO/operator remedy runs. An exact commit-behind count for
either file was not obtained this update — the containment guard admits
only a single bounded `diff`/`stat` per call, not a scripted bisection loop
against the marketplace path — so this item's acceptance criteria (below)
stay the actionable measure, not a specific commit count.
