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

The frozen candidate at commit
`f83803c767f90dceacea936ac3bd52c63dc24bd1`, tree
`9bdd679db74aa0b1b7877984df7324ffb880be86`, contains the corrected license
boundary, trusted-base CLA gate, personal-acceptance event proof, privacy
review, threat model, and recovery contract. The public evidence package now
records its dispositions, sanitized projections, and Result. That package
does not itself amend the historical closure or authorize release.

## Constructed public evidence package and missing amendment

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

No backlog evidence amendment has been created. Activation remains blocked
until the existing exact evidence package is completed with:

1. the raw private license-gate authority record retained outside public
   repository history;
2. the exact append-only backlog transition digest and closure commit that the
   HAW-E external prerequisite consumes; and
3. fresh Verify, security, and independent-Critic evidence for that same
   candidate package.

The named-human privacy approval dated 2026-07-23 is candidate-bound and
records the 30-day Actions-log retention read-back. It is not release consent,
publication authority, or a substitute for the missing amendment.

## Sanctioned construction path

The owner has frozen the candidate, run the license contract, constructed the
private and neutral-public sanitized projection digests, recorded the
named-human licensing/privacy dispositions, and constructed the
candidate-bound Result. The evidence update must use
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
