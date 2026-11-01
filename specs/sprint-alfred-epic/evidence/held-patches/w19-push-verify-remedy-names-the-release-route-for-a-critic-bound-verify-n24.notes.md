# Held patch notes — the push Verify remedy names the release route for a Critic-bound Verify (N24, candidate 15c)

Patch: `w19-push-verify-remedy-names-the-release-route-for-a-critic-bound-verify-n24.patch`.

## Why

`backlog/items/2026-10-30-push-init-names-the-wrong-verify-producer-mode.md` (Toolbox N24): `push-init` reported `verify-evidence-bound missing`; `verify-evidence-producer.mjs --mode push` refuses
`--critic-evidence-feature-id` (`VEP-CRITIC-CARRY-INPUT`); the route that worked was `--mode release ... --out evidence/verify-latest.json`, and the producer never overwrites. The hint said none of this.
PO tile answer 2026-11-01: the hint names the exact release-mode route and what to do with an existing output file (not: make push mode accept the carry input).

## What

`plugins/pipeline-core/scripts/push-prepare.mjs`: `resolveVerifyRemedy` (the text `push-init`, `push-prepare` and the satisfiability report print for missing or stale `evidence/verify-latest.json`) gains one trailing line:
if the push needs a Critic-bound Verify (`--critic-packet-id` with `--critic-evidence-feature-id`), `--mode push` refuses it (`VEP-CRITIC-CARRY-INPUT`); run the same command with `--mode release` and those Critic inputs and
`--out evidence/verify-latest.json`; the producer never overwrites, so move an existing `evidence/verify-latest.json` aside first. Text only: the plan object (`resolveVerifyRemedyPlan`), the commands, and every gate are unchanged.
`push-prepare.test.mjs`: three `assert.match` lines in the existing remedy test (+3 assertions).

## Not done

Making `--mode push` accept the Critic carry input (the alternative in the item) — decided against by the PO. The route was reported by a consumer, not re-run here; the line states what the producer's own refusal says.

## Evidence

Scratch clone: push-prepare, push-init and push-gate-satisfiability suites and the case-completion suite 199/199 pass. Pending: Full Verify, batch Critic, native runs, PO acceptance.
