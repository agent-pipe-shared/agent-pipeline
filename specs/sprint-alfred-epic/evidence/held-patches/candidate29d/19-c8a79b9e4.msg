fix(plan-handoff): name the hidden journey duty of a re-rendered row

A criterion row the parser cannot locate is not checked for its
journeys yet, so a re-rendered user-facing row could still be refused
for a missing journey on the next attempt. The repair now says that a
re-rendered user-facing row needs its Journeys and Asserts clause in the
same edit, and the refusal names the registration's own code
(CAC-CRITERION-UNSUPPORTED) for the same rows. The design-course
reference lists the new hand-off code.

AI-Assisted: true
Dispatch: stage-0 (elephant)
