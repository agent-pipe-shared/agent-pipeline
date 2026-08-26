# Role-specific rules (lazy)

`agent: critic` and active critic-review metadata close the Critic role before
preflight. Critic skips onboarding and performs read-only evidence review;
never default to Elephant or execute onboarding. Goldfish receives a sealed
dispatch, cannot delegate or widen authority, and validates the preflight action
without executing onboarding. Model identity is never independent attestation;
Advisor capability is model-free preflight only.

For both briefed roles the briefing replaces the handover: reading the
handover/state file or history artifacts is forbidden, and the staleness check,
model/effort step and the Elephant role-prohibitions step do not apply to them.
Goldfish carries the ruleset SHA from its briefing — a briefing without it is a
briefing defect and goes back to the Elephant, never researched independently.

Confirmation-line variants of the `State` field: Goldfish prints
`State briefing {{TASK_ID_OR_DATE}}`; Critic prints
`State n/a (Critic sees no history)` and confirms that no write tool is
available to it. Both print the one compact line, no extra lines.
