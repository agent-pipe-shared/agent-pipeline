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
| `w283-c20e-proof-wait-subject.package.json` | G20-76 (the signature wait accepts an old proof: `authorize-critical` mirrors to `scratch/critical-<kind>-{request,proof,authority,signer}-<repo fingerprint>.json`, one fixed name per repository, and `proof-wait.mjs` only checks the file schema, so a mirror from an earlier signature ends the wait at once and `approve-push` then refuses with CRITICAL-PROOF-SUBJECT) | Goldfish package, not built; added after the first handover |

G20-76 interim, until the fix is installed: before every `push-prepare`, move any old `scratch/critical-*` files aside
(rename, never delete).

Watched, not built: G20-74 (a Critic correction round over five modules needs five dispatches; one-module-per-dispatch is
by design and is not loosened; decide after the next greenfield shows the cost; a possible direction is a preflight that
splits the finding list into per-module packages in one step).

## Order on the other machine

1. Pull `feat/sprint-alfred`; copy `scripts/clone-slice/*.mjs` to `scratch/agent-out/` (and `rehearse.mjs` also to
   `scratch/agent-out/w24reh/`), see `docs/operating-tools.md`, "Clone-slice route".
2. Rehearse, then the PO applies part 1:
   `node scratch/agent-out/w24reh/rehearse.mjs specs/sprint-alfred-epic/evidence/held-patches/c20e-handover/chain/po-apply-0.7-candidate20e-part1.sh`,
   then `bash specs/sprint-alfred-epic/evidence/held-patches/c20e-handover/chain/po-apply-0.7-candidate20e-part1.sh`.
3. With no Goldfish in flight: `routine-repair.mjs run heal --no-goldfish-running`. Make the slice clones at the new HEAD
   (`mkclone.mjs scratch/agent-out/c20e-cr <HEAD>`, the same for `c20e-ap` and `c20e-pw`; w283 touches the signature-wait files, disjoint from w277/w282); copy the packages to `scratch/briefings/`;
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
no tree edits while a Goldfish runs or a PO command is outstanding.

PO decisions of 2026-11-08 that the first handover left out:

- G20-71: the Critic stays on opus by default; preflight and admit write the MP-07 lines themselves (package w277).
- G20-72: a review range too large for one Critic is split per module (package w281). The Critic preimage pin is never
  re-pinned. It covers `agents/critic.md`, `roles/critic.md`, `skills/critic-review/SKILL.md`,
  `templates/prompts/critic-review.md`, `harness/review-protocol.md`, the Codex Critic host and its schemas.
- Push proof: the push or release approval arrives as its own follow-up commit that only adds files under
  `audit-bundles/<feature>/<commit>/proofs/` and goes out with the version tag (package w282).
- `--by` on `push-prepare` and `approve-push` only with a value the PO names for exactly that command (EL-36); for the
  push of 20d it was the label APS.
- Stamping only on the PO's word. The agent stamps, the PO installs.
- Protected plugin files only through a held patch plus a PO apply script; run `rehearse.mjs` first, which needs the
  script committed.
- Small corrections the Elephant may build itself in a clone; larger ones go to a Goldfish: `pipeline-core:goldfish-deep`
  with model sonnet and the briefing generator, never a hand-written briefing.
- Work discipline: never two heavy suites at once; `heal --no-goldfish-running` only when no Goldfish runs.
- Acceptance standard: the happy path in greenfields on Windows and Linux, on all three runners (Claude, Codex,
  agy), from onboarding to release and feature close, without detours. Open: Full Verify, Critic, the greenfields and
  PO acceptance; nothing is "done" before those.
