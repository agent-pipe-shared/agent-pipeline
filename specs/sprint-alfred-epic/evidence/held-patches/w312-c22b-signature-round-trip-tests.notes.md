# w312 — every printed signature command is proven by a signed round trip (candidate 22 follow-up, LOOP-A1)

Delta on candidate 8627df377 (clone base 8627df377; the patch is the diff of the clone's two commits). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone; delivered as a held patch. Targeted delivery: green (27 of 27). Batch Critic, Full Verify and PO acceptance stay pending.

## What it adds (all under plugins/pipeline-core/)

One new test file, `scripts/critical-action-signature-round-trip.test.mjs` (a plain node:test file, 27 cases, no openssl binary, no real key). No product file changed.

- Library leg, parametrized over every member of `CRITICAL_ACTION_KINDS` (9 cases): `criticalActionSubjectSha256` -> `createCriticalActionApprovalRequest` -> a signature by a generated fixture key over the intent digest -> `verifyCriticalActionApprovalRequest` returns `CRITICAL-ACTION-PROOF-VERIFIED`. Each case also proves the four refusals that keep it from passing for the wrong reason: another candidate, another kind with the same digest, past expiry, a key the authority does not name. A closed-list case fails when a tenth kind is added, so a new kind must add its round trip.
- Printed-command leg, parametrized over `AUTHORIZE_CRITICAL_COMMAND_KINDS` (6 cases: push, deploy, publication, release-preflight, feature-package-reconcile, acknowledge-caller-authored-critic): the line is built by `prepareAuthorizeCriticalLine` (the builder every emitter uses) with a space in the plan and spec paths. The inline line, the bounded POSIX copy (`CMD=` fragments and `eval "$CMD"`) and the bounded PowerShell copy (`$CMD =`, `$CMD +=`, `Invoke-Expression $CMD`) are each read back, by a small parser in the test, to the exact argv; on a host with bash a real bash evaluating the POSIX text must give the same argv. Both Windows and POSIX forms are therefore covered for the kinds the product prints both for. cmd.exe is not covered: the product prints it only for argv without a space or metacharacter, and these lines carry a plan path with a space on purpose.
- Verb leg, same 6 kinds plus `accept-residual-critic-findings` (7 cases): the printed argv (no `--directory`, key directory resolved from the environment, as on the PO's terminal) runs through the real `authorize-critical` verb (`runHumanApproval`) with a generated, passphrase-protected fixture key, an injected attended terminal and an injected `spawn` that answers only `pkeyutl -sign` with a node:crypto signature over the same bytes. The proof the verb wrote verifies against an action built from the PRINTED digest and expiry alone, and does not verify against another digest. For the acknowledgement the line carries the Critic packet and the verb binds the reviewed candidate, not the moved HEAD (the C21B route that failed). The residual acceptance has no builder line (its subject is rebuilt from the consumed packet, never typed), so its argv is the verb's documented shape and the case proves the digest the verb rebuilds is the one signed.
- Consumer leg (3 cases):
  - `release-preflight`: `prepareReleasePreflightAuthorizeLine` (the CLI's own emitter) prints the line for a small two-commit repository (the fixture shape of `release-preflight-cli.test.mjs`, committed policy requiring the proof, no waiver); the verb signs it; `buildReleasePreflight` accepts the verb's request and proof (`status: ready`, consent derived from the verified proof) and refuses the same proof for another retention policy.
  - `acknowledge-caller-authored-critic`: `approve-critic-acknowledgement` prints the signing line, the verb signs it, and the follow-up command printed with it names exactly the three mirror paths the verb wrote (the disagreement class of LOOP-A1); the consumer then accepts the proof once and refuses a replay.
  - `push`: the printed push line is signed by the verb and `approve-push` consumes the mirrored proof; the same files for another destination are refused before the proof is consumed.

## Why

Finding LOOP-A1 and priority 1 of the Antigravity greenfield report: a signature command the Pipeline printed and the verb consuming the proof disagreed, and cost five PO turns. w307 measured that a full emit, sign, consume round trip existed for the acknowledgement only, and that no suite ran the whole set of kinds. The existing single-kind suites (`po-human-approval.test.mjs` C21F, `pipeline-state.test.mjs` C21B/C21C, `pipeline-state-push-anchor.test.mjs`) are unchanged and not duplicated one for one.

## Per kind: which leg was proven, and why a heavier one was left out

| Kind | Legs run | Heavier leg left out, and why |
|---|---|---|
| push | library, printed (inline, POSIX, PowerShell), verb, consumer (`approve-push`) | none |
| acknowledge-caller-authored-critic | library, printed, verb, consumer (`approve-critic-acknowledgement`) | none |
| release-preflight | library, printed, verb, consumer (`buildReleasePreflight`) | consumer leg for the consumer-project flavour (`isConsumerReleaseProject`) and the source-checkout reader binding not run; the plain repository path is the one covered |
| feature-package-reconcile | library, printed, verb | consumer is the feature close audit (`pipeline-state.mjs` reconcile approval); not read for a fixture, left out, not measured |
| deploy | library, printed, verb | consumer `authorizeRecordedDeploy` is covered at the authorization-read layer by the PPA cases in `lib/critical-action-authorization.test.mjs` (a fixture of about 40 lines, `approvalRecord` plus `stateFor`); not duplicated here |
| publication | library, printed, verb | consumer is the publication transaction command; not read for a fixture, left out, not measured |
| accept-residual-critic-findings | library, verb (hand-built argv, no builder line) | consumer `approve-residual-acceptance` has a fixture in `pipeline-state.test.mjs` C11-b (signature mode, consumed once); not duplicated |
| governance-fork-disposition | library | no printed `authorize-critical` line: it is signed by the dedicated fork-disposition verbs (`prepare-fork-disposition`, `approve-fork-disposition`), which need a fork-inspection fixture and an async path |
| interruption-promotion | library | no builder line: its subject is the baseline file passed as `--subject`; the verb path needs an eligible interruption baseline fixture |

Other signature kinds with an emitter that are not `CRITICAL_ACTION_KINDS` (HGO signature digest, signed quality package, design approval, bootstrap acknowledgement, portable Agy authorship, portable Critic export, organization architecture config, model-family approval, adoption approval, guard maintenance window) use `sign-intent` or their own verbs and their own request schemas. Their fixture-key routes were located by w307 and stay in their own suites; they are not part of this file.

## Test-first evidence

The cases were written before any run, from AC-108 and the findings, and ran green against the original code on the first run (24, then 26, then 27 with the consumer legs): no kind's round trip is broken at candidate 8627df377, so there is no defect to fix and no product change. To prove the cases are live, one fault was injected in the clone and reverted before the commit: dropping `--critic-packet` from the line `renderAuthorizeCriticalCommand` prints turned exactly the two acknowledgement cases red (the verb leg: "the candidate the emitter bound, not the checkout's HEAD"; the consumer leg: `CRITICAL-ACTION-REQUEST-MISMATCH`), and the other 24 stayed green. That fault is the shape of the LOOP-A1 disagreement.

## Needs from the Elephant

- Registration of the new file in `harness/verify-suites.json` (protected, TP-13): without it Verify does not run it. It is a new file because the cases span the library, the signing verb and two consumer verbs, which no single existing suite owns; adding them to the large `po-human-approval.test.mjs` or `pipeline-state.test.mjs` would have mixed concerns (not measured: whether either pins a case count or registry).
- The held-patches check file (`w312-...check.test.mjs`) only checks the patch; the real suite is the new file.

## Deliberately not changed

- Every product file (none needed), every guard hook, the Critic preimage files and list, the existing suites and the protected `critical-human-proof-policy.test.mjs`, PRD and Spec.
- No gate, signature or review round added.

## Not proven

- PowerShell and cmd.exe were not executed, only read back: the PowerShell fragments are parsed by the test's own reader, which is exact for the single-quoted shape the product prints but is not a PowerShell evaluation. The POSIX form is additionally evaluated by bash where bash exists.
- `renderPoTerminalCommand` (the WSL and Windows two-block rendering, `lib/copy-safe-command.mjs`) is not exercised: the only emitter in the tree that uses it for a signing step is the design-approval `sign-intent` line (`pipeline-state.mjs`, "PO signs the design approval"), which is not a `CRITICAL_ACTION_KINDS` member; no critical-action emitter routes through it, so its `wsl.exe -d <distro> --` block is outside this file.
- The fixtures live under the OS temporary directory. The existing suite moves its ceremony fixtures under the repository's `scratch/` on native Windows because the OS temporary root's DACL is refused by the owned-authority ancestor inspection (`WIN-AUTH-ANCESTOR-MUTATION`); this file was run on Linux only (with and without a private TMPDIR) and may need the same move on native Windows.
- The signing seam is a node:crypto stand-in for `openssl pkeyutl -sign`; production signing through the openssl binary is covered by the existing `REQUIRES_OPENSSL` cases, not here.
- No Full Verify, no Critic review (batch gates), no live PO ceremony.
