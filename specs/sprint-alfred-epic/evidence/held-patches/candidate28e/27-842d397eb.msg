fix(design): retain every non-re-derived manifest entry when an approval supersedes the package

The supersede added for the Claude test run kept only the
candidate-evidence entries of the earlier manifest. A package that also
listed a threat model, supply-chain record, plan or further design file
lost those entries silently on the rebuild, and its close later missed
an artifact the manifest had bound.

- lib/feature-package-registration.mjs: supersededRegistrations
  re-derives the PRD, Spec, Acceptance, Result and the Critic review
  unit; every other entry is retained with its own fields (class,
  authority, mutability, retention, any amendment) and its recorded
  digest, provided it lies under specs/<feature>/ and its file still
  holds those bytes; otherwise the supersede is refused as before
- the manifest rebuild writes retained non-evidence entries with their
  own fields instead of re-labelling them candidate evidence

Tests: architecture-baseline.test.mjs 7.13c gains a threat-model entry:
retained with its own fields in state approved and implementing; a
drifted threat model refuses the supersede and leaves the manifest
byte-identical. 42/42.

AI-Assisted: true
Dispatch: stage-0 (elephant)
