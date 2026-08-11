# Medium/Low LOOSE backlog (41 items): thematic grouping and disposition

Source population: `2026-08-11-backlog-88-sprint-mapping-and-priority.md`'s 41
Medium/Low LOOSE items (27 Medium + 14 Low), the remainder after the 27 High
items were fully dispositioned (18 decided across 13 clusters, 5 completed,
4 in active fix-rounds).

Disposition: 18 items are low-hanging fruit with no open design question —
queued directly as implementation Tasks #47–66 (see the session task list;
not duplicated here). The remaining 23 need an actual PO decision, because
each is either unclear whether it is worth doing or carries a real design
question. Each entry below states Impact, the Options grounded in that
item's own Proposal/Direction text (never invented), and the Elephant's
Recommendation.

## Onboarding/Runner (1–4)

### 1. `2026-08-05-claude-has-no-start-time-opt-in-adoption-path.md`

**Impact:** Claude Code has no bootstrap adoption path in a fresh, un-piped
repository the way Codex's `project-onboarding-v3.mjs` does; a Claude
operator does the marketplace registration and plugin install by hand —
exactly the manual sequence that produced the `setup.mjs` marketplace-name
collision defect.

**Options (item's own text):**
- A. Hint text only, pointing at the existing manual procedure doc.
- B. A full V4-onboarding-parity flow matching Codex's.

**Recommendation:** B, but scoped as its own PRD/Spec, not a same-session
call — the item itself states this is feature work. ADR-0051's dual-runner
parity requirement makes hint-only a stopgap that reproduces the underlying
runner-asymmetry gap this session already spent effort tracking (see #3
below). Ask: authorize a kickoff for it, at PO's convenience.

### 2. `2026-08-10-git-identity-ask-step-unreachable-through-live-cli-path.md`

**Impact:** GF-103's merged fix (a real `collect-input` ask-step for a
missing git identity) is dead code on the actual live onboarding path —
`applyLifecycle()`'s `operation === "portable"` branch discards its return
value and re-inspects fresh. The original PO-reported bug (missing identity
discovered only when the first commit fails) is therefore **not yet fixed
end to end**, despite looking closed.

**Options (item's own text):** Only one credible direction is named: thread
an additive `nextAction` through `v4Inspection()`/`readyLifecycleResult()`
to the real portable-seed-apply CLI caller, without breaking existing
status-transition tests (GF-103's own recommendation, explicitly flagged as
"wide blast radius").

**Recommendation:** Accept — already due-dated 2026-08-17 in this item's own
Triage. No PO design call actually needed beyond confirming priority;
recommend dispatching to `goldfish-deep` (design latitude, guard-adjacent
state machine) now.

### 3. `2026-08-08-runner-neutrality-must-hold-before-a-third-runner-lands.md`

**Impact:** Process/tracking item, not a code defect. Six separate
runner-parity defects were found one at a time over four days ("die 4.
Runde Fixes damit Claude geht" — PO's own words) on a codebase that already
declares dual-runner support a hard requirement. A third runner (AGY) would
rediscover the same class at full cost unless the precondition — that
runner identity is provably carried end to end — is made true first.

**Options (item's own 5 directions):**
1. Make the class measurable: enumerate every place a runner identity
   enters, is stored, defaulted or dropped.
2. Make the `runner = "codex"` silent default explicit and loud (or decide
   it shouldn't exist except at the outermost entry point).
3. Adopt a third-runner readiness criterion before AGY work starts.
4. Decide where AGY itself is tracked (today: three prose locations only).
5. Explicitly do not start AGY adapter work from this item.

**Recommendation:** Accept 1–4 as prep work, not urgent (AGY isn't
imminent) — queue as a future-sprint item. Decide now only point 4: this
item becomes AGY's tracking home, closing the "lives in three prose places"
gap cheaply and immediately.

### 4. `2026-08-08-two-manifest-literals-still-bypass-the-single-seed-owner.md`

**Impact:** Minor, latent. A second manifest-seeding path (the
host-managed-Codex fresh-project branch in `runner-profile-migration-v3.mjs`)
has never been measured for the same divergence class that already produced
one real authority-binding defect (PO-profile receipt bound to the wrong
manifest tier). `readProjectAuthority` currently masks it by preferring the
neutral tier.

**Options (item's own text):** Measure the host-managed-Codex fresh-project
path first (byte-for-byte compare of both seed dictionaries) — the item
states the size of the problem is genuinely unknown before that.

**Recommendation:** Do the measurement now (cheap, bounded, no design
call) — queue as a task; decide fix scope only if it finds real drift.

## Bootstrap/Kickoff forensics (5–9)

### 5. `2026-08-08-two-cheap-costs-a-skill-invoked-without-arguments-and-a-thirteen-step-bootstrap.md` (D6 half — D5 already queued as Task #65)

**Impact:** 13 digest-bound steps run before the first line of code in a
fresh bootstrap (preflight → inspect → plan → apply-seed → plan-runtime →
init-runtime → kickoff plan → kickoff apply → promote plan → promote apply →
submit-plan → approve-plan → set-phase). Each step's digest-rebinding
property is what caught every drift immediately in both measured
transcripts — that part works. The total is simply a number nobody chose.

**Options (item's own text):**
- A. Deliberately count and rationale-document all 13 as load-bearing —
  possibly the correct answer, currently just an accident of accumulation.
- B. Measure and merge separable steps into fewer transactions, preserving
  the per-step drift-detection property.

**Recommendation:** A first — write the accounting down now, cheap. Defer B
until that accounting shows real merge candidates; don't redesign bootstrap
speculatively.

### 6. `2026-08-09-what-the-claude-greenfield-run-adds-to-the-happy-path-findings.md` (language-freeze finding)

**Impact:** `po-language: en` gets frozen before the PO's actual language
answer exists; the promoted PRD later carries `de`; `PO-GATE-PRD-LANGUAGE-MISMATCH`
only surfaces the disagreement several steps downstream, after both
documents are byte-bound. This is the "Effektivität durch Sprache verloren"
cost the PO already reported directly — not agent slowness, a chain
ordering problem.

**Options (item's own text, the library's own comment):** at the point of
mismatch, either change the configured language to match the document, or
change the document's marker to match config — both are downstream patches
on a symptom.

**Recommendation:** Fix upstream instead — locate which step in the
13-step chain (see #5) owns "ask/fix language" and move it before any
document is frozen with a language value. Tie this to #5's step accounting
so both get resolved together rather than patched twice.

### 7. `2026-08-09-codex-read-only-steps-escalate-individually-instead-of-once.md`

**Impact:** 98 individually-escalated read-only sandbox approvals in one
Codex session — pure token/friction cost, not a security gap; the
Pipeline's own guard hooks are unaffected either way.

**Options (item's own text):**
- A. Investigate whether a Codex CLI sandbox/approval-mode setting exists
  that safely covers read-only work without per-call escalation; document
  it in onboarding guidance if found.
- B. Conclude it is not Pipeline-side actionable at all, and say so
  explicitly rather than leaving it open indefinitely.

**Recommendation:** A as one bounded investigation pass (not a code
change); if nothing is found, close explicitly per B rather than let it
linger.

### 8. `2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md`

**Impact:** none new this session — the PO already deferred this
explicitly on 2026-08-10, pending a live retest of GF-078's `apply_patch`
resume-hint fix from the same evening.

**Recommendation:** No action — leave exactly as the PO already decided;
not a fresh ask.

### 9. `2026-08-10-compare-three-parallel-happy-path-tests-in-detail.md`

**Impact:** Forensic/comparison exercise only, no code risk either way. One
concrete lead already surfaced in passing: the no-Pipeline control run had
Claude install a Chromium CLI with zero consent step.

**Recommendation:** Leave at "later" — the PO already said "nicht mehr
heute" explicitly; not a fresh ask.

## Push/approval security (10–12)

### 10. `2026-08-08-a-maintenance-window-signature-is-voided-by-an-unrelated-file-write.md` — SECURITY-class

**Impact:** Real and gets worse the more the Pipeline's own recommended
parallel-dispatch model is used. A human's already-given, validly-signed
maintenance-window approval is silently voided by ANY unrelated plugin-tree
write between `prepare` and `install` — forcing the same human to repeat
the whole ceremony for a decision they already made. Same failure family as
the `GG-03` token issue already recorded in `docs/state.md`.

**Options (item's own text, in the order the item says they matter):**
1. Demote `openingTreeSha256` from admission precondition to a recorded
   observation only — preserves full audit value, never blocks on drift.
2. Keep it a precondition but tolerate drift confined to paths already
   inside the window's own declared scope.
3. Make `prepare` idempotent against its own signed intent digest — a
   re-prepare after drift yields the same digest when scope/expiry/reason/
   feature are unchanged, so the existing signature still applies without
   asking the human twice.

**Recommendation:** Option 3 — the item itself flags this as most directly
serving ADR-0061 and "deserving the first look." It preserves the strongest
security property (drift still matters) while fixing the actual defect (no
unnecessary re-ask). SECURITY/GUARDRAIL-class — MP-07 mandates max-tier
model once this is designed.

### 11. `2026-08-07-human-authorization-prompts-ignore-the-configured-language-profile.md`

**Impact:** Moderate. The pre-signature confirmation prompt before OpenSSL/
PIN entry is English-only regardless of `runtime.humanFacingLanguage` — the
one part of a PO request ("je nach Sprachprofil natürlich") that
`NOVA-PO-CONFIRM-1` left undelivered, disclosed honestly at the time.

**Options (item's own two separable questions):**
1. Does the confirmation TOKEN itself get translated, or stay a stable
   English constant (a defensible middle: accept the English token always,
   plus a localized token additionally)?
2. Does guard-denial next-step guidance (agent-facing) follow the same
   language axis, or stay English under ADR-0011's target-scope rule (a
   guard denial is read by the agent first, the human second)?

**Recommendation:** Translate the human-facing PROMPT TEXT to
`runtime.humanFacingLanguage`, with English as the hard fallback on any
lookup failure so the gate can never fail open into "no prompt." Keep the
confirmation TOKEN a stable English constant always accepted (add a
localized token as an additional accepted form, not a replacement). Leave
guard-denial next-step guidance in English — it is agent-facing under
ADR-0011's own target-scope rule. Mirrors this repo's existing
German-conversation/English-artifact split.

### 12. `2026-08-08-a-guard-reclassification-changed-what-a-signature-can-lift.md`

**Impact:** Minor, and the item explicitly frames question 1 below as a PO
judgment call. Commit `88d316d` correctly reclassified a stderr-to-null
redirect as non-cross-repository; the side effect is that the same command
moved from never-liftable to liftable-by-signature. No agent capability
changed — only what a human's signature can subsequently reach.

**Options (item's own two separable questions):**
1. Is the new reachability correct — was a stderr suppressor ever really a
   cross-repository mutation, or should it always have been liftable?
2. Should the differential-testing corpus measure override-reachability as
   its own axis (not just admission/denial), so the next reclassification's
   side effect is caught automatically rather than found by review?

**Recommendation:** Yes to both. 1: accept the reclassification as correct
and write the reasoning down — the item states this alone is the
deliverable. 2: add reachability as a probe axis; cheap, and it generalizes
past this one instance.

## Guard messages/phase transitions (13–14)

### 13. `2026-08-08-a-bounded-diagnostic-outside-the-repo-is-refused-under-the-wrong-reason.md`

**Impact:** Real but narrow. A legitimate bounded read-only diagnostic
(`rg ... | head`) targeting a path outside the repo root is refused under
`GUARD-OPERATOR-UNAPPROVED` — the wrong code, with a remedy that cannot
possibly fix it (splitting the pipeline changes nothing, since the pipeline
was never the problem). Worst exactly where it matters most: inspecting a
background task's own log output, which lives outside the repo by design.

**Options (item's own text):**
1. Name the real reason under its own code — decide whether it belongs to
   the never-liftable cross-repository-mutation family, or a narrower,
   override-reachable read-scope-refusal class. This decides whether a
   signed override could ever reach it.
2. Make the remedy text true, or omit it.
3. Audit the other rg-to-rg/rg-to-head exemption for the same asymmetry
   against an outside target.

**Recommendation:** This is the genuine open call — a narrower,
override-reachable read-scope class fits the observed behavior better than
the never-liftable mutation family, since reading is not the risk a
cross-repo-mutation guard exists to stop (same reasoning as #12: read-only
diagnostics don't need write-grade strictness). Flagging as PO's call since
it does move a security boundary either way.

### 14. `2026-08-08-approved-but-not-implementing-refuses-every-write-and-asks-for-nothing.md`

**Impact:** Real, per-occurrence cost that never decays — every session
pays a dispatch round after every plan approval, discovering only by
refusal that a further `set-phase --phase implementation` step is required.
`guard-devplan.mjs`'s refusal itself is correct; only the silence around
the needed transition is the defect.

**Options (item's own text):**
1. Decide whether approval should imply the transition automatically —
   removes the extra step, but also removes a meaningful "approved but not
   yet implementing" state a human might actually want. The item states
   this belongs in the ruleset, not session judgment.
2. If kept as a separate step, have the approval-recording command itself
   ask for/announce the transition.
3. Do not solve it by widening the guard itself.

**Recommendation:** Option 2 — keep approval and implementation-start as
separate deliberate acts (consistent with this repo's other explicit
phase-transition patterns), but have the same command that records approval
immediately surface "run `set-phase --phase implementation` now," so the
next step is announced rather than discovered by refusal.

## Dispatch process (15–16)

### 15. `2026-08-08-a-briefings-model-field-can-contradict-the-agent-it-dispatches.md` — MP-05/MP-07-relevant

**Impact:** Real integrity gap. A hand-written dispatch briefing's model
field is purely decorative — nothing compares it against what the
dispatched agent definition actually runs — so it can silently misrecord
which model did guardrail-class work, exactly what MP-05/MP-07 exist to
keep honest. Happened three times in one wave, written by the Elephant
itself.

**Options (item's own text):**
- A. `guard-dispatch.mjs` compares the stated model against the dispatched
  agent's actual definition and refuses a mismatch.
- B. Allow the deviation as an explicit override with a stated rationale
  (MP-05/07 already permits this).
- C. Drop the model half of the field entirely; derive the record from the
  agent definition automatically.

**Recommendation:** C, combined with B for the genuine upgrade case. Three
consecutive wrong hand-written values is direct evidence the field "cannot
be authored correctly by hand" (item's own conclusion); deriving it removes
the failure mode structurally. Keep an explicit override path for the real
MP-05/07 case (dispatching guardrail work at a higher tier with a stated
reason) so C and B combine rather than compete.

### 16. `2026-08-08-pre-existing-failure-is-a-claim-that-needs-evidence.md` (points 3–4: Verify cadence)

**Impact:** Real — two dispatches in one wave wrongly self-diagnosed actual
regressions as "pre-existing, unrelated," nearly burying a genuine
cross-file breakage (from ADR-0059 Decision 6's cross-repository lift work)
as an accepted flake. Root cause: nobody runs the FULL gate mid-wave, only
each dispatch's own local suites.

**Options (item's own text):**
1. Run one full Verify at the wave's midpoint, converting a wave-long
   undetected breakage into a one-dispatch one.
2. Run it after every landed commit instead of on a cadence.
3. Define what a valid "before" baseline even means when dispatches run
   concurrently — both wrong self-diagnoses were caused by comparing
   against a moving target.

**Recommendation:** Option 1 as the practical middle ground — per-commit
Verify is expensive at real wave scale; a scheduled midpoint check is
cheaper and catches the exact failure mode observed. (Points 1–2 of this
same item — evidence-carrying claims in the Goldfish contract — are already
queued as Task #66; this remainder is Elephant-process, not Goldfish
contract text.)

## Repo layout/docs (17–20)

### 17. `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md` — ADR-class

**Impact:** Large and structural. Six concrete instances already observed
in one night: helper scripts falling back to `.git/`, `scratch/` sketched
in two files and wired to neither, an unanchored `.gitignore` rule
swallowing citable `backlog/evidence/` closure artifacts, repo-root
`evidence/` used as a scratch directory, dispatch records landing untracked
by independent convergent guesswork, and `evidence/` growing unbounded
(128.7 KB of paths) with nothing able to tell citable artifacts from
throwaway material. PO explicitly asked for an ADR-class fix.

**Options (item's own 6 required decisions):** name the kinds; one home per
kind plus what may NOT go there; which are tracked vs. ignored and how the
ignore rule is anchored; what a fresh session is told and where
(agent-facing briefing, not only `docs/`); what checks it (a Verify gate);
how a consumer project inherits it (kinds transfer, not directory names).

**Recommendation:** Accept as an ADR-track item — too large for a
same-session call, but six already-measured instances is more than enough
evidence to start now. Scope the ADR to exactly these 6 points; treat the
Verify-gate check as a hard requirement from day one, not optional, so this
doesn't become instance seven of its own problem.

### 18. `2026-08-07-handover-file-has-no-rotation-obligation.md`

**Impact:** `docs/state.md` is over 4,500 lines and grows every session
with no gate; ADR-0060 deliberately left the rotation mechanism undecided
(Decision 5). A second, sharper problem: durable rules are embedded
throughout the current file even though ADR-0060 Decision 3 says they
belong in an ADR/policy, so any deletion-based rotation would destroy rules
that exist nowhere else.

**Options (item's own 5 candidates, one explicitly a prerequisite):**
1. A length gate mirroring CLAUDE.md's close-gate precedent.
2. Rotate at block/feature boundaries, not by size.
3. Archive to a dated `docs/state-archive/` with pointer lines in the live
   file.
4. Bound by session count rather than lines (needs a session marker that
   doesn't exist yet).
5. Independent of 1–4: a one-time extraction pass lifting every embedded
   durable rule into an ADR/policy/guardrail file first — without this,
   rotation is destructive.

**Recommendation:** Start with 5 unconditionally — it's a prerequisite for
any of 1–4 to be safe, and has independent value (ADR-0060 Decision 3 is
being violated right now). Recommend 2 as the follow-on rotation mechanism —
most semantically correct per the item, weakest failure mode (doesn't
invite gaming a length trigger), though it doesn't alone solve one
very-long-running feature.

### 19. `2026-08-10-plugin-package-should-vendor-canon-references-via-build-step.md`

**Impact:** Already "accepted in principle" in its own prior triage; the
immediate quick-copy fix already shipped. This item is the proper
generated-build-step follow-up, sharpened by its own Critic review (F2/F3):
25 of 37 vendored files currently have zero drift-detection coverage
against their repo-root originals.

**Options:** The item names one required direction (a generated build
step, analogous to `generate-agent-obligations.mjs`) plus a required
classification pass (Pipeline-self-only vs. universal content) before or
alongside it — no competing options offered.

**Recommendation:** Accept as scoped, already due-dated 2026-08-24. This is
an assignment decision, not a design choice — recommend dispatching to
`goldfish-deep` (design latitude needed for the classification scheme) once
capacity allows; PO input needed only to confirm priority against the due
date.

### 20. `2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-calls-it.md`

**Impact:** Real, now observed live in a CONSUMER project, not just this
repo: a shipped skill instructs writing to `scratch/`, a shipped guard
refuses that exact write in draft phase, and the built cleanup machinery
(45 tests green) is wired to no event at all. The PO already corrected the
original "bind on start, release on close" design as wrong, since a close
is the least reliable moment — the sessions whose scratch most needs
collecting are the ones that ended abruptly and never reached one.

**Options (item's own text, per the PO's own correction — two events, not close):**
1. Bind on session start; sweep orphans on the NEXT session's bootstrap
   (reliable, already-instrumented, and the right motive: start clean).
2. Sweep/assert at the push gate — the one moment a human is actually
   transporting a finished state outward.
Separately, an explicit PO question the item names: what should the push
gate SAY about unswept scratch state — a hard finding, a soft warning, or
silent cleanup?

**Recommendation:** Implement both 1 and 2 together, as the item itself
recommends (a release-on-close fast path may still exist but nothing may
depend on it). For the push-gate question: a soft WARNING, not a hard
block — a human transporting a finished state should see leftover scratch
material named, but blocking the push over housekeeping would contradict
the "protects against the agent, not the human" design policy already
applied to cluster D this session.

## Other (21–23)

### 21. `2026-08-07-native-windows-verify-red-suite-class.md`

**Impact:** None new — already accept-deferred, blocked purely on PO
access to real native-Windows hardware (Git-Bash and PowerShell) to
re-measure the original 11/25 red-suite baseline.

**Recommendation:** No action until that access exists.

### 22. `2026-08-10-no-rename-path-for-a-feature-id-continuity-already-fixed.md`

**Impact:** None new — already explicitly deferred by the PO on
2026-08-10; GF-099 (same day) already prevents this dead end from
recurring for any project promoted after that fix landed.

**Recommendation:** Leave as is; revisit only if it recurs live despite
GF-099.

### 23. `2026-08-07-technical-lock-for-pipeline-consent-before-onboarding-complete.md`

**Impact:** Real in principle — no `PreToolUse` technical barrier exists
between "PO gave Pipeline-adoption consent" and "onboarding actually
completed"; a session that drifts out of bootstrap for any reason (a
plugin-registration conflict, a mis-generalized later instruction) can
silently start unguarded implementation. But the item is filed from a
narrative self-report, not a source-code investigation, and the PO's own
triage note explicitly says it was never checked against what already
exists.

**Options (item's own text):** One concrete mechanism is proposed (a
`PreToolUse` hook keyed on a local "consent given, onboarding not complete"
marker, cleared only by real onboarding completion or an explicit
PO-confirmed override) — no competing options offered.

**Recommendation:** Do the cheap read-only investigation first — does
`guard-lifecycle-ready.mjs`'s existing PreToolUse machinery already close
this gap, partially or fully? This is exactly what the item's own note
asks for before any new hook is planned. Only design the marker-based hook
if a real gap remains after that check. Not urgent (one historical
incident, no repeat observed), but cheap to verify.

## Open question for the PO

Walk through all 23 individually, or decide only the ones with a real
security/architecture dimension (10, 11, 12, 13, 15, 17, 18) and leave the
rest at "later" for now? Several of the 23 (2, 4, 8, 9, 19, 21, 22) need no
fresh PO judgment at all — they are already accepted/deferred by prior
triage and are listed here only because the earlier grouping pass included
them; they can be actioned or left alone without further input.
