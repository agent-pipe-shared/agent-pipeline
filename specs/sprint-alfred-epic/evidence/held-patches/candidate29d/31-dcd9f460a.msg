fix(wait-host-commit): state which slice a refused integration's commit releases

The refused-integration note said the commit evidence releases the
dependents "when the trailer names the slice id (the usual case)": an
assumption the waiter could not check. The finalizer now carries the
briefed slice id in its delivery result, the stop outcome records it,
and the waiter states the fact: the same id as the dispatch releases
the dependents, a different id does not (report the refusal), and no
recorded id keeps the conditional wording.

ADR-0099's sentence on D40b now names the guarantee it relies on: the
generated briefing makes the slice id the dispatch id
(DBG-SELFCHECK-SLICE); a hand-written briefing gets no such release.

Pin: the "C29 K-38" case of wait-host-commit.test.mjs covers all three.

AI-Assisted: true
Dispatch: stage-0 (elephant)
