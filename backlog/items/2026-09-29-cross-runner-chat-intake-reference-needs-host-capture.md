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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — Only the Claude capture adapter has a host-shaped route; a real chat turn capture on installed Claude, Codex and Antigravity hosts is unproven
  Requires a real chat turn in each installed host (Claude, Codex, Antigravity) to observe whether a byte-exact turn reference is exposed; codex/agy/claude CLIs need an authenticated model turn, which an agent must not make. Where a host exposes none, the typed-unavailable result is the acceptance and must also be observed on the host.
