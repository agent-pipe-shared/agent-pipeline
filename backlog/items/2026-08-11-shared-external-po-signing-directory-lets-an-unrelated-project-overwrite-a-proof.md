---
schema: pipeline.backlog-item.v1
id: pipeline.shared-external-po-signing-directory-lets-an-unrelated-project-overwrite-a-proof
type: defect
owner: pipeline
status: closed
created: 2026-08-11
source: "docs/state.md 'Current block' section (0.5.4 release session, 2026-08-10): 'The external PO-signing directory (~/agent-pipeline-po-nova) is also shared with an unrelated parallel test project, which overwrote the first signed request/proof mid-ceremony; the PO re-signed and it was consumed immediately.' Noted there as not yet filed."
closed_at: 2026-08-11
closure_repository: self
closure_commit: 256033ebdc80ae5055e3fdfe96a8492d18a34c04
closure_evidence: backlog/evidence/2026-08-11-po-keydir-01-landed.md
---

# A shared external PO-signing directory lets an unrelated project overwrite a signed proof mid-ceremony

## Description

During the 0.5.4 release signing ceremony, the external PO-signing directory
`~/agent-pipeline-po-nova` (outside this repository, holding the human's
Ed25519 key material and the request/proof files exchanged with
`po-human-approval.mjs`/`approve-push`) turned out to be shared with an
unrelated parallel test project on the same machine. That other project
overwrote the first signed request/proof file mid-ceremony. The PO had to
re-sign, and the second proof was consumed immediately — the release still
landed correctly, but only because the collision was noticed and re-signed
live, not because anything prevented it.

## Triggering situation

0.5.4 main-release signing ceremony, 2026-08-10 (see `docs/state.md`,
"Current block" section, paragraph starting "The release-signing ceremony
itself hit two real bugs, both fixed live").

## Affected artifact

The external PO-signing directory convention itself (`po-human-approval.mjs`,
the request/proof file exchange it defines) and, transitively, the
`poKeyDirectory` resolution this directory is named through (see the related,
already-filed
`backlog/items/2026-08-10-po-key-directory-default-should-be-repo-scoped-not-machine-wide.md`
— that item is about the *machine-wide default* being wrong; this item is
about the *directory itself* being reused across unrelated projects/ceremonies
at all, which is a real collision even with a correct default).

## Proposal

No fix attempted yet — filed as observed. A plausible direction: request/proof
filenames should be bound to something project- and ceremony-specific (e.g. a
repository fingerprint and/or the exact candidate commit, already used
elsewhere in this codebase as `poGateAuthority.repositoryFingerprint`) rather
than a fixed, reusable filename in a directory a human might point two
different projects at. Needs a decision on whether the fix belongs in
`po-human-approval.mjs` (request/proof naming) or is fully subsumed once the
repo-scoped-directory item above is implemented (a correctly repo-scoped
directory per project would not, by itself, prevent a human from *choosing*
to point two different projects at the same directory — so this may remain a
real gap even after that fix lands).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept-defer, then superseded same day — accept-fix once the
  PO reviewed the design question directly.
- **Rationale:** initially triaged accept-defer (the fix touches the signing
  ceremony, which the PO had asked to hold back generally). Superseded a few
  turns later, 2026-08-11, when the PO was presented this exact open design
  question ("Proof-Dateinamen an Repo/Kandidat binden" vs. "erst den
  Key-Dir-Scope-Fix abwarten" vs. "zurückstellen") and picked the first
  option explicitly, overriding the general hold-back for this specific,
  now-decided item.
- **Assignment:** PO-KEYDIR-01 (`goldfish-deep`), combined with the related
  `2026-08-10-po-key-directory-default-should-be-repo-scoped-not-machine-wide.md`
  fix in one dispatch (same file, adjacent concerns — two parallel dispatches
  would have guaranteed a cherry-pick conflict). Landed `8a04490d` in an
  isolated worktree, cherry-picked onto `feat/sprint-nova-codex-v046` as
  `256033eb`. Request/proof/signature/intent/signer filenames now carry a
  short repository-fingerprint segment (`derivePoGateRepositoryFingerprint`,
  reused rather than a new scheme); private/public key and trust-policy
  files stay unsuffixed, unchanged, still shared per human identity. Target
  suite re-verified directly against the integrated commit: `node --test
  plugins/pipeline-core/scripts/po-human-approval.test.mjs` → 48/48, exit 0.
- **Date:** 2026-08-11
