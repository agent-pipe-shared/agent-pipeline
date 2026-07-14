# The docs, and the order to read them

This folder is the pipeline's optional post-setup reference map. For the one-minute
picture, start with the top-level [README](../README.md); to stand up your own copy,
read [`SETUP.md`](../SETUP.md). After setup, use this list as needed.

## Reading order

1. [`overview.md`](overview.md) — the model in one read: how work flows from
   intent to a closed change. **Optional conceptual overview after setup.**
2. [`usage.md`](usage.md) — a day in the pipeline: the concrete, session-by-session
   workflow once you are set up.
3. [`migration.md`](migration.md) — bringing an existing project under the
   pipeline, step by step.
4. [`runtime-boundary.md`](runtime-boundary.md) — what is portable methodology
   versus what is specific to Claude Code.
5. [`deploy/README.md`](deploy/README.md) — the optional Release/Promotion phase:
   the adapter-based deploy guide, relevant only once your project's manifest
   declares a `release` section.

Then, as you need them:

- [`design-decisions.md`](design-decisions.md) — the "why" behind the method: the
  foundational decisions and their rationale.
- [`operating-model.md`](operating-model.md) — the full normative rulebook. The
  authority on conflict; open it when you need the exact rule.

(Formalized decisions live in [`adr/`](adr/) — one record per decision.)
