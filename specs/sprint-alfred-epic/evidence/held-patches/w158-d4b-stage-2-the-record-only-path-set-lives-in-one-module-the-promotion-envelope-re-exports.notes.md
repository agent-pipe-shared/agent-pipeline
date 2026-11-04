# w158 — the record-only path set lives in one module, the promotion envelope re-exports it (candidate 19, D4b/E3 order of work, step 1)

Delta on w157. Elephant-built, in a clone that carries the whole chain. This is step 1 of the order of work in the "Proposed amendment of 2026-11-04" of `docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md`; the amendment itself has had no review.

## Why

Three definitions of "may change without invalidating a Verify or Security record" exist (Critic delta course, release-promotion envelope, the w156 carry-forward decision). Before any reader is wired, the production one must have one owner.

## What it changes

- `lib/record-only-paths.mjs` (new): `RECORD_ONLY_PATH_PATTERNS` and `isRecordOnlyPath`, moved byte-for-byte from `lib/release-promotion-envelope.mjs`; plus `AUTHORITY_CARRY_EXTENSION_PATTERNS` and `isAuthorityCarryExtensionPath` for the two classes the draft adds (`specs/<f>/audit-bundles/**`, `project/push-threat-model.md`). The extension is NOT record-only and nothing consumes it yet.
- `lib/release-promotion-envelope.mjs`: imports the set and re-exports both names, so `hooks/guard-push.mjs`, `scripts/push-prepare.mjs` and every other importer see the same objects. No behaviour change.
- `lib/record-only-paths.test.mjs` (new): ROP1 pins the 13 pattern sources and flags in order, ROP2 the identity of the re-exports, ROP3 membership and normalisation, ROP4 the extension separation, ROP5 that the narrower w156 decision never accepts a path outside the shared set plus the extension and pins the members where the shared set is wider (`docs/state.md`, `backlog/**`, pipeline-state files, `evidence/**`).
- `harness/verify-suites.json` and `docs/product-capability-inventory.json`: registration of `record-only-paths-tests`.

## Checks

- Clone: `record-only-paths.test.mjs` 5/5; the existing envelope and push suites unchanged: `release-promotion-envelope.test.mjs`, `guard-push-promotion.test.mjs`, `push-prepare.test.mjs` together 101/101. Registration checker in the work clone: the new suite is registered and categorized (the only finding there was the w155 one, fixed by w155). `git apply --check` against the chain clone: exit 0.

## Not changed / not proven

- The w156 module keeps its own narrower set; unifying it with the shared one is a later step and needs the reviewed amendment. The Critic delta course keeps its test.
- No shared freshness function yet (step 2), no carry-forward branch (step 3), no reader wired.
- No Full Verify; no independent Critic review (suspended by the PO).
