# W9 slice N40: the full-Verify refusal names the cause and the repair

Built by the Elephant (PO exception: small items are built in a scratch clone and held as a patch). Candidate 65e0a0984. Source: a Toolbox finding (CDI-FULL-VERIFY named no cause).

## Root cause
Two layers, both fixed:
1. The three raise sites of `CDI-FULL-VERIFY` (`lib/critic-diagnostic-producer.mjs` for the produce path, `lib/critic-diagnostic-evidence.mjs` for the validate path) passed only the code. The producer's local `fail` could not even carry a message.
2. The CLI (`scripts/critic-diagnostic-evidence.mjs`) printed `error.code ?? error.message`, so even a message would not have reached the operator.

## What changed
- One shared wording, `fullVerifyExecutionRefusal(observed)` (exported by the evidence lib): the evidence ran as `"<execution>"` (mode `<mode>`), not a full run; produce it again with `verify-evidence-producer.mjs --mode critic --commit <candidate> --base <candidate> --out <path>` (a base equal to the candidate falls back to a full run; with an ordinary base the selection stays "impacted"), then pass that file as `--full-verify`.
- The validator's other three refusals now say what is wrong: bad shape (keys / status set), a `not-run` record that carries evidence (must be null), and a recorded status that differs from the evidence file's status.
- The producer's `fail` takes an optional message; the CLI prints `error.message || error.code` (bare code when there is no text, unchanged).

## Evidence
- Tests `N40 (a)–(d)` in `lib/critic-diagnostic-evidence.test.mjs` (22/22 green in the clone, logs `c3`, `c6`). (a) impacted evidence refused with cause and repair at the producer, (b) full evidence still accepted, (c) the four validator refusals, (d) CLI stderr carries the text and a text-less refusal keeps the bare code.
- Revert proof: with the three production files reverted to the candidate, (a), (c), (d) turn red; restored byte-equal (log `revert...`).
- Repair claim measured, not assumed: `verify-evidence-producer.mjs` returns `forceFullReason: "invalid-base"` for a base equal to the candidate (line 168), and the Toolbox confirmed from a real run that such evidence carries `selection.execution "full"`, `fallbackReason "invalid-base"`.
- Neighbouring suites green in the clone: diagnostic packet (2), capture header (9), packet preflight (18), generic batch (38), dispatch preflight (86), course admission (82).
- Patch applies on the candidate (`git apply --check`, exit 0).

## Files
`plugins/pipeline-core/lib/critic-diagnostic-evidence.mjs`, `lib/critic-diagnostic-producer.mjs`, `scripts/critic-diagnostic-evidence.mjs`, test file. No protected-list change beyond what the PO apply script already covers; no pinned count in `check-verify-case-completion.test.mjs` involves these files (checked with rg).

## Not verified
Native Windows run, Full Verify on the assembled candidate (fv9), batch Critic, PO acceptance.

## Follow-ups from the Toolbox answers (not in this patch)
- N43 text: the base in the producer call must be the PREFLIGHT base (a base equal to the candidate derives an empty guardrail set); produce the diagnostic while HEAD is still the candidate and the tree is clean (CDI-DIRTY-CANDIDATE after any follow-up commit); a second diagnostic for the same candidate gives CCA-DELTA-BINDING until the delta request is registered again. Goes into `critic-dispatch-preflight.mjs` AFTER slice 3 is committed (same file).
- N42 text: each signature binds to the exact HEAD, so touch the mirror only after the first file's commit, then a second plan. Goes into `hooks/guard-gate-strength.mjs` (own small patch).
