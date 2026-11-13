feat(dispatch): the Goldfish briefing names the approved Spec addenda (ADR-0095)

A correction approved as a Spec addendum is read together with the Spec
it corrects. The briefing generator adds one context line per applied
addendum of the Spec's feature package: path, digest, the findings it
corrects, and that the addendum wins where it and the Spec differ. A
package whose registered addenda do not read back is named with "stop
and report it"; no package, or no addendum, adds nothing. Prose only,
like the architecture lines; no parser reads them.

- scripts/dispatch-briefing.mjs specAddendumContextLines, in section 2

Tests: spec-addendum-registration.test.mjs SAR-09 (unregistered: none;
registered: the line; changed after registration: the stop line);
dispatch-briefing and prepare-dispatch 203/203.

AI-Assisted: true
Dispatch: stage-0 (elephant)
