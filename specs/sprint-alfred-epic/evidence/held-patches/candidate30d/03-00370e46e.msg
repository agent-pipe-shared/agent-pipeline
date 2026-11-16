fix(dispatch): the Antigravity Critic briefing asks for the session's concrete model id, not the word inherit

On Antigravity the Critic inherits the session's model and its call passes
no Model, which the call guard enforces. The briefing still has to name a
model (MP-05), and the policy check refuses a briefing that names none. The
envelope's model row only said "the Antigravity route model of the Critic
duty", so the dispatcher wrote "inherit", was refused DISPATCH-NO-MODEL, and
looped through several steps.

The model row now asks for the concrete id this session runs on and says
never the word inherit and that the call passes no Model; the briefing-use
text of prepare-dispatch says the same, and the policy finding says what to
write instead. No check changed its decision.

AI-Assisted: true
Dispatch: stage-0 (elephant)
