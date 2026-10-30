# Onboarding inspect offers rebind-approval as a structured alternative to reopen-design (PO exception: Elephant builds small items, 2026-10-30)

Held patch `w7-inspect-rebind-alternative.patch`, built by the Elephant in the scratch clone `w7inspect` at candidate
12ff86b (HEAD plus the held onboarding patch `w7-onboarding-cleanup-binding-not-partial`). It stacks after that patch.
Nothing applied.

## Behaviour

For a drifted approval whose next action is `reopen-design` (`designToImplementationHandoverAction` in
`lib/project-onboarding-v3.mjs`), the collect-input action now also carries `alternativeAction`: the command
`node <plugin>/scripts/pipeline-state.mjs rebind-approval`, mutating, no confirmation, expected
`pipeline.rebind-approval.v1` with status `verified` (the values `lib/rebind-approval.mjs` returns on success). The
guidance text from `w7-stale-approval-names-rebind-approval-first` is unchanged; the driver can now execute the
approval-keeping repair from the structure instead of reading it from prose. The invalid-architecture-evidence case
is unchanged and carries no alternative.

The ready gate (`lib/project-onboarding-ready-gate.mjs`) admits exactly that one extra key on the reopen-design
collect action, with the alternative pinned like reopen-design itself: exact keys, exactly two argv entries, the
plugin's own resolved `pipeline-state.mjs`, subcommand `rebind-approval`, the flags and the expected result. Any
other extra key, a null or mutated alternative, or a foreign script stays PORG-INVALID-OBSERVATION.

## Files

- `plugins/pipeline-core/lib/project-onboarding-v3.mjs`: the stale-approval branch adds `alternativeAction`.
- `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs`: `validRebindApprovalCommand`, and the collect-action
  check admits the optional `alternativeAction` key only with that shape.
- `plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs`: stale fixture with the alternative, two mirrored
  producer literals, fifteen mutation cases, the foreign-script case for the alternative. No existing case changed
  except the stale fixture now carrying the alternative.

## Evidence (scratch/agent-out/w7inspect logs)

- Ready gate in the clone: 28/28 (c1).
- Revert proof: with both production files reverted to the candidate, the producer-shape test and the mirror test
  fail; restored byte-equal (revert log).
- Pins in the clone: foreign-worktree 19/19, approved-lifecycle-state 5/5, brownfield-entry 16/16 (c2, c3).
- `scripts/rebind-approval.test.mjs`: 11 pass, 1 todo, 0 fail. The todo stays: no inspect fixture reaches the
  ready branch, so it is not turned into a real test here.
- `project-onboarding-v3.test.mjs`: clone (c4) and baseline (base4) fail the same five checks (NVA-R40-PROJDRIFT,
  seeded push gate, SECGATE-1, handover codex, handover antigravity); none new.
- Patch apply-check on the plain candidate: exit 0.

## Not verified

The driver executing `alternativeAction` live in a drifted session, Codex/Antigravity live, Windows, Full Verify,
Critic, PO acceptance.
