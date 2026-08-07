# Role-specific bootstrap reference (lazy)

Load only when the selected role is Goldfish or Critic and a non-ready or
role-specific condition requires detail. Goldfish remains non-delegating and
bounded by its dispatch; Critic remains read-only and never performs onboarding
or changes role. The model-free Advisor preflight, authority, calibration,
handover and Verify checks remain mandatory facts from machine readback.
