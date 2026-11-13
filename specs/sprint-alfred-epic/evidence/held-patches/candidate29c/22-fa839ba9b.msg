test(pins): resume-hint consume and query are admitted in their exact form

Candidate 29 R7 (ad059b943) admits `consume` and `query` as exactly
`<verb> --root <root> --session-id <id>`; the pin still listed both as
refused and has been red since. It now asserts the exact forms are
admitted and keeps a missing session id and an extra flag refused.

Checkpoint-Intent: candidate 29c, pin follow-up of R7
AI-Assisted: true
Dispatch: stage-0 (elephant)
