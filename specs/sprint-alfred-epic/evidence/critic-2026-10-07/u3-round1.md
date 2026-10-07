# Critic record — ADR-0085 U3 design approval binding, round 1 (full)

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: 0df8e4c53 (U3-T), 8545160e8 (U3-F).
- Verdict: **PASS** (two minor). Trajectory: consistent.
- F1 minor: after a round-2 receipt a deleted companion yields `DAB-SHAPE` — the builder copies the current SourceSet (null companion digest) into `binding.sources` (`design-approval-binding.mjs` ~217, ~178-182), the validator requires hex digests there (~95) and accepts `currentSha256: null` in the delta only for unbound paths (~137-140); contract §4 ("no null sha256" in sources) vs §6 ("absent current file has `currentSha256: null`") conflict. Fails closed.
- F2 minor (QG-11): validator rules carrying decisions U and Z lack negative tests — verdict/openFindingIds consistency (~154), delta truthfulness (~139-140), SafePath on binding paths (~86-91), PRD/Spec/companion overlap and order (~100-106), finding-list pattern/order/uniqueness (~116-119), delta size cap (~134).
- Process observations: the Critic agent has no Write/Edit tool, so `critic-notes.md` could not be written (existing backlog item `2026-10-06-critic-scratch-notes-write-is-refused-again.md`); `pipeline-start critic` not invocable (no Skill tool); one `counter-lock-busy` on a parallel call.
- Disposition: Elephant ruling (7) on F1 (below); test-only dispatch U3-T2 pins F1 and F2, then U3-F2; Elephant self-verification afterwards (round cap, decision A).
- Ruling (7), derived from decision Z: a companion absent at binding time is omitted from `binding.sources` and appears in `unreviewedSourceDelta` as `{ path, reviewedSha256, currentSha256: null }`, so the PO signs the deletion knowingly; an absent PRD or Spec stays a refusal (`DAB-SHAPE`), because the approval intent binds their digests.
