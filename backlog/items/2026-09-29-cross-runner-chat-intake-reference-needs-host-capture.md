---
schema: pipeline.backlog-item.v1
id: pipeline.cross-runner-chat-intake-reference-needs-host-capture
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-29
source: "Claude Windows greenfield review M5: the agent emitted an existing chat request twice into a scratch write, about 7k output tokens per failed attempt."
sprint: alfred
done_when: manual
---

# Capture an already supplied chat turn by stable host reference

The intake CLI can now use a digest-bound existing project file without copying
it. A chat-only request still lacks a trusted, runner-neutral turn identifier
and byte-exact capture API. Parsing runner transcript files by guessed path or
format would risk selecting the wrong message or silently changing whitespace.

## Acceptance

- Define a host-provided turn reference with explicit user-message identity,
  exact UTF-8 bytes, scope, expiry and user consent for project intake.
- Implement adapters for Codex, Claude and Antigravity only where the host
  exposes a reliable capture API; otherwise return a typed unavailable result.
- Bind the captured bytes and reference digest into the existing intake
  checkpoint, with replay/drift checks and a size limit.
- Prove the chat-only greenfield path avoids agent re-emission of the full
  message and still captures byte-exact multiline content.
