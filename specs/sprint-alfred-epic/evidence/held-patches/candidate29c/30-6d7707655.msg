fix(guard): a shell command never changes .git/agent-pipeline

The Write/Edit refusal (daf3aa12c) left the shell lane open: a live probe
on 2026-11-13 showed cp, mv and rm into .git/agent-pipeline/ admitted on
the installed plugin, so a forged design review observation or override
record could still be placed by a shell command. The lifecycle guard now
refuses a shell segment that names the control-plane directory, literally
(also as an attached redirect target) or through a path whose real
location lies in it, unless its command only reads (rg, grep, cat, head,
tail, wc, stat, file, ls, git, sed without -i, find without a mutating
action) and it carries no redirect other than one to /dev/null. Reading
that directory stays admitted.

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
