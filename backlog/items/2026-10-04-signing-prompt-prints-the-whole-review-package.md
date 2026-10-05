---
schema: pipeline.backlog-item.v1
id: pipeline.signing-prompt-prints-the-whole-review-package
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "PO observation, native Windows PowerShell, 2026-10-04, po-human-approval.mjs sign-intent for the Alfred revision-4 design-workflow package."
sprint: alfred
done_when: manual
---

# The signing prompt prints the whole review package to the terminal

## Description

`po-human-approval.mjs sign-intent --request <design-workflow-approval-request>`
prints the complete bounded review material before the passphrase prompt: all
five source documents verbatim, the initial consultation, the Advisor failure,
the proposed exception and the full readiness receipt. For the Alfred package
this was roughly 100 KB of terminal output. The PO reported (verbatim): "das ist
doch viel zu viel output um mit halbwegs guter UX auch kopiert zu werden, dass
müssen wir besser machen".

The prompt also takes very long before the passphrase appears. The likely
cause is that every request describer is tried in turn before the disclosure
(Git-guard override, bootstrap acknowledgement, authorship, Critic export,
design-workflow package, inherited sources, model family), and the
design-workflow path re-verifies the whole package (process review PF-14).
To be measured and fixed together with the output size.

The decision-relevant facts fit on one screen: intent digest, action, feature,
package path and digest, candidate commit/tree, PRD/Spec digests, readiness
outcome, the Advisor exception (if any) and the open PO choices. The success
JSON after signing repeats paths the PO does not need to copy.

## Triggering situation

Final design approval ceremony, 2026-10-04.

## Affected artifact

`plugins/pipeline-core/scripts/po-human-approval.mjs` (`sign-intent` review
rendering); the same pattern likely applies to the push-approval and override
signing prompts.

## Proposal

- Print a compact, fixed-shape confirmation block (at most ~25 lines) with the
  digests and decision facts above.
- Write the full bounded review material to a file next to the request and
  print its path and sha256; the signed intent still binds the full material,
  so nothing the PO approves becomes less bound.
- Dispatch on the request schema to exactly one describer, validate the
  package once, and print a progress line immediately.
- Keep the post-sign output to one short line (status and proof path); the
  agent reads the proof from its known location, the PO copies nothing back.
- Test the rendered line count and that the file's digest equals the bound
  review material digest. Apply the same rule to every PO-facing signing
  command (R3-5, design-input #16).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

## Observed again 2026-10-05

PO, 2026-10-05, on the `sign-intent` confirmation text (verbatim, German):
"dieser text läßt einen auch jedes mal mit staunen zurück … kann man sich
sparen". For a `pipeline.signed-quality-package.v1` request the confirmation
prints HGO-RECORD-DIGEST-MISMATCH and says it "signs a one-time
guard-lift/guard-override ... for whatever was recorded against this exact
digest elsewhere": the wrong kind of request, and no description of what is
signed. It must recognise the request it was given and show its members,
paths and base commit. Signing also took about 4 minutes wall-clock; measure
where the time goes. See also
`2026-10-04-signed-quality-package-route-is-not-agent-operable-on-windows.md`.
