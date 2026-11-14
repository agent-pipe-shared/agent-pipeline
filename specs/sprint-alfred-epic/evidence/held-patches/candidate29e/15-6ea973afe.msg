test(runtime-projection): pin that the parallel reminder key stays in the source

C29e T10 follow-up: session.parallel_reminder_every is read by the hooks
from pipeline.user.yaml. The V3 runtime projection renders only
keep_awake into the .claude/pipeline.yaml session block, so a source
carrying the new key plans ready and the projected block is unchanged.
This test pins that, so a later projection change cannot start owning
or dropping the key unnoticed.

AI-Assisted: true
Dispatch: stage-0 (elephant)
