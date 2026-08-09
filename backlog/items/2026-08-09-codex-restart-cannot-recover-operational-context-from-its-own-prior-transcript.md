---
schema: pipeline.backlog-item.v1
id: pipeline.codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript
type: idea
owner: pipeline
status: open
created: 2026-08-09
source: "PO observation of a live Codex greenfield test session, 2026-08-09 (three rollout files, two restarts), plus independent forensic confirmation that the sanitized resume-hint card cannot carry this class of information by design."
due: 2026-08-23
---

# Should a Codex restart be told to consult its own prior rollout transcript, not only the sanitized resume-hint card?

## What happened

Across two restarts in one Codex test session, the agent lost all
operational context each time: already-hit guard errors, established
workarounds, and the exact state of in-progress work all had to be
rediscovered from scratch. The PO's suggestion: on restart, tell the agent to
run `pipeline-start` AND read the previous session's own JSONL transcript
file, if one can be located, as a richer recovery source than the
resume-hint card alone.

Independently confirmed this session: even a WORKING resume-hint capture
(see the sibling defect about `apply_patch` never being recognized as a
write tool during `restart-required`) is deliberately barred from carrying
"raw transcripts, commands, approvals, lifecycle instructions" — by design,
per `pipeline-start/SKILL.md`'s own resume-hint rules. So even a fully
functioning resume-hint mechanism was never going to solve the specific loss
the PO observed (rediscovering guard workarounds, in-progress diagnostic
state) — that class of information is explicitly out of the card's scope,
not an implementation gap in it.

## Why this needs a real design pass, not a quick fix

- Codex's own rollout files live at a host/tool-specific path
  (`~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`) with no
  obviously reliable, portable way for a *new* session to identify which
  prior rollout file is "the one to read" — multiple sessions can run the
  same day, across different projects, and the new session has no session ID
  for its predecessor unless something explicitly hands it one.
  - However: `Codex 0.145` writes its own `session_meta`/thread linkage,
    and the CLI itself is invoked by an external harness that DOES know the
    prior session's ID when initiating a restart — plausibly the restart
    ACTION ITSELF (not the agent's own guesswork) could pass the prior
    rollout path down explicitly, side-stepping the discovery problem
    entirely. This would need investigation into whatever code path
    triggers a Codex restart today.
- Reading a full raw transcript back in is exactly the kind of unbounded,
  potentially-large, unsanitized input the resume-hint mechanism was
  deliberately designed to AVOID (privacy, payload-budget, and "never a raw
  transcript" are explicit, stated design constraints elsewhere in this
  codebase) — a blanket "read your own last transcript" recommendation could
  reintroduce exactly the risk class the sanitized-card design exists to
  prevent, unless carefully bounded (e.g. read only the last N tool
  results/errors, never full user-turn content).
- This is Codex-specific; Claude Code's own session/transcript model and
  restart semantics differ, so any fix here should not assume it transfers.

## Direction (for a future dedicated design pass, not a same-night fix)

Investigate whether the mechanism that INITIATES a Codex restart already
knows (or could be made to know) the prior rollout file's path, and if so,
whether passing it down explicitly (rather than having the new session guess
at discovery) is both feasible and safe. If a bounded, privacy-respecting
subset of "what to recover" can be defined (e.g. only recently-hit guard
denial codes and their resolutions, not full transcript content), scope a
proper spec for it rather than a quick patch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
