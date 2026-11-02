# w91 — the scope-mismatch refusal names the required coverage; scope advice is a question (candidate 18, C18-12)

Binding: AC-241 is the closest existing accepted criterion; the PRD and Spec are unchanged.

## What it adds

- `lib/architecture-design.mjs`: `ARCHITECTURE-DESIGN-SCOPE-MISMATCH` now carries the existing typed field detail (`field: "disposition.scope"`, `expected`, `rejectedValue`) naming which required paths the approved `disposition.scope` does not cover: the plan path, `architecture/map/index.md`, `architecture/fitness-model.json`, `architecture/baseline.json`, an implementation-surface path, or the task scope. The list is deduplicated, at most 6 entries, each at most 96 characters, repo-relative. The code and the firing condition (any required path uncovered) are unchanged; it uses the existing `rejectField` helper, so no caller signature changes.
- `agents/readiness-reviewer.md`: one short paragraph. A proposed architecture scope or disposition is never stated as a fact; the reviewer phrases it as a question to the Elephant and names the coverage list materialization checks. No tool is added (still Read, Grep, Glob).
- `lib/architecture-design.test.mjs`: one new case (RED against the original code on the missing field, GREEN after). It checks the refusal names each uncovered required path, does not name covered ones, covers the implementation-surface and task-scope branches, and that a fully covering scope still passes. `hf9Fixture` gained an optional `designInput` parameter.

## Why

A readiness reviewer advised a wrong scope, the PO signed it, `materialize-architecture` refused with a bare code and a second signature was needed. The refusal now says what to fix before a signature.

## Checks

- `architecture-design.test.mjs` 18 of 18; `architecture-entry-readiness.test.mjs` 41 of 41; `check-consumer-safe-paths.test.mjs` 9 of 9; the agent-definition pin `agy-driver-dispatch-and-design-routes-incomplete.test.mjs` 21 of 21 (all in the slice clone).

## Not changed / not proven

- What scope materialization accepts or refuses, every other ARCHITECTURE-DESIGN-* code, and the agent's tools are unchanged.
- Follow-up, not in this slice: a `materialize-architecture --plan` dry-run mode (a new CLI mode in `pipeline-state.mjs`) so the scope can be checked before signing.
- The full Verify run was not made; the new case is in an already registered test file.
