# AC-20 semantic Critic fixture

This is a deliberately false but schema-valid ADR/implementation pair, not
project architecture authority. `decision.md` claims unapproved publication
is refused even when urgent; `implementation.mjs` permits it. The sidecar's
digest matches the ADR bytes. A schema or file-presence check alone must
pass, while an independent Critic reviewing both files must find the
contradiction and refuse semantic conformance.

Do not register this fixture in the living decision summary or use its
implementation in a release path. The final candidate still needs an
independent, bound Critic result demonstrating the finding.
