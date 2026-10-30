# Held patch w7-n31r: authorize-critical paths, reconcile plan re-read, --by placeholder (N31 remainder, D212)

Built by the Elephant under the PO exception for small items (2026-10-30), in the
scratch clones `scratch/agent-out/w7n31r/clone` (edited) and `clone2` (plain), at
candidate 83d51085f. Held; the PO applies it with candidate 13.

## What the patch changes

1. `scripts/po-human-approval.mjs` `formatHumanApprovalCliResult`: the human-mode
   result of `authorize-critical` for every kind except push now names
   `requestPath` and `authorityPath` next to `proofPath`. Those files stay in the
   PO key directory, which an agent cannot list; the reconcile needs all three.
   The push output is byte-identical: push still prints only `proofPath`, and its
   agent-side consumer reads the repository mirror. Mirroring the non-push
   kinds into scratch as push does would have been the larger change, so I named
   the paths instead. The mirror also exists to keep the key location out of an
   agent-rendered command, but here the PO passes these paths in by hand anyway.
2. `scripts/pipeline-state.mjs` `continuity-result-bootstrap-plan` (read-only,
   already admitted): once the Result is bound and the package is stale
   (`reconciliation-pending`), it prints
   `pipeline.continuity-result-reconcile-pending.v1` with `planSha256`,
   `signatureCommand`, `reconcileCommand` and `mutated: false`, instead of
   refusing. Before this change the close-feature skill told the reader to take
   the signing command again from a fresh `continuity-result-bootstrap-plan`
   after a commit, and that read refused in exactly this state (a dead end).
   The legacy-repair branch is unchanged and runs first.
3. `reconcileSigningRoute` placeholders: `--by` is now `<po-name>`, and its text
   says the PO supplies it and never the agent (EL-36). The three proof
   placeholders name the `requestPath`, `authorityPath` and `proofPath` fields
   the signing terminal prints.
4. `skills/close-feature/SKILL.md`: step 5 and the 'Command signatures' rows for
   `continuity-result-bootstrap-plan` and `authorize-critical` describe 1-3.

## Tests

- New: PHS005 in `scripts/po-human-approval.signing-handoff.test.mjs` (non-push
  kinds name all three paths; push unchanged; JSON mode unchanged); case guard
  4 to 5.
- New: two N31r cases in `scripts/pipeline-state-result-bootstrap.test.mjs`
  (re-read after apply prints the same plan digest and both commands and writes
  neither State nor manifest; `--by` placeholder and proof path sources).
- `harness/scripts/check-verify-case-completion.test.mjs`: the signing-handoff
  top-level assertion pin goes from 14 to 17 (the three new assertions). VCR01
  then shows only the six count mismatches already present on the baseline.

## Evidence (logs in scratch/agent-out/w7n31r)

- RED before the production change: red1 logs, all three new cases fail.
- Clone c1: signing-handoff 5/5, result-bootstrap 23/23, close-feature pin 5/5,
  signing-prompt pin 13/13. Clone c2: po-human-approval, critical-human-proof-gate,
  signing-ceremony, push-init 39/39, close-coordinator 36/36, all exit 0.
- Baseline base1: the same nine suites, all exit 0. The failing-name sets are
  identical (empty).
- Revert proof: with both production files reverted, exactly the three new cases
  fail; restored byte-equal true.

## Callers and the test that pins each one

- `formatHumanApprovalCliResult`: the CLI main (po-human-approval.mjs, TTY only),
  pinned by PHS004/PHS005; `signing-prompt-prints-the-whole-review-package`
  (green); the `signing-disclosure-sweep/presentation-cases.mjs` harness only
  checks the sign-intent/proof codes and the JSON mode, so it is unaffected.
  `signing-ceremony.mjs` reads the full result (`signed.paths.proof`), not the
  compact human output, so it is unaffected (signing-ceremony suite green).
- `continuity-result-bootstrap-plan`: `close-coordinator.mjs` CLOSE-RESULT text
  (names the verb before a Result exists; unchanged, close-coordinator suite
  green); `close-feature` skill and its pin (green); the
  session-authority-registry and onboarding-continuity companion lists only
  name the verb (no output parsing).
- The reconcile placeholders: the N30 anchor fills by token lookup, so the token
  rename stays green; there is no other consumer of `<by>`.

## Open

Full Verify, batch Critic, a native consumer close and PO acceptance stay
pending.
