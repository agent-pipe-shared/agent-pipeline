# Native Critic policy contract — 2026-09-09

`lib/codex-native-critic-policy.mjs` defines a pure, non-activating contract
for the distinct native model-tool read-only Critic lane. It cannot relabel or
validate the existing intermediate whole-process transport: its policy is
exactly thread `read-only` plus turn `{type: "readOnly", networkAccess: false}`
and its assurance says that trusted Codex runtime, authentication, and cache
are outside the boundary.

The selector binds the candidate dispatch, V3 route only through a
caller-supplied route authority validator, PO-decision digest, and canonical
same-tuple smoke digest. The host must also supply an independently obtained
current tuple during construction or readback; it must equal both the stored
selection tuple and the smoke tuple. The tuple includes CLI version/hash,
protocol-schema digest, WSL host/kernel/filesystem/boot digest, exact policy,
and two tool-surface facts: configuration digest and a sanitized observation digest.
The latter represents the fixed prohibited-feature vector and fully drained
MCP-status pages that are either empty or contain only disabled servers with
empty tool, resource, and resource-template catalogs. It does not assert a
complete inventory of native read tools.

`scratch/native-tool-metadata-1788941834901/result.json` is a real metadata
probe, not a model execution: all 14 fixed prohibited features read back
`false`; its per-thread reducing configuration changed one server with five
tools into one `disabled` server with zero tools, resources, and templates.
The probe started a thread but no model turn, tool execution, global-config
read, credential read, or global-config change occurred. In Codex CLI 0.153.4,
the connection-set constructor collects `!enabled` servers as
`disabled_servers` and constructs connection views only for enabled servers;
the status producer maps that list to `runtimeStatus: "disabled"`. A direct
thread-scoped MCP tool call resolves the same thread runtime and fails its
server-map lookup for such a disabled server. This is bounded evidence that the
server was not callable through that thread's MCP runtime at observation time,
not a complete tool-isolation or execution-pass claim. The status response's
catalog fields come from a separate temporary discovery snapshot, so their
emptiness corroborates the observation but is not the disabled-state proof.
Sources: [connection construction and direct call gate](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/codex-mcp/src/connection_manager.rs), [disabled-status producer](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/codex-mcp/src/connection_manager/status.rs), [published-runtime matching](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/codex-mcp/src/runtime.rs), and [temporary status snapshot](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/codex-mcp/src/mcp/mod.rs).

`scratch/native-command-sandbox-smoke-1788940933417/result.json` is a real
standalone native command/exec observation for Codex CLI 0.153.4: the read
succeeded, the write was OS-denied, the canary stayed unchanged, the host
write control succeeded, and cleanup completed. It is not a Critic verdict
and lacks this policy module's normalized same-tuple record fields. The
separate model probe has no attempted write and therefore cannot activate this
lane. The future host must obtain its own actual probe observation and provide
the closed normalized receipt; caller-provided JSON is not independently
authenticated by a pure validator.

Validation: `node --test plugins/pipeline-core/scripts/codex-sandbox-runtime.test.mjs`
passed 8/8. Machine-written capture:
`evidence/NVA-B-NATIVE-CRITIC-POLICY-1-codex-sandbox-runtime-test.txt`.
`node --test harness/scripts/check-consumer-safe-paths.test.mjs` passed 9/9;
capture: `evidence/NVA-B-NATIVE-CRITIC-POLICY-1-consumer-safe-paths-test.txt`.

No provider run, production Critic turn, full Verify, installation, or release
occurred in this package. The native lane remains inactive pending host tool
exposure evidence and a genuine same-tuple model-tool proof.
