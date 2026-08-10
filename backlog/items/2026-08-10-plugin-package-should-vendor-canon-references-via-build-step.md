---
schema: pipeline.backlog-item.v1
id: pipeline.plugin-package-should-vendor-canon-references-via-build-step
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-10
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

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted in principle (the PO explicitly wants "es sauber zu
  machen"), deferred in execution — the immediate copy fix ships first.
- **Rationale:** the PO's own framing treats the quick copy as a stopgap,
  not a resolution; this item exists specifically so the stopgap does not
  get mistaken for done.
- **Assignment:** none yet — pick up after the quick-copy fix's exact
  scope is known.
- **Date:** 2026-08-10
