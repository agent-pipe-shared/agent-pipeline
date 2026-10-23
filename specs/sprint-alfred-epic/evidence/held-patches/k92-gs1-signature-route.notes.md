# K92-GS1-SIGNATURE-ROUTE notes (clone k92, base = k91 rehearsal bundle)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.
The clone still carries the edits in its working tree (nothing committed; the product file is a kernel path).

## Cause
`plugins/pipeline-core/lib/human-guard-override.mjs` eligibility() refused every Edit/Write/apply_patch of `pipeline.user.yaml`
up front (`HGO-NONOVERRIDABLE-USER-CONFIG` -> recoveryRoute `HGO-NARROWER-USER-CONFIG-REFUSED`, "human edit committed to the repository;
no signed override"), the 2026-10-17 AC-258 decision. Decision row 29 (2026-10-23) reverses it: every deadlock stays repairable by signature.

## Change
Protected (`...-protected.diff`, 1 file, human-guard-override.mjs, 34 lines changed, net -28): removed the two eligibility refusals, the dead recoveryRoute
branch and userConfigOverridePath(); `pipeline.user.yaml` is again an ordinary protected path (already in protectedPath()), so the
denial seeds a normal standard request bound to the exact tool input and the usual plan/prepare/emit-signature-digest/sign-intent/
authorize-by-signature guidance is emitted by the existing shape. No new module, no kernel-list change.
Widening stays refused: GS-1 (guard-gate-strength) still denies the agent edit; only a human-armed capability for the exact input admits it
(ADR-0059 "no per-file exception"; chat-armed capabilities are already refused unless committed mode is chat, HGO-SIGNATURE-MODE-REQUIRED).
Unprotected (`...-unprotected.diff`): (a) new negative control in antigravity-pretool-guard.test.mjs (agent widening signature->chat is denied,
names authorize-by-signature, file bytes unchanged); (b) the AC-258 pin restated (below). The two Antigravity GS-1 cases are NOT restated.

## QG-04 restatement (bounded justification: decision row 29)
signature-ceremony-requires-operator-work-and-breaks.test.mjs: the case "RED: [needs protected patch ALF-C-AC258-REF] ... refused up front"
asserted the opposite of row 29 (typed refusal, nothing seeded). Now "a PO-signed pipeline.user.yaml override stays offered": route null
(eligible, like the unchanged control), recorded denial `planned`, one signable request seeded. The "mirror proof" case (always skipped: the
patch file never existed in any tree) now runs the same assertion on a scratch copy of the live plugin, so skipped 1 -> 0.

## Counts (each suite once, alone; machine shared with other dispatches)
- Antigravity suite, unchanged code, RED: `node scratch/k92-run.mjs red ...antigravity-pretool-guard.test.mjs` exit 1, 60 ok / 3 not ok, 711 s.
  Not the briefed 61/2: all 3 failed with `null !== 0` (adapter 8 s timeout under load), incl. one unrelated case. Intended RED isolated with an
  untracked copy at 60 s timeout and only the two GS-1 cases: exit 1, answer = `HGO-NARROWER-USER-CONFIG-REFUSED` text.
- After change, unmodified file: exit 1, 59 ok / 5 not ok, 855 s: 5 unrelated simple cases hit the same 8 s `null !== 0` timeout (load);
  the two GS-1 cases and the new control passed in that run. Lone retry of the same file not repeated (14 min, machine loaded).
- After change, untracked copy with only the adapter timeout raised to 60 s (all 64 cases): exit 0, 64 ok / 0 not ok, 536 s (63 original + 1 control).
  The tracked file keeps its 8 s timeout (not changed); a quiet-machine run of the unmodified file is still owed (operator/Critic).
- Pin file: before 16 tests / 15 pass / 1 skip; after 16 / 16 pass / 0 skip (47 s).
- human-guard-override.test.mjs before (k91) 178/177 pass/1 skip; after 178/177/1. disjoint-isolation 38/38 both; capability-scan 3/3 both;
  disjoint 35/35 both; guard-authority-ledger-intake (after only) 19/19. Files mentioning the refusal code: only the pin above.
- guard-lifecycle-ready not run (lib/guard/* untouched). check-consumer-safe-paths.test.mjs: 9/9 pass.
- Restated pin RED on the unchanged product holds by construction (it asserts the opposite of the old behaviour); not separately run.
- `git apply --check` of both diffs: clean against the main checkout (they touch only lines identical in the bundle); the bundle clone `k91` check
  was refused by the shell classifier (mutating git apply, unbound target), so "applies after the bundle" rests on k92 = k91 + these edits only.

## Risks / open
- The 2026-10-17 durability warning remains true in principle (lifecycle may class an agent-written routing as a stale projection and
  migrate it back); row 29 accepts it. Not documented in product text anymore: consider a note in docs/human-authorization-inventory.md (not touched).
- ADR-0059 / threat model text untouched; backlog item for AC-258 still describes the retired refusal (backlog edits forbidden here).
- Ratchet effect on architecture/boundary-policy.json: not measured, expected none (net -28 lines in one lib file, no new imports).

## Proposed commit messages
Protected (operator): `fix(pipeline-core): keep pipeline.user.yaml repairable by signature (decision row 29)`
Unprotected: `test(pipeline-core): restate the AC-258 user-config pin to the signed route and add a widening negative control`
Both end with trailers: `AI-Assisted: true` / `Dispatch: K92-GS1-SIGNATURE-ROUTE (goldfish)`.
