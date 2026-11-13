fix(dispatch-briefing): derive the Critic trigger's security and guardrail flags from the write scope

Glossover K-29: the briefing builder hard-coded the Critic decision's
diff trigger with security and guardrails false. The host checks the
real diff with classifyCriticChangedPaths, which marks any path segment
named security/auth/secret/credential (and hooks/policies) accordingly,
so a dispatch writing docs/security/** or an auth route ended with
NGHF-CRITIC-PATH-DISPOSITION (critic-trigger-underdeclared): the commit
landed but no dispatch record was written.

- The builder classifies allowedPaths with the same function and
  declares guardrails/security from it; architecture stays declared, so
  the applied row stays T1.
- Test: a security, auth and policies write scope yields a trigger the
  host's path check accepts.

Checkpoint-Intent: candidate 29c, Glossover K-29
AI-Assisted: true
Dispatch: stage-0 (elephant)
