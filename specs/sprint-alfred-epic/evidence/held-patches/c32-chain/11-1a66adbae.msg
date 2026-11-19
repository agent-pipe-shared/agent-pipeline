fix(architecture): the unbound ADR refusal says what the design carrier is

A Claude greenfield run was refused at submit-plan with ADR-DRAFT-UNBOUND, ran the bind command the refusal printed, and was then refused again because the carrier it names (specs/<id>/design.md) did not exist; it created that file by hand. The first refusal named the carrier and never said what it is. It now says so where the path appears: a Markdown file of this design package that must already exist, to be written with a title line first, into which the bind adds the decision block. Only the refusal text changes; no state, no condition and no exit code. The existing pin asserts the sentence.

AI-Assisted: true
Dispatch: stage-0 (elephant)
