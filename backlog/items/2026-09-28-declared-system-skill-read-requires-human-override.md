---
schema: pipeline.backlog-item.v1
id: pipeline.declared-system-skill-read-requires-human-override
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Codex candidate preparation, 2026-09-28: installed lifecycle guard refuses the runtime-declared skill-creator SKILL.md read with GUARD-READ-SCOPE-OUTSIDE-ROOT and offers only a signed override."
sprint: none
done_when: manual
---

# Declared system skill cannot be read through the normal Codex read boundary

## Description

The active runtime skill catalog declares the system `skill-creator` skill
under `.codex/skills/.system/skill-creator/SKILL.md`. Applying that skill requires
reading its instructions. The installed lifecycle guard refuses the ordinary
read-only `cat` with `GUARD-READ-SCOPE-OUTSIDE-ROOT` and returns no safe retry;
its only offered route requires a human signature. No content was read and no
override was requested or used. Work continued without applying the skill.

This is a verified host admission mismatch, not evidence that unrestricted
outside-root reads are safe. The declared skill file is a runtime authority;
credentials, transcript roots and unrelated files remain outside its scope.

## Affected artifact

Runtime-declared skill authorities, session read-scope resolution,
`hooks/guard-lifecycle-ready.mjs`, and bounded Codex diagnostic reads.

## Proposal

Bind the exact physically verified skill instruction files from the active
host catalog into the session's read authorities, or return an equivalent
host-authorized instruction read. Do not admit the entire home directory,
infer authorization from a skill-looking filename, or follow arbitrary links.
Report unavailable catalog/identity evidence explicitly instead of forcing
routine skill loading into an unplanned PO signature ceremony.

## Acceptance

- A fresh Codex session can read its declared `skill-creator` instructions
  through a returned normal read action without a human override.
- Unlisted system files, credentials, transcript directories and aliases
  escaping the bound authority remain refused.
- Replaced or drifting catalog/file identities invalidate the read authority.
- The installed host readback proves the actual route; a static allowlist
  or synthetic catalog alone is insufficient.

## Triage

The installed denial is reproduced. No repair or release acceptance is claimed.

2026-10-17: deferred past the 0.7.0 candidate together with
`lifecycle-read-scope-blocks-host-declared-system-skill` (AC-209) by PO
decision of 2026-10-16. The item stays open; AC-147 is not counted against the
0.7.0 local test candidate.

## Merged from `2026-09-28-lifecycle-read-scope-blocks-host-declared-system-skill` (created 2026-09-28; merged 2026-10-22)

*Carried over verbatim from the item closed as a duplicate of this one. What is unique to it: From the duplicate: the second concrete instance (openai-docs SKILL.md, in addition to skill-creator), the requirement that identical admission applies to supported single reads AND bounded diagnostic reads, the requirement for a concrete ordinary retry route after refusal, and verification of adversarial negatives (traversal, symlink escape, sensitive private surfaces) at the real lifecycle boundary while preserving current Implementation approval validation. The AC-209 deferral label should be kept in the canonical's triage note.*

**Front matter of the merged item, verbatim (status/ledger fields of the original):**

```yaml
schema: pipeline.backlog-item.v1
id: pipeline.lifecycle-read-scope-blocks-host-declared-system-skill
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Installed 0.7 recovery guard refused a single read of the host-declared openai-docs SKILL.md with GUARD-READ-SCOPE-OUTSIDE-ROOT while ordinary Implementation admission was valid."
sprint: alfred
done_when: manual
```

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

#### Acceptance

- Define and admit the narrow host-owned skill instruction surface required
  by the runtime, including a concrete ordinary route after refusal.
- Apply identical admission to supported single and bounded diagnostic reads.
- Keep unrelated outside-root reads, traversal, symlink escapes and sensitive
  private surfaces refused; do not reopen the unrestricted external-read lane.
- Verify declared-skill admission and adversarial negative cases at the real
  lifecycle boundary, preserving current Implementation approval validation.

#### Triage

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

- **DEFERRED** — An installed Codex readback of the declared skill read is needed; the host-catalog producer is Codex-held
  Deferred past the 0.7.0 candidate by PO decision of 2026-10-16 together with lifecycle-read-scope-blocks-host-declared-system-skill (AC-209); item triage 2026-10-17 says AC-147 is not counted against the 0.7.0 local test candidate. When taken up it needs an installed Codex session.
- **DEFERRED** — The PO deferral past 0.7.0 stands; scope for the post-0.7.0 release is undecided
  Nothing blocks 0.7.0: the deferral is recorded (item triage 2026-10-17, PO decision 2026-10-16). The post-0.7.0 scope is a later planning decision, not a candidate blocker.
