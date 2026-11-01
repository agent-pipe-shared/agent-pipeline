# w50 — the Full Verify clone lives outside the verified repository (candidate 17, slice 4, documentation only)

The first 0.7.0 Full Verify on 4cb48720f (2026-11-01) had five reds and no confirmed product defect. Two of them were effects of where the
clone was placed: `g23-read-help-tests` (`G23C001`; a clone under the verified repository's `scratch/` makes `ls -lh ../` stay inside the project,
the same test is green in the verified checkout) and `security-scan` (every adapter `remote-not-configured`, the clone had no remote). Three
others (`agy-host-commit-execution-tests`, `critic-course-admission-tests`, `pipeline-state-tests`) passed alone.

## Change

- `docs/operating-tools.md`: a short subsection "Where the Full Verify clone lives" under the Full Verify rows: place the clone outside the
  repository it verifies, give it a working `upstream` remote, and re-run a red alone before calling it red.

## Not changed / not proven

- `scripts/full-verify.mjs` is unchanged: no refusal for a nested clone and no remote setup (it has no test suite to hold such a check; adding
  one needs a suite registration). The statements about a clone elsewhere with a remote are the expected behaviour and are not yet measured by a
  second Full Verify.
