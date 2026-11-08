# Candidate 20e handover (PC switch, 2026-11-08)

PO decision 2026-11-08 (tiles): candidate 20d is applied, stamped and pushed on `feat/sprint-alfred`; the other machine
BUILDS candidate 20e first and only then runs the greenfields. Everything 20e needs is in this folder and tracked
(`scratch/` does not travel).

## What is here

| Item | Finding | State |
|---|---|---|
| `chain/` (4 patches + `po-apply-0.7-candidate20e-part1.sh`) | G20-70 (w278), G20-73 (w279), G20-75 (w280) | built and tested in a slice clone by the Elephant; notes `w278-*`, `w279-*`, `w280-*.notes.md`; PO apply pending |
| `w277-c20e-critic-admit-request.package.json` | G20-69 (preflight prints the complete admit request) + G20-71 (opus stays; the preflight writes the MP-07 lines) | Goldfish package, not built |
| `w281-c20e-critic-module-split.package.json` | G20-72 (a review range too large for one Critic is split per module; measure first, design stop) | Goldfish package, not built |
| `w282-c20e-audit-push-proof-followup.package.json` | audit bundle: the push and release approval proofs reach the remote in one evidence-only follow-up commit with the release tag | Goldfish package, not built |

Watched, not built: G20-74 (a Critic correction round over five modules needs five dispatches; one-module-per-dispatch is
by design; decide after the next greenfield shows the cost).

## Order on the other machine

1. Pull `feat/sprint-alfred`; copy `scripts/clone-slice/*.mjs` to `scratch/agent-out/` (and `rehearse.mjs` also to
   `scratch/agent-out/w24reh/`), see `docs/operating-tools.md`, "Clone-slice route".
2. Rehearse, then the PO applies part 1:
   `node scratch/agent-out/w24reh/rehearse.mjs specs/sprint-alfred-epic/evidence/held-patches/c20e-handover/chain/po-apply-0.7-candidate20e-part1.sh`,
   then `bash specs/sprint-alfred-epic/evidence/held-patches/c20e-handover/chain/po-apply-0.7-candidate20e-part1.sh`.
3. With no Goldfish in flight: `routine-repair.mjs run heal --no-goldfish-running`. Make the slice clones at the new HEAD
   (`mkclone.mjs scratch/agent-out/c20e-cr <HEAD>`, the same for `c20e-ap`); copy the packages to `scratch/briefings/`;
   `fill-base.mjs <HEAD> <package>`; `dispatch-briefing.mjs build --package <pkg> --out <md>`; dispatch
   `pipeline-core:goldfish-deep`, model sonnet, in the background. w277 and w282 touch disjoint files and may run in
   parallel. w281 changes the same preflight file as w277: dispatch it after w277 is delivered, from a clone `c20e-cs`
   that has w277 applied (its BASE_SHA is that clone's base, and its notes name w277 as the predecessor).
4. Export the delivered clones as part 2 (`scripts/export-held-chain.mjs`), rehearse, PO apply, stamp, install,
   `/reload-plugins`, `pipeline-start`, rebind; Full Verify; then the greenfields on all three runners (Windows and
   Linux), onboarding to release and feature close.

## Rules that still hold

Protected plugin files change only through a held patch and the PO apply script; the Critic preimage pin is never
re-pinned (G20-72 must not touch `agents/critic.md`); QG-04 (restate in place, never weaken); one heavy suite at a time;
no tree edits while a Goldfish runs.
