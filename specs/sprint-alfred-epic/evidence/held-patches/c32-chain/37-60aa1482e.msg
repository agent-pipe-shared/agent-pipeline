fix(scripts): the held chain export leaves out a commit whose every hunk is derived instead of writing an empty patch

The candidate 32 rehearsal of the apply script stopped at step 17: a Reader-input sync commit (subject chore(reader-inputs)) holds only derived files, the export drops derived hunks from every patch, so its patch came out empty and `git apply` refuses an empty patch ("No valid patches in input"). Only a commit with the subject of the derived-files refresh was left out before. The export now computes each filtered patch first and leaves out every commit whose patch is empty, whatever its subject; the apply script's own refresh at its end writes what such a commit changed, which is the reason derived hunks are dropped at all. Numbering and the script steps follow the kept commits.

AI-Assisted: true
Dispatch: stage-0 (elephant)
