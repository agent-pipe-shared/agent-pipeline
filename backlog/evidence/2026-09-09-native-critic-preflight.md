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
consumer-safe-path suite passing. The one bounded live action was unavailable:
the installed server emitted a notification outside the producer's explicitly
admitted safe notification set before metadata completed; capture is
`evidence/NVA-NATIVE-PREFLIGHT-1-live-preflight-notification-recovery.txt`.
Earlier input/schema recovery observations remain separately captured. No tuple
or smoke receipt was emitted, and the native Critic lane remains inactive.
