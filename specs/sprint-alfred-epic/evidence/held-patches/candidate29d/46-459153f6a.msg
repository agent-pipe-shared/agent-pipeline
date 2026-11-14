test(pins): split the source-bound pin into two cases

The 29d rehearsal's case-completion check reported the new pin as
VULNERABLE-UNREGISTERED: one node:test case with several assertions,
where an early failure hides the later ones. The bound and walk
assertions and the size check are now two cases (registry valid,
393 entries).

AI-Assisted: true
Dispatch: stage-0 (elephant)
