fix(native-host): a settled sibling's shared paths are no foreign paths

K-46 (Glossover 2026-11-14): the successor of a slice cancelled with
--started failed its stop with AGY-HOST-COMMIT-PATH-MISMATCH, five of
six claimed paths "claimed but not changed". The concurrent stop plan
kept the cancelled sibling's allowedPaths as foreign dirty paths while
its member was not released, and the admission dropped them from the
successor's own change set. The collision rule already admits overlap
with a settled (cancelled or integrated) sibling; its paths that this
slice owns now stay this slice's, the rest stays foreign as before.
NGHS37K reproduces the live error without the fix (missing the shared
path, the added one recognised) and is green with it.

AI-Assisted: true
Dispatch: stage-0 (elephant)
