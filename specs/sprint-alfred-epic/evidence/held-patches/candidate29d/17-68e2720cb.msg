fix(native-host): admit a checkpoint with no changed path for a stop before any edit

Glossover on 29c: a Goldfish stopped correctly on a stop condition
before changing any file. The briefing told it that a plain-text stop
report is the one legal form in that case, but the host return
validator refused every final without changed paths and the Stop hook
never reads plain text, so the stop failed NGHR-FINAL-JSON, left a
stop-failure file, and a re-dispatch under the same id was refused as an
item-delivery owner collision.

A checkpoint commits nothing and keeps the reservation live, so it may
now carry changedPaths []. A success still has to name its files. The
briefing's return contract and the budget-checkpoint notice say the
no-edit stop is that same JSON with outcome checkpoint and an empty
list, never plain text. The D31 pin now checks the no-edit checkpoint
validates and an empty success is still refused.

AI-Assisted: true
Dispatch: stage-0 (elephant)
