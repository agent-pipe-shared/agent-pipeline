# Architecture Navigation Map Index

Root index of the agent-first architecture navigation map bundle for `agent-pipeline` (OKF v0.1 format, WP-D2, Issue #104, AC-8, AC-23, Spec §7.2, Doctrine §3).

## Re-Entry Reading Order (Doctrine §3.2)

Stateless context-budgeted agents and fresh sessions re-enter this repository by reading artifacts in the following strict order (bounded by task scope, without loading unrelated implementation):

1. **`AGENTS.md`**: Universal entry point, conventions, and pointer into this architecture map.
2. **`architecture/map/index.md`**: This root map and inventory index.
3. **Concept files of touched modules**: The concept file(s) for exactly the modules touched by the task (`architecture/map/<module>.md`).
4. **Compiled decision summary**: `project/architecture-decisions.compiled.json` (or `docs/adr/`), filtered by applicability.
5. **Lifecycle state & bootstrap**: Sanctioned next actions via `pipeline-core:pipeline-start`.
6. **Owned implementation surface**: Only then, the specific implementation files owned by the authorized module.

## Governed Modules

The repository is partitioned into 4 governed modules:

- [pipeline-core](pipeline-core.md): Core agent pipeline engine, hooks, lifecycle management, guards, and CLI scripts.
- [harness](harness.md): Verification runner, test orchestration, suite registration validation, and CI checks.
- [schemas](schemas.md): Canonical JSON schemas defining contracts, profiles, state, and receipts.
- [backlog](backlog.md): Sprint backlog items, evidence records, interruption baseline, and ledger history.
