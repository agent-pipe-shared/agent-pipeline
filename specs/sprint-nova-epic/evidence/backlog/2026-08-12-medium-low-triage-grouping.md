# Medium/Low LOOSE backlog (41 items): thematic grouping and disposition

Source population: `2026-08-11-backlog-88-sprint-mapping-and-priority.md`'s 41
Medium/Low LOOSE items (27 Medium + 14 Low), the remainder after the 27 High
items were fully dispositioned (18 decided across 13 clusters, 5 completed,
4 in active fix-rounds).

Disposition: 18 items are low-hanging fruit with no open design question —
queued directly as implementation Tasks #47–66 (see the session task list;
not duplicated here). The remaining 23 need an actual PO decision, because
each is either unclear whether it is worth doing or carries a real design
question. Grouped thematically below, in the order presented to the PO on
2026-08-11.

## Onboarding/Runner (1–4)

1. `2026-08-05-claude-has-no-start-time-opt-in-adoption-path.md` — already
   triaged "accept-deferred"; needs a PO scope decision: a hint text only,
   or a full V4 onboarding flow matching Codex's.
2. `2026-08-10-git-identity-ask-step-unreachable-through-live-cli-path.md` —
   fix already accepted, but the item's own text names a "wide blast radius
   across status-transition tests" — a real design problem, not a pure
   mechanical fix.
3. `2026-08-08-runner-neutrality-must-hold-before-a-third-runner-lands.md` —
   tracking item for AGY; open question: should `runner="codex"` exist as a
   silent default anywhere, and where is AGY itself tracked?
4. `2026-08-08-two-manifest-literals-still-bypass-the-single-seed-owner.md`
   — scope unknown per the item's own text; needs measurement before it is
   clear whether it is worth doing.

## Bootstrap/Kickoff forensics (5–9)

5. `2026-08-08-two-cheap-costs-a-skill-invoked-without-arguments-and-a-thirteen-step-bootstrap.md`
   (the 13-step part) — are all 13 bootstrap steps actually load-bearing?
   Needs a deliberate accounting, not a guess.
6. `2026-08-09-what-the-claude-greenfield-run-adds-to-the-happy-path-findings.md`
   — PRD language is frozen before the PO's language answer; where exactly
   in the kickoff chain is language queried/fixed?
7. `2026-08-09-codex-read-only-steps-escalate-individually-instead-of-once.md`
   — possibly pure Codex CLI behavior, "possibly not fixable from the
   Pipeline side at all" per the item.
8. `2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md`
   — already "deferred, not declined", waiting on a live retest of a fix
   from the same evening.
9. `2026-08-10-compare-three-parallel-happy-path-tests-in-detail.md` — pure
   forensics idea; the PO already said "not today" once.

## Push/approval security (10–12)

10. `2026-08-08-a-maintenance-window-signature-is-voided-by-an-unrelated-file-write.md`
    — 3 options (treat as observation rather than precondition / tolerate
    drift within the window / idempotent preparation); option 3 changes
    what a signature covers at all — security-relevant.
11. `2026-08-07-human-authorization-prompts-ignore-the-configured-language-profile.md`
    — is the confirmation token itself translated, or does it stay a stable
    constant? Does guard text follow the human axis or the agent axis?
12. `2026-08-08-a-guard-reclassification-changed-what-a-signature-can-lift.md`
    — was the new reachability correct (should a stderr suppressor have
    ever been liftable)? Per the item, explicitly a PO judgment call.

## Guard messages/phase transitions (13–14)

13. `2026-08-08-a-bounded-diagnostic-outside-the-repo-is-refused-under-the-wrong-reason.md`
    — does the code belong to the never-liftable cross-repo family, or to a
    narrower, override-reachable class? Decides whether a signed approval
    could ever reach it.
14. `2026-08-08-approved-but-not-implementing-refuses-every-write-and-asks-for-nothing.md`
    — should "approved" automatically imply the phase transition? Two
    defensible answers; the item itself says this belongs in the ruleset,
    not session judgment.

## Dispatch process (15–16)

15. `2026-08-08-a-briefings-model-field-can-contradict-the-agent-it-dispatches.md`
    — 3 structurally different fixes (guard compares the model field
    against the agent definition / allow the deviation as a justified
    override / drop the model field entirely and derive it from the agent
    definition) — different MP-05/MP-07 consequences.
16. `2026-08-08-pre-existing-failure-is-a-claim-that-needs-evidence.md`
    (points 3–4) — does the Elephant run a full Verify after every landed
    commit, or on a cadence? Can parallel dispatches measure a valid
    "before" baseline at all?

## Repo layout/docs (17–20)

17. `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md`
    — ADR-sized topic, 6 open points (taxonomy, one home per kind,
    tracked-vs-ignored anchoring, consumer inheritance).
18. `2026-08-07-handover-file-has-no-rotation-obligation.md` — `docs/state.md`
    grows unbounded; 5 candidate mechanisms, ADR-0060 left this deliberately
    open.
19. `2026-08-10-plugin-package-should-vendor-canon-references-via-build-step.md`
    — already "accepted in principle"; now needs a classification scheme
    (Pipeline-only vs. universally vendorable), "probably needs its own
    ADR".
20. `2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-calls-it.md`
    — what should the push gate say about scratch state: a finding, a
    warning, or silent cleanup? Explicitly a PO question per the item.

## Other (21–23)

21. `2026-08-07-native-windows-verify-red-suite-class.md` — blocked on PO
    access to real Windows hardware, not a design problem.
22. `2026-08-10-no-rename-path-for-a-feature-id-continuity-already-fixed.md`
    — de facto already resolved by GF-099; noted for the record only, no
    action needed unless it recurs live.
23. `2026-08-07-technical-lock-for-pipeline-consent-before-onboarding-complete.md`
    — the PO never triaged this itself ("interesting for the backlog");
    check first whether `guard-lifecycle-ready.mjs`'s existing PreToolUse
    machinery already covers it before planning a new hook.

## Open question for the PO

Walk through all 23 individually, or decide only the ones with a real
security/architecture dimension (10, 11, 12, 13, 15, 17, 18) and leave the
rest at "later" for now?
