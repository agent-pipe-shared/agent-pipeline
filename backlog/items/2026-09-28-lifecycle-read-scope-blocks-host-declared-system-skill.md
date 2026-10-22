---
schema: pipeline.backlog-item.v1
id: pipeline.lifecycle-read-scope-blocks-host-declared-system-skill
type: defect
owner: pipeline
status: closed
created: 2026-09-28
closed_at: 2026-10-22
closure_repository: self
closure_commit: 35455319327d44d5519671a13f0956583dd99a21
closure_evidence: backlog/items/2026-09-28-declared-system-skill-read-requires-human-override.md
source: "Installed 0.7 recovery guard refused a single read of the host-declared openai-docs SKILL.md with GUARD-READ-SCOPE-OUTSIDE-ROOT while ordinary Implementation admission was valid."
sprint: alfred
done_when: manual
---

**Rejected as a duplicate (backlog grooming 2026-10-22):** merged into `backlog/items/2026-09-28-declared-system-skill-read-requires-human-override.md`. Same observable defect and same fix: the lifecycle guard refuses (GUARD-READ-SCOPE-OUTSIDE-ROOT) a read of a host-declared system skill SKILL.md and offers only a PO-signature route; one bound read authority for the declared skill instruction files closes both. Both were deferred together by the PO decision of 2026-10-16 (AC-147 and AC-209), so the canonical absorbs the PO decision. All content of this item is carried over verbatim into that item's section "Merged from `2026-09-28-lifecycle-read-scope-blocks-host-declared-system-skill`"; nothing is lost.

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
- **Deferral (2026-10-17):** deferred past the 0.7.0 candidate together with
  `declared-system-skill-read-requires-human-override` (AC-147) by PO decision
  of 2026-10-16. The item stays open; AC-209 is not counted against the 0.7.0
  local test candidate.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **DEFERRED** — Verify declared-skill admission at the installed Codex lifecycle boundary
  The item is closed as a duplicate (2026-10-22) and merged into 2026-09-28-declared-system-skill-read-requires-human-override.md; both were deferred past the 0.7.0 candidate by PO decision of 2026-10-16 (AC-147 and AC-209 not counted; item Deferral line 2026-10-17). The pin's declared-skill cases are intentionally skipped as NATIVE_HOLD.
