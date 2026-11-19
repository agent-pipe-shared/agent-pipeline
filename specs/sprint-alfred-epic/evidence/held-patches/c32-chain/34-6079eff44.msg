docs(happy-path): say how the fitness check and the boundary check differ and how a model run is bound to the candidate commit

The Antigravity greenfield report: the agent ran the fitness tool the way the guide spells it, got a result that said nothing about a candidate, and took the boundary check for its sibling. The two are different instruments: the boundary check reads the whole tracked tree, the fitness tool judges the property classes of the model for one mode and, with --diff, only the paths of a change, and a run that has to be bound to the candidate commit is --qualify with --commit. The step-five line of the happy path now says so, read from the tool's own argument parser (the mode list, the default, --diff, --qualify, --commit); no flag the tool does not take is named.

AI-Assisted: true
Dispatch: stage-0 (elephant)
