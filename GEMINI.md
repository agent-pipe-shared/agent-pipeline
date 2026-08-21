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

1. Reference this repository via a `.agents/plugins.json` manifest in your target project:
   ```json
   {
     "entries": [
       { "path": "/absolute/or/relative/path/to/agent-pipeline/plugins/pipeline-core" }
     ]
   }
   ```
2. Run the standard pipeline initialization command in your target project:
   ```bash
   node /path/to/agent-pipeline/setup.mjs --runner antigravity
   ```
