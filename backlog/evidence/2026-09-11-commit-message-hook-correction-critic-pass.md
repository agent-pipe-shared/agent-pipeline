# Commit-message hook correction Critic PASS

Date: 2026-09-11

The ordinary fresh-session Critic reviewed only the correction range
`8866d1d2043ac1b148a99eeebd45bffc53060dc3..306f85603be8256397338a3588c2b29db8d46010`
against `specs/sprint-nova-epic/nova-b-git-boundary-correction.md`, the Git
guardrail, ADR-0079, the candidate threat model, the derived governance inputs,
the candidate-bound focused-test evidence and the preceding failed review.

Assurance was `functional-equivalent-read-only`; OS isolation was not asserted.
The native Codex sandbox was not used and contributes no acceptance claim.

## Verdict

**PASS. No findings.**

The reviewer confirmed that:

- `posixSingleQuote()` renders the installed implementation path as one POSIX
  single-quoted shell word and encodes apostrophes by closing, quoting the
  apostrophe and reopening the word;
- `applyInstall()` writes that shim and onboarding calls the installer on the
  real setup path;
- the regression test covers apostrophes, whitespace, a newline, `$()`,
  backticks and `$VAR`, then proves a valid commit succeeds without executing
  either command or variable expansion; and
- the correction preserves the finished-message GIT-03 backstop and closes the
  shell-expansion path identified by the preceding Critic.

The reviewer reported no briefing violation and found the correction
consistent with the supplied candidate-bound evidence. The reviewed candidate
was commit `306f85603be8256397338a3588c2b29db8d46010`, tree
`984efad66637463f4dba084bcba877ab48728b04`.

The preceding blocker report is retained at
`scratch/NVA-B-COMMITMSG-1-critic-fail.md` with SHA-256
`608c07223f02a22b01a71a8a3e95909805d6dbbebf566d963cf5626dd0100d77`.
The correction dispatch bound that report through
`scratch/NVA-B-COMMITMSG-1-correction-input-bindings.json`.
