# Public workspace inventory and inert preservation

This package audits354repository roots and preserves public changes outside
the primary feature branch as inert postimages and public-only Git diffs.
It does not integrate or qualify those changes. See `inventory.json` for
per-root HEAD, Main ancestry, dirty paths, Source/transport hashes and exact
existing tracked copies. Deduplicated blobs are indexed by content hash.

The final package has1021artifact records in718deduplicated blobs,75,730,478
bytes. `source-inventory.json` preserves original per-root status and coverage;
`status-readback.json` rechecks353nonprimary roots after capture and confirms
unchanged HEAD/status for all. The primary tree is excluded from that second
comparison because the parent performs authorized transfer integration there.

All registered worktree HEADs were checked against the primary feature HEAD.
For separate nonancestor clones, a shared ancestor is found in their first512
commits and their public committed delta is preserved separately from dirty
working-copy changes. A synthetic fixture commit is not a release finding.
Unresolved ancestry, failed diffs, sensitive-pattern exclusions or snapshot
drift must be reviewed before asserting complete portability.

Only ordinary public Source/test/documentation/architecture/harness/package
paths are eligible. Private runtime state, profiles, keys, credential/approval
proofs, node_modules, Scratch trees and Git internals are excluded. Source
files named authority or private are ordinary public code, not authority
store contents. Symlinks/directories are not dereferenced. Original absolute
home/repository prefixes are sanitized and derivative hashes are explicit.

One historical k101 committed diff contains the same token-shaped scanner
test value in two test files. The raw value is excluded; the complete diff is
preserved as a sanitized derivative with digest markers. This does not classify
the value as a real credential or create a scanner exception. All172nonancestor
public commit deltas have an inert transport. All10registered HEADs are already
in Main history. Final hash/count/status readback is in `validation.json`.

The real default-rule Gitleaks directory scan exited1 with16findings. Exact
public-artifact inspection classified3PEM-header code literal matches,
5public synthetic key-reference labels and8reuseKeySha256 content-digest
matches. [Classification metadata](scanner-classification.json) preserves
rule/line/span/value hashes and Source evidence. These are false positives,
not actual private keys or API credentials. Their exact Source bytes remain
preserved; no ignore/allowlist/suppression was added and no scanner exit0 is
claimed. The separately redacted k101 token-shaped fixture remains a derivative.

These transports are recovery material, not instructions to apply historical
rehearsal or rejected patches. Canonical next work remains docs/state.md.
No root was removed and no liveness/cleanup safety claim is made.
