# Vendored canon refresh (PO exception: Elephant builds small items, 2026-10-30)

Held patch `w7-vendored-canon-refresh.patch`, built by the Elephant in a scratch clone at 463fa9a14. Nothing applied.

## Behaviour

Regenerates the three vendored copies under `plugins/pipeline-core/` that had drifted from their repo-root canon:
`roles/critic.md`, `docs/adr/0014-critic-contract.md`, `docs/push-release-flow.md`. Content is the canon's bytes;
no canon file changes.

## Evidence

- The vendored-canon check passes on the patched clone; its test 8/8.
- The drift was pre-existing at the candidate (see the D196 notes addendum), not introduced by D195/D196.
- Stack check: applies cleanly after D195 and D196-on-D195 (`scratch/agent-out/stack-check.mjs`).

## Not verified

Full Verify, Critic, native Windows, PO acceptance.
