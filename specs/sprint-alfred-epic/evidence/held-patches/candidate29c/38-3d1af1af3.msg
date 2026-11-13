docs(adr): align ADR-0096 with the built walk, early readback and bundle item

The walk follows the first-parent history and counts a merge against its
first parent (the ADR said merges were not walked). It names the
trust-anchor bootstrap proof, the exempt-field rule for
pipeline.user.yaml and the dated Spec folder range. The early readback
is the read-only close-coordinator gate-changes command the one-shot
close asks before Verify. The bundle item is gate-changes; the Critic
gets no list, because a handed list is a hunt list its contract forbids
(ADR-0014). The acknowledgement record is device-local like the other
critical approvals; its proof object travels in the bundle.

AI-Assisted: true
Dispatch: stage-0 (elephant)
