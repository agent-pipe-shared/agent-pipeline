# Held patch notes: slice A2-c4, the gate-strength guard prints the one-command signature flow

Status: patch delivered. The Goldfish reached its budget twice (once before the production edit); the Elephant ran the Goldfish's prepared
edit script through the Goldfish driver in the scratch clone (no production code was hand-written by the Elephant), fixed one more test that
the Goldfish had not found, and measured the result. No independent Critic review, no Full Verify.

Base: the candidate commit plus the held patches A2, A2-c2 and c3 applied in that order. Patch: `w7-gate-strength-signature-guidance-points-at-prepare-for-signature-c4.patch`
(3 files: `hooks/guard-gate-strength.mjs`, `hooks/guard-gate-strength.test.mjs`, `hooks/antigravity-pretool-guard.test.mjs`; 33 insertions, 34 deletions).

## Cause

`hooks/guard-gate-strength.mjs`, the signature branch of the human-override guidance of the gate-strength denials (GS-1 and the others), still printed
prepare-authorization, emit-signature-digest, a sign-intent line with `<intent-sha256-from-emit-signature-digest>` and authorize-by-signature with
`<proof-path-from-sign-intent>`. A2 covered the Codex, Antigravity and test-path hooks, the render-copy-safe script and the repair map, not this site.

## Change

- The signature branch is now one continuation sentence (the wording of the Codex hook after c3, including `gates.human_approval is "<approvalMode>"`)
  followed by one `prepare-for-signature` line; chat mode is byte-identical. The constant `PO_HUMAN_APPROVAL_SCRIPT` had no other use and is removed
  (`join` and `PLUGIN_ROOT` have other uses and stay).
- Tests (equivalent assertions on the new text plus refusals of `emit-signature-digest`, `prepare-authorization` and the placeholder tokens; none weakened):
  - `guard-gate-strength.test.mjs` GST23 (three assertions of the old text replaced).
  - `antigravity-pretool-guard.test.mjs`, the case "signature guidance assigns only sign-intent to the external PO/operator" (it reads the gate-strength route).
  - `antigravity-pretool-guard.test.mjs`, the case "GS-1 widening of pipeline.user.yaml stays denied without an armed capability (k92 negative control)" pinned
    `authorize-by-signature --repo` as proof that the repair is a human signature; it now requires `prepare-for-signature --repo`, `exactly one sign-intent command`
    and refuses the former text. The Goldfish did not find this one; the Elephant found it in the first GREEN run.
- Not changed, already refusals of the old text: `codex-pretool-guard.test.mjs`, `guard-lifecycle-ready.test.mjs`, the signature-ceremony pin file.

## Evidence (scratch clones; base = candidate + A2 + A2-c2 + c3)

- RED with the production edit reverted: `guard-gate-strength.test.mjs` exit 1 (GST23), `antigravity-pretool-guard.test.mjs` exit 1 with exactly the two updated cases red.
- GREEN with the edit: `guard-gate-strength.test.mjs` 41 passed, 0 failed; `antigravity-pretool-guard.test.mjs` all 67 passed; `guard-lifecycle-ready.test.mjs` exit 0;
  the signature-ceremony pin file exit 0; `codex-pretool-guard.test.mjs` only the two baseline reds (case 7 and case 17, red in the base as well, untouched).
- Restore proof: after the revert run the production edit was re-applied from the saved diff (exit 0) and the patch was written from the restored clone.
- Apply check of the patch on a clone that holds only the three base patches: exit 0.
- Not run for this slice: `generate-architecture-overview.mjs --check` and the VCR01 test (the patch changes no count pin: it adds no case).

## NOT done

- Full Verify, an independent Critic review, native Windows runs and PO acceptance.
- Chat-mode text and the Guard Maintenance Window `install` text (line about 779) are deliberately untouched.

## Operator flow

`guard-gate-strength.mjs` is a never-liftable kernel path and `guard-gate-strength.test.mjs` is a protected test path: apply under a Guard Maintenance Window
after patches A2, A2-c2 and c3 (Block 2m), then `git add` with a path limit, `--no-verify` commit, stamp, install.

## Proposed commit message

fix(hgo): print the one-command signature flow in the gate-strength guard guidance as well (slice A2-c4)
