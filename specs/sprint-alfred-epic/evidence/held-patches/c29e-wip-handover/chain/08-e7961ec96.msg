docs(el01-tripwire): name the ADR-0101 stage-0 fast path without rigor 0

The tripwire's refusal text and header still called the stage-0
exception "rigor-0/no-risk-flag" and quoted the old 2-file, 25-line
criteria. ADR-0101 admits the fast path at any rigor; only the risk flag
stays a per-feature criterion, which is the one this hook enforces.
Wording only: a high risk class still blocks Elephant writes.

AI-Assisted: true
Dispatch: stage-0 (elephant)
