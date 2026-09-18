# Onboarding completion registration — pending protected edit

Status: signed and applied locally on 2026-09-18. Intent
`6c7a08957c9a04035c220742807d42ee9644e83156cc7278e051e0c723200712`
was verified by the sanctioned consumer. The exact 281-to-283 edit is present;
the registration checker passes and the onboarding suite passed 283/283 after
runtime recovery. Commit and new clean-candidate full Verify remain pending.
The proposal and resumption sequence below are retained as historical context.

## Exact repair

At candidate `f9649b0b1cb6a628320e6161a920af15bb143e5b`, the Git blob of
`harness/scripts/verify.mjs` is `c4b09246fc9a26f5f743dc0614e469a4bafbd0e2`.
In the single `onboarding-continuity-tests` registration at line 306,
replace `Array.from({ length: 281 }` with `Array.from({ length: 283 }`.
Do not change its schema, OBC identifier generation, maxBytes, suite source,
or the verifier's case-completion enforcement.

Full run `verify-1789762105324-22df756734f4055a` executed and passed all
283 onboarding tests, including OBC282 and OBC283, with no skips or failures.
Its wrapper then emitted `VERIFY-CASE-COMPLETION-DECLARATION`.
This is a registration mismatch, not a reason to remove tests or relax
the completion predicate.

## Safe resumption

1. Finish candidate-changing agent work before opening a signing ceremony.
2. Re-read the exact file and revalidate the narrow diff and current candidate.
3. Obtain a fresh guard request for this edit alone. The earlier combined
   request also included a now-resolved push test and must not be reused.
4. Use the installed sanctioned human-override preparation and copy-safe
   renderer. Do not invent a digest, signature, or human reason. Present
   terminal commands in the requested variable-assembled format.
5. Freeze HEAD and worktree for the ceremony: the authorization binds the
   complete candidate, and concurrent commits invalidate that binding.
6. After the PO signs, consume only the exact authorized edit through the
   normal guard path. Verify readback and the resulting registration.
7. Run registration checks, the onboarding suite and full Verify on the new
   clean candidate. The independently pending archive scanner exceptions
   must also be resolved before a green full Verify can be claimed.
8. Only then run the requested full-scope first Critic and correction-scoped
   second Critic under the critic-review skill and resolve their findings.

The source script `guard-human-override.mjs` explicitly warns that any
concurrent commit invalidates the whole-tree signature binding. Therefore no
premature signable intent is emitted while the PO is AFK. This handoff is
preparation data, not authority to modify the protected verifier.
