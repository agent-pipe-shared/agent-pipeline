---
schema: pipeline.backlog-item.v1
id: pipeline.agent-never-asks-po-for-key-directory-invents-one-instead
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "PO live observation, 2026-08-10, during the Claude Code greenfield test: 'er hat das key verzeichnis im setup nicht nachgefragt aber denkt sich jetzt die ganze zeit was aus.'"
---

# Nothing tells the agent to ASK the PO for the external key directory; when it is missing, the agent guesses instead

## Description

`po-human-approval.mjs setup` needs an external, outside-the-repository key
directory (`--directory <external-po-dir>`, per
`references/push-approval.md`'s "The human's one command" section). In a
live Claude Code test, the agent reached the point of needing this value
without ever having asked the PO for it during setup — and instead of
stopping to ask, it kept inventing/guessing a directory value on its own
across multiple attempts ("denkt sich jetzt die ganze zeit was aus").

This is distinct from the already-filed repo-vs-machine-scope item
(`2026-08-10-po-key-directory-default-should-be-repo-scoped-not-machine-wide.md`):
that item assumes a real directory value was established once via an
explicit `setup --directory <dir>` call and is about WHERE that value is
remembered afterward. This item is upstream of that: the value was never
established via an actual PO answer in the first place, and nothing in the
agent's instructions treats a missing key directory as a stop-and-ask
condition the way, for example, kickoff's goal/profile/language values are
already treated.

## Triggering situation

Live PO observation, 2026-08-10, during the same Claude Code greenfield
test session already mined for several other findings this session
(kickoff CLI friction, resume-hint handling, PRD/Spec depth). Reported
standalone, with visible frustration at the agent inventing values rather
than stopping to ask.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/references/push-approval.md` —
currently describes the `--directory` flag and its resolution precedence
("supplied with `--directory`, or resolved from the machine-scoped
configuration plane, or from the documented environment variable") but
never states what the agent should do when NONE of those three resolve: ask
the PO once, explicitly, the same way kickoff already asks for goal/profile/
language rather than silently degrading to invented output. Also possibly
`po-human-approval.mjs setup` itself, if it currently accepts a missing/
absent `--directory` and proceeds with some invented or defaulted value
instead of failing with a clear "the external key directory must be
supplied; ask the PO where their PO key material should live" message.

## Proposal

No fix designed yet. Direction: add an explicit instruction to
`push-approval.md` (or wherever the agent first needs this value) that a
missing key directory — not resolvable from `--directory`, the machine
plane, or the environment variable — is a stop-and-ask condition, phrased as
a real question with context (what this directory is for, that it lives
outside the repository, what happens if it's lost), mirroring how kickoff's
profile/language questions are already specified as blocking questions
rather than left to inference. Verify `po-human-approval.mjs setup`'s own
behavior on a genuinely missing `--directory` first (does it fail cleanly
today, or does it silently default/invent something?) before writing the
fix, since the two have different remedies.

## Triage (filled in by the Elephant of the next Pipeline session)
