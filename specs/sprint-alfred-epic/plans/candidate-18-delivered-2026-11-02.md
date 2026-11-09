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

## Full Verify 2 (home-directory clone, 2026-11-02)

`node scripts/full-verify.mjs` on a fresh clone at `8f23d7aa7` below the home directory with an `upstream` remote: exit 1 after 3502 s, 1152 steps, 25 red. Re-run alone: 11 green (read as load at the time; Full Verify 3 showed they are case-completion mismatches, fixed by w114: `agy-host-commit-*`, `guard-dispatch-tests`, `commit-message-policy-tests`, `critic-course-admission-tests`, `critic-dispatch-preflight-tests`, `dispatch-record-write-tests`, `native-goldfish-host-*`, `claude-intake-prompt-capture-tests`, `po-human-approval-signing-handoff-tests`), 14 still red. Each of the 14 was compared with a clone at the candidate 17 base (`c9a73fb80`) and with the main tree itself:

- Caused by candidate 18, fixed by w110/w111: the VCR01 sites counts (four suites grew), the submit-plan verify-command warning (C18-2), the ruleset identity source (C18-9: a plugin-root content hash no longer warns), the signing refusal before the prompt (A18-M2: the TOFU measurement now stops at `PO-SIGN-APPROVAL-MODE-UNCOMMITTED`), the host-commit drift detail (C18-1a).
- Already red at the candidate 17 base, fixed by w112/w113: the observed Critic preflight dropped the producer's refusal reason (a small product defect), the feature-package preview digest in `pipeline-state-tests`, the Codex preflight key list (`runnerCapabilities`), the backlog-state D222 exceptions, the AC-203 runner marker.
- Clone-location effects, green in the main tree, not fixed: `g23-read-help-tests` (`ls -lh ../` stays inside a clone) and `agy-item-delivery-tests` (its fixture parent is five levels above the test file, `/home/fixtures` for a clone directly below `/home/<user>`); `security-scan` needs `--remote upstream` (the clone has two remotes), and with it reports 13 gitleaks findings in test fixtures and old held patches, identical at the candidate 17 base.
- Left open on purpose: `codex-isolated-critic-protected-preimage-tests`, the pinned hash of the Critic review skill (trust anchor of the autonomous Critic; class A of the greenfield findings, the PO's re-pin).

Second apply script: `specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate18-fixes.sh` (w110 to w114 and the derived files).

## Full Verify 3 (home-directory clone with w110 to w113 applied, 2026-11-02)

Exit 1 after 3543 s, 1152 steps, 15 red. Re-run alone, 11 green and 4 red (the four expected: the Critic preimage pin, `g23-read-help-tests` and `agy-item-delivery-tests` as clone-location effects, `security-scan` needing `--remote upstream`). The same 11 suites had been red in Full Verify 2 and were wrongly read as load there. They are not load: the Full Verify runs a suite as plain `node <file>` with descriptor 3 open and rejects one that declares case ids its policy does not list (`VERIFY-CASE-COMPLETION-DECLARATION`); run alone, no descriptor is announced and nothing is checked. Candidate 18 grew 11 suites without extending their policies. Fixed by w114 (only `harness/config/verify-case-completion-augmentations.v1.json`; details in the patch notes). Lesson: a suite that is red in the full run and green alone, in two runs, is a case-completion mismatch, not load (see the triage memory).

## Full Verify 5 (stamped state `63d505ca3`, clone below the home directory with an `upstream` remote, 2026-11-02)

Exit 1 after 3596 s, 1152 steps, 4 red: `codex-isolated-critic-protected-preimage-tests`, `agy-item-delivery-tests`, `g23-read-help-tests`, `security-scan`. These are exactly the four open-by-design reds; w114 is proven in a full run (the 11 case-completion reds are gone, no new red). Re-run alone in the clone: all four still red. Re-run alone in the main tree: `agy-item-delivery-tests` and `g23-read-help-tests` green (clone-location effect confirmed), the Critic preimage pin red (PO re-pin, trust anchor, not touched), `security-scan` red (needs `--remote upstream`; 13 findings in fixtures and old held patches, identical at the candidate 17 base). No real finding, so no further candidate 18 fix and no new held patch.

## Open

The Critic preimage re-pin by the PO; the batch Critic (paused by the PO); native Windows runs; real Codex and Antigravity runs; the security scan (`--remote upstream`); the end-to-end hook activation on a real promotion; parallel host commits in a real parallel run; PO acceptance.

## Moved verbatim from `docs/state.md` on 2026-11-09 (size cap)

**Candidate 17 (runner neutrality Claude/Codex/Antigravity, first consumer-run findings) delivered 2026-11-02** as held patches w48-w73 and one apply script
(`specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate17.sh`), applied by the PO the same day (`130ebba59` to `235014116`) and stamped `5337c081b`
(`0.7.0+claude.20261102073855.fba0507`); not installed or read back on this machine yet. Rehearsal and whole-chain checks green; implementation complete, PO acceptance pending. Open: Full Verify on the final tree, the batch Critic (paused by the PO), native Windows runs, real Codex and Antigravity runs, the security scan
(`--remote upstream`). Not built, planned for candidate 18 with the draft native Antigravity admission: [candidate 18 plan](candidate-18-plan-2026-11-02.md).
**Candidate 18 (parallel Goldfish host commits, signing parity on every runner, the Antigravity runner, first greenfield findings) applied, stamped and installed 2026-11-02**: w74-w109 via `po-apply-0.7-candidate18.sh` (`1fb3e5197`), stamp `3cdc6e7a8`, then the fixes w110-w114 via `po-apply-0.7-candidate18-fixes.sh` (`0caf799`) and the second stamp `63d505ca3` (`0.7.0+claude.20261102210630.0caf799`), installed by the PO and read back; implementation complete, PO acceptance pending.
