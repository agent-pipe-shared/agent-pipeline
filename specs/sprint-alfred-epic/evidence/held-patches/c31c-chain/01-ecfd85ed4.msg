fix(architecture): an accepted unowned-path exception keeps covering a test the derivation would now own

Candidate 31 derives the owner of a test file that no module's ownedPaths reach, so its relative imports are checked and it can be ambiguous between two modules. A project that adopted the check earlier by accepting every violation holds an unowned-path exception for such a test. After the upgrade the same test was owned, its import of another module became a forbidden-dependency and a two-module test became ambiguous-ownership, neither covered by an exception, and the old exception was reported stale: Verify went red on an unchanged tree.

The derivation is now skipped for a file that has an exact-path unowned-path exception, so the file keeps the reading it had when the exception was written and the exception stays used. Removing the exception hands the file to the derivation. The preview stays raw (it applies no policy), and the baseline policy of a new project uses excludedPaths, so the derivation stays on for every new project. Two cases pin it (an imported module outside allowedDependencies, a test of two modules) and both fail without the change with the reviewer's own violations.

AI-Assisted: true
Dispatch: stage-0 (elephant)
