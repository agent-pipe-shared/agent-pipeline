# Critic record: WINACLFIX-G bounded re-review (`8321624cb`, plus remainder of `5de5eaab1`)

Independent Critic, Opus 5.5 at max (route pre-check passed, SECURITY subject), ruleset
`0.7.0+claude.20261005202045.7170ed20`. Lane: functional-equivalent read-only, OS isolation not asserted.
Persistence unavailable (Write tool disabled, no write lane in the guard grammar); this file, written by the Elephant
from the returned report, is the durable copy.

**Status: partial review, pass/fail withheld** (budget checkpoint at call 22 of 24; about 10 calls were guard
refusals). Not reached: category 7 (`guardrails/global.md`, `security.md`, `quality-gates.md`, `CLAUDE.md` on disk),
category 11 (`docs/adr/0011-language-policy.md`), Verify discovery of the install test in `harness/scripts/verify.mjs`,
the installers' top-level error output, the failing-name lists of `scratch/WINACLFIX-F/commit-msg-before.log`,
`pre-commit-before.log`, `pre-commit-after.log`, `red.log` from line 17, and the full test file at `8321624cb`.

## F-A (minor) — a pre-existing segment with status `unavailable` still gets the owner remedy

`hardened-private-directory.mjs:30` at `8321624cb`: `if (!(created && removed)) return OWNER_REMEDY;` — a
pre-existing segment whose assurance is `unavailable` (failed, timed-out or malformed native read,
`windows-private-state.mjs:19`, `:143-145`, `:150-151`) is told it is "an existing insecure private directory" that
"must be removed or re-secured". The installers' first segment (`agent-pipeline` under the git common dir,
`pre-push-hook-install.mjs:697`, `pre-commit-hook-install.mjs:917`) is normally pre-existing, so this is the common
re-run path; following the remedy would discard private pipeline state whose security was never determined. Fails
closed; operator misdirection only. No test covers it. Registry F-1; spec `winacl-diagnosis.md:20-22` distinguishes
`insecure` from `unavailable`.

## Cleared

`8321624cb`: decision unchanged, prefix/disposition byte-identical; scope matches `changedFiles`; no consumer parses
the message text (all compare `error.code`); RED 11/3 at the new assertions, green 14/14, install 3/3; two
assertions tightened, nothing removed; harden-throw rethrown before remedy selection; no new data in the message; no
new imports. `5de5eaab1` remainder: authorship (three lib files match `changedFiles`; the evidence file is an
orchestrator-written record under `specs/*/evidence/`, not production code); `commit-msg-after.log` 22/20/2
(CMI002, CMI018); importers of `hardened-private-directory.mjs` do not parse the message; the registry range
`b54b108d9..6a36c0c4d` on the helper files is empty.

## Trajectory

Not verifiable (partial), consistent wherever examined. consumer-safe-paths 9/9 for G had no referenced artifact.

## Elephant disposition

- F-A → WINACLFIX-H (in flight): remedy chosen by status first (`unavailable` → unavailable remedy for created and
  pre-existing segments alike).
- Remaining categories 7/11 and the log comparisons → one bundled follow-up Critic after H.
