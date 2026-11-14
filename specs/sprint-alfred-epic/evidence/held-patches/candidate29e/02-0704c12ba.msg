docs(elephant): name the scope-change route next to the budget release

C29d patch 51 made the checkpoint print four routes (resume, budget
release, scope change, complete except an out-of-scope item), but EL-25a
and workflow-dispatch.md still named only the budget release, and EL-25a
step (4) read as forbidding the scope-change route. Step (4) now speaks
of the same outcome and scope, a new step (6) states the scope-change
route (cancel --started --class wrong-premise, recover the diff, a
successor under a new id) and the out-of-scope route (recover without a
cancel), and the DBG-CHECKPOINTED-OWNER warning names the scope-change
route next to the budget release. Vendored canon regenerated.

AI-Assisted: true
Dispatch: stage-0 (elephant)
