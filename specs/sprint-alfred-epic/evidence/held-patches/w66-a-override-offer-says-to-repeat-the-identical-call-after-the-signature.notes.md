# w66 — the signature-mode override offer says to repeat the identical call after the signature (candidate 17, intake 1k)

Applies on the nine-patch chain; one sentence in `lib/guard/denial-route.mjs` and its pin.

## What went wrong

The override offer printed with a guard denial says who signs ("the PO signs with a human-held Ed25519 key in an attended external terminal; this session only prepares digests"), but not what the agent
does afterwards. An armed capability is matched to the retried tool call by the digest of its raw input and bound to the repository state, so an agent that re-derives the call, or commits something
between the denial and the signature, burns a signature without any diagnostic (CLAUDE.md records two such cases).

## Change

- Signature-mode offer: "Once the PO has signed, repeat the IDENTICAL denied tool call; a commit or edit between this denial and the signature changes the bound state and voids the request."
  Chat mode is unchanged.
- The existing signature-mode case in `guard-lifecycle-ready.test.mjs` asserts the new sentence. The whole file passes (428 tests, 3 skipped as before).

## Not changed / not proven

- The other three denial renderers with their own "Human override available" strings (gate-strength, testpath, and the Codex and Antigravity hooks) keep their text; this is the shared route used by the lifecycle guard.
- Which of the ceremony verbs the agent itself may run was handled by the guard slices (w51, w55); this change adds no admission.
- Text only; no mutation check.
