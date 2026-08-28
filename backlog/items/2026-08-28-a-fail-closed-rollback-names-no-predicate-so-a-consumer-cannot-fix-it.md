---
schema: pipeline.backlog-item.v1
id: pipeline.rebind-rollback-names-no-predicate
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — the only sanctioned route to a PO acknowledgement marker is unusable, and the refusal is undiagnosable from outside"
source: "Consumer project HA, incident report S56 finding B2 (2026-08-28, Windows). The consumer independently re-derived every input digest and found all of them correct."
---

# A fail-closed rollback that names no predicate cannot be fixed by the consumer

## What happened

After a successful chat-gate confirmation, `pipeline-state.mjs
po-authority-acknowledge-apply` printed:

```
Error: PO authority rebind postimage readback failed; rollback verified.
```

The rollback itself was clean. The consumer then verified, from outside, every input the
apply binds:

- **prdDigest** — `appendAcknowledgementMarker()` reproduced exactly (trim trailing
  newlines, append blank line + marker + newline); the result matched the plan's
  `postimage.prd.sha256`. The file is pure LF, UTF-8.
- **v4Intents** — `bootstrap`, `session` and `dispatch` all `status: "ready"`,
  `diagnostics: []`.
- **preimage.state.sha256** — matched the live file; nothing wrote between plan and apply.
- **runtime projection** — `project/pipeline.yaml` unchanged and equal to
  `postimage.poGateAuthority.runtimeSha256`.

Every checkable predicate held, and the route still refused.

## The gap

`pipeline-state.mjs` around line 6050:

```js
console.error(`Error: PO authority rebind postimage readback failed; ${... ? "rollback verified" : "rollback unresolved"}.`);
```

The `pipeline.po-authority-postimage-readback.v1` evidence that would say WHICH predicate
failed goes only into the `deps.observeRebindPostimageEvidence` hook, which only a test
can inject. Nothing reaches stderr. A consumer therefore gets a correct fail-closed
rollback with no way to act on it — the safe behaviour and an unusable one at the same
time.

This blocks the only sanctioned route for getting the PO acknowledgement marker onto a
bound PRD. The consumer's workaround was for a human to append the marker line by hand.

## Direction

The diagnosis is the deliverable; the root cause is second. Report the failing predicate,
with its `expected` and `observed` values, on stderr — the same information the evidence
object already carries. A fail-closed rollback that names its cause is recoverable; one
that does not is a dead route.

Only once the predicate is visible can the underlying failure be identified. It may well
turn out to be its own defect; that is a follow-up this item's fix makes possible.

## Acceptance criteria

- A failed postimage readback names the failing predicate and its expected/observed values
  on stderr, without leaking file contents or absolute host paths.
- A test drives a deliberately failing predicate and asserts the message identifies it.
- The rollback behaviour itself is unchanged: still fail-closed, still verified.

## Related

- `2026-08-28-a-chat-gate-is-unusable-with-a-non-ascii-name-on-windows.md` — the gate the
  consumer had to pass before reaching this failure.
