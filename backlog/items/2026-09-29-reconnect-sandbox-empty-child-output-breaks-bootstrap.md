---
schema: pipeline.backlog-item.v1
id: pipeline.reconnect-sandbox-empty-child-output-breaks-bootstrap
type: bug
owner: pipeline
status: open
created: 2026-09-29
source: "Codex reconnect reproduced: pipeline-start preflight ready, then project-onboarding-v3 inspect printed Unexpected end of JSON input because a nested Node reader received empty stdout in the managed sandbox; the same read-only command at the host boundary returned ready."
sprint: alfred
done_when: manual
---

# Return a typed host recovery when nested bootstrap output is unavailable

After a reconnect, the managed sandbox can return empty stdout from a
successful Node child process. The enrollment-retirement reader parses that
empty output as JSON, so the prescribed inspect action fails with an opaque
error. This must not be mistaken for corrupt project state or a request for a
new PO signature.

## Acceptance

- Detect empty or malformed child output at the boundary that owns the call
  and return a bounded transport/host-boundary diagnostic.
- Surface an exact read-only retry action with the required execution boundary
  when the host can safely perform it; preserve fail-closed state semantics.
- Cover a zero-exit child with empty stdout, an ordinary valid result, and a
  genuinely malformed private state without treating them as the same error.
- Reconnect a Codex session and complete the prescribed bootstrap readback.
