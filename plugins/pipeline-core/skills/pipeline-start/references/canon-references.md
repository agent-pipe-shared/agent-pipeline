# Canon-reference paths: repo-root first, plugin-root fallback

Load this when the repo-root/plugin-root resolution for a canon pointer
itself needs explaining, rather than re-deriving it from the short mention in
`SKILL.md`.

A canon pointer in this plugin's agent-facing text — `roles/*.md`,
`guardrails/*.md`, `templates/prompts/*.md`, `docs/push-release-flow.md`, or
`docs/adr/<NNNN>-*.md` (an ADR named either by its full path or bare as
"ADR-<NNNN>") — names a path relative to the Agent-Pipeline repository root.
A self-application session (this repository's own checkout) has that path
directly; read it as written. A hosted/consumer project does not, because
those directories are not part of that project's own tree — read the
identical vendored copy at `${PIPELINE_PLUGIN_ROOT}/<same relative path>`
instead (for example `${PIPELINE_PLUGIN_ROOT}/roles/goldfish.md`,
`${PIPELINE_PLUGIN_ROOT}/docs/push-release-flow.md`, or
`${PIPELINE_PLUGIN_ROOT}/docs/adr/0061-uniform-human-approval-ceremony.md`).
Try the repo-root path first; fall back to the plugin-root path only when it
is absent.

Only the ADRs an already-vendored canon file actually cites are vendored —
not the full `docs/adr/` tree, and not an ADR that only a vendored ADR cites
in turn (a second-level citation stays repo-root-only unless a future
dispatch vendors it explicitly, with its own stated evidence). A bare
"ADR-<NNNN>" mention still means `docs/adr/<NNNN>-*.md` under this same
resolution rule, whether or not the citing text spells out the path.

Every canon pointer of this shape anywhere in this plugin package resolves
the same way — this file states the rule once instead of repeating it at
each site; a site that names one of these paths means this rule, whether or
not it says so again.

The vendored copies are a manual, byte-for-byte snapshot with no drift
detection yet — replacing this manual copy with a generated, drift-checked
build step is a separate, already-filed backlog item in the agent-pipeline
repo (canon pointer, not a runtime read, and not this file's scope):
`backlog/items/2026-08-10-plugin-package-should-vendor-canon-references-via-build-step.md`.
Read either vendored/source copy as authoritative for its own content; never
write to either from a session.
