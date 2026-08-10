# Canon-reference paths: repo-root first, plugin-root fallback

Load this when the repo-root/plugin-root resolution for a canon pointer
itself needs explaining, rather than re-deriving it from the short mention in
`SKILL.md`.

A canon pointer in this plugin's agent-facing text — `roles/*.md`,
`guardrails/*.md`, `templates/prompts/*.md`, or `docs/push-release-flow.md` —
names a path relative to the Agent-Pipeline repository root. A
self-application session (this repository's own checkout) has that path
directly; read it as written. A hosted/consumer project does not, because
those directories are not part of that project's own tree — read the
identical vendored copy at `${PIPELINE_PLUGIN_ROOT}/<same relative path>`
instead (for example `${PIPELINE_PLUGIN_ROOT}/roles/goldfish.md` or
`${PIPELINE_PLUGIN_ROOT}/docs/push-release-flow.md`). Try the repo-root path
first; fall back to the plugin-root path only when it is absent.

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
