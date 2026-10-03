---
schema: pipeline.backlog-item.v1
id: pipeline.read-blocks-and-misleading-denial-texts-across-runners
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "PO observation after the 0.7.0 three-runner greenfield tests, 2026-10-03, plus live observations in the Agent-Pipeline Claude/Windows session the same day."
sprint: alfred
done_when: manual
---

# Too many read blocks, and denial texts that say "not present" instead of "blocked"

## Description

**PO observation (all runners):** there are still too many read blockades. In
some places the agent-visible text still says that something is not present or
does not exist, when the truth is that the guard blocked the read. Agents then
draw wrong conclusions.

Concrete cases observed in the Claude/Windows session on 2026-10-03:

- Every in-repo read was refused (separate root-cause item
  `2026-10-03-claude-windows-guard-refuses-every-in-repo-read.md`).
- Native `Read` of a user-supplied report on a WSL UNC path
  (`\\wsl.localhost\...`) is refused with `GUARD-READ-TARGET`, while a Windows
  drive path outside the repo is admitted. The PO handed over three such paths
  as working material.
- Native `Grep` with a `glob` filter is always refused. `readToolScopeVerdict`
  only admits Grep when `selector === undefined`, so a scoped search such as
  `glob: "2026-09-2*-*.md"` inside the repo is denied.
- Native `Grep` on an in-repo **directory** (for example `path: plugins/pipeline-core`,
  no glob) is refused. Grep only admits exact files or registered plugin
  directories (`isSafeExactPassiveFile` / `isSafeRegisteredPluginDirectory`), so
  the normal "search this subtree" usage needs a Bash `rg` workaround. Native
  `Glob` with a `*` pattern and no path is refused as well.
- The Claude test run reports read-only `ls`/`Glob` on the transcript directory
  and `node scratch/forensics.mjs` refused (Claude analysis V-8).

## Acceptance

- Ordinary passive reads (Read, Grep with or without glob/type filters, Glob,
  `cat`/`head`/`rg`) inside the project root, scratch and user-supplied exact
  files are admitted on all runners and platforms, including WSL UNC paths.
  Credential roots stay denied.
- Every denial says "blocked by guard <code>" and never implies absence. Audit
  all refusal texts and tool fallbacks for "not found" / "not present" wording
  on guard-denied paths.
- One cross-runner test matrix covers these read shapes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
