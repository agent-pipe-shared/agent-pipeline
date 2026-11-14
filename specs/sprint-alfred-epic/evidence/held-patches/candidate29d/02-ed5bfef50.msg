test(signing-sweep): the staged fixture's Claude review carries the host observation

SHDQ002-007 set up through present-plan with a native Claude review
receipt built by the library. Since D247 present-plan refuses such a
round without a host observation of its reviewer
(PLAN-DESIGN-REVIEW-UNOBSERVED), so the setup failed before any case
ran. The fixture now carries the observation the route stamps, as
12d0ef6cd did for the other fixtures it missed. No assertion changes.

AI-Assisted: true
Dispatch: stage-0 (elephant)
