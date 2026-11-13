fix(design-review): a background reviewer's handback is the observed report

A background child ends with a SubagentHandback tool call, and that
message is what the parent receives (PF-61); last_assistant_message is
then absent or later trailing prose (PF-70). The D247 stop observation
took last_assistant_message first, so a review could be recorded under
the digest of a closing sentence and never match the exported report.
The child's last handback now wins; the last message is the fallback.

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
