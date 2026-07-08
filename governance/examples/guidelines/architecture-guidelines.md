# Architecture guidelines (generic example)

> **Advisory.** These are example guidelines a company MIGHT set for its projects —
> generic fixture content, not a real company's actual standard. Deviations from any
> numbered item below are ALLOWED, but MUST be named and justified in the plan artifact
> (dev-plan / PRD) so the reviewer can see the decision was deliberate, not an oversight.
> Consumed by: the planner/Elephant during design (as input to the plan), and by the
> Critic during review (as a benchmark for named deviations — an undocumented deviation
> is what the Critic flags, not the deviation itself).

1. **Layering** — respect the project's declared layer order (e.g. presentation → domain
   → data access); a layer may only call downward, never skip a layer or call upward.
2. **Dependency direction** — dependencies point from concrete/volatile modules toward
   stable/abstract ones; a stable core module must never import from a feature module.
3. **Naming** — names describe intent, not implementation detail (`calculateTotalPrice`,
   not `loopAndSum`); avoid abbreviations that are not domain-standard.
4. **Error handling** — fail loudly and specifically at the boundary where the error is
   first detectable; do not swallow exceptions silently, do not convert domain errors
   into generic ones without preserving the original cause.
5. **Logging** — log at the boundary of a unit of work (request/job entry+exit), include
   a correlation/trace id where the runtime provides one, never log secrets or full PII
   payloads.
6. **API versioning style** — breaking changes to a public API get a new version
   segment (`/v2/...`); additive, backward-compatible changes stay on the current
   version.
7. **Single responsibility per module** — a module should have one reason to change;
   when a change touches unrelated concerns in the same file, that is a signal to split.
8. **Configuration over hardcoding** — environment-specific values (URLs, timeouts,
   feature flags) live in configuration, never as literals in business logic.
9. **Idempotency for retryable operations** — any operation that a caller might retry
   (network calls, queue consumers) should be safe to run twice with the same input.
10. **Test placement mirrors source placement** — a unit's tests live in a predictable,
    discoverable location relative to the unit under test (project-declared convention).
11. **Explicit over implicit dependencies** — prefer constructor/parameter injection over
    hidden global state or ambient context lookups.
12. **Deprecation has a stated end date** — when a guideline permits deprecating an old
    path/API instead of removing it immediately, the deprecation notice names an owner
    and an expiry, not an open-ended "will be removed eventually" (mirrors AP7/QG-06:
    a documented-without-a-date exception is a finding, not a mitigation).
