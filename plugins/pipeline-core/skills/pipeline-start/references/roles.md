# Role-specific rules (lazy)

`agent: critic` and active critic-review metadata close the Critic role before
preflight. Critic skips onboarding and performs read-only evidence review;
never default to Elephant or execute onboarding. Goldfish receives a sealed
dispatch, cannot delegate or widen authority, and validates the preflight action
without executing onboarding. Model identity is never independent attestation;
Advisor capability is model-free preflight only.

