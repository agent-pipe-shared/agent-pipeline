# Handover archive -- Observation publication queue, Re-entry, 2026-08-18 (daytime continuation 3) — 0.6.0 version bump; a real Verify regression from this session's own closures found and fixed, Full-backlog completeness sweep (2026-08-18, PO hard bar: "otherwise no 0.6"), Bucket C/E parallel-sweep completion (2026-08-18), Phoenix reconcile-approval port, worktree-isolation root cause, and Nova-sweep round 2 (2026-08-18), 2026-08-18 (six-branch merge, F2f close, C2f block, HGO diagnosis), 2026-08-18 (OT09 fixed, C2f fully merged, the HGO admission "bug" resolved as a process gap, not a code defect), 2026-08-18 (Toolbox/Phoenix blockers, HGO ceremony-scope PO feedback, fresh 0.6.0 candidate), Recovery

> Rotated from `docs/state.md` on 2026-08-19 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Observation publication queue, Re-entry, 2026-08-18 (daytime continuation 3) — 0.6.0 version bump; a real Verify regression from this session's own closures found and fixed, Full-backlog completeness sweep (2026-08-18, PO hard bar: "otherwise no 0.6"), Bucket C/E parallel-sweep completion (2026-08-18), Phoenix reconcile-approval port, worktree-isolation root cause, and Nova-sweep round 2 (2026-08-18), 2026-08-18 (six-branch merge, F2f close, C2f block, HGO diagnosis), 2026-08-18 (OT09 fixed, C2f fully merged, the HGO admission "bug" resolved as a process gap, not a code defect), 2026-08-18 (Toolbox/Phoenix blockers, HGO ceremony-scope PO feedback, fresh 0.6.0 candidate), Recovery.
> Summary: 2026-08-18 daytime: six-branch merge/F2f/C2f/HGO OT09 diagnosis, Phoenix reconcile-approval port, worktree-isolation root cause (now in CLAUDE.md), backlog completeness sweep, Toolbox/Phoenix blockers, fresh 0.6.0 candidate history -- all superseded by later same-day and 2026-08-19 work.
> Append-only once written; never edited by hand.
> Content below is verbatim except that relative markdown link target(s) were rewritten to keep resolving correctly at this file's directory depth (link text and all other content are untouched).

## Observation publication queue

GitHub Issues in the Public repository are the intended branch-independent
single source. The following sanitized observations were approved for initial
publication as `kind:observation` plus `triage:needs-review`; they remain
unverified and must not be promoted to Known Error or a new backlog item during
capture. Publication waits for the planned plugin/session reload and GitHub
capability readback.

1. WSL sandbox DNS configuration may be unreliable.
2. Codex Advisory requires repeated per-run permission escalation.
3. Claude Code runner retest after Multi-CLI 0.3+ remains pending.
4. Codex CLI sandbox does not work reliably for this project in WSL while the
   Desktop App sandbox does; a workaround exists.
5. The planned Gemini/Anti Gravity third runner has not been tested.
6. Formal Critic/Goldfish errors can cause restarts and excess runtime.
7. Epic/Feature efficiency and cross-runner runtime/cost telemetry are
   insufficient.
8. AFK mode is not working correctly on Codex.
9. Codex does not reliably enforce the configured phase/model transition.
10. Windows Codex App may substitute an ad-hoc writable Critic for the required
    skill; publish only the sanitized high-level observation, never bypass
    details.
11. `close-block` is not proactively required or offered at the delivery/session
    boundary. The expected trigger is delivery-ready or session cut, not every
    intermediate commit. Every Pipeline component that creates temporary
    scratch/resources must register them in the session-owned cleanup handle;
    Close deletes only descriptor-bound allowlisted targets and requires a
    clean hygiene readback rather than broadly clearing `/tmp`.
12. The obsolete “new block review” ritual can still surface although bootstrap
    replaced it.
13. Legacy user-doc redirects and possibly internal/obsolete `docs/` files are
   still presented as V3 user-facing material. Triage requires a complete
   audience/lifecycle inventory and link/authority review before deletion.
14. The primary README mixes runner-specific lifecycle wording, historical
   links, a Claude-first runtime framing, and detailed Codex sandbox material;
   triage should restore a runner-neutral onboarding flow and move deep runtime
   detail to the operating model.

The intake implementation consists of a closed repository Issue Form, the
`capture-observation` skill, privacy/security routing, duplicate search,
preview/confirmation, GitHub creation and readback. Required labels still have
to be created on GitHub before publication.


## Re-entry

1. Maintainers start with [`CLAUDE.md`](../../CLAUDE.md).

1. Maintainers start with [`CLAUDE.md`](../../CLAUDE.md).
2. Run the full [`pipeline-start` bootstrap](../../harness/session-bootstrap.md).
3. Confirm the installed plugin version and source/cache manifest digest before
   trusting the refreshed plugin in the new session.
4. Read back the named feature branch and rerun the configured Verify/Security
   gates if its OID differs from the local exact candidate.
5. Keep slim private overlays fail-closed until the SNT-A candidate is
   independently reviewed, reinstalled, explicitly activated and read back in
   the new session. In the private overlay use `inspect`, `plan`, explicit
   `activate`, then `status` and `load-context`.


## 2026-08-18 (daytime continuation 3) — 0.6.0 version bump; a real Verify regression from this session's own closures found and fixed

The PO's Stop-hook correctly pushed back on treating the Sentinel/Cyborg
reconciliation as sufficient for the standing "release 0.6.0, deploy to
main" goal — neither the version bump nor the candidate freeze nor the
Main publication had happened. Proceeded autonomously per the operating
model (routine implementation choices do not need a fresh PO touch).

**Version bumped to `0.6.0`** across all three surfaces (`VERSION`,
both plugin manifests, stamped `+{claude,codex}.20260818090525.8574686`).
`claude plugin validate plugins/pipeline-core`: passed. Commit `cad15998`.

**A fresh Full Verify immediately caught a real regression this
session's own backlog work introduced.** `backlog-state-tests` and
`backlog-state-check` — both previously clean, not part of the known
exception — failed. Root cause traced directly: `check-backlog-state.mjs`
requires `closure_commit` to be a full 40-char lowercase Git commit OID;
every closure this session (13 items) and one from immediately before it
(2 items, 15 total) used the short 8-char form instead. The malformed
field cascaded into a flood of unrelated "ledger event N: id does not
name a current backlog item" findings — resolving each short SHA to its
full form via `git rev-parse` and regenerating `backlog/index.json`
cleared all of it at once, confirming the cascade's actual cause. Fixed,
commit `92039bbb`. Two pre-existing, unrelated DRIFT-classified findings
remain (ledger event 403, `pipeline.codex-read-only-steps-escalate-individually-once`)
— predate this session, tolerated by the checker's own cutoff-sequence
logic, not touched.

**Fresh Full Verify after both fixes: 268/269 green, exit path clean
except the one known, separately-tracked `human-guard-override-tests`
host-config exception** (`HGO-EXTERNAL-MARKETPLACE`, unrelated to any
change this session made — confirmed identical on unmodified `main`
multiple times today). `security-scan.mjs`: included in the Verify run,
clean (no separate finding). Candidate at `92039bbb`, local test
candidate — not yet frozen as the Nova A release candidate, no push
approval prepared or recorded.

**Lesson worth naming:** this session's own extensive backlog-closure
work introduced a real, mechanical field-format defect (short vs. full
commit SHA) that a fresh Verify run caught immediately — exactly the
"trust but verify" discipline this whole session repeatedly needed. The
closure_commit convention (`git rev-parse <short-sha>` before writing
the frontmatter field, never the short form a `git log --oneline`
naturally hands back) is worth stating explicitly for future closures.

**Explicit per-candidate QG-01 disclosure for `92039bbb`.** The
comprehensive Critic review dispatched against diff `41d7e8c2..92039bbb`
FAILed on one finding: the candidate-bound Verify evidence
(`evidence/verify-latest.json`, commit
`92039bbbc834e69d8474d2da87d5510bb55ca522` / tree
`f24e6f45e4d1c841a7acd6446f9b9ea0e04edd00` — independently confirmed
against `git rev-parse 92039bbb^{commit}`/`^{tree}`) reports the
deterministic Verify gate red, and no entry in this file disclosed that
exact fact for this exact candidate — the closest disclosure was for the
earlier candidate `41d7e8c2`, three commits before this tip. Disclosing
it now, explicitly, per candidate: the sole failing step is
`human-guard-override-tests`, the single known, pre-existing, host-local
`HGO-EXTERNAL-MARKETPLACE` exception (`externalLocalMarketplaceObservation()`
— rsync-mirror staleness on this host), confirmed identical on
unmodified `main` via `git stash` multiple times this session, and
independently re-confirmed unrelated to this diff's own code path by the
Critic's own review (all 6 new `NVA-CROSSREPOLEDGER-1/2` tests pass in
the same evidence run — `evidence/NVA-CROSSREPOLEDGER-2-verify.txt:69-100`).
No new failure was introduced between `41d7e8c2` and `92039bbb`. Accepted
as a standing, host-local exception, not re-litigated per candidate going
forward — this entry is the one-time explicit disclosure the Critic's
QG-01 finding required.


## Full-backlog completeness sweep (2026-08-18, PO hard bar: "otherwise no 0.6")

PO instruction, verbatim intent: items already deferred to a named,
still-open future sprint (not Sentinel/Cyborg, which are closed) do not
block 0.6; everything else in the 96 open/in_progress backlog items
(86 open + 10 in_progress out of ~254 total) must be genuinely resolved
now — decided AND, where feasible same-session, implemented — not
deferred again.

A systematic audit (read every item's own Triage section directly, no
sampling) classified the 96 into five buckets: **A** genuinely untriaged,
7 items; **B** deferred to a named future sprint with real PO/Elephant
rationale, ~34 items (does not block, per the PO's own rule above); **C**
accepted, in scope, not yet implemented, ~40 items; **D** rejected but
never closed, 0 found; **E** partially landed, deliberately still open,
~15 items.

**Bucket A (7) resolved this block, commits `00bd47c1`/`df60eea4`/`5c0ab668`:**
- `goldfish-dispatches-touching-plugin-files-dont-self-check-consumer-safe-paths` — CLOSED, implemented (standing DoD-checks line in `goldfish-task.md`).
- `elephant-direct-implementation-under-afk-authorization` — CLOSED, implemented (PO-waived direct-implementation light path in `close-block/SKILL.md` step 6b, with a mandatory follow-up-Critic-review obligation).
- `two-handover-rotation-mechanisms-use-different-archive-conventions` — CLOSED, implemented (both scripts' headers now state the naming-convention split is a permanent decision, citing the item).
- `backlog-delivery-status-reconciliation` — stays `in_progress`: this item IS Nova A issue #57 (issue-acceptance-matrix row `#57`), closes with that gate chain, not separately.
- `test-suites-use-host-tmp-instead-of-the-repos-own-scratch-convention` — stays `open`: real bounded decision recorded (shared `scratch/test-tmp/` helper + verify-surfaced budget check + two highest-offender suites migrated; full repo-wide migration explicitly deferred as a separate follow-up), implementation queued for a `goldfish-deep` dispatch — not yet dispatched.
- `managed-onboarding-success-contract` and `managed-onboarding-repair-item-sha256-pin-blocks-its-own-triage-edits` — left untouched: both were miscategorized as bucket A by the audit; both already carry a real, PO-legible deferral-to-Sprint-Alfred decision (the second item's own Triage records the first item's decision too, since the first item's file is byte-pinned by a ledger repair and cannot be edited without breaking `check-backlog-state.mjs`). Genuine bucket B, not bucket A.

**QG-01 process fix, same block:** the comprehensive Critic review of the
Nova A candidate (`41d7e8c2..92039bbb`) FAILed on a pure evidence-disclosure
gap (see the entry above this one) — fixed via an explicit per-candidate
disclosure commit (`ea42d6d7`) and a corrected, contamination-free
re-dispatch (`92039bbb..ea42d6d7`, strict positional-token `args`) — round 2
in flight as of this entry.

**Next: bucket C (~40) and E (~15).** Per the PO's hard bar these are not
optional follow-ups — they are release-blocking. Working through them
systematically next, same pattern as bucket A: real decision + same-session
implementation where feasible, a queued/dispatched fix where the work
genuinely needs its own dispatch, never a re-deferral without a named
future sprint and PO-legible rationale.


## Bucket C/E parallel-sweep completion (2026-08-18)

Per the PO's explicit direction to parallelize the remaining backlog work
hard via the Workflow tool: `isolation: "worktree"` was tried first and hit
a confirmed infrastructure bug (worktrees provisioned from the stale local
`stable` branch, 552 commits behind — see the sharpened
`feedback-agent-worktree-isolation-can-branch-off-wrong-base` memory) —
worked around by switching to a two-phase design: 10 parallel *read-only*
cluster agents (no isolation needed, no shared-write race) each proposed
full new content for their assigned items, then this session applied every
proposal sequentially, single-writer, in the main checkout.

**All 92 remaining open/in_progress items were covered across the 10
clusters** (authority-guard, critic-verify, human-approval-push,
onboarding-bootstrap-kickoff, codex-cross-repo-runner,
dispatch-goldfish-orchestration, docs-handover-design,
gmw-windows-fs-scratch, process-cost-recovery-misc,
sentinel-cyborg-residual-po-only). Disposition breakdown:

- **3 closed, implemented same-pass:** `plan-partial-authority-guard-
  allowlist-does-not-admit-its-own-profile-source-flags` (closed as
  not-a-defect — the narrower admission is deliberate, twice-Critic-
  reviewed defense-in-depth; no code change needed), `no-gate-is-tested-
  end-to-end-for-satisfiability` (QG-11 added to
  `guardrails/quality-gates.md`: "test what the change altered, not only
  what it was meant to fix"), `prd-spec-depth-collapses-relative-to-
  design-input` (one sentence added to `kickoff-design.md` operationalizing
  the PO-accepted "short goal → ask more" decision).
- **~40 already correctly deferred to a named, still-open sprint** (Alfred,
  Nightwing, Phoenix) with real, dated, PO-legible rationale — confirmed,
  left untouched, do not count against the release bar per the PO's own
  rule.
- **~45 decided and queued for a dedicated implementation dispatch**, each
  with a bounded, concrete scope written into the item's own Triage (not
  left "unassigned" or vaguely deferred) — most newly assigned to Sprint
  Alfred where no sprint was previously named, since "Nova A/B" is this
  same release, not a separate one.
- **2 confirmed genuinely PO-only**, cannot be closed from any session
  (`two-guards-block-an-unrelated-file-via-substring-name-matching` part B,
  `unregistered-suite-is-red-and-invisible-to-verify` — both need an
  out-of-session attended-author repair ceremony or signature only the PO
  can perform).
- **0 "rejected but never closed"** bookkeeping gaps found.

Applied across 9 commits (one per cluster, `9fa8a025`..`18b6d8bd`), plus a
closure_commit-placeholder-resolution commit (`74dabb23`), a
closure_evidence bare-path-format fix (`d923c035`, the checker rejects a
fragment anchor or line range in that field), and a ledger-regeneration
commit (`a3519ed4`). Fresh Full Verify at `a3519ed4`: clean except the one
known `HGO-EXTERNAL-MARKETPLACE` host-local exception, unchanged.

**Honest remaining count:** `backlog/STATUS.md` — 81 open + 9 in_progress =
90 not-closed (down from 96 at the start of this session's full-backlog
sweep), 164 closed. The 90 are now ALL either (a) correctly deferred to a
named still-open sprint with real rationale, or (b) decided with a bounded,
concrete dispatch scope recorded in their own Triage, or (c) confirmed
genuinely PO-only — none are silently unassigned or unexamined.


## Phoenix reconcile-approval port, worktree-isolation root cause, and Nova-sweep round 2 (2026-08-18)

**Phoenix cross-repo port.** `plugins/pipeline-core/lib/critical-human-proof-policy.mjs`
was generalized (commit `d44f992e`, ported from the sibling Phoenix sprint
checkout, bounded scope: this lib file only, `CRITICAL_ACTION_KINDS` and
`po-human-approval.mjs` deliberately untouched) to support a
`feature-package-reconcile` gate mode alongside `push`
(`GATE_APPROVAL_MODE_KEYS`, `readGateApprovalMode`). The dispatch
(`NVA-RECONCILE-PORT-1`) landed the lib change but was truncated before
updating its own test coverage, leaving `guard-testpath-override.test.mjs`
line 213 (OT09) red — it still asserts the old `gates?.push_approval` regex
literal, which the generalized source no longer contains verbatim.

**TP-7 human-guard-override signature ceremony run to completion on the
PO side, but OT09 is still unfixed — a real consumption bug, distinct from
the display bug below.** Override request `66e429bb…` (HEAD
`6f84945518302c1da727245d0ad45731c1e86c78`, `plan-sha256 447cc30e…`,
`mode: pipeline-author-repair`, `author-source-root:
plugins/pipeline-core`) was PO-signed successfully twice over
(`sign-intent` → `humanName: "André"`; a same-session attempt to rebind
the identity to "APS" was correctly refused by `setup` as a non-silent
rebind and deferred, not forced) and armed via `authorize-by-signature`
(capability `447cc30e….json`, `status: "armed"`, `consumedAt: null`).
**The armed capability was never consumable**: retrying the identical
Edit twice against a confirmed-clean tree still returned the same
`TP-7`/`author-repair-required` denial as if unarmed, meaning
`consumeHumanGuardOverride()` in `human-guard-override.mjs` returned
something other than `"consumed"` (`"absent"` or `"replan"`) for a
capability that every visible field said should match. Root cause not
yet found — candidates not yet ruled out: the denial-digest recomputed
fresh at consume-time diverging from the one recorded at arm-time, or
`authorEligiblePaths()`'s re-validation at line ~2721 of
`human-guard-override.mjs` returning null against the current repo state.
The capability expired unused (`2026-08-18T09:56:41Z`). **Two self-
inflicted `HGO-DRIFT` retries happened first**, both from this session
editing the tracked/untracked tree (`docs/state.md`, then a new file)
between hand-off and the PO's next command — each burned a live PO
passphrase entry for nothing; this is now `CLAUDE.md`'s new Hard Rule
("No tree mutation while a HEAD/tree-bound PO command is outstanding").
**OT09 is still red.** The prepared one-line fix
(`assert.match(source, /push:\s*"push_approval"/u)`) is unapplied;
redoing the ceremony needs the consumption bug understood first, or the
PO may prefer the still-available `pipeline-author-repair` route once a
working fix is confirmed some other way. File this as its own backlog
item (bounded scope: `consumeHumanGuardOverride`'s `pipeline-author-repair`
path only) before the next attempt.

**`isolation: "worktree"` root cause found and fixed.** Confirmed by direct
test: a fresh worktree is provisioned from the LOCAL
`refs/remotes/origin/HEAD` symbolic ref's target, not the current
checkout's branch — a stale, clone-time-only ref that doesn't auto-update.
The reliable fix is a self-heal, not a stop: `git checkout --detach
<exact-expected-sha>` inside a mismatched fresh worktree moves HEAD
cleanly (shared object DB, no network, no data loss, safe pre-work).
Persisted in `CLAUDE.md`'s Environment note and
`templates/prompts/goldfish-task.md`; NOT YET integrated into the
`pipeline-start` skill itself (PO-requested follow-up, open).

**Nova-sweep round 2 (9 parallel worktree-isolated dispatches, re-running
the round-1 items that all self-detected the (now-fixed) stale base and
stopped cleanly with zero work): confirms the self-heal fix works** — all
9 worktrees landed on the exact correct HEAD. 2 of 9 (A2 — transfer-time
PRD/Spec retention classification, commit `ff31ee87`; H2 — happy-path
cost forensic pass, correctly self-stopped on a real missing-access
blocker) finished cleanly with full reports. **The other 7 (B2/C2/D2/E2/
F2/G2/I2) did real, on-scope implementation work — confirmed via each
worktree's uncommitted `git diff`, matching its backlog item's scope —
but returned an empty final report and never committed.** Root cause:
`guardrails/token-budget.md` TB-06 already documents an observed
Claude-Workflow-agent hard termination near 50 tool calls (recommended
dispatch budget ≤45); round 2's briefings never stated a tool-call budget,
so these 7 ran blind into that cliff (measured: 470 tool calls / 9 agents
≈ 52 average, consistent with the documented cliff). A follow-up
"finish-in-place" Workflow (`wxhzae2b9`, no new worktree provisioning —
same 7 existing worktrees, explicit 40-call budget with a mandatory
~32-call checkpoint-and-report instruction) completed with **0 empty
reports** — the budget fix worked. **6 of 7 finished and committed**:
B2f `f1d12e35` (runtime-projection-v3 neutral-mirror sync — DONE, but no
production caller wired in yet, follow-up needed), D2f `ad6bcf34`
(benchmark fixture digest binding — DONE), E2f `929f840b`
(host-managed-Codex target boundary — DONE; flags an unconfirmed possible
latent EACCES on a read-only `.codex` mount at real apply-time, not yet
investigated), F2f `9b36dc14` (GMW reconcile manual-copy collapse in
`po-human-approval.mjs` — DONE, **security-adjacent, needs a Critic review
before this branch merges to `main`**, not yet dispatched), G2f
`48cec16d` (Windows ACL auto-remediation + ancestor-skip gap — DONE, but
**cannot be live-verified from this Linux/WSL host**, needs a real
Windows checkout run before being treated as closed), I2f `914b5328`
(`.gitignore` anchoring per ADR-0063 follow-up 1 of 3 only — the other two
ADR-0063 follow-ups and the separate Codex-restart-transcript-recovery
item remain open/unassigned). **C2f correctly stopped, no commit**: adding
the mandatory PRD-acknowledgement marker check inside the shared
`prdAuthority()` validator causes a proven, git-stash-confirmed collateral
regression in `harness/scripts/pipeline-state.test.mjs` (at least 6 more
files construct the same kind of PRD fixture and are equally exposed but
unverified). **Open PO/Elephant decision, not yet made:** either (a) patch
every affected fixture call site to carry the new marker, or (b) narrow
the check's blast radius to the real `approve-plan` CLI path instead of
the shared validator. None of these 7 branches have been merged into
`feat/sprint-nova-codex-v046` yet — still sitting as commits in their own
worktrees under `.claude/worktrees/wf_7f39bfec-21b-{2,4,5,6,7,9}` (C2f's
worktree, `-3`, has an uncommitted diff instead). Merge sequentially by
hand once the C2f decision is made and F2f's Critic review is scheduled.

**Four durable-documentation items written this session** (all four were
live, PO-flagged costs from this exact session, not speculative
hardening): `plugins/pipeline-core/skills/pipeline-start/references/
workflow-dispatch.md` (new — Elephant-only Workflow/Agent orchestration,
the worktree self-heal briefing text, the ~50-tool-call budget
requirement, and how to recover a truncated dispatch), pointers to it
added to `SKILL.md`'s lazy-loading list and its autonomous-continuation
section, and the new CLAUDE.md Hard Rule against tree mutation during an
outstanding HEAD-bound PO command (see the ceremony entry above for the
incident that prompted it).

**Fork incident (contained, no lasting effect).** A `subagent_type: "fork"`
dispatched for read-only research self-authorized two Workflow launches
beyond its brief. Stopped via the same agent (SendMessage, not a fresh
fork) and `TaskStop`; confirmed zero footprint (`git status`, `git
worktree list`, `git branch --list`). Root cause: forks and
`general-purpose` subagents inherit the FULL parent toolset (including
Agent/Workflow) — unlike the Pipeline's own `goldfish-*`/`critic` role
definitions, which are already tool-scoped in
`plugins/pipeline-core/agents/*.md` to exclude Agent/Workflow (confirmed
by direct grep — no change needed there). **Open, PO-requested:** a
durable rule that forks/general-purpose dispatches must be explicitly
told never to invoke Workflow/Agent unless the Elephant authorizes it —
not yet written into CLAUDE.md or `docs/operating-model.md`.

**Two new bugs found, not yet filed as backlog items:** (1)
`describeHumanGuardOverrideSelection()` in `human-guard-override.mjs`
hardcodes `authorSourceRoot: null` when re-deriving a stored request's
digest for display, so it can never correctly describe/match a
`pipeline-author-repair-candidate`-mode request — surfaces as a cosmetic
but confusing `HGO-RECORD-DIGEST-MISMATCH` on every such ceremony (does
not block signing, confirmed live). (2) the PO separately flagged that
`sign-intent`'s confirmation text should show the actual recorded reason
for audit purposes rather than a generic placeholder — may already be
covered by an existing backlog item; not yet cross-referenced.


## 2026-08-18 (six-branch merge, F2f close, C2f block, HGO diagnosis)

**All 6 mergeable worktree commits landed on this branch, cleanly, zero
conflicts.** Cherry-picked as new SHAs (originals were in worktrees):
`98b173f0` (A2, transfer-classification), `95801948` (B2f,
runtime-projection-v3 neutral-mirror sync), `e3e52183` (D2f, benchmark
fixture digest binding), `d8fd9a37` (E2f, host-managed-Codex target
boundary), `b8f28a79` (G2f, Windows ACL auto-remediation — still **not
live-verified from this Linux/WSL host**, needs a real Windows checkout
run before being treated as closed), `2b90e547` (I2f, `.gitignore`
anchoring, ADR-0063 follow-up 1 of 3 only). Combined `node --test` across
all 9 touched test files: 9/9 green. All 6 source worktrees removed
(`git worktree remove`).

**F2f (GMW reconcile manual-copy collapse) — Critic-reviewed and merged.**
First Critic round: FAIL (blocker: the new `scratch/` mirror writes did
not carry `artifactPath()`'s existing symlink/hardlink/regular-file
hardening; major: PO doc never updated; minor: mutual-exclusion check
tested digest validity instead of presence, silently discarding a
malformed digest supplied together with `--request`). Rework dispatch
(`NVA-SWEEP-F2f-REWORK`) fixed all three, added symlink regression tests,
documented the route in `docs/po-human-approval.md`. Second Critic round:
**PASS**, two non-blocking `minor` findings left as fast-follow (assert
ordering runs post-signature instead of pre-flight; two new branches lack
direct test coverage) — full detail in the closure note on
`backlog/items/2026-08-16-gmw-reconcile-still-needs-a-manual-copy-after-the-po-signs.md`
(now closed). Both commits (`9b36dc14` original + `8c7a1ac9` rework)
cherry-picked to this branch as `aaccbfcf`/`b273a1a0`. 71/71 tests green
on the integrated branch.

**C2f (PRD-acknowledgement scope fix) — implemented, committed in its own
worktree, but blocked on the same wall as OT09.** The core fix
(`requireAcknowledgement` threaded into `prdAuthority()`, gated on
`expectedPlanSha256`/`expectedSpecSha256`) landed and its own suite is
green (`po-gate-authority.test.mjs` 61/61). But `harness/scripts/
pipeline-state.test.mjs`'s `seedSubprocessPoGateAuthority` fixture (real
subprocess `submit-plan`/`approve-plan` path, the one call site of the
three originally suspected that actually needed the marker — the other
two, at lines 75 and 450, were investigated and confirmed NOT affected)
needs the PRD-acknowledgement marker added, and that file is
`guard-testpath.mjs` `TP-5`-protected with no in-session override. **Not
merged; worktree `wf_7f39bfec-21b-3` (HEAD `d723d88b`) left as-is.**

**HGO admission bug (blocking both OT09 and now C2f) — diagnosis
narrowed, not fixed.** A read-only investigation (repo `git status`
unchanged throughout) built a real repro
(`scratch/critic-hgo-repro/repro-signature-author-repair.mjs`, gitignored,
left for reuse) combining signature-mode + `pipeline-author-repair` mode —
previously untested in combination — and it succeeded end to end when the
retried tool input is byte-identical to the originally denied one. This
narrows the live-ceremony failures to the **silent `toolInputSha256`
match gate** in `consumeHumanGuardOverride()`
(`human-guard-override.mjs:2689-2691`): any field difference between the
originally-denied call and the manually retried one silently skips the
capability with no error, falling through to `{status:"absent"}` —
indistinguishable from unarmed. Secondary, untested candidate:
`capability.root !== repo.root` (~line 2714). Separately, and now FULLY
CONFIRMED (not just suspected): `describeHumanGuardOverrideSelection()`
hardcodes `authorSourceRoot: null`, which structurally cannot resolve ANY
`pipeline-author-repair-candidate` request for display — a distinct bug
from the consumption failure, cosmetic (does not block signing). Full
diagnosis and proposed minimal fixes are in
`backlog/items/2026-08-18-pipeline-author-repair-signature-mode-never-actually-admits-the-edit.md`
(updated, still open). **Recommended next step, revised: add temporary
scoped instrumentation logging exactly which equality check fails per
skipped capability file, land it, THEN run one more live ceremony
attempt** — turns the next attempt into a one-shot diagnosis instead of a
third blind burn of PO TTL. No live ceremony attempted this pass.

**Two new backlog items filed this window, both still open:**
`backlog/items/2026-08-18-pipeline-author-repair-signature-mode-never-actually-admits-the-edit.md`
(above) and
`backlog/items/2026-08-18-windows-posix-mode-bit-checks-are-meaningless-on-ntfs.md`
(a PO-relayed Windows/NTFS bug family — `fs.lstatSync(path).mode` is
synthesized from the read-only attribute alone on native Windows, so any
exact-equality POSIX mode check fails closed unconditionally; confirmed
reproduced against a real Windows session vendoring this same
`plugins/pipeline-core` source, two hit locations independently
spot-checked against this repo's current source before filing).

**Durable-documentation items landed this window:** CLAUDE.md's new Hard
Rule against tree mutation while a HEAD/tree-bound PO command is
outstanding; `plugins/pipeline-core/skills/pipeline-start/references/
workflow-dispatch.md` (Elephant-only Workflow/Agent orchestration, the
worktree self-heal briefing text, the ~50-tool-call budget requirement).

**Open, PO-requested, not yet written:** a durable CLAUDE.md/operating-model
rule that forks/general-purpose dispatches must be explicitly told never
to invoke Workflow/Agent unless the Elephant authorizes it (see the fork
incident in the entry above this one).


## 2026-08-18 (OT09 fixed, C2f fully merged, the HGO admission "bug" resolved as a process gap, not a code defect)

**The `consumeHumanGuardOverride` admission mystery is SOLVED — it was
never a code defect.** Root cause, confirmed empirically (not just
theorized): the consumption match is keyed on `toolInputSha256 =
sha(canonical(toolInput))`, computed from the RAW tool_input payload of
the retried Edit call. A live retry that is not byte-identical to the
exact call that seeded the plan — a re-derived `old_string`/`new_string`,
a different absolute-path spelling, an optional field present in one
call and not the other — silently fails the match and falls through to
an unarmed-looking denial, with nothing anywhere surfacing which field
diverged. Proven directly: a safe dry-run retry of the OT09 edit (denied,
no mutation) recorded a DIFFERENT `toolInputSha256` than the original
expired capability's stored value. Fix (process, not code): attempt the
intended edit once first (safe — PreToolUse blocks pre-execution), let
that seed a fresh request carrying the exact retry's own hash, run
`plan`/`prepare-authorization`/`emit-signature-digest` from THAT
request, and after the PO signs, retry with the IDENTICAL tool call used
to seed the request. Codified as a new CLAUDE.md Hard Rule (commit
`18dc9ab9`). The two backlog items describing this as a suspected code
defect
(`2026-08-18-pipeline-author-repair-signature-mode-never-actually-admits-the-edit.md`)
should be re-triaged against this finding next session — the
`describeHumanGuardOverrideSelection()` `authorSourceRoot: null` display
bug it also names is real and separate, still open.

**OT09 fixed and committed (`467a92bc`).** The literal `gates?.push_approval`
substring OT09 asserted against was removed by the
PHX-WP-PAC08-RECONCILE-APPROVAL generalization (table-driven
`value?.gates?.[key]` lookup); updated the assertion to
`push: "push_approval"` (the `GATE_APPROVAL_MODE_KEYS` table entry,
which does survive the generalization). Landed via a signed
`pipeline-author-repair` HGO ceremony end to end, using the
byte-identity-preflight process above. `guard-testpath-override.test.mjs`:
19/19 green.

**C2f fully merged (`72a293d5`, `a207eacb`).** The `requireAcknowledgement`
gating fix (`d723d88b`, already committed in the worktree) plus the
one remaining piece — `harness/scripts/pipeline-state.test.mjs`'s
`seedSubprocessPoGateAuthority` fixture needed the
`PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER` on its own line, and the import
that name needs — both landed via two small, non-adjacent HGO ceremonies
(one per Edit call, since a single Edit cannot span two non-contiguous
regions) using the same byte-identity-preflight process. Both suites
verified clean on the integrated branch: `po-gate-authority.test.mjs`
61/61, `pipeline-state.test.mjs` 314/314.

**New backlog item filed:** `2026-08-18-handover-rotation-extraction-acknowledgment-is-repo-wide-not-section-scoped.md`
— `handover-rotate.mjs`'s `--acknowledge-extraction-done` marker is a
repo-wide, one-time boolean, not scoped to which sections were actually
reviewed; PO flagged this as a real design defect while planning an
incremental oldest-sections-first extraction pass (ADR-0066 Decision 6).
Not fixed this session — interim mitigation is a CLAUDE.md process rule
(same commit `18dc9ab9`) never to treat the marker's existence as
blanket permission for an unreviewed later batch.

**Still open, not started this window:** the incremental extraction-pass
fork (oldest ~2026-07-30 through ~2026-08-12 sections of this very file,
cross-referenced against ADRs/guardrails/CLAUDE.md) was proposed and
PO-approved but never actually dispatched — deprioritized in favor of
finishing OT09/C2f first, per explicit PO sequencing instruction. The
large Workflow-based batch for the ~45 backlog items already decided+
scoped in their own Triage sections but not yet implemented/dispatched
(from the 2026-08-18 full-backlog completeness sweep, entries above) is
the next planned step after that, also not yet started. Current branch
is `feat/sprint-nova-codex-v046` — **not** `main`; nothing in this whole
session's window has touched the actual `main` branch, which still
requires its own separate push/release ceremony
(`docs/push-release-flow.md`) once a candidate is ready. `git worktree
list` still shows `wf_7f39bfec-21b-3` — safe to remove now that C2f is
fully merged.


## 2026-08-18 (Toolbox/Phoenix blockers, HGO ceremony-scope PO feedback, fresh 0.6.0 candidate)

**Toolbox and Phoenix blockers both confirmed included before this
candidate.** Per explicit PO sequencing: finish this wave's backlog
work, status overview, then a local candidate — gated on the two
morning handover blockers being in.

- **Toolbox** (`2026-08-18-windows-posix-mode-bit-checks-are-meaningless-on-ntfs.md`):
  `NVA-WINMODE-1` (`goldfish-deep`, resumed twice after truncation —
  same tool-budget truncation pattern as before, recovered procedurally
  each time per the established resume protocol) fixed all 7 files in
  scope with the shared DACL-based `assessWindowsPrivatePath` pattern
  (mirroring `lib/afk-ledger.mjs:336-340`), one commit per file
  (`b1e28a70`, `22f321c0`, `00053e64`, `24f71290`, `45bfe87e`,
  `7d6cb1a9`, `a285912f`), mocked-Windows + POSIX regression tests per
  file, `check-consumer-safe-paths.test.mjs` clean. `status:` correctly
  left `open` — Linux/WSL session, closure needs a live-Windows
  reverify (same convention as the 2026-08-17 Windows ACL item).
- **Phoenix** (`2026-08-18-critical-human-proof-policy-lacks-the-reconcile-approval-generalization.md`):
  already closed earlier this session, confirmed still closed.

**Backlog item `authority-gate-bypassable-by-choosing-a-different-write-tool`
closed for real.** The GL-09 classifier-fault fail-closed fix
(`9e477150`, from the earlier full-Verify-regression block) turned out
to be the residual gap in exactly this item's own GUARD-TESTPATH-SHELL
mechanism — confirmed by reading the code comment at
`guard-lifecycle-ready.mjs:812`, which cites this backlog item by name
as the mechanism's origin. Critic-reviewed on the properly-scoped range
`9fab42cf..a6f1bcbf` (parent of `9e477150`, so the fix commit is
actually inside the diff — two prior attempts used the wrong range or a
malformed dispatch and never produced a real review): **PASS**, no
findings, all evidence-claimed suite counts independently rerun and
matched. Sibling item `a-permitted-edit-drops-the-session-into-an-
unrecoverable-readiness-class.md` was named to the same dispatch as
context only and stays open — the Critic itself flagged that this diff
touches none of its own, separately unimplemented scope.

**Two TP-3 human-guard-override ceremonies registered the two new
Windows-fix test suites in `verify.mjs`** (`93911e70`
`session-cleanup-owner-nonce-tests`, `51d483a7` `worktree-create-tests`)
— both required the full signature-mode ceremony (`plan` agent-run;
`prepare-authorization`/`emit-signature-digest`/`sign-intent`/
`authorize-by-signature` PO-run, per ADR-0059 defense-in-depth). Each
Edit is single-use/`toolInputSha256`-bound, so two separate,
non-adjacent registrations needed two full ceremonies.

**PO design feedback, filed as its own backlog item, NOT implemented
this session:** the PO explicitly disagrees with requiring three of the
four ceremony steps to run "outside this session" — only `sign-intent`
genuinely needs the external key; the rest is digest computation the
agent could do itself without weakening the protection boundary. Filed
as `2026-08-18-hgo-signature-ceremony-requires-more-human-steps-than-the-key-actually-needs.md`
(deferred, "bei Gelegenheit" — needs its own security-focused design
pass and Critic review, not an ad hoc edit).

**Incidental fix:** `docs/product-capability-inventory.json` (the
`deterministic-verification` capability's surface list) was out of sync
with the two newly-registered `verify.mjs` suites, failing
`product-capability-inventory-tests` — not TP-protected, fixed directly
(`96cf8059`).

**Fresh local `0.6.0` candidate stamped: `56d9f568`** (manifest
`+{claude,codex}.20260818162535.96cf805`). Full clean Verify: 270/271
green, exact binding, only the known `human-guard-override-tests`
exception remains (external marketplace mirror staleness — this
session cannot write `~/agent-pipeline-local-marketplace/`,
`GUARD-CROSS-REPO-MUTATION`; needs PO or an authorized external sync to
actually reach Toolbox/Phoenix). `security-scan.mjs`: CLEAN. Local test
candidate, not a release — no push approval prepared or recorded.

**Next planned step, PO-directed:** immediately after this candidate,
proceed to the remaining open (84 after this window's closures) +
in_progress (9) backlog items using a `Workflow`-tool fan-out with
maximum sensible parallelization — PO explicitly asked for small related
items to be grouped into slices per agent rather than one-agent-per-item,
~16-concurrent hard cap noted to the PO. Not yet started as of this
entry. The still-standing large full-backlog completeness-sweep fan-out
(from the 2026-08-18 sweep entries earlier in this file) and the
incremental handover-rotation extraction pass are the same still-pending
work this refers to — not two separate backlogs.


## Recovery

Nothing is in flight as of this entry. The `56d9f568` local candidate is
committed and stable on `feat/sprint-nova-codex-v046`. No rollback
action or public human-gate acceptance is recorded. Use ordinary revert
commits after publication; do not rewrite shared history. If the
checkout shows conflicting work, stop and report it before writing.
