# K55 part A: protected diff notes

File: plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs (matches guard-*.test.mjs, protected, not committed in the clone).
Diff: scratch/agent-out/k55-protected.diff (git apply --check from the main checkout: clean).

## What changed
A small shared helper posixCommandPath(path) (backslash to forward slash, identity on POSIX) next to POSIX_PARSE, applied at the
call sites that splice a join()/mkdtemp path into a Bash command string:
- NVA-B8-IPA: argv[0] (the attestation writer script path; the preflight argv and the command share it).
- bounded rg pipeline admits self-inspection: hooksDir, grammarFile, foreign.
- NVA-CATPIPE-1 exactness: outsideRead.
- host-provided transcript, memory and sibling paths: transcriptPath, memoryFile, sibling in the commands only (roots array and transcript_path keep the native spelling).
- PASSIVE-READ-ROOT-INTEROP: a posixPath helper inside the child script (the outer template escapes the backslash), applied to the five command splices only.
- runner session paths: prior.
- Codex transcript recovery: script and --root spelled once as recoveryScript/recoveryRoot; prior.
- sibling transcript path: prior.
- symlink-plus-dotdot: escaped = posixCommandPath(link) + "/../sibling/secret.txt".

No assertion, expected value, case name, skip or case count was changed (QG-04).

## Not changed: DEVPLANSHELL-5
The reader named it, but its commands are PowerShell-dialect (not the Bash POSIX parse), `path` is the root() fixture rather than a join() splice, and its node/script
paths are already normalised with replaceAll("\\", "/"). The remaining `--root '${path}'` is a single-quoted PowerShell literal where a backslash is not an escape.
The mechanism the briefing describes does not apply; the actual native-Windows cause there is unverified. Left untouched.

## Measured (Linux/WSL)
Before: tests 392, pass 389, fail 0, skip 3, todo 0. After: identical (392 / 389 / 0 / 3 / 0).
Native Windows was not available; the effect there is not measured.

## Proposed commit message
test(guard-lifecycle-ready): spell fixture paths in Bash command strings with forward slashes

Nine fixtures built a Bash command from a join() path whose backslashes the POSIX parse of the Bash tool eats on native Windows. They now splice the path
through posixCommandPath(), an identity on POSIX hosts. No assertion, expectation, case name or skip changed (QG-04); the Linux count is identical
(392 tests, 389 pass, 3 skip).

AI-Assisted: true
Dispatch: K55-TEST-FIXES (goldfish)
