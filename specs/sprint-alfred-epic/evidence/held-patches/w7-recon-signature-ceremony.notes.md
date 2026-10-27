# W7 recon: signature ceremony, one-command sign-and-apply and agent proof import (notes only, no patch)

Row `pipeline.signature-ceremony-requires-operator-work-and-breaks`, stage 50. Candidate d9d9e1ef0.
Status of this note: INTERIM. Read-only recon of the code was done; the clone setup and the test runs
(counts) were NOT reached (tool budget). No patch exists. No signing step was run, no key material touched.

## 0. Premise check (briefing vs repo)

The text "G9a.command" is not found under that name in `greenfield-findings-2026-10-23.md`; the finding G9
(line 57) is about `approve-plan` refused for the agent although the PO supplied a signature proof, and about a
wrapped line cutting the subcommand. That was handled by K153 (see `evidence/verify-fixes/k153-notes.md`,
`evidence/g9a-source-qualified-2026-10-25/README.md`: "transporting a valid proof is agent work; issuing human
approval and discard remain human-only"). The row's own ceremony is the human-guard-override (HGO) route. This
note covers the HGO route (the row), and flags that the plan-approval route (G9a proper) is already
source-qualified elsewhere. The Elephant should confirm which clause the row is judged against.

## 1. Exact current behaviour (file and line)

All paths under `plugins/pipeline-core/`.

- `scripts/guard-human-override.mjs` CLI: `plan`, `prepare-authorization`, `emit-signature-digest` (l.411-448),
  `prepare-for-signature` (l.460-502), `refreeze-plan` (l.503), `authorize` (chat mode, l.517),
  `authorize-by-signature` (l.573-592), `render-copy-safe` (l.321-371).
- `prepare-for-signature` (library `lib/human-guard-override.mjs` l.4263-4373) is the one agent call that does
  plan + audit check + patch preflight + prepare-authorization + intent + disclosure index. It returns
  `signIntentCommand` (human step: `po-human-approval.mjs sign-intent --repo-root R --intent-sha256 D`,
  `executionBoundary: attended-external-terminal`, `mutation:false`) and `authorizeBySignatureCommand`
  (`--proof "<external-proof.json>"` placeholder, `executionBoundary: local-process`, `mutation:true`).
  stderr carries the two copy-safe blocks (CLI l.488-500).
- Copy-safe rendering: `renderHumanCopySafeCommand` (POSIX and PowerShell blocks); pinned by
  `lib/pins/signature-ceremony-requires-operator-work-and-breaks.test.mjs` l.104-116 (every line <= 72 columns,
  no backslash/backtick continuation) and l.88-102 (agent prepares; only sign-intent is the human step; proof
  import is `local-process`).
- Agent proof import today: the agent may run `authorize-by-signature --proof <file>`. `externalJson()`
  (CLI l.87-101) REFUSES a proof path inside the repository ("--proof must be supplied outside the repository").
  The library (l.4662-4770) verifies: proof well-formed, signature over the exact intent
  (`buildHumanGuardOverrideSignatureIntent`, l.4604), then the committed `project/critical-human-proof.json`
  anchors; an unrecognized well-formed key yields `HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED`; there is no
  `--authority` flag (CLI comment l.554-572). So a signed proof is verified, never self-approval: the agent
  cannot produce the signature (`sign-intent` needs an attended terminal and the passphrase-protected key).
- Where `sign-intent` writes the proof: `scripts/po-human-approval.mjs` l.2724-2730 writes
  `proof-<intentSha256>.json` and `signer-<intentSha256>.json` into the PO's external key directory (path is
  deliberately not printed by prepare-for-signature; test "resolves the configured machine key directory without
  printing its private path", `scripts/guard-human-override.test.mjs` l.788). With `--request <scratch-path>`
  (l.2544-2597, 2738-2747) it additionally mirrors proof/signer into repo `scratch/` next to the request file
  (name must contain "request"), so the agent finds it next turn.

## 2. Gap versus the clause "one wrap-safe signing command and agent proof import"

1. Two commands remain (sign-intent by the human, then authorize-by-signature), and the second carries the
   literal placeholder `<external-proof.json>` that someone must fill with a path. Wrap-safety of each block is
   delivered and pinned; there is no single combined command. Tag: code-fixable-here (a placeholder-free hand-off
   such as the proof path printed by sign-intent, or a single wrapper that runs sign-intent then the import
   locally), but the signing half must stay attended, so true one-command is only the human running one line.
2. The designed agent hand-off, `sign-intent --request scratch/...`, is unusable for HGO: `prepare-for-signature`
   emits `--intent-sha256` (not a request file), and the scratch mirror proof lies inside the repository, which
   `authorize-by-signature` refuses by design (l.87-101, pinned by test l.673 and the win32/backslash tests
   l.585, l.624). So the agent cannot import the mirrored proof. Tag: code-fixable-here ONLY if the PO decides to
   relax or extend the outside-repository rule for a proof under `scratch/`; that touches a security rule (ADR-0059
   Decision 1) and `scripts/guard-human-override.mjs` / `scripts/po-human-approval.mjs`, which are outside this
   briefing's write scope. Treat as a PO/Critic decision first.
3. Real human signature, passphrase entry, attended terminal and native runners: native-host-only. Not
   verifiable in a clone. Also native-host-only: any end-to-end proof that a wrapped line survives a real
   PowerShell/WSL paste.
4. The clause's agent import for plan approval (`approve-plan --design-approval-request`) is separate and already
   Source-qualified (G9a README); no remaining code gap found there in this recon.

## 3. Minimal slices for the code-fixable items

Neither slice fits this briefing's write scope (only `guard-human-override.test.mjs` plus this note). Both need
production files, so they need a new briefing with expanded scope.

- Slice A (placeholder-free import hand-off). Files: `lib/human-guard-override.mjs` (authorizeBySignatureCommand),
  `scripts/guard-human-override.mjs`, `scripts/guard-human-override.test.mjs`. RED cases: prepare-for-signature
  output names no literal `<external-proof.json>` when the proof path is derivable from the printed sign-intent
  result; the 72-column and no-continuation bounds still hold; the private key directory is still not printed
  (existing test l.788 must stay green). Proposed subject:
  `fix(hgo): hand the proof path from sign-intent to authorize-by-signature without a placeholder`.
  Caution: l.788 pins that the private directory is not disclosed, which conflicts with printing the path; a
  design decision is needed.
- Slice B (scratch-mirror proof import). Only after a PO decision. RED cases: a proof under `scratch/` produced by
  `sign-intent --request` is accepted by authorize-by-signature; an unsigned or foreign-key file placed there by
  the agent is refused; a symlink/hardlink at the path is refused; existing in-repository refusal tests stay for
  every other repository path. Subject: `feat(hgo): import the scratch-mirrored sign-intent proof`.

## 4. What the row needs to be called technically delivered

Per the open agent entry: a written, tested statement of exactly what the agent imports (`authorize-by-signature`
with an external proof) versus what stays operator-only (sign-intent, passphrase, attended terminal), with a
counted test of the original acceptance. The last piece exists in the pin file (l.88-102, l.104-116) and in
`guard-human-override.test.mjs` (l.237, 528, 649, 673, 694). What is missing is decision on gap 2 (either record
that the in-repository refusal is intended and the external path is the hand-off, or deliver Slice B), plus
fresh counts from running both test files.

## 5. Not done / confidence

- Not done: clone/clone2 setup, running `plugins/pipeline-core/scripts/guard-human-override.test.mjs` and
  `lib/pins/signature-ceremony-requires-operator-work-and-breaks.test.mjs` for counts, and the baseline-versus-
  patched comparison (no patch exists; the briefing's stage-50 baseline of 15 of 16 green with one skip is
  unverified here).
- Confidence: medium for sections 1 and 2 (read directly from code, line numbers as of the candidate); low for
  section 4 (row threshold judged without fresh test counts and without the clause text itself).
