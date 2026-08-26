---
schema: pipeline.backlog-item.v1
id: pipeline.hash-chained-ledger-collides-with-the-secret-scanner
type: defect
owner: pipeline
status: closed
created: 2026-08-08
source: "Observed 2026-08-08 while repairing the 38 pre-public-core reachability findings: the repair commit turned the live security scan red, one finding per appended ledger line."
due: 2026-09-07
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "c8dee9d47692fd5f87a6a3f4cc15a666cc7fb247"
closure_evidence: "backlog/items/2026-08-08-the-hash-chained-ledger-collides-permanently-with-the-secret-scanner.md"
---

# Every append to the transition ledger produces one gitleaks false positive, so the Pipeline's own tamper-evidence mechanism permanently fights its own secret scanner

## Description

`backlog/transitions.ndjson` is a hash-chained, append-only ledger. Every event
carries at least `entryHash` and `previousHash`, and several event kinds carry
more — a `reachability-amendment` also carries `referenceSha256` and
`supersedesEntryHash`. These are SHA-256 digests, so every line contains
multiple bare 64-character lowercase hex strings.

gitleaks' `sentry-access-token` rule pattern-matches exactly that shape.

**The exact incidence, measured over all 220 ledger lines rather than inferred.**
An earlier draft of this item claimed one finding per appended line. That was
wrong, and the correction sharpens the item rather than dissolving it:

| event kind | lines | trip the scanner | 64-hex digests per line |
| --- | --- | --- | --- |
| `reachability-amendment` | 2 | **2 (100%)** | 4 |
| `pre-public-core-reachability-amendment` | 38 | **38 (100%)** | 4 |
| `item-file-reconciliation` | 125 | 2 (1.6%) | 2 |
| the other 13 kinds | 62 | 0 | 1–5 |

So the collision is **deterministic for amendment events and sporadic for
everything else**. The discriminator is the digest count: an amendment carries
four 64-hex values (`entryHash`, `previousHash`, `referenceSha256`,
`supersedesEntryHash`) where an ordinary event carries two, and four is enough
for the rule's context window to match. The two sporadic hits are not even the
same rule — they fire `generic-api-key`, at
`.gitleaksignore:70` and `:82-83`.

This was measured, not assumed, and the prediction that produced the correction
is itself recorded below: filing this very item appended one ordinary
`item-file-reconciliation` event, the scan was re-run against that candidate
expecting a new finding, and it returned **0 findings**.

The historical evidence is consistent with the corrected reading: the 2026-07-30
repair appended two amendment events and both tripped it —
`.gitleaksignore:75-78` carries their four `sentry-access-token` authorities.
Nobody recorded then that the cost recurs, or that it is specific to the
amendment shape.

## Why this is worth an item rather than a shrug

Each occurrence is individually cheap to handle and the handling is correct —
a `content-v1:` authority binds path, rule, line, column and a digest of the
matched content, so it suppresses exactly the one finding and re-blocks on any
drift. Suppressing is the right call; a file-level exclusion would be worse,
because it would hide a genuine secret later pasted into the same file.

The problem is the accumulation, and it has three separate costs:

1. **The suppression list grows without bound.** `.gitleaksignore` gained 38
   entries from one repair. A future repair of comparable size adds another
   batch. The file is already 100+ lines and carries four distinct historical
   formats with explanatory comment blocks between them.
2. **It erodes exactly the property the review rule protects.** The phase plan's
   R2 disposition states that the security-scan assertion "exists to catch
   suppressions nobody re-justifies" and that the PO's approval covered 13
   specific entries, not the rule. A mechanism that mints suppressions in
   batches of 38 makes that review surface unreadable in practice: nobody will
   re-derive 38 justifications, so they will be re-justified as a block, which
   is the thing the rule was written to prevent.
3. **Repairs pay it in full; everything else pays a lottery.** Every future
   ledger repair appends amendment events, and those trip the rule at 100% —
   a repair of N events costs N suppressions, by construction, with no
   variance. Ordinary transitions mostly do not trip it, but 2 of 125 did, and
   nothing about those two is visible in advance. An occasional, unpredictable
   red gate is in one respect worse than a constant one: a constant cost gets
   designed around, while a 1.6% cost surfaces as a surprise failure inside
   whichever unrelated work package happened to move a backlog item, and gets
   diagnosed from scratch each time. It cost this session one such diagnosis.

## Triggering situation

2026-08-08, PHX-LEDGER-REACH. Commit `a368552` appended 38 events. The next full
verify run went from 366/366 green to `security-scan=2` with 38 findings, none
outside the ledger. Repaired by `d0de981`, which appended 38 `content-v1:`
authorities. Both the failure and the repair are exactly reproducible.

## Affected artifact

`backlog/transitions.ndjson` (the digests), `.gitleaksignore` (the growing
suppression list), and the interaction between them at
`harness/scripts/security-adapters/gitleaks.mjs` — specifically the fact that no
mechanism distinguishes "a digest in a machine-generated ledger" from "a secret
that happens to be 64 hex characters".

## Proposal

Not designed here. Candidates for a deliberate decision, explicitly not a
commitment, roughly in increasing order of intrusiveness:

1. **Teach the scan about generated data without blinding it.** A per-path rule
   scoping — for instance, disabling only `sentry-access-token` (and any other
   bare-hex rule) for `backlog/transitions.ndjson`, while leaving every
   content-bearing rule active on that file — keeps a pasted credential
   detectable while removing the digest tax. This is narrower than a file
   exclusion and narrower than a global rule change, and it is the only option
   that scales, because it costs nothing per future append. The question a
   decision has to answer is whether the scanner's configuration supports
   path-scoped rule disabling without also weakening the rule elsewhere.
2. **Have the sanctioned ledger writer mint its own authorities.** The writers in
   `check-backlog-state.mjs` already know exactly which lines they appended. They
   could compute and append the matching `content-v1:` entries in the same atomic
   transaction, so the suppression is generated by the same code that generated
   the digest and can never drift from it. This keeps the scan fully armed and
   removes the human step — but it does mean a program writes its own
   suppressions, which needs a clear-eyed answer to "what stops that from
   suppressing something real?" (Probable answer: it only ever emits authorities
   for lines it just wrote, bound to the content it just wrote.)
3. **Reduce the digest surface in the ledger.** Not recommended, recorded for
   completeness: the chain needs its hashes, so the only movable parts are the
   optional evidence digests. Shrinking them to weaken a scanner heuristic would
   be tuning integrity data to suit a tool, which is backwards.
4. **Whichever is chosen**, record in `.gitleaksignore` itself that the ledger
   block is a *class* of false positive with a stated cause, not a list of
   individually reviewed incidents. The current comment blocks describe their
   entries as exact historical false positives, which stops being true once the
   list is machine-scale.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Not decided — this entry records re-examination, not a
  choice among the item's named candidates. Confirmed still live and
  growing: `.gitleaksignore` is now 122 lines (was ~38 at filing), with new
  `content-v1` entries for `backlog/transitions.ndjson` accumulating past
  line 78. No per-path rule scoping, self-minting writer, or generated-data
  classification comment exists.
- **Rationale:** The item's own Proposal frames this explicitly as "not
  designed here... candidates for a deliberate decision" among named
  alternatives — an architectural call about how the ledger and the secret
  scanner should relate, not a mechanical fix.
- **Assignment (if accepted):** Not assigned; needs the PO decision the item
  itself asks for. The list's continued unscoped growth is a live,
  measurable cost of leaving this undecided.
- **Date:** 2026-08-18

## Triage — closed 2026-08-18 (PO decision: "nutze eine gute Empfehlung")

- **Decision:** Candidate 1 (per-path rule scoping) — the option the item's
  own Proposal named as "the only option that scales, because it costs
  nothing per future append."
- **Assignment:** `PHX-WP-GITLEAKS-RULE-SCOPE` (goldfish-deep), commit
  `c8dee9d4`. New `.gitleaks.toml` extends gitleaks' full default ruleset
  (`useDefault = true`) and adds a path-scoped allowlist disabling ONLY
  `sentry-access-token`/`generic-api-key` for `backlog/transitions.ndjson`;
  `gitleaks.mjs` now always passes `--config`, resolved from the adapter
  module's own on-disk location (never from `rootDir`, the untrusted
  candidate-tree snapshot — a candidate must never supply its own
  scanner-config override). Proven empirically with the real gitleaks
  binary: a ledger-shaped fixture produces no finding; the identical
  secret-shaped string at a different path still does (the load-bearing
  proof nothing else was weakened).
- **Independently re-verified by the Elephant** (not trusted from the
  dispatch report alone): re-ran `node --test
  harness/scripts/security-adapters/gitleaks.test.mjs` directly — 13/13
  pass, exit 0, including the real-binary path-scoping regression test.
  Confirmed the commit's diff matches the report's description. Confirmed
  the report's one flagged deviation (test uses
  `resolveTrustedSystemExecutable` rather than the adapter's own narrower
  `isInstalled()` PATH-walk) matches the exact same production trust-probe
  `harness/scripts/security-scan.mjs` itself already uses — not a shortcut.
- **Residual, accepted:** existing `.gitleaksignore` `content-v1:` entries
  for this ledger are left in place (historical record, not removed); no
  new entries will be needed going forward. First attempt at this dispatch
  exceeded its tool budget before committing and had to be resumed once —
  disclosed, not silently absorbed.
