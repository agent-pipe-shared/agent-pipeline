fix(architecture): the inspect repair action names the field, the rule and the rejected value of the architecture block

Two greenfield runs (Claude and Codex) wrote an architecture block with wildcard paths, got only the code ARCHITECTURE-DESIGN-PATH-INVALID in the pipeline-state inspect next action and read the validator source to find the rule. The draft inspection already carried the field, the expected shape and the rejected value; the repair-required action dropped them. It now keeps them as fields and adds one sentence to its guidance, and the owned path rule says in plain words which characters are refused and which prefix form is accepted.

AI-Assisted: true
Dispatch: stage-0 (elephant)
