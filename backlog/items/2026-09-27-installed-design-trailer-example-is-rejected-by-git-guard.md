---
schema: pipeline.backlog-item.v1
id: pipeline.installed-design-trailer-example-is-rejected-by-git-guard
type: defect
owner: pipeline
status: open
created: 2026-09-27
source: "Codex greenfield review B3 and independent 2026-09-27 self-application: installed obligations print `Dispatch: design (elephant)`, active Git guard rejects it."
sprint: alfred
done_when: manual
---

# Installed obligations teach a direct-design trailer that the Git guard rejects

## Description

The installed Agent Obligations and their generator recommend
`Dispatch: design (elephant)` for direct Elephant design documents. The active
Git guard and `guardrails/git.md` reject that form as
`GIT-03-DISPATCH-MALFORMED` and admit `Dispatch: stage-0 (elephant)` instead.
Stage-0's narrow implementation exception is not an accurate provenance
description for a broad design package. The earlier item
`2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits.md`
was closed on verifier/generator evidence, but the live commit boundary still
contradicts it.

## Triggering situation

The 2026-09-27 Codex greenfield run and two rejected local commit attempts
while preserving Alfred reader/AC evidence. A stage-0-marked commit was
admitted; that is a workaround, not proof the intended design form works.

## Affected artifact

`harness/scripts/generate-agent-obligations.mjs`, both generated Obligations
copies, `guardrails/git.md`, Git command and commit-msg guards, and
`dispatch-authorship-verify.mjs`.

## Proposal

Use one authoritative trailer grammar for generated instructions, guard
admission and authorship verification. Admit the direct-design form only for
its actual allowed paths and phase, and make the printed command example pass
the installed Git command guard. Do not relabel design work as stage-0 merely
to obtain a commit.

## Acceptance

- A real installed-hook test runs every printed commit example through the
  command guard and commit-msg backstop; each admitted example is accepted.
- `Dispatch: design (elephant)` is accepted for a legitimate direct-design
  commit and rejected for production implementation files.
- Verifier, generator and guard share the same classification, including
  commits made during an approved feature's implementation phase that only
  add documentation or evidence.
- Existing local stage-0-labeled design evidence commits are explicitly
  dispositioned as provenance debt; their history is not silently rewritten.

## Triage
