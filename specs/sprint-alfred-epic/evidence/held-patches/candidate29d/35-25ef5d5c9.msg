feat(pipeline-state): configure-verify --replace replaces the verify command with one approval

ADR-0100: in the 28d test round a verify-command change took two
signed overrides, two 570 s proof waits and a Critic major (EL-01).
- configure-verify --verify-command <new> --replace --by <label>
  during an implementing lifecycle: test run first, then the signing
  request (pipeline.verify-replacement-signing.v1 with recordCommand);
  with the proof it stores the approval, writes exactly the signed
  post-images through the commit transition and prints the commit with
  the subject "chore: replace project verification command". In chat
  mode the approval is chat-attributed and labelled.
- Without --replace the configured-tier refusal is unchanged and now
  names the replace route; the GS-10/GS-11 guard refusal names it too
  instead of two overrides.
- The waiver reader is injectable (criticalProofWaiverForFn) so a
  chat-approved fixture can run the signature leg.
- The human terminal action catalog and the authorization inventory
  list the new gate.

AI-Assisted: true
Dispatch: stage-0 (elephant)
