# Held patch notes — the design review receipt refusal names the bad finding id and the id form (Toolbox D23, candidate 15c)

Patch: `w32-design-review-receipt-refusal-names-the-bad-finding-id-and-the-id-form-d23.patch`. Three files (`lib/design-review-receipt.mjs`, `scripts/design-review-receipt.mjs` and the CLI test), independent of the other 15c patches. D23 of `pipeline.toolbox-session-friction-and-feature-wishes`: the finding-id format of design review receipts was undocumented, and `F1` ended in a bare `DRR-FINDING-IDS`.

## What

- `lib/design-review-receipt.mjs`: new export `describeDesignReviewFindingIdRefusal(ids)`. It only explains; the existing predicate still decides. It returns null for an acceptable list, otherwise the offending ids and the rule (upper-case letters and digits, starting with a letter, 2 to 8 hyphen-joined parts such as `AC-155` or `DESIGN-REVIEW-3`, at most 80 characters, at most 64 distinct ids), or that an id is given twice.
- `scripts/design-review-receipt.mjs`: on `DRR-FINDING-IDS` the refusal text now carries that explanation (same pattern as the existing `DRR-DECISION-TRACE` text); the code, exit status and the "writes nothing" behaviour are unchanged.
- Test: the existing "library refusals" case is extended in place: a free-text id, `F1` next to a valid id (only `F1` is named) and a duplicate id each produce the explaining message.

## Evidence

- Receipt CLI suite 35/35; with the receipt lib suites, doc contracts and case completion: 228/228.
- Mutation: disabling the CLI branch turns the extended case red (the message is only the bare code).

## Not covered

- The format is explained in the refusal, not yet in the user documentation of the receipt command.
