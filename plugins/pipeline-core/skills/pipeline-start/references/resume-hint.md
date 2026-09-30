# Material input across restart and resumed intake

Load when material design input arrives after kickoff, before any restart,
session cut or Compact after kickoff, or when `resume-hint.mjs inspect` reports
an available card. This is a capture and consumption duty, never a new
readiness gate.

The pre-restart guard admits exactly one command shape: card at
`<root>/project/.resume-hint-input.json`, `--consume-card`, no extra flags.
Write the card first. A ready session may use any `--card-file <json>`.
Read back `resume-hint.mjs inspect` after capture. In the next session read
`project/resume-hint.json` in that same turn and incorporate its intent,
constraints, scope and questions before the bootstrap confirmation. Surface
a failed read honestly; `absent`, `challenged-stale`, and `ignored-invalid`
never change readiness, action, authority, approval, close state or exit status.

The core card has `intent` as one string and `constraints`, `scope`, and
`questions` as arrays of short strings, at most 4, 4 and 3 entries. Every
entry is distilled, not a transcript. Intended restart/session cut captures
material input; changed scope or constraints refresh it; canonised or revoked
information is discarded. Do not capture raw transcripts, commands,
approvals, lifecycle instructions, host paths, URLs, credentials, secrets or
private identifiers. The validator rejects those forms.

The same guard-admitted card accepts OPTIONAL top-level `materialInput`, an
array of the user's own material design input, one verbatim, unbounded,
possibly multiline entry per chunk. It is additive; the distilled core keys
retain their caps. `materialInput` is exempt from the 4/4/3 short-string caps
and 480-byte line limit so it can contain a user-authored document. It is
still screened for credential, secret, host-path, URL and private-identifier
shapes; a failing chunk persists nothing.

The same shape accepts `values`, an object of already-answered onboarding
input: commit-author name and email, operator-facing language and PO profile.
It persists to the onboarding intake checkpoint, not to
`project/resume-hint.json`; later capture never overwrites an answered value.
The author is still written via local `git config user.name` / `user.email`
only immediately before the first commit, never sooner.

When `resume-hint.mjs inspect` reports material-input chunks or answered
values at the start of the next session, read them in that same turn and use
them; never re-ask answered values. A failed or skipped read must be surfaced.
This remains a consumption duty, never a readiness precondition.

On resumed intake, checkpoint-origin material chunks are the original
product-material record: retain their bytes and capture order, do not
recapture an existing chunk merely to satisfy a tool ritual, and keep
answered onboarding values separate from product requirements. When only a
recovered summary is available while drafting, label it as a recovered
summary with its available source pointer; never manufacture a verbatim
`materialInput` chunk from that summary. If requirements remain uncertain,
collect the specific missing confirmation together rather than silently
substituting settings as requirements. Follow the current returned
`nextAction` from onboarding inspection; do not add `pipeline-state inspect`
or an Operating Model hash as an unavailable pre-binding prerequisite.
State/authority orientation follows ready binding.
