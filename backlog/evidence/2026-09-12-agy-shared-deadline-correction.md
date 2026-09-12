# AGY native dispatch shared-deadline correction

Date: 2026-09-12

The correction review of candidate
`8a66612a84fa75655c3e28845a9d90de415472d7` found that the bounded
`repositoryState` phase was followed by serial role-preflight Git probes with
their own timeouts. That allowed total PREPARE time to exceed the promised
bound. It also retained the final candidate threat-model approval as an open
ceremony.

Commit `b3272edc` carries one monotonic deadline from repository inspection
through every packet's commit, tree, tree-entry, blob, and working-copy probe.
Caller-provided deadlines can shorten but cannot extend the five-second public
bound. An exhausted or invalid budget returns `RDP-DEADLINE` before any native,
launcher, or model call.

The new slow-Git case reaches the real `git -C` batch path after the repository
probes and completes in 4,502 ms with `RDB-PREPARATION-FAILED`, nested
`RDP-DEADLINE`, and zero native/model/launcher calls. Host-bound focused results
are 34/34 dispatch-policy, 20/20 AGY coordinator, and 8/8 Antigravity pretool;
syntax and `git diff --check` also pass. This is the direct parent verification
required after the package's two bounded Critic rounds. The versioned rollback
keeps all candidate and artifact authentication while explicitly reopening the
deadline finding if the deadline plumbing is reverted.

Final threat-model approval remains bound to the later frozen aggregate
candidate and is not claimed here.
