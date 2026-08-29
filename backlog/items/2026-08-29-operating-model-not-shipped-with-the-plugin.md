---
schema: pipeline.backlog-item.v1
id: pipeline.operating-model-not-shipped-with-the-plugin
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: path-exists plugins/pipeline-core/docs/operating-model.md
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md §5.6), cited by scratch/greenfield-triage-2026-08-29.md finding F21, observed during the 2026-08-29 three-runner greenfield test."
---

# `docs/operating-model.md` is not shipped with the plugin, yet every role/guardrail cites it as normative

## What happened

`docs/operating-model.md` lives at the control repository's root and is
cited as the normative source by every `roles/*.md` file and every
`guardrails/*.md` file. It is not part of the vendored subset that ships to
consumer projects with the plugin. In a consumer project, every one of those
citations is a dangling pointer to a file the session cannot read.

## Where it is

Confirmed directly:

- `plugins/pipeline-core/docs/` exists and ships a curated ADR subset
  (`plugins/pipeline-core/docs/adr/0003-*.md` through `0074-*.md`, 18 ADRs)
  plus two standalone docs (`default-push-threat-model.md`,
  `push-release-flow.md`) — but **no `operating-model.md`**.
- `plugins/pipeline-core/roles/elephant.md`, `goldfish.md`, and `critic.md`
  (the vendored role copies that DO ship) each open with: "Normative source:
  `docs/operating-model.md` — *Roles and boundaries*" (or equivalent) — a
  path that, inside a consumer project checkout, resolves to nothing,
  because only `plugins/pipeline-core/...` is vendored there, not the
  control repository's own `docs/` tree.
- `plugins/pipeline-core/guardrails/*.md` (`global.md`, `git.md`,
  `security.md`, `quality-gates.md`) each cite `docs/operating-model.md`
  repeatedly (confirmed via grep: 8+ citations across the four files) as the
  authoritative source for precedence, verification method, and rationale —
  every one of these is a dangling pointer in a consumer project.

## Proposal

Ship `docs/operating-model.md` itself (or the sections it defines that the
vendored `roles/`/`guardrails/` actually cite) as part of
`plugins/pipeline-core/docs/`, alongside the already-vendored ADR subset —
following the exact pattern already established for the 18 vendored ADRs.
Given `docs/operating-model.md`'s size and centrality (cited by literally
every vendored role and guardrail file), it should be a first-class vendored
doc, not folded piecemeal into individual role files. Once shipped, the
existing citations in `plugins/pipeline-core/roles/*.md` and
`plugins/pipeline-core/guardrails/*.md` resolve correctly with no further
edit needed, since they already use the repo-relative path
`docs/operating-model.md`.

## Acceptance

- `plugins/pipeline-core/docs/operating-model.md` exists after a rsync/plugin
  sync from this control repository (the vendoring step that currently
  copies the ADR subset must be extended to include this file, or it must be
  added to that step's manifest — whichever mechanism currently selects the
  18 ADRs for vendoring).
- In a fresh consumer-project checkout with only the plugin installed (no
  access to the control repository root), a citation such as
  `docs/operating-model.md` — *Roles and boundaries* resolves to a real,
  readable file at that path.
- A test or check asserts every `docs/operating-model.md` citation inside
  `plugins/pipeline-core/roles/*.md` and `plugins/pipeline-core/guardrails/
  *.md` resolves to a real path once vendored, closing this specific
  dangling-pointer class for good rather than only for this one file.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Directly confirmed by inspecting `plugins/pipeline-core/
  docs/`'s actual contents against the citations in the vendored `roles/`
  and `guardrails/` files — every cited path is genuinely absent, not a
  runner misreport.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate — every
  vendored role and guardrail file cites this document as its own normative
  source; shipping the plugin without it means the pipeline's own contract
  documents point at nothing in every consumer project.
- **Date:** 2026-08-29
