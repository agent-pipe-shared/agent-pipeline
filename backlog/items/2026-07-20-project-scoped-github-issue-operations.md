---
schema: "pipeline.backlog-item.v1"
id: "pipeline.project-scoped-github-issue-operations"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
created: "2026-07-20"
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "5d5153e594f8e3c4bcbb6b7c748f4ab28faa0373"
closure_evidence: "plugins/pipeline-core/scripts/github-issue-operations.test.mjs"
source: "user-requested feature expansion after the first public observation publication"
due: "2026-08-10"
expires: "2026-08-17"
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

- **Renewal (2026-08-18):** expired 2026-08-17, never triaged — found
  during a systematic sweep for the same expired-unread-item pattern
  caught repeatedly tonight. Renewed with current evidence.
- **Decision:** accepted, closed. The described capability was already
  built (`plugins/pipeline-core/skills/github-issue-operations/`,
  `plugins/pipeline-core/scripts/github-issue-operations.mjs`,
  `docs/github-issue-operations.md`) and substantially matched this item's
  Proposal/Acceptance criteria. A dedicated Critic review
  (`00fcc336..8ae6567e`) found one real major gap: `validateIssueReadback()`
  never checked the "stable URL" the Acceptance criteria, `SKILL.md` step
  6, and `docs/github-issue-operations.md` all required — **FAIL**. Fixed
  as `NVA-GHOFIX-1` (commit `5d5153e5`): reproduce-first (RED confirmed:
  `GHO-READBACK-URL expected, got undefined`), a new `GHO-READBACK-URL`
  check deriving and requiring the exact `https://github.com/<owner>/<repo>/issues/<number>`
  form, plus repair of two pre-existing test fixtures that would otherwise
  have silently mis-asserted after the new check's insertion point. A
  fix-verification Critic re-review (`9ce8901b..5d5153e5`) returned
  **PASS, no findings** — independently re-ran the suite (5/5) and traced
  the fix's check placement relative to the existing validation order.
- **Rationale:** the capability was real and mostly correct; the one real
  gap the review found was fixed and independently re-verified before
  closing, rather than closed on the strength of "mostly implemented."
- **Assignment:** closed, no further work.
- **Date:** 2026-08-18
- **Cross-branch note:** a separate, independently run PO-requested audit
  of `in_progress` backlog items on another line of development reached
  the same "closed — implemented" conclusion on 2026-08-19 by reading
  `skills/github-issue-operations/SKILL.md` and
  `scripts/github-issue-operations.mjs` against the acceptance criteria
  (target resolution with `owner/repo` display, local `gh` auth with no
  token exposure, typed setup/permission failures, narrow create/edit,
  preview + confirmation, mandatory readback with `publish-unverified` on
  mismatch, `docs/github-issue-operations.md` setup docs, and
  `github-issue-operations-tests` registered in `verify.mjs`). That audit
  did not have visibility into the `GHO-READBACK-URL` stable-URL gap
  found and fixed above; the frontmatter above (commit `5d5153e5`)
  reflects the more complete, Critic-re-verified closure and is kept as
  the record of truth for `closure_commit`/`closure_evidence`.
