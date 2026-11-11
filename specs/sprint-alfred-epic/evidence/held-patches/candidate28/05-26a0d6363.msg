test(guard): keep three host pins running against the current production shape

The candidate 27 Full Verify found three tests that no longer matched the code
they load: the Windows program branch now takes a same-path comparator, the
option-value mirror compiled an `export` as a function body, and the requester
pin needed two bounded readers. Production code does not change.

AI-Assisted: true
Dispatch: stage-0 (elephant)
