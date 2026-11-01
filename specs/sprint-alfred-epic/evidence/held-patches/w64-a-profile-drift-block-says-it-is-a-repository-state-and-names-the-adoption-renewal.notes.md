# w64 — a profile-drift block says it is a repository state and names the adoption renewal (candidate 17, intake 1m)

Applies on the nine-patch chain (the base already carries the w49-a blocking-outcome listing this builds on).

## What went wrong

When planning fitness is blocked by class 9 (profile drift), `submit-plan` listed the class with its first violation and nothing else. The cause is not a property of the PRD: the accepted architecture
adoption snapshot differs from the current profile and module snapshot, so every feature plan of the repository is blocked until the adoption authority is renewed. An agent cannot tell that from
"class 9 (profile-drift) finding: ..." and edits the PRD instead.

## Change

- `lib/architecture-entry-readiness.mjs`: `describeBlockingOutcome` appends `PROFILE_DRIFT_REPAIR` for class 9 only: it is a state of the repository, no plan can pass until the adoption authority is renewed,
  read it with `architecture-adoption.mjs status --root <root>`, renew with `architecture-adoption.mjs prepare` and `apply` (the apply step carries the PO's signature).
- Tests: the class 9 refusal carries the repair; a class 7 refusal does not. Mutation-checked: appending the text for every class turned the second case red; the original was restored.
  41 tests pass in the readiness suite.

## Not changed / not proven

- The renewal route is named by its verbs, not by a full argument list: `prepare` needs a decision, scope, rationale, decision reference and `--decided-at` that depend on the repository, and the PO signs the
  request. The happy-path guide (separate item) is the place for the full sequence.
- The `status` verb was read from the script's own command list; the text was not run against a repository with a real drifted snapshot.
