fix(state): let a reopened design reach the PO again after the first Goldfish

The first native Goldfish creates the session-authority catalogue, and from then
on submit-plan, present-plan, approve-plan and the verbs that start a feature
needed an owning context no production route supplies. A greenfield run on
native Windows reopened its design for a one-value change and could not submit
it again. These verbs now take the route close-feature already takes: held while
a State operation is in flight, each writer proving its own gate.

AI-Assisted: true
Dispatch: stage-0 (elephant)
