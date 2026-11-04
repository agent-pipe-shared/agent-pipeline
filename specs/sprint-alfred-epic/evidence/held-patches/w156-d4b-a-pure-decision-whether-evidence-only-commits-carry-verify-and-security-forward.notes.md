# w156 — a pure decision whether evidence-only commits carry Verify and Security forward (candidate 19, D4b/E3 stage 1)

Delta on w154 (independent of w155; the inventory hunks are far apart). Elephant-built, in a clone that carries the whole chain.

## Why

Antigravity D4b and Codex E3: the registration commit and every evidence commit make the Verify and Security records stale for HEAD although no product line changed, which forces a repeated Critic and Verify round. The authority ADR draft (point 2) defines the answer: a closed evidence set, a product tree hash outside it, and a secret scan for Security.

## What it changes

- `lib/evidence-carry-forward.mjs` (new): `isEvidencePath` (closed by record class: the feature's `evidence/**` and `audit-bundles/**`, its `lifecycle.json` and `result.md`, and `project/push-threat-model.md`; plugin source, not project configuration), `productTreeSha256(root, commit)` and `evaluateEvidenceCarryForward({root, evidenceCommit, candidateCommit, kind, secretScan})`. It returns `carried: true` only when the earlier commit is an ancestor, every changed path lies in the set, the product tree hash is equal and, for Security, the injected secret scan reports `clean`; an unavailable scan, a throwing scan or a finding fails closed. It names the passed-over commits and the changed evidence paths. Full 40-hex commit ids only.
- `lib/evidence-carry-forward.test.mjs` (new): ECF1 to ECF8 against real temporary git repositories (set membership including look-alike paths, carried range, each product path class, deletion and rename out of the set, same commit and non-ancestors, every scan outcome, hash behaviour, argument validation and no repository change).
- `harness/verify-suites.json` and `docs/product-capability-inventory.json`: registration of `evidence-carry-forward-tests`.

## Checks

- Clone: `evidence-carry-forward.test.mjs` 8/8. Registration checker in the clone: the new suite is registered and categorized; the only finding there was the w155 one (control-plane-script-scan-tests), which w155 fixes.

## Not changed / not proven

- NOTHING READS THIS DECISION YET. No push guard, close coordinator, publication gate or Verify-evidence reader calls it, so no stale record is carried forward by this patch. The wiring (readers record `productTreeSha256`, existing records without it keep their exact-commit meaning, the carry-forward record names the passed-over commits) is the next stage and belongs behind its own opt-in.
- An evidence-only notion already exists for another consumer: the Critic delta course (`lib/feature-package-registration.mjs`, candidate choice and the `CCA-TRANSPORT` check) treats a commit as evidence-only when it changes only the feature manifest and `specs/<feature>/evidence/`, and a manifest-core change (for example a feature-package-reconcile commit) as a candidate. That set is narrower than the one here and answers a different question (transport of a Critic round, not carry-forward of Verify and Security). This patch does not touch it. The wiring stage must decide whether the two definitions are unified or deliberately kept apart; until then they are two sets with two owners.
- The secret scan itself is injected; no scanner is bound here (the repository's security scan would be the natural binding).
- The ADR text has had one review and no second one; no Full Verify; no independent Critic review (suspended by the PO).
