fix(override): a denied push-init keeps the destination it froze

Codex greenfield run 3 (C6): after a guard denied a push-init.mjs call
(the gh data value, C5), the recovery planner treated it as "not a push"
and handed out the fixed main publication preflight
(`--destination-ref refs/heads/main`) although push-init had frozen a
feature branch; following it ended in PX-NON-FAST-FORWARD. The planner
now reads the one plain push-init invocation's own --remote and
--destination unchanged: main keeps the publication route, an approvable
refs/heads/<branch> gets the branch approve-push route for exactly that
remote and ref, and a tag, a dot-dot ref or a repeated --destination is
undetermined (never main). Composed commands and other scripts keep the
unchanged route.

Checkpoint-Intent: candidate 29, Codex run 3 C6
AI-Assisted: true
Dispatch: stage-0 (elephant)
