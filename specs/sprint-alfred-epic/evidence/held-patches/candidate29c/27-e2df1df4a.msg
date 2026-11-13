fix(guard): the lifecycle catalogue admits the typed fallback receipt form

design-review-receipt.mjs create takes --requested-route and
--observed-identity only together with --fallback-reason-code (W7, D247),
and the entry-gate repair names that flag for a fallback receipt. The
catalogue admitted the first two but not the reason code, so the typed
fallback route could not be completed where the catalogue governs, and
the two admitted flags alone are always refused by the script. The
catalogue now admits --fallback-reason-code with the script's own
pattern; the pin admits the fallback form and refuses a code that is not
one.

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
