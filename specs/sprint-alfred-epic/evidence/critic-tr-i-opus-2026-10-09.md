# Critic report: T33 / TR-I (Opus, class G, clean spec)

Persisted verbatim in substance by the Elephant (the Critic has no Write tool). Dispatch: Critic TR-I chain, 2026-10-09.

- **Verdict: PASS.** No blocker and no major findings. One minor finding (F1).
- **Requested route:** `claude-opus-5-5` at max. **Effective identity:** `claude-opus-5-5`, read from the runtime prompt.
  The effort level was not observed.
- **Assurance:** functional-equivalent-read-only; OS isolation not asserted.
- **Ruleset:** 0.7.0+claude.20261008194106.da20519d (fixed by the dispatch).
- **Candidate:** `0b0e9224a` (TR-I-T2, test), `b32f859c0` (TR-I-T2b, test), `98b81b479` (TR-I-F2, fix).
- **Files:** `plugins/pipeline-core/lib/test-case-completion.test.mjs` and `plugins/pipeline-core/lib/test-case-completion.mjs`.
- **Spec read:** `specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md` row T33 (:141) with the §1/§2 column
  definitions, and `specs/sprint-alfred-epic/plans/0.7-execution-order.md` :1047–1059 only.

## F1 (minor): a regular file where the ruling names a pipe; the comment cites an allowance not in the admitted text

- Ruling 107 (T33) says "the fixture suite runs with fd 3 present as a pipe and no signal". The pin hands the child a
  regular temp file instead (`test-case-completion.test.mjs:206`, `:213`).
- The comment at `:259–260` says "Ruling 107 allows both a pipe and a temp file". That allowance is not in the T33
  sub-block (:1047–1059), which is the only part of Ruling 107 the Critic was given.
- Risk: minor. The pin still discriminates. It was RED before the fix and GREEN after on both lanes, and
  `fd3Probe === "file"` proves the descriptor arrived. The problem is a permanent comment that credits the ruling with a
  permission its admitted text does not state. If the allowance exists elsewhere, cite it; otherwise reword the comment
  as a declared deviation.
- Spec-ref: `specs/sprint-alfred-epic/plans/0.7-execution-order.md:1056`.

## Examined and found in order

1. **Spec fidelity.**
   - Inert without the signal: `test-case-completion.mjs:139` (`registrationRoute && !verifySignalled()`), `:141`
     returns before any write. The registration route passes `true` (:213); the direct constructor passes `false`
     (:106), unchanged.
   - With the signal, an unwritable fd still fails closed with `TCC-FD-WRITE`; that pin is untouched and green.
   - No single-suite runner shipped; `verify.mjs` is not in the diff.
   - The test-only pin was RED on native and WSL before the fix.
   - WSL `bootstrap-payload-measure`: before, it dies at load with `TCC-FD-WRITE` (`EINVAL`); after, BPM001–BPM005 pass.
   - F2 is a separate fix.
2. **Scope.** Exactly the two pre-oriented paths.
3. **Reachability.** `scripts/verify-journal.mjs:1002–1006` sets `PIPELINE_VERIFY_CASE_COMPLETION_FD: "3"` whenever a
   completion policy exists. All 13 files that read a child's `output[3]` set the signal in their spawn env, or are
   covered by passing captures (VCR26, VAC010). A required suite with a missing completion terminal still fails closed
   when it exits zero.
4. **Test integrity.** T2 is additive; T2b changes only the spawn env; F2 changes no test. No skips, lowered thresholds
   or deleted assertions.
5. **Edge cases.** Inertness is decided at construction. Configuration, output-bound and dispose validation still run
   when inert. The Windows handle is closed before `rmSync`.
6. **Guardrails.** QG-04, QG-07, QG-09, QG-11, GL-09, GL-03, Conventional Commits: in order.
7. **Security, QG-06, dependencies, language:** in order.

## Dropped candidates

- T2b's assertion sweep landed in its own commit, not with the pins. No consequence.
- T2b cites Ruling 113, outside the admitted range; judged against Ruling 107 and QG-04, no deviation.
- The signal check is presence-only (pre-existing, outside the ruling).
- The header comment about `verify-journal.mjs` is imprecise on pre-existing lines.
- No macOS capture; the admitted spec does not require one.

## Trajectory

- Commit claims match the diffs and captures. The captures are pre-commit runs on dirty trees at ancestor heads; line
  fingerprints tie them to the committed content.
- `wsl-after` exits 1 with three reds outside the diff, identical before and after (VCR01 VULNERABLE-UNREGISTERED, the
  WINVERIFY real-tree guard, ALFRED-RF1 real-SIGINT 13 vs 130). Failures dropped from 6 to 3.
- All three commits carry `Dispatch: <TASK_ID> (goldfish)` and `AI-Assisted: true`, no forbidden trailers.

## Disclosures

No Skill tool in the host, so the bootstrap skill was not invoked; the closed Critic role was kept. One advisor call.
Persistence of critic notes unavailable (no Write tool). Budget: 19 of 24 base tool uses.
