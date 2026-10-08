# Critic — AC-34 package, full review (aa395e32e, 697aa4b30, 326e3a07a footprint hunk)

Route claude-opus-5-5 (effort unknown), functional-equivalent-read-only. Verdict **FAIL** at the 80 % checkpoint
(20 of 25; hunt categories 1–11 and the evidence gate done). One major, two minors. Trajectory consistent
(UC02C008/009 RED with `PU-FOREIGN-HOOK-PRESERVED` → 10/10).

## Findings (registry IDs)

- AC34-F1 (major): `apply` refuses every conflict with the generic `PU-OWNERSHIP-CONFLICT`
  (`lib/project-uninstall.mjs:64`); the CLI error (`scripts/project-uninstall.mjs:8`) carries only that code. The new
  code exists only as plan data (`lib:40`); no hook name, no "nothing was removed", no attended step reaches the
  operator. SPEC:1073 / U-1; decision AK. UC02C002 still pins the generic code (`test:54`).
- AC34-F2 (minor): the AC34 refusal helper asserts `apply` with a bare `assert.throws` (`test:98`), so UC02C008/009 pass
  for any error.
- AC34-F3 (minor): U-1 is only partly demonstrated — no Git-history check, no commit/push after the refusal (the file's
  harness at `test:34` could do it), win32 only, no consumer-layout repository.

## Not reached

Calibration risk zones; ADR-0063 placement; HOME redirection for the keys assertion; QG-03 vs `.txt` evidence;
intermediate commits between the listed SHAs.

## Dispatcher disposition (2026-10-08)

Ruling 29: `apply` refuses with `PU-FOREIGN-HOOK-CONFLICT` whenever any conflict carries that code (precedence over
the generic code; other conflicts keep theirs), and the refusal carries
`instructions: { hook: <repository-relative path>, removed: false, attendedStep: <one sentence naming the owner's
step> }` on the error and in the CLI's `pipeline.project-uninstall-error.v1` output. UC02C002's foreign-hook arm moves
to the new code — that is a contract change ruled here, so the test-only dispatch AC34-T3 may update that one
expectation; it also binds the code in the AC34 helper and adds a commit + push after the refusal. POSIX dialect and
consumer layout → host checklist H2. Then AC34-F2; self-verify (one full Critic done; a delta only if the fix exceeds
the two named files).
