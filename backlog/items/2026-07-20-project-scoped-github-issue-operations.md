---
type: workflow-improvement
status: new
created: 2026-07-20
source: user-requested feature expansion after the first public observation publication
owner: Pipeline Elephant
due: 2026-08-10
expires: 2026-08-17
---

# Provide project-scoped GitHub issue operations

## Description

When a user develops a separate web project with Agent-Pipeline, the pipeline
should be able to work with that project's GitHub Issues after the user has
authenticated locally. The current `capture-observation` path is deliberately
restricted to the Public Core observation repository and must not be widened
implicitly; general project issue work needs its own target, permission, and
mutation contract.

## Affected artifact

The project-scoped GitHub integration, its authentication/readback adapter,
issue-operation skill, user documentation, and the target/permission safety
tests. The public observation intake remains a separate repository-global
workflow.

## Proposal

Add a project-scoped issue-operations capability that:

- resolves the target repository from explicit user selection or a validated
  project remote and displays the resolved `owner/repo` before any write;
- uses the user's locally stored `gh` authentication and never asks for or
  stores a token in chat, the repository, issue bodies, or machine evidence;
- verifies login, target repository, and available metadata/issue access before
  performing work, with typed setup or permission failures;
- supports read/list/search plus create and narrow edit operations for issue
  title, body, labels, and other explicitly approved fields;
- previews the exact mutation and requires an explicit confirmation before
  each write or an explicitly confirmed batch;
- forbids delete, transfer, repository settings, permission changes, and
  silent close/relabel operations unless a separately approved capability is
  added;
- reads every mutation back and requires exact target, issue number, changed
  fields, and stable URL before reporting success; and
- documents the safe `gh auth` setup, fine-grained PAT permissions, target
  selection, examples, and failure handling under `docs/`.

## Acceptance criteria

- A consuming project can verify local GitHub login and its selected target
  without exposing credentials or private coordinates.
- Read, create, and edit operations are target-bound, previewed, confirmed,
  and read back; a failed or mismatched readback is not success.
- The Public observation skill still rejects arbitrary target remotes and
  continues to use its fixed public-repository/privacy contract.
- Positive and negative tests cover missing login, missing issue permission,
  wrong repository, target drift, unsupported mutation, confirmation refusal,
  and readback mismatch.
- The user guide is linked from the documentation map and describes the
  minimum repository-scoped permission set.

## Ownership and expiry

The next Pipeline Elephant owns triage and an accepted implementation package.
The triage due date is **2026-08-10**. If no decision is recorded by
**2026-08-17**, this item expires and must be renewed with current Public
evidence before implementation or prioritization.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
