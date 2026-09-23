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

For the pipeline hooks to securely intercept and evaluate commands, the Antigravity CLI daemon must be able to resolve `node` in its system `$PATH`. 
If you manage Node.js via `fnm` or `nvm` and launch the daemon in the background (e.g. via an IDE, desktop app, or systemd), those environments typically do not source your `.bashrc`, causing hooks to fail silently ("Fail Open").

**To ensure `node` is available globally to all background processes:**
```bash
command -v node
```

This condition has no code fix inside the plugin: a hook that never starts
cannot report its own absence. Treat it as a host prerequisite and restore a
system-visible Node installation before relying on Antigravity enforcement.

### Antigravity Installation (Workspace-Local)

Unlike Codex, Antigravity does not rely on a global `plugin install` marketplace 
command for local plugins. To install the Agent-Pipeline in an Antigravity project:

1. Run the Antigravity installer script from a locally available, approved
   plugin directory obtained from the official GitHub distribution (for
   example a released marketplace snapshot or release checkout), not an
   un-released developer checkout:
   ```bash
   node /path/to/approved-agent-pipeline/plugins/pipeline-core/install-agy.mjs
   ```
   (Select "Workspace-Local" to generate the `.agents/plugins.json` for your project. The installer will also print the node PATH verification.)
2. Initialize the pipeline in your project by invoking the agent and running the start command:
   ```bash
   agy
   ```
   (`agy` itself does not bypass confirmation prompts. If appropriate for the
   workspace, select the installer’s explicit autonomous-mode option; it
   remains runner-local and grants no plan, release, remote, or human authority.)

3. To enable autonomous execution (auto-apply edits & safe commands) permanently, the installer can write `.agents/settings.json`:
   ```json
   {
     "toolExecutionPolicy": "always-proceed",
     "artifactReviewMode": "always-proceed"
   }
   ```
