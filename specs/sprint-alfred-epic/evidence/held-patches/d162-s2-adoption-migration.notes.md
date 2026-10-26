# D162 S2 held kernel patch: adoption stops offering a new deferral and names the migration for a legacy one

Patch: `d162-s2-adoption-migration.patch` (4 files, 204 insertions, 5 deletions). Held because `plugins/pipeline-core/scripts/architecture-adoption.mjs` is a NEVER_LIFTABLE kernel path.

## Apply order

Apply AFTER C29 item 14 (the 14 patches in `scratch/wave3/c29-order-14.txt`, in order), then this patch. Stack check: a fresh clone of the repository HEAD (`c6cd3a6d7`) accepted the 14 patches and then this one with `git apply --index` (15 of 15 apply).

## Touched files and preimage SHA-256 (on the stacked clone, i.e. after the 14 C29 patches)

| File | Preimage SHA-256 |
|---|---|
| plugins/pipeline-core/schemas/pipeline.adoption-proposal.v1.json | 67fc90be5a615793a940f92c7b5b7391ea8ccd3ca243eaa7f49c9b5acfa9aede |
| plugins/pipeline-core/scripts/architecture-adoption.mjs | 35607b09f2acb7f3323bf2fa0eb0a2b287220ceef08a39dc61f515fb7b85ec72 |
| plugins/pipeline-core/scripts/architecture-adoption.test.mjs | 8388e3bf1c8ce164a4a1d34900bc5e4f0ad598b232a74733e20cc3cf04cf4290 |
| schemas/pipeline.adoption-proposal.v1.json | acd4ea65ae1ab3f93b1b95150fd2aa3e966ffe99d17a2c2a97111499d4bc03f0 |

The two schema copies receive the identical `migration` property and stay deep-equal (the parity test around line 319 of the test file passes).

## Behaviour

- `generateAdoptionProposal`: while adoption-required, `decisionOptions` is `[approved-scoped, partial]`. For a non-expired legacy `deferred` record the proposal carries an optional `migration` (`from`, `scope`, `steps`): `measure` (only when `architecture/map` is absent), `prepare` and `confirm-and-apply`; `decisionOptions` stays `[]`.
- CLI `prepare --decision deferred` and `apply --decision deferred` refuse before building or writing anything: `ADOPTION-DEFERRAL-RETIRED:` on stderr, exit 1, no file (also no `--out` file).
- `checkPlanningAdoptionDisposition` unresolved text names "approved-scoped or partial"; the apply usage text is "approved-scoped | partial".
- The library still reads, verifies and applies an existing `deferred` record; `applyAdoptionDecision`, `validateState` and `resolveAdoptionState` are unchanged for it.
- `architecture-adoption.mjs` does not import `architecture-measure.mjs`; the migration only names it as a step.

## Counts (in the stacked clone, after the change)

| Suite | Result |
|---|---|
| architecture-adoption.test.mjs | 52 tests, 52 pass, 0 fail (RED before the change: 52 tests, 46 pass, 6 fail) |
| lib/architecture-entry-readiness.test.mjs | 32 / 32 pass |
| lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs | 14 / 14 pass |
| scripts/pipeline-start-preflight.test.mjs | 96 / 96 pass |
| scripts/architecture-fitness.test.mjs | 58 / 58 pass |
| harness/scripts/check-consumer-safe-paths.test.mjs | 9 / 9 pass |

No pre-existing failures observed.

## Why no subject or state-schema change

`buildAdoptionSubject` (lib/architecture-adoption-authority.mjs) already binds the candidate commit and `moduleSnapshotSha256`, a hash of every `architecture/map` file. An approved-scoped adoption prepared after the measurement therefore binds the measured map. The end-to-end test (deferred record committed, `architecture-measure.mjs --apply`, commit, prepare, sign, apply) resolves to approved-scoped and passes the planning check inside the scope with the authority module, adoption-state schema, entry readiness and gates all unchanged.

## Changed existing assertion

The `decisionOptions` assertion near line 200 now expects `[approved-scoped, partial]` with a one-line D162 comment. Justification: D162 retires the new deferral, so an adoption-required state no longer offers it. No other existing case changed.

One new-case expectation was corrected during GREEN: the migration scope test first expected the scope in input order; the record stores scope normalized (sorted), and the briefing defines migration scope as the record's scope array, so the case now expects `["lib/", "src/"]`. The implementation was not altered for this.

## Still owed

- S3: the typed entry refusal for brownfield implementation entry without a disposition.
- S4: the orientation offer.
- The bundled signed ceremony that applies the held patches; Full Verify, batch Critic and PO acceptance remain pending.

## Proposed commit message

```
feat(architecture): retire new adoption deferral and name the migration of a legacy one

Adoption no longer offers or accepts a new deferred decision (D162): the
CLI refuses it with ADOPTION-DEFERRAL-RETIRED and the proposal offers
approved-scoped and partial. A legacy deferred record is still read and
applied, and its proposal carries a migration naming measure, prepare and
confirm-and-apply. The proposal schema gains an optional migration property.
```
