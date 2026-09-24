# Agent-Pipeline Antigravity workspace entry

Read and follow the governed project's `AGENTS.md` before working in that
project. It is the workspace-instruction pointer and identifies the runtime
manifest and Operating Model as the calibrated authorities.

Nova exposes Antigravity as a **first-class third runner** (`sprint_agy` / #69).
It follows the same portable operating model as Codex and Claude Code, while
native hook delivery and enforcement remain runner-specific; see
[`docs/runtime-boundary.md`](docs/runtime-boundary.md) for the supported
coverage and manual responsibilities.

### Prerequisites

For the pipeline hooks to intercept and evaluate commands, the Antigravity host
must be able to resolve `node` in its PATH. A desktop or service launcher may
have a different PATH from an interactive shell.

If Antigravity is launched from this same terminal, check before launching it:

```bash
command -v node
```

For a desktop or service launch, this shell command does **not** establish the
launcher PATH. Inspect the host's launcher/service environment and confirm
that Antigravity's own command tool can resolve and run `node --version` in a
new session. If that readback is unavailable or denied, treat hook readiness
as unknown; correct the host environment and fully restart Antigravity before
relying on its hooks. Do not use an unattended permission bypass to obtain the
readback.

### Antigravity Installation (Workspace-Local)

Antigravity uses a workspace registration rather than a global plugin install
command. From the project root:

1. Run the installer from a locally available, approved plugin directory
   obtained from the official GitHub distribution (for example a released
   marketplace snapshot or release checkout). A developer checkout is only for
   an explicit pre-release test:

   ```bash
   node "/absolute/path/to/approved-agent-pipeline/plugins/pipeline-core/install-agy.mjs"
   ```
   Select **Approved Plugin Directory** (the default), then
   **Workspace-Local** to register the plugin in `.agents/plugins.json`.
2. Fully restart Antigravity and open a new workspace session in the project
   root. Launch the CLI if that is how you use the runner:

   ```bash
   agy
   ```
3. Invoke `/pipeline-core:pipeline-start` as the first Pipeline action in the
   new session and follow its returned onboarding action.

The installer also offers an optional autonomous tool policy while installing.
If selected, it writes `.agents/settings.json`; this runner-local option does
not grant plan, release, remote, or human authority. Launching `agy` alone does
not select that option or bypass confirmation prompts.
