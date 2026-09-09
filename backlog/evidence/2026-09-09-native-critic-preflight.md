# Native Critic model-free preflight — 2026-09-09

`codex-native-critic-preflight.mjs` is the reusable producer for the native
Critic tuple and smoke receipt. It generates the protocol schema from the
resolved executable into a newly-owned child of repository scratch, validates
the required request shapes, and hashes that generated bundle. It observes
host/CLI/boot facts, starts only metadata threads, drains feature and MCP pages,
and never sends `turn/start`.

The smoke uses the generated protocol's standalone `command/exec` route under
`{type:"readOnly",networkAccess:false}`. It reads a scratch canary, runs a
Node payload which emits an attempted-write marker then records the concrete
write errno, and accepts only `EROFS`, `EACCES`, or `EPERM` with unchanged
canary bytes. A host positive-control write restores that same canary before
the native attempt. Source tree and tracked-state observations must agree
before and after; protocol, launch, timeout, malformed page, and cleanup
failures produce only an unavailable result.

Machine evidence: `evidence/NVA-NATIVE-PREFLIGHT-1-codex-sandbox-runtime-test.txt`
records 11 passing focused runtime tests, including a fake executable that
generates both current protocol bundles and enforces the exact no-turn request
order. It also covers timeout cleanup, launch denial without a witnessed canary
write, wrong readback policy, scratch escape, malformed evidence, and preserved
preexisting scratch content.
`evidence/NVA-NATIVE-PREFLIGHT-1-consumer-safe-paths-test.txt` records the
consumer-safe-path suite passing. The NVA-NATIVE-PREFLIGHT-1 input and schema
refusals were preparation failures; its notification refusal was the first
actual app-server launch. They are separate captures and do not constitute one
successful live action.

NVA-NATIVE-PREFLIGHT-2 added a method-only diagnostic and identified the
schema-declared, notification-only `remoteControl/status/changed` event. Its
params are neither captured nor admitted as evidence. The producer now accepts
only that necessary non-request event alongside its existing harmless status
notifications; server requests with IDs and turn/tool events remain refused.
The actual-wire regression stays model-free. Capture
`evidence/NVA-NATIVE-PREFLIGHT-2-live-smoke.txt` records the resulting passed
current tuple and smoke receipt: eighteen reduced false-feature observations
over two pages, empty MCP status, standalone read, concrete native write
denial, unchanged canary/source, host write control, clean teardown, and zero
turns. The receipt was validated through `validateNativeCriticSmokeReceipt`
against its actual tuple. This does not activate the native Critic lane or run
a provider/model turn.
