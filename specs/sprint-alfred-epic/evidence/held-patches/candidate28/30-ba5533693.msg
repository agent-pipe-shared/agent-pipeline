fix(critic): read the Opus route cell for the runner the session really is

opusCriticPromptLines knew only Codex and Claude, so an Antigravity session
got the Claude Opus MP-07 lines although its own Critic route is a Gemini
one. An Antigravity greenfield run pasted them as nextStep says and was
refused twice (transcript steps 502/503 and 892/893). The cell now comes
from the detected runner; an unknown session keeps the Claude cell.

AI-Assisted: true
Dispatch: stage-0 (elephant)
