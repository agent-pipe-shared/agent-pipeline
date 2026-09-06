> **Persisted 2026-09-06** from the read-only positioning session's scratch
> output `scratch/handover-to-nova-b-2026-09-06.md`, verbatim apart from this header and
> the cross-reference paths noted below. Design input for the 0.6.2
> documentation block (D.1–D.6 in the handover file), not canon: nothing in
> it is a decision until an ADR, a guardrail, or `docs/state.md` says so.
> Status tags inside it (LIVE / CLI / CONTRACT / BUILT-NOT-WIRED / ROADMAP)
> are load-bearing and must not be rounded up.

# Handover to the Nova B session — 2026-09-06 (from the read-only positioning session)

Inputs, not canon. Everything below was produced read-only; nothing outside `scratch/` was
touched, `git status` was clean throughout. The Kanalprobe hook was removed from
`~/.claude/settings.json` again (`node scratch/kanalprobe-hook.mjs remove`).

## PO decisions to honour (2026-09-06, chat)

1. **One product.** No split, no license change. SUL-1.0 stays.
2. **Target audience:** teams with audit obligations, and users who want *measurable* rails.
   Docs, README and positioning align to that audience.
3. **The Reddit post ships with 0.6.2**, not 0.6.1; the audience is stated early in the post.
4. Efficiency topics go into the **0.6.2 local candidate** together with the parallel-workflow
   (slicing) topic and the verify optimisation.

## Where things are

| File | What it is | Use it for |
|---|---|---|
| `specs/sprint-nova-epic/design/2026-09-06-positioning-and-doc-gaps.md` | Positioning decision, market context, **measured doc-gap audit** (§3), front-door structure (§4), **12 dispatch-sized work items (§5)**, what "measurable rails" must publish (§6) | The doc/positioning work for 0.6.2 |
| `specs/sprint-nova-epic/design/2026-09-06-positioning-usp-catalog.md` | Verified feature catalog with status column (LIVE / CLI / CONTRACT / BUILT-NOT-WIRED / ROADMAP), source paths | Capability inventory extension; new doc pages; never claim a BUILT-NOT-WIRED item as live |
| `specs/sprint-nova-epic/design/2026-09-06-positioning-reddit-post-prep.md` | The post draft (TL;DR, audience paragraph, origin story, two USPs, cost block, 10-minute test), pre-post fix list (§1), latest greenfield data (§3), swap blocks, source map | Everything marked `[KORRIGIERE MICH]` needs the PO; the fix list is doc-drift work for 0.6.2 |
| `specs/sprint-nova-epic/design/2026-09-06-positioning-kanalprobe-result.md` | PreToolUse `additionalContext` reaches the model — confirmed live and statically | Precondition for `guard-slicing` increment 1; cite it in the slicing ADR addendum |

## Order for the 0.6.2 local candidate (PO, 2026-09-06: "rest erst danach")

**First — A, B, C below. Then — D (the doc/positioning block).** Nothing in D blocks A–C.

### A. Parallelisation (slicing)

`guard-slicing.mjs` is built, 33 tests green by hand, registered nowhere. Order from
`backlog/evidence/2026-09-06-po-decision-queue.md`:

1. **Payload capture** (queue #3): why does `guard-dispatch-budget` never fire? Temporary hook in
   `~/.claude/settings.json` + restart — the same cheap route as the channel probe. Do this
   before wiring anything else, or the candidate ships a second registered, tested, inert guard.
2. **TP-3 signature** (queue #1): two lines in `harness/scripts/verify.mjs` after
   `guard-dispatch-tests` register `guard-slicing.test.mjs`; the gate goes 514/515 → green.
   Seed the ceremony only when the PO can sign immediately; the one seeded 2026-09-06 lapsed.
3. **`hooks.json` wiring** (queue #2): attended operator run; `NEVER_LIFTABLE_KERNEL_PATHS`, no
   in-session route. **Fold into one shared TP-4 ceremony** with the other pending `hooks.json`
   edits (see C.2) — three ceremonies for one file is the waste the repo already named.
4. Add the channel result (`specs/sprint-nova-epic/design/2026-09-06-positioning-kanalprobe-result.md`) to
   `docs/adr/draft-parallel-dispatch-slicing-enforcement.md` and promote the draft.

### B. Verify optimisation

- **Landed, in the candidate already:** lane eviction `f16ab254`, 645.7 s → 482.5 s (−25%),
  same single red before/after (`backlog/evidence/2026-09-06-lane-eviction-measured-result.md`).
- **Honest ceiling for more** (`2026-09-06-verify-lane-achievable-win.md`, and the decision
  queue's own "not on this list" note): the four-module thesis was refuted; the top-5 lane
  members (59% of wall clock) are process-global and not evictable. Remaining eligible: 12
  suites = 17.2% max, 8 clean = 8.8%. Take the clean eight as one bounded dispatch; do not
  promise more than that for 0.6.2.
- Keep `backlog/items/2026-09-01-verify-runtime-is-concentrated-in-ten-suites-…` open with the
  measured trend 419 → 571 → 646 → 482 s; `pre-gate.mjs` is the day-to-day answer.

### C. Finished — needs only a signature or an operator step

1. **Marketplace/plugin update + `/reload-plugins`** (decision queue #5, `docs/state.md` item 7):
   installed `guard-lifecycle-ready.mjs` and `guard-git.mjs` copies are confirmed stale, so
   today's read-scope and GG-22 fixes are not enforced for this checkout's own sessions. No
   signature; operator action; do it first.
2. **One shared TP-4 ceremony for every pending `hooks.json` edit** (`docs/state.md` item 4):
   worktree-isolation matcher gains the `Agent` tool name
   (`backlog/items/2026-09-02-the-worktree-isolation-hook-matcher-omits-the-agent-tool-name.md`),
   the resume-hint delivery hook
   (`2026-08-29-claude-code-has-no-mechanical-resume-hint-delivery-hook.md`), plus A.3 above.
   `guard-handover-size` is already in the source `hooks.json` (verified) — only the installed
   copy question (C.1) remains for it.
3. **TP-3: `guard-slicing-tests` registration** — A.2. The four suites
   `docs/pending-verify-registrations.md` still calls pending (`dispatch-authorship-verify-tests`,
   `push-prepare-tests`, `test-tmpdir-tests`, `test-tmpdir-budget-tests`) are **registered**
   (`verify.mjs` lines 670–689); that doc is stale — see D.1.
4. **ADR-0079 scope sentence** (`docs/state.md` item 2): does hook-bypass removal cover
   `git commit` and `git push`, or push only? One PO sentence; test file is TP-1.
5. **Release mechanics for 0.6.2 itself:** version stamp, `CHANGELOG.md` entry (and the missing
   0.5.2–0.5.4 / 0.4.0–0.4.2 entries or an explicit note), full verify green on the frozen
   candidate, security scan, Critic, push-approval signature, feature-branch push, **CI green
   before `main`** (0.6.1 went to `main` under a ruleset bypass with CI red — do not repeat),
   tag.

Already decided today, no action: GIT-03 attribution (#4), GitLab evidence deferred (#6),
B1/Codex probe approved-but-blocked by the runner classifier (#7), Codex Critic e2e run
approved-and-queued behind its own consumer (#8).

### D. After A–C: the doc/positioning block

The six items below, in this order.

1. **Doc-drift fixes** — positioning §5 item 1 / post-prep §1 (ten items: 0.6.0 banners in five
   files, `release-state.json`, `runtime-boundary.md` guard table, `SETUP.md` Codex
   SessionStart sentence, capability inventory `handover-hard-size-gate: planned` → shipped,
   CHANGELOG gaps, one German maintainer doc, **`docs/pending-verify-registrations.md` banner
   → "none pending" now that all four are registered**). Mechanical; `goldfish-mechanic`.
2. **Capability inventory** — add the ~30 shipped-but-undeclared capabilities to
   `docs/product-capability-inventory.json` (positioning §3.3), then clear
   `criticReview.status` through a real Critic round. Do this **before** the doc pages; it makes
   the doc obligations checkable.
3. **Front door for the chosen audience** — positioning §4: README outline ("who it's for / what
   gets refused / what gets recorded / what it costs, measured / what it does not claim"),
   `docs/README.md` regroup, four new pages. `docs/enforcement.md` must be **generated** from
   `hooks.json` in the `generate-agent-obligations.mjs` pattern — a hand-written guard list
   drifts. README is canon → T1 Critic.
4. **Parallel workflow (slicing)** — `guard-slicing.mjs` is built and tested (33 tests), not
   wired. Order per `backlog/evidence/2026-09-06-po-decision-queue.md`: (3) payload capture for
   `guard-dispatch-budget` first — it is registered and never fired; (1) TP-3 signature to
   register `guard-slicing.test.mjs` in `verify.mjs` (gate goes 514/515 → green); (2)
   `hooks.json` wiring via attended operator run. The channel question is answered — see the
   Kanalprobe file; add its result to `docs/adr/draft-parallel-dispatch-slicing-enforcement.md`.
5. **Verify optimisation** — lane eviction landed (645.7 s → 482.5 s, `f16ab254`,
   `backlog/evidence/2026-09-06-lane-eviction-measured-result.md`). Next lever: the top-5 lane
   members are 59% of wall clock and not evictable on caller scoping
   (`2026-09-06-verify-lane-achievable-win.md`); the regression item
   `backlog/items/2026-09-01-verify-runtime-is-concentrated-in-ten-suites-not-spread-across-many.md`
   stays open. Record the wall-clock trend (419 → 571 → 646 → 482 s) in the new
   `docs/cost-and-measurement.md`.
6. **Metering** — start
   `backlog/items/2026-08-29-three-runners-showed-wide-pipeline-administration-overhead-variance.md`
   (administration-vs-product share from tool-use/token counts, two runners). "Measurable
   rails" is not credible while the one adoption-deciding number is a self-estimate.

## Constraints

- English-canonical docs (ADR-0011); the German reference stays below the marker;
  `check-language-canon` must stay green.
- `hooks.json` (TP-4) and `verify.mjs` (TP-3) need PO signatures — seed a ceremony only when the
  PO can sign immediately.
- Status honesty: catalog status tags are load-bearing. Nothing BUILT-NOT-WIRED or CONTRACT is
  documented as enforcement.
- The post's `[KORRIGIERE MICH]` markers (SUL rationale, latest greenfield numbers, CI state on
  the 0.6.2 commit, outside-tester count) are PO inputs, not dispatch work.
