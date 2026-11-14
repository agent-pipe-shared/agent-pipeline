fix(plan-handoff): refuse an unlocatable criterion row at the hand-off

Glossover: the plan hand-off admitted a Spec as soon as one criterion
row was locatable, so a row such as `- **AC-1 (part 1):** ...` passed
it, the registration's own row check refused it afterwards
(CAC-CRITERION-UNSUPPORTED), and the journey gaps of the same Spec only
surfaced on the attempt after that.

The hand-off now runs the registration's row check itself and refuses
with PLR-HANDOFF-CRITERION-UNSUPPORTED, naming every unlocatable row
and, in the same refusal, every user-facing criterion without a
journey, so one Spec edit repairs both. The repair map carries the new
code; the journey pin covers both the combined and the single refusal.

AI-Assisted: true
Dispatch: stage-0 (elephant)
