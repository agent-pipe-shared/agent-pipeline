# Agent-Pipeline Antigravity workspace entry

Read and follow [AGENTS.md](AGENTS.md) before working in this repository. It
is the sole workspace-instruction pointer and identifies the runtime manifest
and Operating Model as the calibrated authorities.

Nova exposes Antigravity as a **first-class third runner** (`sprint_agy` / #69). 
Antigravity executes identically to Codex and Claude Code, conforming strictly 
to the `operating-model.md`.

### Antigravity Installation (Workspace-Local)

Unlike Codex, Antigravity does not rely on a global `plugin install` marketplace 
command for local plugins. To install the Agent-Pipeline in an Antigravity project:

1. Run the Antigravity installer script from the pipeline repository:
   ```bash
   node /path/to/agent-pipeline/install-agy.mjs
   ```
   (Select "Workspace-Local" to generate the `.agents/plugins.json` for your project)
2. Initialize the pipeline in your project by invoking the agent and running the start command:
   ```bash
   agy --execute "/pipeline-start"
   ```
