# W9 slice 5 (Toolbox N43, blocker): the missing-guardrails refusal names the producer derivation

Built by the Elephant (PO exception: small items are built in a scratch clone and held as a patch). Stacked on D223 slice 1 (candidate = slice 1 applied).

## The finding (Toolbox hand-over of 2026-10-31)
The preflight refused a diagnostic with CDP-EVIDENCE-MODE / CDI-GUARDRAILS because the candidate changed the calibration, which makes `.claude/pipeline.json` a required guardrail (reason `changed-manifest`, derived by `deriveRequiredCriticGuardrails`). The refusal listed the path but gave no route; the only route the agent could see was `--guardrail .claude/pipeline.json` on `critic-diagnostic-evidence.mjs`, and the shell guard (GUARD-GATE-STRENGTH-SHELL) refuses every command that names that protected path, without an override route. The course stood still.

## Root cause and why the proposed read-only-list entry is not the fix
- The producer ALREADY derives the required guardrails itself when it is given `--base <ref>` (`critic-diagnostic-producer.mjs`, the `baseRef` branch calling `deriveRequiredCriticGuardrails`). The missing piece was the refusal text: it did not say so.
- Adding `critic-diagnostic-evidence.mjs` to `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS` is not viable: GST33 requires every entry and its transitive imports to carry no filesystem-write API, and the producer writes the evidence file.

## The change (one production file)
`plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs`: `matchingCandidateEvidence` gets the base the preflight derived the list over; the CDI-GUARDRAILS refusal now carries `details.diagnosticBase` and `details.reason` with the exact repair command (`critic-diagnostic-evidence.mjs ... --candidate <c> --base <b>`), says that the producer then derives every required guardrail itself, and that a protected calibration path must never be passed by `--guardrail`. With no commit base (empty tree) the reason says so and asks for one `--guardrail` per listed non-protected path. Message, code and `requiredGuardrailPaths` are unchanged (the existing test CDPF-guardrails stays green byte for byte). The preflight stays read-only (strings only, GST33 untouched).

## Chain (3 cases in `scripts/critic-dispatch-preflight.test.mjs`, real entry points `runCriticDiagnosticCli` and `preflightCriticDispatch`)
(a) calibration changed, diagnostic produced without `--base`: refused CDP-EVIDENCE-MODE / CDI-GUARDRAILS, `.claude/pipeline.json` required, the reason names the exact `--base`, the derivation and the protected-flag warning. (b) following that repair end to end: producer with `--base` and NO flag naming the protected path writes a diagnostic that contains `.claude/pipeline.json`; the preflight admits (`packet-ready`). (c) negatives: a base that is not a commit is refused CDI-BASE and writes nothing; a diagnostic lacking another required guardrail keeps today's refusal.

## Evidence (logs in the scratch directory of this slice)
- Red first: case (a) red against the unmodified preflight (`red.*`); (b) and (c) are green against the old code by design, they pin the existing producer capability.
- Green: the three cases pass (`g1.*`); the whole preflight suite 89/89 against 86/86 in the baseline (`c1` vs `base1`); `critic-diagnostic-evidence` 18/18, `critic-diagnostic-packet` 2/2, `critic-course-admission` 82/82, identical failing-name sets (all empty) in clone and baseline (`c2` vs `base2`).
- Revert proof: with the preflight file reverted only case (a) is red (`revert.*`), file restored byte-equal.
- The patch applies on the stacked candidate (apply-check exit 0).

## Pinned counts and what is not verified
- `harness/scripts/check-verify-case-completion.test.mjs` VCR01 pins `critic-dispatch-preflight-tests` at 352 top-level assertions; the three new cases move it (373 measured in the clone, 354 in the baseline stack because slice 1's restated tests already moved it). VCR01 is red in the baseline stack itself; the numbers are fixed ONCE for the whole stack in the final pins patch at assembly, not here.
- Not verified: native Windows run, a real Toolbox consumer repository (the claim "`--base` works today" is shown in the fixture, case (b), not in their repository), Full Verify, batch Critic, PO acceptance.
- Operator answer for the Toolbox, valid today without this patch: produce the diagnostic with `--base <the base you give the preflight>` and no `--guardrail` for the calibration; the producer adds every required guardrail itself.
