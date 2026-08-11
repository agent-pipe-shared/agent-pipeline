---
schema: pipeline.backlog-item.v1
id: pipeline.plugin-package-should-vendor-canon-references-via-build-step
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-10
due: 2026-08-24
source: "PO decision, 2026-08-10, on the plugin-packaging gap confirmed the same day (backlog item / commit tracking the quick copy-fix pending): 'jetzt a) und c) für später festhalten es sauber zu machen' — a direct copy now, this item tracks doing it properly afterward."
---

# Vendor `templates/`, `roles/`, `guardrails/`, and `docs/push-release-flow.md` into the plugin package via a generated build step, not a manual copy

## Description

Confirmed 2026-08-10 by inspecting a real installed plugin cache directly
(`~/.codex/plugins/cache/agent-pipeline-local/pipeline-core/<version>/`):
the distributed plugin package contains no `templates/`, `roles/`, or
`guardrails/` directory at all, and its bundled `docs/` contains only
`default-push-threat-model.md` — `push-release-flow.md` is absent too. Every
canon reference `SKILL.md` files and hook-code comments point to by a
repo-root-relative path (`templates/prompts/agent-obligations.md`,
`roles/*.md`, `guardrails/*.md`, `docs/push-release-flow.md`) is therefore
unreachable for any session working in a hosted/consumer project that only
has the plugin installed — the whole "Dispatch from the template, never
freehand" hard rule (CLAUDE.md) is structurally unsatisfiable there, not
just poorly documented.

A direct, one-time copy of these directories into the plugin package was
authorized the same day as an immediate fix (tracked in the fix commit, not
this item). This item tracks doing it PROPERLY afterward: a generated build
step, analogous to the existing precedent `templates/prompts/agent-obligations.md`
already sets (a file explicitly documented as "GENERATED from the guards
themselves," via `harness/scripts/generate-agent-obligations.mjs`) — so the
repo-root originals stay the single source of truth and the plugin package
always ships a synced, current copy, rather than a manually-copied snapshot
that can silently drift from its source the moment either side is edited
without the other.

## Triggering situation

PO decision, 2026-08-10, while triaging a batch of findings from two live
greenfield happy-path tests. The PO explicitly separated "do a quick copy
now" from "do it properly later" rather than accepting either the quick fix
as sufficient or a full build-step redesign as this candidate's scope.

## Affected artifact

Whatever mechanism copied `templates/`, `roles/`, `guardrails/`,
`docs/push-release-flow.md` into the plugin package as the immediate fix
(find that commit/dispatch first) — replace its one-time copy with a
generated step wired into the same pipeline that already generates
`templates/prompts/agent-obligations.md`, or a sibling generator script
alongside it. Also candidates for review once the generation step exists:
`harness/scripts/validate-manifest.mjs` (should it verify the vendored copy
matches its generator's current output, the same way other generated
artifacts in this repo are pinned against drift?) and the release/candidate
stamping flow (should a stale vendored copy block a candidate build?).

## Proposal

No fix designed yet — direction only, per Description above. Whoever picks
this up should first read whatever the "jetzt a)" quick-copy fix actually
did (exact files/paths copied, exact reference-path updates made in
`SKILL.md`/hook comments) so the generated version reproduces the same
effective behavior, then replace the one-time copy with a build step and
add drift detection so the two copies (source and vendored) cannot silently
diverge again.

### Added scope (PO, 2026-08-10, same triage session): classify before vendoring, don't just copy everything

The immediate "jetzt a)" fix vendors `templates/`, `roles/`, `guardrails/`,
and `docs/push-release-flow.md` wholesale, without first asking whether
every file in those directories is actually appropriate for a hosted/
consumer project to read at all. Some content in `docs/adr/` (and plausibly
in `templates/`/`roles/`/`guardrails/` too) may be Pipeline-self-application
-only — decisions about how the Pipeline governs its OWN repo, not
decisions meant to bind or inform a hosted project's own operating model.
Blanket-vendoring that content into every consumer project's plugin install
is a different, quieter problem than the path-resolution bug this whole
item started from: it would leak internal process decisions into projects
that have no reason to see them, and could actively confuse an agent
working in a hosted project if it reads a Pipeline-self-only ADR as if it
applied there.

Before (or as part of) building the generated build step above, do a real
classification pass over `docs/adr/` (and re-check `templates/`, `roles/`,
`guardrails/` with the same lens once ADRs establish the pattern): which
decisions are Pipeline-self-only, and which are universal — meant to apply
to, or at least inform, any project the Pipeline governs, self or hosted.
This probably needs its own ADR to formalize the split (a classification
scheme, and where the line sits for existing ADRs), and may mean literally
splitting some existing ADRs whose content mixes both concerns into a
self-only part and a universal part, rather than just tagging them in
place. Only the UNIVERSAL subset should ever be vendored into the plugin
package for consumer projects; self-only content stays exactly where it is
today (Pipeline repo root only, never shipped).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted in principle (the PO explicitly wants "es sauber zu
  machen"), deferred in execution — the immediate copy fix ships first.
- **Rationale:** the PO's own framing treats the quick copy as a stopgap,
  not a resolution; this item exists specifically so the stopgap does not
  get mistaken for done.
- **Assignment:** none yet — pick up after the quick-copy fix's exact
  scope is known.
- **Date:** 2026-08-10

### Added scope (Critic F2/F3, candidate review 2026-08-10, over commits 4d0f8038..e2a3072f)

Two concrete gaps in the quick-copy fix's exception handling, confirmed by
the candidate's Critic review, both traced to this item's own "quick copy
now, proper build step later" tradeoff rather than new defects:

- **F2 — wrong exemption granularity for shipped canon:** the 19
  `harness/scripts/check-consumer-safe-paths.mjs` `ALLOWLIST` entries added
  for the vendored copies are whole-file `filePattern` exemptions — the
  checker's own module doc defines that form for files never read by a
  consumer as an instruction, which is the opposite of what these 19 files
  are (vendored specifically so a consumer DOES read them as instructions).
  A `filePattern` match also registers as "used" before any line is
  inspected, so a repaired file's entry never goes stale and is never
  reported — unlike the tighter `{file, match}` form. The sibling gate this
  same candidate added, `harness/scripts/check-doc-contracts.mjs`'s
  `VENDORED_LINK_EXCLUSIONS` (per `(file, destination)`, class-scoped,
  genuinely stale-checked), is the template to follow when this item is
  picked up: replace the 19 whole-file entries with that tighter shape.
- **F3 — no drift detection for 25 of the 37 vendored files:** byte-identity
  to the repo-root origin is machine-checked only for the 9 ADRs covered by
  `VENDORED_LINK_EXCLUSIONS`'s own test. The other 28 (6 guardrails, 3 role
  contracts, 6 prompt templates, `docs/push-release-flow.md`, 9 further
  ADRs) have zero enforcement anywhere in `verify.mjs` — a repo-root edit to
  any of them silently desyncs what a hosted session reads as canon. This is
  exactly the drift-detection gap this item already exists to close; treat
  F3 as confirmation the due date below is warranted, not new scope.

Due date added (`due: 2026-08-24`, two weeks out) specifically to satisfy
`guardrails/quality-gates.md` QG-06 — the Critic correctly flagged that this
item, cited as the accepted-gap justification for both the above and the
19 ALLOWLIST entries themselves, had no expiry, which QG-06 requires for any
documented-instead-of-fixed exception.

### Execution confirmed (PO, 2026-08-12)

- **Decision:** proceed as recommended — dispatch to goldfish-deep (design
  latitude needed for the classification scheme) now that capacity allows.
- **Rationale:** PO, 2026-08-12: "empfehlung."
- **Date:** 2026-08-12
