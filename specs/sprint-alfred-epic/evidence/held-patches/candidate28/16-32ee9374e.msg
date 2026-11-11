fix(architecture): name the blocking decision finding and the retained reference

Implementation entry refused with a generic repair text, so a run on native
Windows read the plugin's source to learn which finding held it. The guidance
now names each finding. The commit step after materialize-architecture also
names the retained approval reference, which it left out outside the ADR-only
route.

AI-Assisted: true
Dispatch: stage-0 (elephant)
