# Selected Critic startup diagnosis — 2026-09-09

This is startup evidence, not a Critic verdict, transport activation, or
permission to weaken the selected review boundary.

## Observations

- The selected transport invocation bound to candidate
  `5b21e7260abdbb6b2fecec2eae25a9d3ac2945a1`, tree
  `921e4dfc915edd91627f7f37dfb344c754e24521`, returned
  `selected-critic-transport-failed`. Child exit was 1, initialization and
  model-turn flags were false, cleanup was complete. Retained result:
  `scratch/v3-frontdoor-selected-review-result.json`.
- The prior bounded diagnostic process handle no longer existed on readback.
  Its completed artifact, `scratch/critic-initialize-probe-sDGRB2/result.json`,
  records actual child exit 1 rather than the diagnostic timeout signal.
  Stderr contains the non-fatal PATH-alias warning followed by
  `Error: Read-only file system (os error 30)`; initialization is false.
- A separate probe using the documented `log_dir` override pointed at its
  existing writable scratch directory produced the same terminal failure:
  `scratch/critic-initialize-probe-wQlZ0o/result.json`. This rules out that
  override alone as a repair. SQLite and temporary paths were already directed
  into scratch; the original host HOME/CODEX_HOME were not replaced.
- These probes use a separately compiled intermediate sandbox and their own
  coordinator scratch, not the sealed selected-review sandbox. They explain
  startup behavior but cannot stand in for its receipts. No model turn ran.

## Version-bound source explanation

Codex CLI 0.153.4 calls `resolve_installation_id` before opening its Stdio
connection. That function unconditionally opens the installation-ID file with
read, write and create enabled, then reads the existing ID. Thus an existing
valid ID still requires write-open permission under CODEX_HOME. The legacy
whole-process review sandbox permits writes only to coordinator scratch,
whereas the production child inherits CODEX_HOME. This is a concrete startup
incompatibility; changing only logs, SQLite or temporary directories cannot
remove that write requirement.

Sources: [app-server startup at rust-v0.153.4](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server/src/lib.rs),
[installation-ID implementation at rust-v0.153.4](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/core/src/installation_id.rs),
[documented log directory setting](https://developers.openai.com/codex/config-reference).

The stderr itself does not name the failing path, and no syscall trace was
available. Do not relabel this source-backed explanation as a local trace of
the exact failed open, or assume it is the only startup write requirement.
No host identifier or credential was copied into this record.

## Next admissible work

Do not keep retrying the unchanged legacy child, grant host-home writes,
copy credentials, or substitute a generic-agent PASS. The existing native
Critic host/policy/child contracts are separate and remain inactive. Their
own current same-host tuple, actual read/write-denial smoke, complete reduced
feature/MCP readback and selected V3 route binding are prerequisites to a
genuine native review. Historical scratch probes cited by those contracts
are not current authenticated receipts and must not be reconstructed as PASS.
Resolve that bounded execution path before final candidate stamping and
marketplace delivery. This remains technical work, not a review-waiver request.
