# Failed session capability probe phase

NVA-B-CAPABILITY-PHASE-1 preserves a strictly closed failure phase from the
existing ordinary session probe when that invocation fails. The permitted
values are `descriptor-publication`, `descriptor-retirement`,
`descriptor-load`, `directory-rollback`, and `descriptor-rollback`.

The phase is optional for compatibility. Its absence remains valid for an
otherwise valid non-ready observation, which remains blocked; it does not
grant readiness. If present, it is accepted only with
`session-capability-unavailable`; invalid values, a non-session status, or a
ready observation carrying a phase are rejected as invalid observations.
Only the closed phase reaches the first native lifecycle denial line. Raw
errors, paths, tokens, nonces, and ownership data do not cross that boundary.

Machine-written host captures, all exit 0:

- `scratch/NVA-B-CAPABILITY-PHASE-1/capabilities-green-helper-fixed.txt` — 30
  capability checks, including deterministic failure injection from the
  ordinary probe.
- `scratch/NVA-B-CAPABILITY-PHASE-1/project-onboarding-v3.txt` — 165 V3
  checks.
- `scratch/NVA-B-CAPABILITY-PHASE-1/project-onboarding-ready-gate-phase-ready.txt`
  — 19 ready-gate checks, including rejection of ready-plus-phase.
- `scratch/NVA-B-CAPABILITY-PHASE-1/guard-lifecycle-ready.txt` — 248 lifecycle
  checks.
- `scratch/NVA-B-CAPABILITY-PHASE-1/guard-apply-patch-native.txt` — 16 native
  checks, including generated staging persistence, the PO-only
  acknowledgement request, and product-authoring denial.
- `scratch/NVA-B-CAPABILITY-PHASE-1/check-consumer-safe-paths.txt` — 9
  consumer-safe-path checks.

The historical intermittent native `session-capability-unavailable` event was
not reproduced by this work. These captures establish propagation when a probe
fails; they do not claim the intermittent condition is fixed or stable.
