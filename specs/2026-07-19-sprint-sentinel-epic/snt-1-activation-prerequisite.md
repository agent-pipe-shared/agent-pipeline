# SNT-1 activation prerequisite status

Status: **the SNT-1 prerequisite is complete and may be consumed by an exact
HAW-E `externalPrerequisite` validation. This record grants no HAW-E
activation, release consent, publication, or main-branch approval.**

The historical backlog transition at sequence 15 closed
`pipeline.source-available-commercial-licensing` for commit
`a798db6d45f2fc113f66d01400d7ea70fcef9427`. Its closure evidence predates the
current Sentinel candidate and does not contain the SNT-1.8 candidate-bound
Result digest, private license-gate digest, or neutral-public license-gate
digest. Sequence 40 therefore preserves that event and appends a
`closed` → `closed` `evidence-amendment` for the current candidate. The
append-only history remains truthful and must not be edited, replaced, or
supplemented with invented values.

The frozen candidate at commit
`f83803c767f90dceacea936ac3bd52c63dc24bd1`, tree
`9bdd679db74aa0b1b7877984df7324ffb880be86`, contains the corrected license
boundary, trusted-base CLA gate, personal-acceptance event proof, privacy
review, threat model, and recovery contract. The public evidence package now
records its dispositions, sanitized projections, and Result. That package
is now bound into the closure by the append-only amendment. Neither the
package nor its amendment authorizes HAW-E activation or release.

## Complete public evidence package and amendment

The sanctioned path is now implemented in existing governed surfaces:

- `check-license-contract.mjs` constructs closed-schema, candidate-bound
  private and neutral-public license-gate receipts, a log-safe public
  projection, and a physical owner-only private record below the Git common
  directory with POSIX owner/mode or Windows owner/DACL assurance and exact
  replay/conflict handling. The public projection contains no raw private
  receipt digest; `privateLicenseGateSha256` binds its sanitized projection
  digest instead;
- the same checker constructs and validates the canonical SNT-1 Result digest,
  binding both candidates, both gates, governing license surfaces, the
  licensing disposition, and the separate privacy disposition; it refuses a
  ready result while privacy review is pending; and
- `backlog-state.mjs` plus `check-backlog-state.mjs` provide one strict
  `closed` → `closed` `evidence-amendment` suffix through the recoverable
  transaction writer. Generic transitions still cannot leave or re-close a
  closed item.

The named-human licensing and privacy dispositions and candidate-bound Result
are now recorded as closed-schema JSON under `backlog/evidence/`. The private
and neutral-public gates in that Result expose only sanitized projection
digests. The raw private receipt, its digest, and its storage path are not
public. Both projections bind the same candidate and seven-surface set.

Sequence 40 records the completed append-only backlog evidence amendment. It
keeps `closed_at: "2026-07-21"` unchanged, advances the closure evidence to
the candidate Result at commit
`2ddf3592ea004bd6e2a830a61bb02c931238070f`, and preserves ledger events
1–39 byte-for-byte. The private raw authority remains outside public
repository history by design; only its sanitized projection is public.

The named-human privacy approval dated 2026-07-23 is candidate-bound and
records the 30-day Actions-log retention read-back. It is not release consent,
publication authority, HAW-E activation, or main-branch approval.

## Completed construction and HAW-E consumption boundary

The owner has frozen the candidate, run the license contract, constructed the
private and neutral-public sanitized projection digests, recorded the
named-human licensing/privacy dispositions, and constructed the
candidate-bound Result. The evidence update used
`applyBacklogEvidenceAmendment` through the recoverable transaction writer,
which preserved every historical ledger byte before its single amendment
suffix and regenerated the item, ledger, status, and index projections.

HAW-E may now consume the prerequisite only when its `externalPrerequisite`
record validates this exact set:

- `closureCommit`:
  `2ddf3592ea004bd6e2a830a61bb02c931238070f`;
- `resultSha256`:
  `68c75d03de7a59745ba3429c6ffdc3e038b35f52db20a74216744399f7f9775b`;
- `transitionSha256`:
  `2849de19fb7f0d0f34d6f2cbe6ed6d5171445abb09fa02132bc9a1d0d707e2b1`;
- `privateLicenseGateSha256`:
  `44b9c3e4a13f44b61b281b604f9e25cce4b98ea409ba304211b55a119557882f`;
  and
- `neutralPublicLicenseGateSha256`:
  `e61dc186b036be253db0c41abf7b5c8d5e7fc74f64fb3b38b262cf4d91bdecc0`.

Successful consumption establishes only the SNT-1 external prerequisite. It
does not establish a HAW-E Result, release approval, publication approval, or
approval to merge to `main`; those authorities remain separate.
