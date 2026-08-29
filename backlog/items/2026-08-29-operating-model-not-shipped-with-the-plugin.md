---
schema: pipeline.backlog-item.v1
id: pipeline.operating-model-not-shipped-with-the-plugin
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: 39454abc446f4b8d0e578598f4536d272305c987
closure_evidence: harness/scripts/generate-vendored-canon.test.mjs
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

## Re-verified, 2026-08-29 (before dispatch)

The item's own proposal — vendor the file — collides with a prior, deliberate,
documented decision: `harness/scripts/generate-vendored-canon.mjs`'s
`SELF_ONLY_EXCLUSIONS` table already lists `docs/operating-model.md` by name,
with a stated rationale: "the artifacts actually handed to a hosted-project
agent are guardrails/roles/templates themselves, not this meta-document about
how the Pipeline assembled them." The original triage confirmed only that the
file is absent from the vendored output — it did not surface that the absence
is intentional, on record, with a reason.

That rationale is sound in principle but is contradicted by fact: the vendored
`roles/*.md` and `guardrails/*.md` files themselves cite
`docs/operating-model.md` as their own stated normative source for precedence
and rationale, not as an incidental cross-reference — so "the vendored
artifacts are self-sufficient" is not true today, whatever the design intent
was.

**Decision:** vendor the file (the item's original proposal), rather than
rewriting citation content across every citing role/guardrail file — the
latter is a much larger, riskier edit to authoritative normative text for the
same outcome. This narrows to two additive changes: add
`docs/operating-model.md` to the vendored-canon generator's inclusion set, and
remove its now-inconsistent entry from `SELF_ONLY_EXCLUSIONS` (leaving a table
that says "self-sufficient" next to vendored files that demonstrably are not
would itself be a defect). No ADR is warranted — this corrects a
classification against evidence the classification's own stated premise no
longer holds, it does not introduce a new governance decision.

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

## Closure, 2026-08-29 (dispatch NVA-R13-VENDOROPMODEL)

All three Acceptance criteria met, across five commits (`39454abc`,
`083ed4de`, `69898279`, `1f21e719`, plus this note):

- `plugins/pipeline-core/docs/operating-model.md` now exists, vendored
  byte-identically via `generate-vendored-canon.mjs`'s
  `UNIVERSAL_STANDALONE_FILES` (moved out of `SELF_ONLY_EXCLUSIONS`, per the
  "Re-verified" decision above).
- The now-resolvable ADR 0005 `../operating-model.md` dead-link exclusion in
  `check-doc-contracts.mjs` was removed; a new exclusion was added for
  `operating-model.md`'s own three links that don't survive vendoring
  (`../README.md`, `../PIPELINE_FLOW.md`, `../SETUP.md`,
  `adr/0021-prd-po-gate.md`).
- `check-section-citations.mjs` gained a new check asserting every vendored
  `roles/*.md`/`guardrails/*.md` citation of `docs/operating-model.md`
  resolves to the real vendored file — closing the dangling-pointer class
  generally, not only for this one file, per the third Acceptance criterion.
- `check-consumer-safe-paths.mjs` gained two allowlist entries for
  `operating-model.md`'s own inherited `harness/` mentions (EN + DE
  reference translation), same class as the pre-existing vendored-canon
  entries.

Verified by the dispatcher directly, on the merged state: `generate-
vendored-canon.test.mjs` 8/8, `check-doc-contracts.test.mjs` 45/45,
`check-section-citations.test.mjs` 17/17 (including the two new AC-covering
tests by name), `check-consumer-safe-paths.test.mjs` 9/9 — all exit 0.

The dispatch itself truncated at its 50-turn harness limit mid-work with
nothing committed, then was resumed (correctly, via SendMessage with full
context preserved — an earlier resume attempt in this session mistakenly
used a fresh Agent call instead, losing context, though it still finished
correctly) and got everything to a green, verified, but uncommitted state,
blocked by a since-cleared GG-22 ledger debt on an unrelated item
(`2026-08-27-phoenix-merge-re-critic-minor-findings.md`'s
`closure_evidence`, itself broken by the same stray-comma parser defect the
`pre-push-hook-is-offered-not-installed` item hit earlier the same session).
The dispatcher landed the five commits above once that debt was cleared.
