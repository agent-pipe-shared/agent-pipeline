fix(design-review): one observed review dispatch stamps one round

create found the host observation by the report digest alone and never
consumed it, so a delta round could reuse the previous round's exported
report and come out host-observed although no new review ran. create
now refuses with DRC-OBSERVATION-REPLAYED when the --previous receipt or
any receipt in the target folder already carries that observation's
digest, and names it and the route (dispatch the reviewer again,
export-report, --previous).

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
