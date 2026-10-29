---
schema: pipeline.backlog-item.v1
id: pipeline.po-key-directory-fills-up-with-signing-artifacts
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-26
sprint: alfred
priority: P2
release: 0.7.1
source: "PO remark 2026-10-26 with a directory listing of the PO key directory on a Windows consumer machine"
done_when: manual
---

# The PO key directory fills up with signing artifacts and becomes unreadable

## Evidence (PO listing, 2026-10-26)

The directory that holds the PO signing key also receives every artifact of every signing ceremony. After a few
weeks of use it holds:

- the three files that matter and must stay: `po-private.pem`, `po-public.pem`, `trust-policy.json`;
- hundreds of `proof-<sha256>.json` and `signer-<sha256>.json` files, one pair per signed push or authorization;
- about 45 triples `proof-<12hex>-critical-<kind>.json`, `request-<12hex>-critical-<kind>.json` and
  `signer-<12hex>-critical-<kind>.json` from human-guard overrides;
- a few one-off files (`proof-manual.json`, `signer-manual.json` and similar) from manual runs.

Nothing tells the PO which of these are still needed, and the private key and the trust policy sit among them.

## Wanted

- The signing artifacts live in subdirectories by kind (for example `proofs/`, `signers/`, `overrides/`), so that
  `po-private.pem`, `po-public.pem` and `trust-policy.json` are the only files at the top level.
- A documented, explicit prune or archive command for artifacts whose commit or request is long settled. It lists
  what it would move, moves nothing without the PO naming the cutoff, and never touches the private key, the public
  key or the trust policy.
- The signer and proof readers keep finding existing flat files (a migration path), so nothing signed earlier
  becomes unverifiable.
- The bootstrap or the signing helper may tell the PO in one line when the directory exceeds a stated number of
  files, with the exact command to run.

## Acceptance

1. A new ceremony writes into the subdirectories; the top level shows only the three key files.
2. An existing flat directory still verifies old proofs; the prune command, run in dry-run mode, lists the files it
   would archive and exits without changes.
3. A test shows that the prune command refuses to move the private key, the public key and the trust policy.
4. The user documentation names the layout and the prune command.

## Why P2 and 0.7.1

It is a usability and hygiene problem, not a correctness one: signing works, the PO just cannot find or trust
their way around the directory. The key custody rules stay unchanged, so this is not a release blocker for 0.7.0.
