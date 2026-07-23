# SNT-1 activation prerequisite status

Status: **blocked; no HAW-E Result intent, release consent, publication, or
backlog mutation is authorized by this record.**

The historical backlog transition at sequence 15 closed
`pipeline.source-available-commercial-licensing` for commit
`a798db6d45f2fc113f66d01400d7ea70fcef9427`. Its closure evidence predates the
current Sentinel candidate and does not contain the SNT-1.8 candidate-bound
Result digest, private license-gate digest, or neutral-public license-gate
digest. The append-only history remains truthful and must not be edited,
replaced, or supplemented with invented values.

The current Public candidate adds the corrected license boundary, trusted-base
CLA gate, personal-acceptance event proof, privacy review, threat model, and
recovery contract. This file records implementation state only. It is not the
missing Result and does not convert focused test output into closure evidence.

## Implemented evidence path and missing actual evidence

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

No actual receipt, Result, or evidence amendment is created by that
implementation. Activation remains blocked until one exact evidence package
supplies all of:

1. immutable private and neutral-public candidate commit/tree identities;
2. a license-gate result for each exact candidate tree;
3. a private license-gate receipt digest retained only in the private
   authority and a neutral-public license-gate receipt digest that exposes no
   private values or correlatable raw private digest;
4. a candidate-bound SNT-1 Result whose SHA-256 binds the human licensing and
   data-privacy dispositions, both candidate identities, both license-gate
   digests, and the current governing license surfaces;
5. the exact append-only backlog transition digest and closure commit that the
   HAW-E external prerequisite consumes; and
6. fresh Verify, security, and independent-Critic evidence for that same
   candidate package.

The named-human CLA-process approval dated 2026-07-23 is not a privacy
sign-off, release consent, or substitute for any missing digest.

## Sanctioned construction path

The owner must freeze both product candidates, run each candidate's license
gate without exporting private material, construct the private and neutral
public receipts in their respective authorities, and obtain the named-human
licensing/privacy dispositions. Only then may it construct the candidate-bound
Result and verify its digest off-ref. The evidence update must use
`applyBacklogEvidenceAmendment` through the recoverable transaction writer;
item Markdown, `backlog/transitions.ndjson`, `backlog/STATUS.md`, and
`backlog/index.json` must never be hand-edited. The writer requires an already
closed item, reachable new closure commit, repository evidence file, exact
Result/private/public gate digests, and preserves every historical ledger byte
before its single amendment suffix.

HAW-E may consume the prerequisite only after its
`externalPrerequisite` record validates the exact `closureCommit`,
`resultSha256`, `transitionSha256`, `privateLicenseGateSha256`, and
`neutralPublicLicenseGateSha256`. Until that read-back succeeds, the correct
state is this explicit blocker—not a fabricated close.
