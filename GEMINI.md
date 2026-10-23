# Agent-Pipeline Antigravity workspace entry

Read and follow the governed project's `AGENTS.md` before working in that
project. It is the workspace-instruction pointer and identifies the runtime
manifest and Operating Model as the calibrated authorities.

Agent-Pipeline supports Antigravity alongside Codex and Claude Code. The
operating model is portable, but native hook delivery and enforcement differ
by runner. See the [runner support boundaries](docs/runner-support.md) and
[runtime boundary](docs/runtime-boundary.md) before relying on a guard.

### Prerequisites

For the pipeline hooks to intercept and evaluate commands, the Antigravity host
must be able to resolve `node` in its PATH. A desktop or service launcher may
have a different PATH from an interactive shell, so a shell check does **not**
establish it: confirm that Antigravity's own command tool can resolve and run
`node --version` in a new session. If that readback is unavailable or denied,
treat hook readiness as unknown; correct the host environment and fully restart
Antigravity before relying on its hooks. Do not use an unattended permission
bypass to obtain the readback. The per-platform pre-launch check is in the
[Antigravity (Agy) procedure](SETUP.md#antigravity-agy-workspace-local-binding),
where "Agy" is defined.

### Antigravity Installation (Workspace-Local)

Antigravity registers the plugin per workspace. From the project root:

1. Follow the [Agy installation and upgrade procedure](SETUP.md#antigravity-agy-workspace-local-binding)
   to obtain an approved plugin directory from the official GitHub repository
   and keep it at a durable path. A developer checkout is only for an explicit
   pre-release test. From the **consumer project root**, run:

   ```bash
   node "/absolute/path/to/approved-agent-pipeline/plugins/pipeline-core/install-agy.mjs"
   ```
   Select **Approved Plugin Directory** (the default), then
   **Workspace-Local** to register the plugin in `.agents/plugins.json`.

   The installer also offers an optional autonomous tool policy. If selected,
   it writes `.agents/settings.json`; this runner-local option does not grant
   plan, release, remote, or human authority. Launching `agy` alone does not
   select that option or bypass confirmation prompts.
2. Fully restart Antigravity and open a new workspace session in the project
   root. Launch the CLI if that is how you use the runner:

   ```bash
   agy
   ```
3. Invoke `/pipeline-core:pipeline-start` as the first Pipeline action in the
   new session and follow its returned onboarding action.

Agy also keeps a managed plugin directory and an import manifest, which can
hold a stale copy that shadows the registered plugin. Keep a single source and
refresh with `node ".../plugins/pipeline-core/install-agy.mjs" --refresh`: it
prints the plan and asks first (`--yes` only together with `--refresh`).
Then restart Agy and read the session lock; `agy plugin list` and
`plugins.json` are not proof of what is loaded. The
full procedure is in the [Agy section of SETUP](SETUP.md#antigravity-agy-workspace-local-binding).
