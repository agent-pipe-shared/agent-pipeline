# D162 recon: brownfield architecture deferral and migration on contact

Research for backlog item `2026-10-26-brownfield-architecture-deferral-blocks-implementation-entry`
under PO decision D162 (no deferral for brownfield; adoption as an onboarding migration; an old
`deferred` record is migrated on contact with one disclosed PO confirmation). Read from code at
candidate `92c8ccc35` by slice W4-D162-RECON-20261026 (stopped at its budget checkpoint before
writing); this note was written by the Coordinator from that report plus three own checks
(marked "Coordinator check"). Paths are under `plugins/pipeline-core/` unless stated.

## Q1 Where `deferred` is offered and recorded

- `scripts/architecture-adoption.mjs`: `STATE_DEFERRED` (:39); `validateState` admits it (:53);
  `generateAdoptionProposal` offers `decisionOptions` `[approved-scoped, deferred, partial]` while
  the state is `adoption-required` (:254-256, proposal text :243-249); `applyAdoptionDecision`
  accepts it (:286); the CLI `apply --decision` names it (:598) and applies it with signed
  authority, writing `architecture/adoption-state.json` (:601-613, write :330). Expiry via
  `expiresAt`/`reviewDate` re-raises `adoption-required` (:88-106).
- The only bootstrap caller is the read-only orientation `lib/architecture-adoption-orientation.mjs`
  (:56-96, status `adoption-required | design-pending | decision-recorded`), called by
  `scripts/pipeline-start-preflight.mjs` (:1628, import :13); its action is the read-only
  `architecture-adoption.mjs propose --root --json` (:1643-1654).
- `scripts/project-onboarding-v3.mjs` and `scripts/onboarding-init.mjs` contain no architecture
  or adoption code. The consumer path is: preflight orientation -> `propose` -> PO
  `apply --decision deferred` -> `set-phase implementation`.
- Coordinator check: the pin's section (d) consumer is `lib/project-onboarding-v3.mjs`
  `designToImplementationHandoverAction` (pin :234-271), which offers `reopen-design` only for an
  `ok:false` design result with a verified content-drift code.
- Fixture drift: `scripts/pipeline-start-preflight.test.mjs` (:498, :524, :622, :878) uses the
  state string `deferred-valid-until-review`, which is not a real state value.

## Q2 What the implementation entry needs for a feature that adds paths

- `checkPlanningAdoptionDisposition` (architecture-adoption.mjs :344-427) treats
  approved-scoped, partial and deferred alike for scope (task scope under a recorded scope entry,
  prefix match with `/` boundary, :399-405).
- `lib/architecture-entry-readiness.mjs`: the deferral branch (:446-467) treats paths missing on
  disk as net-new; with any net-new path it falls to `ARCHITECTURE-FITNESS-NOT-READY` (:468-478)
  unless blocking status is `pass` or `excepted`. `projectPlanningFitness` (:173-212) tolerates the
  class-9 "approved-scoped authority unavailable" outcome only for `deferred` (:198-202), so an
  approved-scoped record needs a real snapshot (`lib/architecture-adoption-authority.mjs`, used by
  `scripts/architecture-fitness.mjs` :19).
- Inputs read: `architecture/map/index.md` and concept files (`scripts/module-inventory.mjs`
  `loadMapBundle` :116, `resolveModuleForPath` :204), `architecture/fitness-model.json` (default
  empty model, architecture-fitness.mjs :62-68), `architecture/baseline.json` (`loadBaseline`
  :74-90; `applyRatchet` :107 turns accepted violations into `excepted`). Earlier failures: map
  (:331-336), fitness model (:337-339), baseline (:340-342), disposition (:343-345), AGENTS.md
  pointer (:346-355), checkpoint debt (:361-370).
- The adoption record has no baseline commit or path list (known limitation :438-445); its keys
  are fixed at architecture-adoption.mjs :52 and bound into the authority subject (:81-82,
  `buildAdoptionSubject`). Adding a baseline is a schema change.
- Coordinator check: `saveBaseline` (architecture-fitness.mjs :95) has no caller anywhere, and
  `lib/architecture-map-scaffold.mjs` only scaffolds greenfield. No tool measures an existing
  repository into a map, fitness model and baseline today.

## Q3 Where an old `deferred` record is first met

1. Every session start: the orientation reports it as `decision-recorded`; with a missing map it
   offers the read-only proposal. A disclosed migration offer fits here as a new orientation
   status plus a preflight action, without touching a guard.
2. `set-phase implementation`: `lib/guard/entry-gates.mjs` `architectureAdoptionAuthorityVerdict`
   (:102-129) accepts any ok disposition; `architectureFitnessAuthorityVerdict` (:147-) carries the
   deferred allowance (:174-188) and the greenfield allowance (:196).
3. `lib/architecture-entry-readiness.mjs` :446 is where the ratchet refuses.

Coordinator check: the orientation, `pipeline-start-preflight.mjs`, `architecture-fitness.mjs`,
`lib/guard/entry-gates.mjs` and `module-inventory.mjs` are all NEVER_LIFTABLE kernel paths, like
the two files named in the item. Every D162 slice is therefore a held patch.

## Q4 Tests that pin `deferred` as an accepted choice

- `scripts/architecture-adoption.test.mjs`: :76, :95, :200 (decisionOptions deepEqual), :212,
  :274, :288, :382.
- `lib/architecture-entry-readiness.test.mjs`: :126, :142, :166, :190, :345, :390-434 (incl.
  source `adoption-deferral` :432).
- `lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs`: :59,
  :168, :191, :212, :223.
- Fixtures: `scripts/architecture-fitness.test.mjs` :109, `scripts/pipeline-state.test.mjs` :51,
  `scripts/po-human-approval.test.mjs` :689/:714, `scripts/pipeline-start-preflight.test.mjs`
  :489/:616.
- Not yet checked: entry-gates tests, `scripts/push-init.test.mjs`, `control-placement.mjs`,
  `lib/architecture-design*.mjs` fixtures.

## Q5 Proposed slices (all held kernel patches)

- S1 measurement: a read-only-to-repo `measure` step that writes map, fitness model and baseline
  (with a baseline commit) for an existing tree; nothing does this today.
- S2 adoption (`architecture-adoption.mjs` + test): stop offering `deferred` for brownfield;
  add `migrate`, which re-records a `deferred` record as approved-scoped with a baseline commit
  after one PO confirmation; schema field for the baseline.
- S3 entry (`architecture-entry-readiness.mjs` + test, entry-gates if needed): judge net-new
  against the baseline commit, not on-disk existence; an unmigrated `deferred` record returns a
  typed migration offer instead of routing to `reopen-design`.
- S4 orientation and preflight: report a legacy `deferred` record as a migration offer with a
  disclosed action at session start.

## Open PO questions

1. May the migration record existing debt as accepted (`excepted`) baseline violations, or must
   the measured architecture be clean?
2. Is `deferred` removed only for brownfield, or also for greenfield and for repositories with
   no measurable map?
3. Do `expiresAt`/`reviewDate` stay for `partial`?
4. Does the migration confirmation use the same signature route as a fresh adoption (ADR-0056
   mode), or a lighter one?
5. Is the baseline commit mandatory for every new approved-scoped record?
6. At `set-phase implementation`, does an unmigrated `deferred` record block with a migrate
   prompt, or is the migration offered in-session automatically?
