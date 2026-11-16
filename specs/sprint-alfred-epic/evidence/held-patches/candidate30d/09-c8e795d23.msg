feat(dispatch): a filled Critic briefing is handed to the Critic as a verified pointer

A Critic briefing is about 12k tokens and the Coordinator had to paste it into
the Agent prompt in full; the Goldfish briefing already travels as a marker
line plus one pipeline-briefing-file line, and a Critic attempt with that shape
was refused DBG-REF-AMBIGUOUS. prepare-dispatch.mjs critic-fill writes the
final Critic briefing beside the draft from a closed slot table (the model id
as one token, never the word inherit; the effort from a fixed vocabulary), with
its own generator marker over every other byte, and prints the pointer prompt.

The pointer loader accepts that marker only for a pipeline-core:critic dispatch
and only from a folder under scratch/critic-briefing/; an edited file, an open
slot, a wrong role, a pointer plus inline text and the Workflow, Codex and
Antigravity carriers stay refused. The hook expands the pointer before every
later check, so the expanded text is judged exactly like the inline one.

AI-Assisted: true
Dispatch: C30D-G3 (goldfish)
