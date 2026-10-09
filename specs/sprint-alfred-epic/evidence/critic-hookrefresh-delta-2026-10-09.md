# Critic record: HOOKREFRESH delta (Opus 5.5 at max, class G), 2026-10-09 night

Persisted by the Elephant because the Critic had no Write tool (CR-06-D unavailable; Ruling 98a open).
Content is the Critic's report, condensed; findings, evidence and enumeration are kept verbatim in substance.

- Route: requested `claude-opus-5-5 at max`; effective `claude-opus-5-5` from the runtime prompt. Pre-check passed.
- Review object: `02689a69c` (T6), `ba5121821` (T7), `fa8aaf39d` (F2), one `git show` each.
- Outcome: **partial review, pass/fail withheld** (stopped at the hook's 80 % checkpoint, counted call 20 of 24).
- This was the permitted delta round (one full round + one delta). No further Critic round on this slice.

## Findings that passed the evidence gate

### HR-D1 (major): the Ruling 84 F2 zero-bytes test is missing
- Ruling 84 F2 requires a test proving zero bytes under the store directory after a preflight run.
- Shipped instead: a fake in-memory store with a `persist` spy (`model-role-bootstrap.readonly.test.mjs` ≈:50–80,
  :61, :74); a seam-argument spy (`pipeline-start-preflight-enforcement.test.mjs` ≈:281); a source regex
  `/readOnly:\s*true/` (readonly test :137–145), whose own header (:24–25) calls run-time behaviour not verifiable.
- In `model-role-bootstrap.mjs`@`fa8aaf39d` the `readOnly` return sits at :286–288, after the confirmation block.
  The `activation.status === "active"` branch (≈:196–207) returns via `prepareFamilyBootstrapProjection` before it.
- Spec-ref: Ruling 84 F2 last bullet; Ruling 70 R3.

### HR-D2 (major): no fresh capture at the fix commit
- Ruling 84 "Trajectory" asks for fresh captures at the fix commit. All four captures were taken at other heads
  (`e64b30b72`, `27c3b1b24`, `df5d562d1`, `6ebec9435`), all `dirty: true`.
- The green `after-rerun.txt` recorded tree differs from `fa8aaf39d` in exactly the four fix files (+57/−30), so the
  content that went green has no recorded identity.
- GREEN control F1(h) (`clone-hook-readiness.partial.test.mjs:235`) failed in `before.txt` and passed in
  `after-rerun.txt` with no attributable code change.
- Spec-ref: Ruling 84 "Trajectory"; template Phase A category 4.

## Candidates, not findings (unverified)
- C1: `readOnly` not consulted on the model-family `active` branch; whether `prepareModelFamilyInvocation` writes is
  unverified.
- C2: whether `createModelRoleHostStore` writes on construction is unverified.
- C3: consumers of the new statuses `confirmation-required` / `admission-pending` not checked.
- C4: possible third direct `runModelRoleBootstrap` call in `runEntry` not confirmed.
- C5: tranche-2 registration of the four test modules (Ruling 94(d)) not checked.
- C6: unchecked `installPreCommit` result in the pre-commit-only path; dropped as pre-existing.

## Deliberately not flagged (examined, in order)
Ruling 84 F1 branch order and rollback; F2 code shape; F3 five items; F4 closed allowlist; Ruling 94(a) CHRB007 re-point;
94(c) no new import, GMWKC01 red pre-existing (same 26 violations); scope; QG-04 test/fix split; security/dependencies;
commit metadata; language; QG-06 owner of the readonly-header note.

## Trajectory
Inconsistent (HR-D2). Authorship consistent with dispatched work by trailers.

## Briefing violations observed
Narrative embedded in the Ruling 84/94 spec entries (prior-round status, self-verification claim, WSL counts, pin
characterisations). Not used as evidence. Elephant action: future rulings cited as spec keep narrative out of the
cited requirement bullets.

## Not reached
Category 3 and 7; `spec.md`; `pipeline-start-preflight.mjs` `runEntry` and `modelRoleBootstrap` consumers;
`lib/model-role-host-store.mjs`; `lib/model-family-invocation.mjs`; `check-clone-provisioning.mjs` 1–37;
`clone-hook-readiness.mjs` inspect/apply tail; `refresh-mandatory-hooks.mjs`; tranche-2 list files.
