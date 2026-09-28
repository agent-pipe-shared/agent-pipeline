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
