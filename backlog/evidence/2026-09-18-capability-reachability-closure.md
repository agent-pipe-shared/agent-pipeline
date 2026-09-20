# Module Cluster Reachability Instrument Closure Evidence

**Backlog Item:** `pipeline.capability-is-built-tested-and-declared-ahead-of-anything-that-could-call-it`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `harness/scripts/check-module-cluster-reachability.mjs`, `harness/scripts/check-module-cluster-reachability.test.mjs`

## Problem & Background

An initial wire audit revealed that modules under `plugins/pipeline-core/{lib,scripts,hooks}` formed stranded clusters—internally cohesive subsystems with registered tests and inventory declarations that had no reachable entry point in any hook manifest, skill, agent definition, or active CLI command. Furthermore, the prototype audit suffered from false-unreachable classifications because it could not trace child-process invocations (`spawnSync`, `execFileSync`).

## Implementation Details

1. **Versioned Reachability Instrument (`check-module-cluster-reachability.mjs`):**
   - Statically parses ES imports, CommonJS `require`, and `node:child_process` execution calls (`spawnSync`, `execFileSync`, `spawn`, `execFile`).
   - Distinguishes actual repository module references from foreign binaries and local child homonyms.
   - Evaluates reachability from four authoritative root sets: hook declarations (`hooks.json`), registered verify commands, skill tool references, and public documentation/agent commands.
   - Groups unreachable modules by connected cluster rather than reporting raw disconnected file counts.
   - Separates deferred platform components (such as native-Windows/WSL packages) from active runner-neutral obligations.

2. **Automated Verification:**
   - `harness/scripts/check-module-cluster-reachability.test.mjs`: 10/10 PASS.

## Verification Results

- Automated tests confirm accurate edge detection across dynamic spawn calls, cluster grouping, and deterministic reporting.
