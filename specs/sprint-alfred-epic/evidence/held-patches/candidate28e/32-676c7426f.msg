feat(design): approve a Spec addendum in the configured human-approval mode (ADR-0095)

The PO's approval of one Spec addendum, through the existing critical
approval route: the signing terminal and the recording step derive the
subject from the repository with the one builder of lib/spec-addendum,
so a printed line and the verb that consumes its proof cannot disagree.

- scripts/pipeline-state.mjs approve-spec-addendum --by --addendum:
  mode from gates.human_approval (signature, or a chat-attributed record
  with the label the PO gave); without a proof it prints the signing
  line and the follow-up recordCommand (scratch mirror, like the
  acknowledgement); with one it verifies, refuses a replay, stores the
  approval privately and writes the committed record
  specs/<feature>/evidence/spec-addendum-approval-<sha256>.json, then
  names the registration step
- scripts/po-human-approval.mjs: kind spec-addendum for prepare- and
  authorize-critical with --addendum (no --subject); the subject is
  rebuilt from HEAD and must be the clean candidate; the confirmation
  states the addendum, the unchanged base Spec, the packet and findings
- lib/critical-action-approval-request.mjs, lib/critical-action-
  authorization.mjs: the kind and its private store slot; always
  proof-required in signature mode; local scratch mirror admitted

Tests: critical-action-signature-round-trip.test.mjs (library, printed
line, verb leg on a real repository, consumer leg: print, sign, record
once, replay refused) 31/31; po-human-approval and authorization suites
220/220 plus the restated kind list.

AI-Assisted: true
Dispatch: stage-0 (elephant)
