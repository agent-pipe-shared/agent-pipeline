fix(host-commit): restore the index after a refused whitespace check and name the generated-file route

K-33 (Glossover Epic 2): every Payload-generated migration with a
CREATE TABLE carries "space before tab in indent" in its SQL template
literal, so the native host commit refused it with
NATIVE-HOST-COMMIT-DIFF-CHECK. The host left the admitted paths staged,
and the following recover then stopped on GHCR-STAGED until the files
were unstaged by hand.

- On a refused diff check the host commit parses the flagged files,
  unstages exactly the admitted paths (git --literal-pathspecs reset)
  and records detail {reason: staged-diff-whitespace, condition:
  index-restored | index-left-staged, paths, extraCount} in the stop
  failure.
- The recover plan for a *HOST-COMMIT-DIFF-CHECK stop names the flagged
  files and the route for generated files: a committed .gitattributes
  line "<pattern> -whitespace", which git honours in the same check.
  The recovery commit itself does not run that check.

Tests: AHE15 (index empty after the refusal, detail carried), AHE16
(.gitattributes "*.sql -whitespace" lets the same file pass), recover
plan note for a diff-check stop.

AI-Assisted: true
Dispatch: stage-0 (elephant)
