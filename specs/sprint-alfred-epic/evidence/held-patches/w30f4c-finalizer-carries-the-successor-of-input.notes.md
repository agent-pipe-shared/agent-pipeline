# w30f4c — the session Critic finalizer accepts and forwards the optional successorOf course input (candidate 30f, C30F-G4C)

Applies AFTER the 30e chain plus C30F-G2 plus C30F-G4 plus C30F-G4B: the patch is the delta `5964ddbbd426..HEAD` of a clone that already holds all four, because it edits files the earlier slices touched. It does not apply to a checkout without them (`apply --check` on the C30F-G4B clone: exit 0; on the real repository before the chain: expected to fail). Criterion binding: AC-108 is the closest existing accepted criterion (a fresh bounded attempt under its unchanged text). The PRD and the Spec are unchanged.

## What it changes (only `scripts/session-critic-finalizer.mjs` and its test file)

- `validateCliRequest`: for a v2 request, `review.courseContext` is the five closed keys plus the OPTIONAL sixth key `successorOf`, which must be a string matching the feature-id pattern; any other shape is refused with the existing `SCF-REQUEST` text. No new request schema version; requests without the key validate exactly as before. The `--help` text gains one line naming the optional key (the existing schema line is unchanged).
- `featureReservationFor`: the `courseInput` construction moved unchanged into the exported pure function `featureCourseInputFor(options, course, preflight, root)`, which adds `successorOf` only when the course context carries it. Without the key the object is key-for-key identical to before. The finalizer already re-runs the preflight from `options.preflightInput`, which carries the whole `courseContext`, so no other place rebuilds a course input (`courseContext` is read at the request validation, the preflight input hand-over and `featureCourseInputFor`).
- The feature-id pattern is a local copy of `PACKAGE_FEATURE_ID` of `critic-dispatch-preflight.mjs`: that constant is not exported and that file is outside this slice's scope. The two must stay equal.

## Tests (existing file `session-critic-finalizer.test.mjs`, three appended cases, no registration change)

- (a) a v2 request carrying a valid `successorOf` reaches the preflight with it (admit and finalize); without the key the preflight context has no such property.
- (b) invalid values (`"Not A Feature"`, `7`, `null`, `""`, `"../x"`) and an extra key beside it are refused `SCF-REQUEST`.
- (c) `featureCourseInputFor` carries `successorOf` when given and has exactly today's nine keys when absent.
- Test-first honesty: written before the production edit and run RED against the original code: (a) and (c) failed, (b) already passed (the five-key check refused every one of those shapes; it is a guard that the widened check does not accept them), 125 others passed. After the change the whole file was run green (see the report for counts).

## Not changed / not proven

- NOT proven end to end: round 1 of a flag-only successor consumed through `admit` without `CCA-MANIFEST-READ` (item d). The fixture needs a feature whose manifest and review unit are introduced after the base and a State file recording the predecessor as discarded; `featureCourseFixture` in this test file has neither and the G4B fixtures live in other test files. Proven instead: the request is accepted, the preflight input carries the key and the reservation `courseInput` carries it; admission, preflight and the late-unit reservation are proven in G4B.
- Admission, preflight, generic batch and every other file are untouched.
- The full Verify run was not made; case counts of the finalizer test file change by three (inventory refresh after applying).
