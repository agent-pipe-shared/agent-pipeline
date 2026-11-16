fix(agy): the take-over names the one-call route and forwards the briefing and hand-back files

The second of two parallel Antigravity slices cannot fast-forward (the
first one moved HEAD) and cost six hand-made calls: the plain apply, the
recovery plan, the recovery apply, then the attested dispatch record. The
one-call route existed (apply --commit-dispatch-id) but the plan did not
name it, and it could not write the record because the integrate script did
not forward the briefing and hand-back files the recovery route needs.

plan's next now prints the one-call route (take-over, dispatch-trailer
commit and the typed orchestrator-attested record, not host-observed
evidence); applyOnly keeps the plain take-over. apply accepts --briefing
and --handback together and only with --commit-dispatch-id, and hands them
to the recovery route unchanged, so its own checks decide. The guard
catalogue admits exactly that argv, with both files repository-relative
under scratch/, evidence/ or specs/. ADR-0099 is untouched: no replay and no
new authority; an authorship-preserving take-over of a moved HEAD stays a
separate decision.

AI-Assisted: true
Dispatch: stage-0 (elephant)
