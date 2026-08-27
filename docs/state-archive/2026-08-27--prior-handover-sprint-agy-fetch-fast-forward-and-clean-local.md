# Handover archive -- Prior handover — sprint_agy fetch, fast-forward, and clean local candidate (2026-08-26)

> Rotated from `docs/state.md` on 2026-08-27 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Prior handover — sprint_agy fetch, fast-forward, and clean local candidate (2026-08-26).
> Summary: sprint_agy fetch, fast-forward, and the 2026-08-26 clean local candidate
> Append-only once written; never edited by hand.
> Content below is verbatim except that relative markdown link target(s) were rewritten to keep resolving correctly at this file's directory depth (link text and all other content are untouched).

## Prior handover — sprint_agy fetch, fast-forward, and clean local candidate (2026-08-26)

**READ THIS FIRST — 2026-08-26 session.** PO instruction: fetch the newest
Nova state from `origin` branch `sprint_agy` (same remote,
`agent-pipe-shared/agent-pipeline` — already registered as both `origin`
and `upstream`; not a separate/third-party remote) into this checkout and
build a clean local candidate. `git merge-base feat/sprint-nova-codex-v046
origin/sprint_agy` equaled this branch's exact prior tip (`0d5a6e6b`), so
`origin/sprint_agy` was a strict fast-forward descendant, not a divergent
branch — no merge conflicts, nothing to reconcile by hand. Fast-forwarded
cleanly (`git merge --ff-only`), 271 commits, bringing in the full
tri-runner Antigravity/Agy integration (ADR-0067, `specs/sprint-agy-runner/`,
`plugins/pipeline-core/hooks/antigravity-*`, `install-agy.mjs`,
`pipeline.user.yaml` schema bump) plus the 2026-08-19→2026-08-26 backlog
history already summarized in the prior handover section below.

**Local plugin refresh was required before bootstrap would go ready again**
(`docs/claude-local-plugin-development.md`'s documented, deliberately
operator-only step): the fetch bumped `plugins/pipeline-core`'s schema/
manifest past what the session's enforcing local-marketplace copy
(`~/agent-pipeline-local-marketplace`, stale since the 2026-08-19 stamp)
recognized (`pipeline.user.yaml is not a valid V3 source`,
`project-onboarding-v3.mjs plan-source-recovery` returned `unrepairable`
with no agent-executable `nextAction`). The PO ran the prescribed
`cp -a .../plugins/pipeline-core ~/agent-pipeline-local-marketplace/plugins/`
+ `claude plugin update pipeline-core@agent-pipeline-local --scope user`
+ `/reload-plugins` themselves (this is intentionally not agent-executable —
GUARD-CROSS-REPO-MUTATION refuses a session writing into its own enforcing
plugin root); bootstrap was green again immediately after.

**First full Verify on the fetched tip found one genuine, pre-existing gap
— not a merge artifact, not a new regression.** `origin/sprint_agy`'s own
tip carried two 2026-08-26 `docs(backlog): record ...` filing commits
(`2b68ec79`, `1ebec15f`, for
`existing-repos-drift-on-agy-pipeline-user-yaml-update-no-migration` and
`push-approval-record-always-trails-the-signed-commit`) with no
`chore(backlog): reconcile ledger` follow-up — the pattern every other
filing commit in that branch's own history paired one-for-one. Confirmed
via `reconcile-backlog-ledger.mjs` (plan mode: "Would record 2
transition(s)"), fixed via the sanctioned writer (`--activate`), committed
separately (`75de5950`, `chore(backlog): reconcile ledger for the two
2026-08-26 filing commits`). Note for whoever next fetches from
`sprint_agy`: if this branch continues, watch for the same
filing-without-reconciliation gap at its new tip.

**Candidate stamped and independently reverified clean twice.** Both
runner manifests bumped to `0.6.0+{claude,codex}.20260826182242.75de595`
(commit `3268fcd8`) — the Antigravity manifest
(`plugins/pipeline-core/plugin.json`, `0.6.0+20260825.bbee2df4`) was left
as-is: the documented local-candidate stamp convention
(`docs/claude-local-plugin-development.md`) only names the Claude/Codex
manifests, and Verify already passed clean without touching it. **Full
Verify: 385/385 suites, exit 0, twice** (once directly after the ledger
fix, once again after the manifest stamp) — no known/accepted exceptions
outstanding this time (the prior `human-guard-override-tests`
marketplace-mirror exception from the 2026-08-19 handover did not recur).
Confirmed genuinely parallel: the bounded async worker pool
(`AGY-VERIFYTUNER-1/2`, default concurrency 8) ran the 385-suite set in
~2m17s, with multiple suites' `startedAt` timestamps within ~500ms of each
other before any had completed.

**Not yet done at that point:** push, push-approval ceremony, Critic review
of the fetched range. See the release-readiness block immediately below —
superseded by it, kept here for the exact 385/385 evidence trail.

### Release-readiness follow-up (same 2026-08-26 session, continued)

**PO correction: 0.6.0 is a combined Nova+Phoenix release number, not a
Nova-only one** — Phoenix ([ADR-0043](../adr/0043-post-go-live-sprint-model.md),
evidence/governance/decisions/audit-export/traceability) runs alongside
Nova per the PO's 2026-08-17 sprint order and was intended to land together
under 0.6.0. Do not release this candidate as "0.6.0" alone without
resolving that with the PO first; do not use "0.5.7" either (not a real
target — `VERSION` and every stamp already say 0.6.0). Undecided as of this
writing: intake Phoenix now and release combined, or release Nova alone
under a different number. **Nova B is confirmed NOT a blocker either way**
— `specs/sprint-nova-epic/plans/nova-b.md` slice B3-A scoped Nova B's own
Agy touchpoint as a deliberate non-functional stub only, explicitly
deferring the real Agy work to "#69's later dedicated AGY sprint" — which
is exactly the `sprint-agy-runner` work just fetched. Nova B and Agy are
independently scoped and independently releasable.

**PO instruction: before deciding release timing, re-triage TODAY (not at
their 2026-08-30 due dates) the 3 open Antigravity QG-06 residual-risk
items, then run Critic + re-Critic.** Disposition:

- `antigravity-hard-enforcement-layer-has-two-fail-open-paths` — point 1
  (swallowed-error write) was already fixed (`3ae43380`, pre-existing).
  Point 2 (daemon can't resolve `node` on `$PATH` → hook never fires, no
  in-repo fix possible) got a NEW observability mitigation: dispatched
  `AGY-HARDENFORCE-DETECT-1` (goldfish-deep, non-isolated/shared-tree —
  truncated once at the 50-turn cliff mid-task with real uncommitted work
  in the tree, resumed via a purely-procedural SendMessage per
  `workflow-dispatch.md`'s recovery pattern, then committed
  `ab347a74` "feat(preflight): detect whether the Antigravity
  hard-enforcement hook fired this session"). **Not yet independently
  re-verified by the Elephant** (DoD/Verify/final report from the resumed
  leg still outstanding as of this note) — do not treat as landed until
  that lands and is checked.
- `antigravity-plugin-registration-points-one-level-above-the-plugin-root`
  and `antigravity-sandbox-containment-push-escape-route-unclosed` — both
  CLOSED directly by the Elephant (no code work possible/warranted: item 2's
  fix was already applied and semantically correct per the installer,
  remaining acceptance criterion needs a live Antigravity runner no session
  here has; item 3's real fix needs its own properly-scoped security design,
  not an ad hoc dispatch, and the risk is already fully disclosed in
  `specs/sprint-agy-runner/spec.md` sec.8.2/sec.9 row 8). Commits:
  `2b6680ed` (closure narrative), `3009e13f` (closure metadata),
  `f7bc54c4` (ledger reconciliation).

**A 4th, separate item surfaced by the PO mid-session and judged more
release-relevant than the original 3** (affects every existing
already-onboarded consumer repo, not just Antigravity adopters):
`existing-repos-drift-on-agy-pipeline-user-yaml-update-no-migration`
(filed 2026-08-26, explicitly "undesigned" — no confirmed repro). The
Elephant's own quick check found the JSON-schema diff itself
backward-compatible (enum widening only: `runners.enabled`/`default` gained
`antigravity`, `critic_export.rules[].provider` gained `google`; no new
`required` fields) and `runtime.targetsSha256` unchanged before/after the
fetch — pointing toward "no actual break at the schema layer" but NOT yet
proof, since the item names two other candidate mechanisms
(chat-gate-ceremony standardization; per-repo push-approval-mode
confirmation pre-filled from the machine default) not yet checked. PO
instruction: scope AND fix in parallel with the above. Dispatched
`AGY-CALIBRATION-MIGRATION-1` (goldfish-deep, **worktree-isolated** —
correctly required since `AGY-HARDENFORCE-DETECT-1` above was actively
committing in the shared main tree at dispatch time;
`.claude/worktrees/agent-<id>` landed on the expected stale
`0d5a6e6b` base per the known worktree-provisioning trap, briefing carried
the mandatory self-heal instruction to `f7bc54c4c5415f894c900b8240084feb8e797e6a`).
Briefed to reach one of two honest outcomes: (A) a real break exists →
build a scoped detection+migration path, or (B) no break reproduces →
land a backward-compatibility-pinning regression test and write up the
evidence, not to force a migration mechanism for an unconfirmed problem.
**Result not yet known as of this note — dispatch was in progress.**

**Also filed this session, needs a real home:**
`sendmessage-mid-task-scope-relay-rule-has-no-durable-home` — a durable
operational rule (found during the ADR-0066 extraction pass that rotated
the 2026-08-25 handover section below) that has no home in
`docs/operating-model.md` or `workflow-dispatch.md` yet: a PO decision that
widens a running dispatch's scope must not be relayed via `SendMessage` —
build a fresh, properly-scoped briefing instead.

**Next steps once both dispatches land (not done yet):** (1) Elephant
independently re-verifies each dispatch's DoD/Verify claims directly
(never trust the returned report alone — check `git log`/`git status`/run
the suites), per `workflow-dispatch.md`'s "never trust a returned result"
rule. (2) Reconcile `AGY-HARDENFORCE-DETECT-1`'s and (if it closes
anything) `AGY-CALIBRATION-MIGRATION-1`'s backlog-item Triage/closure
directly (Elephant work, not delegated). (3) Run one more full
`node harness/scripts/verify.mjs` on the combined result. (4) Dispatch an
independent Critic review over the full accumulated range since
`0d5a6e6b` (271 fetched commits + every commit this session made:
ledger fixes, manifest stamp, the two closures, the handover rotation, and
whatever these two dispatches land) — capped at 2 Critic rounds per this
repo's own working practice; self-verify a 3rd-round rework instead of a
3rd Critic dispatch. (5) Only then return to the PO with a release
recommendation, including the still-open Nova+Phoenix version-number
question above.

