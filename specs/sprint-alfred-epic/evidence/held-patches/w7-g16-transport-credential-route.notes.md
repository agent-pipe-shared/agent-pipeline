# Held patch w7-g16-transport-credential-route (G16, D209)

Elephant-built held patch (PO exception for small items), candidate `caaa327ee`, built in a scratch clone.

## What it changes

- `plugins/pipeline-core/skills/pipeline-start/references/push-approval.md`: new section "Git transport credentials
  are not the PO approval proof". It separates the transport credential from the detached PO proof, names the
  configured route (`git remote get-url <remote>`, `ssh -G <host>`, `git config --get credential.helper`), forbids
  listing a credential store or guessing key filenames, and asks the PO one early question with context.
- `docs/push-release-flow.md` and its shipped copy `plugins/pipeline-core/docs/push-release-flow.md` (byte-identical
  before and after): one Layer 5 paragraph naming the same route and pointing at the reference section.
- New pin `plugins/pipeline-core/lib/pins/push-approval-doc-names-the-transport-credential-route.test.mjs` (A1-A5),
  registered in `harness/verify-suites.json` and categorized in `docs/product-capability-inventory.json`.
- Inventory: `housekeeping-tests` and `routine-repair-tests` were registered suites with no capability; a rebaseline
  exposed them, so both are categorized here as well (pre-existing gap, not caused by G16).

## Evidence

- Pin 5 of 5 green in the clone; revert proof: with the production docs reverted, A1-A5 fail; restore byte-equal.
- Downstream suites that read the changed docs, green in the clone: `skills/pipeline-start/pipeline-start-v3.test.mjs`
  (8/8, skill size limit), `scripts/push-release-flow-docs-contract.test.mjs` (11/11),
  `harness/scripts/generate-elephant-role-prohibitions.test.mjs` (13/13).
- Apply simulation in the clone (commit the patch, `node scripts/rebaseline-inventory.mjs`, commit the inventory):
  `check-product-capability-inventory.mjs` PASS, its test 30/30; `check-verify-suite-registration.mjs` still reports
  the 16 pre-existing unregistered suites (identical on the baseline) and 0 uncategorized (baseline 2).
- `driver patch`: 12265 bytes, apply-check on the plain candidate exit 0.

## Operator note

The inventory and `harness/verify-suites.json` are protected; after the apply commit the operator runs
`node scripts/rebaseline-inventory.mjs` and commits the inventory as a second commit.

## Not done

No guard change (none needed: the refusal of a credential-store read stays as it is). No native-host check.
