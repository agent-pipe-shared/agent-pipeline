# ADR-0085 — One review, one signature: simplify the design approval

## Status

Proposed, 2026-10-07. Drafted by the Elephant from PO decisions E and F of
2026-10-07 ([`specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md`](../../specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md))
and the measured toil of the revision-5 approval
([`specs/sprint-alfred-epic/evidence/toil-log-2026-10-06-07.md`](../../specs/sprint-alfred-epic/evidence/toil-log-2026-10-06-07.md)).
Not accepted: it changes approved behaviour beyond the Sprint Alfred revision-5
Spec and therefore needs its own design revision (Spec delta, one review, one PO
signature) before any implementation.

## Context

Approving one design revision (Alfred revision 5) took more than sixteen hours
of wall time and, on the final day, three course runs, two fix rounds, four
continuity writes and about eight PO terminal commands for a single intended PO
decision. None of these steps changed the design's content. The cost came from
machinery stacked between "the design is finished" and "the PO signs":

- **Authoring-dispatch continuity registration.** `submit-plan` needs idle
  continuity, while the Advisor course needs a registered authoring dispatch in
  `continuity.queueHead.dispatch`. In the installed version only the generic
  `continuity-cas` writes that field, so every revision cycle needed a clear
  and a re-registration that the agent cannot perform (T8, T9, T27).
- **Invented authoring dispatch ids and a private course store.** A finished
  Advisor course is terminal for its sources; a re-run after a source fix needs a
  new authoring dispatch id to open a child course, and nothing says so
  (`DAC2-REEXPORT-SOURCE-DRIFT`, T22).
- **A mandatory Advisor stage.** For a runner without a wired Advisor route the
  stage always ends `unavailable` and demands a one-time exception rationale
  every course (T13).
- **A readiness child that re-reviews content.** Each readiness run reads the
  whole design afresh and finds new blocking points that earlier runs did not
  raise (run 1: two blockers; run 2 after fixing them: two new ones; run 3:
  ready). Combined with the Critic rounds this is a non-converging review loop
  (T26), the same failure QG-13 caps for the Critic.
- **Prescribed steps refused for the agent.** `--run-v2`, `present-plan` and
  the continuity steps were refused in `awaiting-approval`; course outputs under
  `evidence/` were not writable (T10, T21, T24).

## Decision (proposed)

The design phase has exactly this flow:

1. **Author** the design (PRD, Spec and the bound companions).
2. **Advisor on demand:** the author asks an Advisor about a concrete topic when
   it helps. There is no mandatory Advisor stage, no course store, no exception
   rationale when no Advisor was needed.
3. **Finalize** the content.
4. **One review** by an independent reviewer of the final sources, with at most
   one delta follow-up (QG-13). Its findings go to the Elephant once.
5. **One PO decision:** the PO signs one intent bound to the PRD and Spec digests
   and the review receipt. That signature is the design → implementation
   transition.

What remains mechanical and is **not** a review: a consistency check run by the
lifecycle writer itself before the signing command is handed over — the PRD
`technical-spec-sha256` marker equals the Spec digest, register and traceability
counts reconcile, every bound path is tracked and unmodified. It reports typed
inconsistencies; it never judges content.

What is removed:

- registration of an authoring dispatch in continuity for the design phase, and
  the idle-continuity precondition of `submit-plan` as far as it exists only to
  clear that registration;
- authoring dispatch ids as an approval input;
- the private Advisor course store with parent/child courses and re-export rules
  as an approval precondition (an on-demand Advisor answer may still be cited as
  evidence);
- the separate readiness child as a content review;
- the design-workflow package as a second artifact next to the bound sources,
  where the signed intent can bind the sources and the review receipt directly.

Every lifecycle verb the Pipeline prescribes for the current state is admitted
for the agent in that state; the PO is asked only for the one signature. The
signing hand-over is one ready-to-paste command with absolute paths and the key
directory (T25).

## Consequences

- A design revision costs one review and one signature; a revision after review
  findings costs a delta review and the same one signature.
- Existing approvals stay valid and verifiable; the removed machinery is retired
  with typed migration hints, not silently ignored (S7 legacy deletion).
- The approved revision-5 contracts R1 (catalogue admission of every prescribed
  verb), R5-6 (coordinator records authoring itself) and R7-10 (supersede
  without an override) are built first; they remove part of the toil now and
  stay valid under this ADR.
- Risk: fewer independent eyes on content before the signature. Mitigation: the
  one review is mandatory and independent, and QG-13's delta follow-up remains.

## Acceptance (for the Spec delta)

- A fixture design revision goes from finished sources to approved with one
  review receipt and one PO signature, zero `continuity-cas` calls, zero
  overrides and zero other PO terminal commands, on win32 and POSIX.
- A source fix after review findings needs a delta review and the same single
  signature; no new identifiers are invented by hand.
- The consistency check fails with a typed code on a stale marker, a count
  mismatch or an untracked bound path, and passes otherwise; it never returns a
  content finding.
