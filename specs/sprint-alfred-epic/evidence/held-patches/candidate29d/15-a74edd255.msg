fix(approval): show the PO the same command spelling in poNow, on its own lines

A copy-safe rendering carries copyCommand as an object (one form per
shell), not a string, so poNow fell back to the raw single-line command:
a second spelling next to the wrapped form the PO is shown. poNow now
takes the form for the PO's platform (POSIX or PowerShell), and
push-prepare passes the rendering it prints rather than the bare
builder result. The sentence comes first and the command last on its
own lines, so a wrapped command stays pasteable.

AI-Assisted: true
Dispatch: stage-0 (elephant)
