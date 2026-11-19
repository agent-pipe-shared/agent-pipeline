fix(hooks): the intake material input is no longer repeated in every turn once the design is approved

A second Antigravity greenfield report: from the first turn after the design was ready the session-start hint injected the verbatim intake material (a 40-line reminder that it MUST be read in full) in almost every turn, although the material was already condensed in the sealed PRD and Spec; the agent answered it with over 30 redundant reads of the intake file. The repetition was deliberate (G20-30: dropping it would turn into asking the user again), but that reason ends when the design is approved.

intakeVerbatimContextLines() now answers a design that is sealed (the active feature's plan is approved, or a feature has been closed) with one pointer line naming the number of chunks and the approved PRD and Spec; the answered onboarding values ("already answered, do not re-ask") stay in every turn, and before the approval nothing changes. Any problem reading the state keeps the full lines, so the reminder can only be shortened on positive evidence. Both hooks that use the function (Codex and Antigravity) follow. A case covers sealed, unsealed and unreadable state.

AI-Assisted: true
Dispatch: stage-0 (elephant)
