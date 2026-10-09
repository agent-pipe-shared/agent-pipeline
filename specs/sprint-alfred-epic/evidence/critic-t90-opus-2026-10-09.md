# Critic review: T90 (win32 audit-lock owner liveness), GUARDRAIL class, Opus (2026-10-09)

Persisted by the Elephant from the Critic's returned report. The Critic had no Write tool, so it wrote no notes file and
disclosed that. The content is condensed; no finding, severity or evidence citation was changed.

- **Route:** requested `claude-opus-5-5` at max. The effective identity `claude-opus-5-5` was observed in the runtime
  prompt, so the route pre-check passed.
- **Review object:** `b395f1c47` (T90-T, RED pins) and `58a30b844` (T90-F, fix).
- **Review:** complete, not partial. 21 of 24 base calls were used.
- **Verdict: FAIL** (on F1).

## Findings

### F1 [major]: the typed recovery is published but not consumed

`58a30b844` attaches `error.recovery = { files, command }` to `HGO-AUDIT-LOCK-AMBIGUOUS`
(`lib/human-guard-override.mjs:2441-2452`). No human-facing surface reads it:

- The planning refusal is still built by `humanGuardRouteUnavailableReason` (`:3103-3108`), which emits only
  `Reason: planning the route failed with code=<code>.`
- The override CLI writes only `${code}: ${error.message}` (`scripts/guard-human-override.mjs:577-578`).
- The only `.recovery` occurrence in the module is the assignment at `:2447`.

So the backlog acceptance is unmet where the operator meets the refusal ("the refusal names the attended recovery
command instead of failing opaquely"; Ruling 111: "T90 cure"). Whether anything under `hooks/` reads `.recovery` was
not checked.

### F2 [minor, tied to F1]: an unconditional delete command is also attached to live win32 owners

The command is a bare `Remove-Item -LiteralPath '<lock>'` or `rm -- '<lock>'` (`:2449`). It is attached to every
`ambiguous` verdict, and on win32 that includes a live, busy owner, because that branch never answers `live`
(`:2413`, `:2428`, `:2540`).

- The backlog interim procedure's precondition, "after checking that no ceremony is running", is dropped.
- If F1 is fixed by printing the command verbatim, an operator could delete a live writer's lock. A second writer on
  the HMAC-chained ledger risks a torn ledger.
- Test (f) pins the keys to exactly `["command","files"]` (`test :6148`).

### F3 [minor]: the new seam is untested, and the win32 pins skip with a reason that is now false

`dependencies.auditLockHost` is added but no test uses it. Pins (a)–(d2) still skip off win32 with "auditLockOwnerState
has no … injection seam (T90-F adds it)" (`evidence/T90-F-20261009/wsl-after.txt:157-162`). Also unpinned:

- the ±1-minute `WIN32_BOOT_MINUTE_TOLERANCE` boundary;
- the seam's `HGO-AUDIT-LOCK-MALFORMED` validation.

The test commit's own header asks for the re-pin (`test :5893-5899`).

## Deliberately not flagged (categories 1–11 examined)

- **Spec fidelity:** ESRCH → dead, EPERM → present, probe throw → ambiguous; the boot-minute rule, foreign host,
  legacy `"unavailable"` and Linux extraction are all correct. RED comes before the fix.
- **Accepted design deviation:** the ±1-minute tolerance is a fail-safe deviation with a comment.
- **Scope:** one file per commit.
- **Authorship:** trailer-level checks are fine.
- **Test integrity:** nothing was weakened.
- **Edge cases:** all fail closed.
- **Quoting:** correct for both shells.
- **Other categories:** no new dependencies, and language and layout are correct.
- **Not flagged:** the wall-clock-step sensitivity of `Date.now() − os.uptime()`. It is mandated by the Ruling and is a
  design question, not a defect.

## Trajectory: consistent, with three residuals

1. All captures are dirty, and their tree ids do not resolve, so the tested bytes are not proven identical to the
   blob at `58a30b844`.
2. No capture exists at or after `58a30b844`.
3. Native ran only `--test-name-pattern=T90-T`.
