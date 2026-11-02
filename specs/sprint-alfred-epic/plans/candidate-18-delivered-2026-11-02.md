# Candidate 18: delivered, installed, verification state (2026-11-02)

Companion to the short entry in `docs/state.md` (which has a hard size cap). Plan: [candidate 18 plan](candidate-18-plan-2026-11-02.md). What goes to candidate 19: [seed](candidate-19-seed-2026-11-02.md).

## Delivery

Held patches w74 to w109 (35 steps), applied by the PO through `specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate18.sh` (derived-files commit `1fb3e5197`), stamped `3cdc6e7a8` (`0.7.0+claude.20261102170250.1fb3e51`), installed and read back on this machine: the start preflight reported `hook-refresh-required` once (git hooks bound to the older distribution), the exact refresh action was run, the identical preflight then reported `ready`. Implementation complete, PO acceptance pending.

## Content

- Parallel Goldfish host commits: diagnostics, recover command, moved-head tolerance in the host observation, the attempt terminal binding and a routine-repair pointer (C18-1a to C18-1e, C18-18b; w76, w77, w90, w95, w96-c18-1e, w97). Unproven in a real parallel run.
- Test-first evidence in the Goldfish return and a flag for its absence (C18-19, w102).
- Close: the drive names every PO action and an already closed lifecycle (C18-4, w79, w103); the push threat model is listed before the close commit (A18-M5, w93); close-time quality readback and audit index (C18-10, w98).
- Refusal texts name flag, path, example and the way forward (C18-8 w80, C18-12 w91, C18-14/14b w87 w92, w101); conventional-commit prints the guard-conformant trailer set (C18-7, w82); Windows directory fsync is a warning (C18-6, w81).
- Signing: refused before the prompt with the push remedy named (A18-M2, w83); every critical signing kind mirrors its proof where the agent can read it (C18-11, w100); parity on every runner: the agent prepares everything, only the sign-off is the PO's (audit C18-21 w105, texts C18-22 w106).
- Antigravity: native implementation admission and carrier names (A18-B1, w84); runner support in the briefing generator, its build and probe (A18-M1b/c, w99, w107); honest observation boundary row and carrier prepare command (A18-M6, w96-a18-m6).
- Briefing: ruleset identity and version (C18-9, w85); optional visual check (C18-15, w94).
- Onboarding: first consent names what is installed and activated, mandatory hooks follow a kickoff promotion (C18-20, w104); inspect names the approving instance of a confirmation (C18-5, w89); an edit to an approved design source is denied up front (C18-13, w86).
- Verify: the verify evidence producer (C18-3, w74), configure-verify named (C18-2, w75), four new suites registered (w108), two pins fixed (w109).

## PO decisions of 2026-11-02

Signing wrapper answered by parity, no new script. Hook activation automatic after the kickoff promotion, consent given by the extended initial "use the Pipeline?" question. C18-17 part 1 (a second Goldfish writing the tests) not built, and no configurable variant. Test-first check at the end of the run. Sequence for the candidate: apply, stamp, install, then a Full Verify (the Elephant) with fixes in a second apply script, then stamp and install again, then the greenfield tests.

## Verification so far

Slice suites, the whole-chain checks (suite registration 1150/0, vendored canon, case-completion) and a rehearsal of the apply script (exit 0) green. A Full Verify on a clone under `/tmp` ended with 73 of 1152 steps red. `session-authority-lock-wait-tests` failed 0/5 there and passed 5/5 in a clone below the home directory, so most reds are expected to be an effect of the clone location; only two were traced to the candidate and fixed (w109: SPDX header of the w81 suite; an apostrophe in a w89 regex made the case-completion classifier read a two-test suite as one case). Known environment red below the home directory: `g23-read-help-tests` and `public --help ... HELP-FORBIDDEN-IO` (candidate 19 item).

## Open

The Full Verify below the home directory and what it finds; the batch Critic (paused by the PO); native Windows runs; real Codex and Antigravity runs; the security scan (`--remote upstream`); the end-to-end hook activation on a real promotion; parallel host commits in a real parallel run; PO acceptance.
