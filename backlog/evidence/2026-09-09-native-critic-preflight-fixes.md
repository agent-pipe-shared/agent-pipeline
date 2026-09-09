# Native Critic preflight RPC fixes — 2026-09-09

The round-one native Critic result identified two producer faults: a protocol
failure received after a successful pending response was not retained through
shutdown, and malformed frames or stdin errors could escape the asynchronous
failure path.

`RpcProcess` now records one sticky terminal failure, rejects pending requests,
ends/kills its owned child, and is checked after graceful close before a smoke
receipt can be produced. JSON frames must be objects. `stdin` errors and
synchronous write/end failures take that same bounded failure path. A normal
coordinator close is marked before the child close event, so it does not create
a spurious failure.

The fake executable regressions send a valid final command response followed by
a forbidden server request, send a `null` JSON frame, and close stdin during
initialization. Each produces a bounded unavailable result; none can issue a
smoke PASS. These are fixture regressions, not live native evidence.
