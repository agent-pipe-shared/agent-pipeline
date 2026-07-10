# Checklist — Small Session ("retest/correction ≤45 min" playbook)

> Agent-Pipeline v0.1.0-draft · Compact operative reference for the Elephant; why + verification live in
> `docs/operating-model.md` §3.3 (rigor/light-dispatch profile) and §4.2 (Critic trigger matrix).
> Companion: `plugins/pipeline-core/skills/close-block/SKILL.md` close-light variant (the closing half
> of this playbook). This file names the PLAYBOOK for the whole small block, close-light names the
> CLOSE mechanics only — read both, they cross-reference rather than duplicate. Second companion: the
> `speed` session-start profile (`harness/session-bootstrap.md` §6.5) is the bootstrapping analog for a
> session that already knows at START it is a mini-feature/hotfix — this playbook covers the
> same-day/mid-session case instead; the two overlap in spirit (light process, hard scope limits,
> close-light at the end) but are entered from different points in the session lifecycle.

## When this playbook applies

A same-day, narrowly-scoped correction or follow-up test — the class this playbook targets is exactly
the "small retest session that took 2h and should not have" pattern.
**Wall-clock target: ≤45 minutes**, bootstrap to close. This is a target to steer toward, not a hard
stop-the-clock rule — but a session drifting well past it is itself the escalation signal (see below).

**Not this playbook:** anything that is genuinely a new feature, touches more than one topic, or turns
out to need real interview/decomposition work — that is a normal session from the start, not a
"small session gone big."

## The flow (four steps)

1. **Same-day light bootstrap.** If this is a same-day continuation of a session already bootstrapped
   today (same repo HEAD lineage, same machine), the full bootstrap protocol
   (`harness/session-bootstrap.md`) may be run in its short form — do not re-derive facts already
   confirmed hours earlier in the SAME calendar day (ruleset SHA, project calibration, role/model
   defaults). A machine change or a new calendar day always forces the FULL bootstrap check
   (`harness/session-bootstrap.md` §6.4 short-bootstrap exclusions) — never skip on that basis.
2. **ONE bundled dispatch.** Either:
   - a single **light-profile** Goldfish dispatch (`docs/operating-model.md` §3.3) — briefed
     stage-0/mechanic-shaped correction, compact 3-field report, referenced rule sets inlined, no
     baseline verify, effort per the MP-27 3-tier matrix (`goldfish-mechanic` `low` for
     mechanical/uniform tasks, `goldfish-implementor` `medium` for clearly-briefed
     implementation) — or
   - the **stage-0 fast path** (`docs/operating-model.md` §3.3 stage-0-smallfix-definition) when the
     fix qualifies outright (≤2 files, ≤~25 diff lines, no architecture/schema/API/test/guardrail
     touch, trivially `git revert`-able, no risk flag).
   Do NOT fan out multiple small dispatches for a task this size — one bundled dispatch is the whole
   point of the playbook; splitting it defeats the wall-clock target.
3. **The Critic-trigger matrix decides Critic need — do not default to a full Critic.** Apply
   `docs/operating-model.md` §4.2 as-is: a mechanical/deterministic diff is **auto-pass** (no Critic);
   otherwise the matrix's own cascade rule decides between no-Critic, a non-blocking parallel Critic, or
   a blocking review-tier Critic escalating to a higher-capability model only on the matrix's own trigger conditions (major
   finding / architecture-guardrail-security touch / contested verdict). This playbook adds NO new
   Critic rule — it is a reminder to actually apply the existing matrix instead of reaching for the
   heaviest Critic option by habit on a small task.
4. **Verify → push → close light.** Run the calibration's `verify` command against the final state
   (evidence bar unchanged — machine-written output + command + exit code). Push per the project's
   push policy. Close via the close-block skill's **close-light variant**
   (`plugins/pipeline-core/skills/close-block/SKILL.md`) — check its own hard eligibility gate
   explicitly; this playbook does not override that gate, it is the expected common case that satisfies
   it (≤1 package, no guardrail/canon diff, <~1h, no open major Critic finding).

## What is deliberately SKIPPED vs. a full session

- No fresh spec-readiness check re-run for a same-day continuation of an already-readied spec.
- No multi-goldfish parallel wave — one bundled dispatch by design (step 2).
- No formal drift-check bundle (CLAUDE.md length re-measure, memory-mirror pass, stale-worktree
  enumeration) beyond a spot-check — close-light's own skip list applies.
- No separate HISTORY entry and no full retro backlog item — folded into close-light's
  one-paragraph handover update (rigor-0 bundling, `docs/operating-model.md` §3.3).
- No `/context`/session-cut recommendation — a ≤45 min session is not near a cut boundary by
  construction.

**What is NEVER skipped, regardless of session size:** `verify` + machine evidence, the
close-light authorship check (6b-equivalent), the telemetry line, and Critic disposition of any
finding the Critic-trigger matrix actually produces — the playbook trims ceremony, never the deterministic gates
or an open finding.

## Escalation rule — scope grows, abort the playbook

The moment ANY of the following becomes true mid-session, **stop treating this as a small session**:
more than one topic/complex decision surfaces, the fix needs more than the one bundled dispatch, a
guardrail/canon file needs touching, a Critic finding comes back major, or the wall-clock target is
being missed by a wide margin with no end in sight. In that case: **abort this playbook and run the
full session ritual** (`harness/checklists/session-close.md` / close-block's full ritual, normal
Spec-Readiness/Critic-Kaskade per rigor level) — do not keep applying small-session shortcuts to a
session that has outgrown them. Naming the abort explicitly (in the handover / close report) is part of
the honest-reporting duty, not an optional courtesy.
