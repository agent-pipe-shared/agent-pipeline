# Nova-B final-candidate signature scope

The final ceremony uses two separately prepared, candidate-bound approvals.

The `sprint-nova-epic` approval covers the public governance-event boundary,
private human-authority audit and recovery, runner role dispatch including the
Advisor prohibition and AGY native coordinator, continuity self-repair, and the
inventory-bound CI public failure reporter. Its machine model is
`specs/sprint-nova-epic/implementation/nova-b-final-threat-model.json`.

The `nova-b-ci-privacy` approval is the attributed data-privacy review for the
human-name flow. The approving human acts in the privacy-reviewer role for this
ceremony. It confirms that `humanName` stays in the existing private external
authority request/receipt flow and that portable governance events and CI
failure output contain only closed, redacted, digest-bound fields. Its machine
model is
`specs/sprint-nova-epic/implementation/nova-b-privacy-threat-model.json`.

Both approvals use the repository's threat-model signing primitive because it
is the available candidate-, plan-, Spec-, model-, and external-authority-bound
proof carrier. The second proof remains honestly typed `threat-model`; this
document records its narrower reviewer purpose and does not claim a distinct
cryptographic `privacy-reviewer` kind that the current CLI does not implement.
Any commit or tree movement after preparation makes both approvals stale and
requires new requests.
