# W122 C19-G1 notes (authorize-critical builders for deploy, publication, release-preflight)

Criterion binding: AC-140 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What
- `po-human-approval.mjs`: new exports `authorizeCriticalDeployCommand`, `authorizeCriticalPublicationCommand`, `authorizeCriticalReleasePreflightCommand`
  (each `authorizeCriticalActionCommand` with a fixed kind) and `prepareAuthorizeCriticalLine({kind, candidate, subject, ...})`, which computes
  `--subject-sha256` with `criticalActionSubjectSha256` and renders the line through the existing shell-quoting renderer.
- `lib/human-terminal-action-catalog.mjs`: three builders added to BUILDERS and REGISTERED_BOUNDARIES (boundary null, as push).
- `catalog.json`: `deploy-signature`, `publication-signature`, `release-preflight-signature` are now `registered` (builderId and templateId set, slots/readback/runners
  copied from the push entry); `docs/human-authorization-inventory.md` disposition rows follow.
- `pipeline-state.mjs`: when `publication-approve` lacks a verified proof, stderr now carries the plugin-built signing line before the refusal.
- `release-preflight-cli.mjs`: subject observation extracted to `observeReleasePreflightSubject` (behaviour unchanged) and new exported
  `prepareReleasePreflightAuthorizeLine`, which returns the built line from the same subject the proof is verified against.

## Why
Signing parity audit of candidate 18 (PO decision 2026-11-02): the agent prepares everything, the PO only signs. Hand-formatting a quote-sensitive line with a
self-computed digest risked a spent passphrase.

- Elephant completion (same patch): `release-preflight-cli.mjs --print-authorize-critical --base .. --lifecycle .. --retention-policy .. --plan .. --spec .. [--expires-at ..]`
  prints the line as JSON (command, argv, subjectSha256, expiresAt) and writes nothing; `pipeline-state.mjs approve-deploy` prints the plugin-built signing line when the proof
  is refused (same helper as publication, subject = the artifact and environment that were asked for).

## Tests
- po-human-approval.test.mjs: 212/212 (6 new AC-140 cases, RED first: 6 fail / 206 pass against the original).
- check-auth-gate-inventory-drift.test.mjs: 35/35 after restating fixtures (release-preflight row, three registered entries, builder list, one inactive-entry index; QG-04: tied to the catalog change).
- release-preflight-cli.test.mjs: 53 passed, 0 failed; new RPC22 (function binds the verifier's digest), RPC23 (CLI prints, writes nothing), RPC24 (usage error). RED measured: with the CLI branch removed RPC23 fails (usage error, exit 2) and the other 52 pass.
- critical-human-proof-gate.test.mjs: green with two new assertion groups (approve-deploy and publication-approve print the signing line on a refused proof; the deploy line carries the digest of the asked subject). Written after the code, no separate RED run for these two.
- check-consumer-safe-paths, check-auth-gate-inventory-drift, pipeline-state-gate-action-event and critical-action-authorization suites: green in the clone.

## Not changed
Push and feature-package-reconcile builders, signature format, subject preimages, approval record schema.

## Not proven / remaining
- No integrated Full Verify yet; the critical-human-proof-gate script has no Verify case-completion descriptor of its own (a script with plain assertions).
- Independent Critic review pending.
