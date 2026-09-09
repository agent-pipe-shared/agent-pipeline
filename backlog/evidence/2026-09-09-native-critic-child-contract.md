# Native Critic child contract evidence — 2026-09-09

The child protocol regression is model-free: it launches the actual child
against a fake app-server and proves native request order, the separate
metadata-only discovery thread, one fresh reduced review thread, policy
readback, paginated false-feature readback, and empty or explicitly disabled
MCP status before the fake turn may start. It also rejects enabled, null or
catalog MCP rows, incomplete metadata, server requests, tool items, wrong IDs,
and write actions. The historical standalone observation at
`scratch/native-tool-metadata-1788941834901/result.json` covered **fourteen**
false feature flags; it did not include `image_generation`. The child now
requires eighteen observed-false feature rows, including canonical
`token_budget=false`, which suppresses history notes without combining
incompatible scalar and nested TOML forms.
The model-free captured protocol run is
`scratch/NVA-B-NATIVE-CRITIC-CHILD-1/codex-critic-host-18.test.txt`.

This is not a native-engine effectiveness claim. The separately observed
same-host `command/exec` smoke is at
`scratch/native-command-sandbox-smoke-1788940933417/result.json`. The current
live metadata observation is
`scratch/native-tool-metadata-1788943690624/result.json`: all eighteen fixed
features were false across 135 feature rows and two pages; the fresh review
thread returned one catalog-free disabled MCP row with zero tools, resources,
and templates; terminal exit was zero and no model turn ran. Neither metadata
observation is a Critic verdict or a complete native-tool inventory. Native
effectiveness for the integrated Critic lane and a Critic verdict remain
pending. The child records its pre-turn snapshot limitation and separates the
requested policy from sanitized feature/MCP bindings.
