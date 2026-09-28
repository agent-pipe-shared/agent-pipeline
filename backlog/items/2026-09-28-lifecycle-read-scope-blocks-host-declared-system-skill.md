---
schema: pipeline.backlog-item.v1
id: pipeline.lifecycle-read-scope-blocks-host-declared-system-skill
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Installed 0.7 recovery guard refused a single read of the host-declared openai-docs SKILL.md with GUARD-READ-SCOPE-OUTSIDE-ROOT while ordinary Implementation admission was valid."
sprint: alfred
done_when: manual
---

# Required host skill read has no ordinary lifecycle admission

The ready installed Codex runtime declares `openai-docs` as a system skill
and requires its instructions for Codex setup/troubleshooting questions.
`guard-lifecycle-ready` refused the single `cat` of that declared SKILL.md
because it is outside the project root. The refusal offered an exceptional
PO-signature flow for this read. The installed Pipeline skill itself remained
readable and the current plan's Implementation boundary admitted work.

This is distinct from the historical pipe/unpiped containment asymmetry:
that containment decision remains valid. The missing case is a required,
host-declared skill instruction surface. No private key or runner transcript
was read, and no exceptional authorization was consumed.

## Acceptance

- Define and admit the narrow host-owned skill instruction surface required
  by the runtime, including a concrete ordinary route after refusal.
- Apply identical admission to supported single and bounded diagnostic reads.
- Keep unrelated outside-root reads, traversal, symlink escapes and sensitive
  private surfaces refused; do not reopen the unrestricted external-read lane.
- Verify declared-skill admission and adversarial negative cases at the real
  lifecycle boundary, preserving current Implementation approval validation.

## Triage

- **Decision:** Confirmed ordinary-work obstruction; include in the existing
  0.7 guard liveness and host-boundary correction review.
- **Assignment:** Lifecycle read-scope admission, with security review.
- **Date:** 2026-09-28.
