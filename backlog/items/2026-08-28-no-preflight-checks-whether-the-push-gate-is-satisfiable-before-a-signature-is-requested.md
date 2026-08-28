---
schema: pipeline.backlog-item.v1
id: pipeline.no-push-preflight-before-requesting-a-signature
type: defect
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: c5c143541b155ac749b2db9323fa58c588d39fcd
closure_evidence: backlog/items/2026-08-28-no-preflight-checks-whether-the-push-gate-is-satisfiable-before-a-signature-is-requested.md
sprint: nova
tracking: "NOW / Nova A — happy-path blocking: a burned or expired signature stops the path at its last step and costs a live PO interaction to retry"
source: "Claude/Windows greenfield run, 2026-08-28, sections 7 and 11 of its own analysis (docs/pipeline-haertungstest-und-analyse.md)."
---

# Nothing checks whether the push gate is satisfiable before a PO signature is requested, so signatures are spent and expire

## What happened

The Claude run obtained a PO signature **before** the verify contract was fixed.
The signature then expired unused while the deadlock was worked through. Its own
verdict: a sequencing error, but one the Pipeline could have prevented.

This repository has independently paid the same cost: a live PO passphrase entry
was burned when an override capability was armed against an already-closed
window, and the retry failed looking exactly like a first denial.

## The defect

A human signature is the most expensive resource in the whole system — it needs a
person, an external key, and a bounded time window. Nothing verifies that the
thing being signed for can actually succeed before that resource is spent.

## Direction

A read-only preflight, run before any signature is requested, answering one
question: **is this gate satisfiable right now?**

- Is the verify contract real, and does candidate-bound evidence exist?
- Is the trust anchor present?
- Is the threat model materialized?
- Is the ordering correct — is anything about to invalidate the preimage this
  signature will bind?
- Does the time window leave enough room to complete the ceremony?

If any answer is no, name which one and refuse to request the signature.

## Acceptance criteria

- A signature request preceded by an unsatisfiable gate is refused with the
  specific unmet precondition named.
- The preflight is read-only and cannot itself mutate the preimage it inspects.
- A test covers the expired-window case specifically.

## Closing note (reconciliation, 2026-08-28)

Partially resolved. `plugins/pipeline-core/scripts/push-prepare.mjs` (`pushPrepareReport()`,
lines 348-425) is exactly the described read-only preflight: it checks working-tree
cleanliness, verify-evidence freshness bound to HEAD (`checkEvidenceFreshness`), the
security-evidence gate when active, `push-threat-model.md` presence
(`checkPushThreatModel`), and the critical-human-proof trust-anchor posture
(`checkCriticalHumanProofPolicy`) — each unmet check returns `ok:false` with a named
`remedy`, and `report.ready` only turns true once every check passes. The header comment
(lines 3-21) states its own read-only contract explicitly ("Never writes a file, never
mutates pipeline state, never touches the network"). This covers three of the item's five
Direction bullets: verify contract + evidence, trust anchor, threat model.

NOT covered: "does the time window leave enough room to complete the ceremony" — the
function only generates a fresh `expiresAt` (line 409), it never checks a caller-supplied
window against elapsed/remaining time. Checked `plugins/pipeline-core/scripts/push-prepare.test.mjs`
for an expired-window test case (acceptance criterion 3) — grepped for "expir"/"window",
only an unrelated literal `--expires-at` fixture value at line 390, no assertion that an
expired or too-short window is refused. The item this one's source section points at
(`2026-08-28-an-expired-override-is-armed-instead-of-refused.md`, a different mechanism —
`authorize-by-signature` in `human-guard-override.mjs`) is the pointer for that gap, and per
this dispatch's briefing that item's own fix is still in flight elsewhere, not in this
checkout. Status left `open`.

## Closing note (reconciliation, 2026-08-29)

The gap the note above identified is closed, by a different commit than the one it
pointed at. Commit `c5c143541b155ac749b2db9323fa58c588d39fcd` (later the same day)
adds `plugins/pipeline-core/scripts/push-gate-satisfiability.mjs`, a new read-only
preflight that reuses `push-prepare.mjs`'s existing precondition functions AND adds
`checkSignatureWindow()`, which independently re-derives armed-capability expiry
(never trusting the human-guard-override store's own self-reported status) — closing
the fifth Direction bullet directly, not via the `human-guard-override.mjs` fix. A
dedicated test covers exactly the expired-window acceptance criterion:
`checkSignatureWindow: an armed capability self-reporting "armed" past its own
expiresAt -> status expired-armed-capability, ok:false (THE confirmed defect)`, and
`assessPushGateSatisfiability: an expired-armed signature window alone flips
satisfiable:false, named specifically`. All three acceptance criteria confirmed:
unmet preconditions are named specifically (`assessPushGateSatisfiability: each
unmet precondition is named specifically...`), the module's own header states and a
dedicated test proves the read-only invariant (`read-only invariant: a real CLI run
against this repository leaves the working tree byte-identical`), and the
expired-window case is covered as above. `node --test
plugins/pipeline-core/scripts/push-gate-satisfiability.test.mjs` (33/33) exits 0.
