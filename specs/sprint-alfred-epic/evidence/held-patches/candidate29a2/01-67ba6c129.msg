fix(review-admission): an earlier round's Critic addendum no longer shadows the descendant admission

AGY run 3 (R2): after round 1 of a task was resolved by a committed
dispatch-critic-addendum, round 2 of the same task at a later candidate
was refused (CPP-REVIEW-ADMISSION, no admitted record): the addendum
branch ran before the exact and descendant branches and counted the
record as covered instead.

An addendum for the requested task whose review candidate is not the
requested candidate now belongs to an earlier round: it is still
validated (an unbound one still refuses), but it no longer counts the
record as covered for this round, and the exact or descendant
admission runs as for a record without an addendum. At the addendum's
own review candidate nothing changes.

Checkpoint-Intent: candidate 29, AGY run 3 R2
AI-Assisted: true
Dispatch: stage-0 (elephant)
