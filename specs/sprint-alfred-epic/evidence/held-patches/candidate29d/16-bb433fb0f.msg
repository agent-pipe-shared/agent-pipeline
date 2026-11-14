fix(native-host): read earlier items' check sources from the commit in the integrated scan

Glossover on 29c: a fix dispatch edited, inside its own scope, the check
file of an item integrated before it. Its stop failed before the host
commit with SDC-AUTHORITY-UNAVAILABLE item-check-source-not-candidate,
HEAD unchanged and no authority-terminal written.

The cause is the integrated-slice computation every stop admission
runs: it re-derived each earlier item's check-source digests from the
WORKING TREE (itemCheckSnapshot), which throws when a file differs from
the candidate commit. Any in-flight edit of an older item's check
source therefore aborted the whole stop, instead of being irrelevant to
whether that older item is integrated.

Integration is a fact about commits, so the scan now reads those
sources from the candidate commit itself (itemCheckCommittedFiles, same
{path, sha256, size} rows). A later commit that changed them still drops
the earlier item, as before. NGHS71 reproduces the live refusal against
the old read (the same SessionAuthorityError from
computeNativeIntegratedSlices) and is green with the fix; it also pins
the committed-change case.

AI-Assisted: true
Dispatch: stage-0 (elephant)
