---
schema: pipeline.backlog-item.v1
id: pipeline.setup-promises-a-human-name-repair-it-cannot-perform
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: dd1eb9eedeb7ac48860c8ec9745750c9a8367b32
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-09
source: "Hit live on 2026-08-09 PO-nova machine while signing the PUSHWARN-1/PG11e-FLAKE TP-5 override: `sign-intent` failed with \"external trust policy does not match the local public key\" against a PO key directory whose key and repo binding were both actually correct."
due: 2026-08-16
---

# `setup`'s own error message describes a repair that the code does not perform

## What happens

`signIntentIntoProof()` (`plugins/pipeline-core/scripts/po-human-approval.mjs`),
the single signing step shared by `sign-intent`, `approve` and `approve-critical`,
requires the local `trust-policy.json` to carry exactly three fields —
`keyReference`, `publicKeySha256`, `humanName` (SETUP-1, this session) — and fails
with `"external trust policy does not match the local public key"` if it does not,
even when the key material itself is entirely correct and the two `own()`-checked
identity fields already match.

A PO key directory created *before* SETUP-1 has only the first two fields. Its
`setup` command has a branch for exactly this case
(`present.privateKey && present.publicKey && present.authority`, `!namedShape`)
that fails with:

> `existing PO authority record predates --human-name and has no name recorded;
> run setup again with --human-name "<the human this key's approvals will be
> attributed to>" to add one.`

But nothing in that branch — nor anywhere else in `setup` — ever reads
`args.humanName` and rewrites `trust-policy.json` when authority is *already
present*. The two branches that DO write an authority record
(`!present.authority` at all, or fresh generation) only fire when no authority
file exists yet. Running `setup` again exactly as instructed re-enters the same
branch and fails identically. The message promises a working repair path that is
not implemented.

## Measured

On the PO-nova machine, `trust-policy.json` held `{keyReference,
publicKeySha256}` only (predating SETUP-1). `sign-intent` refused. Both
`po-public.pem`'s actual SHA-256 and the file's own recorded `publicKeySha256`
were independently confirmed to equal this repo's committed
`project/critical-human-proof.json` → `trustAnchor.publicKeySha256` — the failure
was purely the missing third field, not a key or binding mismatch. Re-running
`setup --human-name "..."` would have hit the same `!namedShape` branch and
failed the same way, since that branch never inspects `args.humanName` at all.

## Why it matters

Low blast radius but real: every PO key directory created before this session's
`--human-name` change will hit this on its *next ordinary push/deploy/publication
approval* (`approve`/`approve-critical`), not only on the rarer `sign-intent`
path — all three route through the same `signIntentIntoProof()`. For this repo
specifically (two machines, per CLAUDE.md), the other machine's directory may
carry the same legacy shape and will fail identically the next time it approves
anything there, with no working self-repair — only a misleading one.

## Direction

Either give the `present.authority && !namedShape` branch of `setup` an actual
write path — when `args.humanName` is supplied, rewrite `trust-policy.json` to
`{...existing 2-field record, humanName: args.humanName}` (identity fields
untouched, so nothing re-verifies against a changed key) — or, if a rewrite of an
existing authority file is deliberately out of scope, correct the failure message
itself to stop promising a "run setup again" path that does not exist, and instead
name the exact manual edit (see workaround below).

## Workaround used (safe, no code change, applies per-directory)

`trust-policy.json` is not secret (it recorded the SAME `publicKeySha256`
already, mode 644 in the observed case) and adding a third field does not affect
the identity check at all (`own()` checks the key SET, `publicKeySha256`
comparison is unchanged). A human can hand-edit it directly:

```json
{
  "keyReference": "local-po-key",
  "publicKeySha256": "<unchanged>",
  "humanName": "<the human's name>"
}
```

No cryptographic material is touched. This is what unblocked PO-nova today.

## Why it is filed rather than fixed now

Discovered mid-flow while clearing an unrelated TP-5 override; the fix belongs to
`po-human-approval.mjs`/its test file, neither of which is TP-protected, but
fixing it now would have been unbriefed scope creep on top of the actual task in
progress. Not urgent: the manual workaround above is safe, quick, and per-machine
(at most one other affected directory for this repo).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Closed (2026-08-11) — fixed.
- **Rationale:** `setup`'s `present.authority && !namedShape` branch now writes `humanName` into `trust-policy.json` when supplied, giving the promised repair a working code path per the item's first Direction option (`closure_commit` `dd1eb9eedeb7ac48860c8ec9745750c9a8367b32`).
- **Assignment:** N/A — already closed.
- **Date:** 2026-08-11.
