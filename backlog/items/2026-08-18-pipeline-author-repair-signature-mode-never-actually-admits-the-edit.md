---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-author-repair-signature-mode-never-actually-admits-the-edit
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "Elephant, 2026-08-18, live during the OT09 (guard-testpath-override.test.mjs line 213) repair ceremony for the Phoenix reconcile-approval port regression (see backlog/items/2026-08-18-critical-human-proof-policy-lacks-the-reconcile-approval-generalization.md and docs/state.md's 2026-08-18 entry). A full `pipeline-author-repair` signature ceremony was walked end to end with the PO: plan, prepare-authorization, emit-signature-digest, PO sign-intent (succeeded), authorize-by-signature (succeeded, capability armed, status: armed, consumedAt: null, correct authorSourceRoot recorded). Retrying the byte-identical original Edit twice against a confirmed-clean working tree still returned the exact same TP-7/author-repair-required denial as if the capability had never been armed. The capability expired unused (DEFAULT_TTL_MS 30 min) before a root cause was found; OT09 is still red as of this entry."
---

# `pipeline-author-repair` signature mode arms a capability that `consumeHumanGuardOverride` never admits

## Description

The `pipeline-author-repair`/`pipeline-author-repair-candidate` ceremony
(the route TP-7 offers for an edit inside `plugins/pipeline-core/**`,
where an in-session `chat`-mode clearance is refused and a normal
override plan cannot auto-select an author source root) completes every
externally-observable step successfully — `plan` resolves,
`prepare-authorization` and `emit-signature-digest` succeed, the PO signs
via `sign-intent`, and `authorize-by-signature` reports `status: "armed"`
with a capability record on disk carrying the correct `authorSourceRoot`,
matching `head`/`tree`/`statusSha256`, `consumedAt: null`. But retrying
the guarded tool call (an `Edit` on the exact file/old_string/new_string
that produced the original denial) against a byte-for-byte matching,
confirmed-clean working tree still returns the same `TP-7`/
`author-repair-required` message as an entirely unarmed request would —
`guard-testpath.mjs`'s `consumeHumanGuardOverride()` call (hooks/
guard-testpath.mjs:259) is returning something other than `{status:
"consumed"}` for a capability that every visible field says should match,
and the guard's own catch-all (`catch { consumed = { status: "absent" }
}`, hooks/guard-testpath.mjs:260-262) means the real internal reason
never surfaces to the human at all — it silently falls through to
`recordHumanGuardDenial`'s normal-denial message, indistinguishable from
never having attempted the ceremony.

**This makes the entire `pipeline-author-repair` signature route
currently non-functional in practice** — the PO can complete every step,
including the sensitive OpenSSL passphrase entry, and the edit still does
not go through. Two ceremony attempts were burned this session before the
capability's 30-minute TTL expired, without a working fix landing.

## A related, likely-connected display bug found the same session

`describeHumanGuardOverrideSelection()` (`human-guard-override.mjs`
~line 2850, used by `sign-intent` to show the PO what they're about to
sign) hardcodes `authorSourceRoot: null` when re-deriving a stored
request's digest for display/matching purposes. This makes it structurally
unable to correctly describe or match a `pipeline-author-repair-candidate`
mode request, surfacing every time as a cosmetic (non-blocking, confirmed
live — `sign-intent` still proceeds to a real signature afterward)
`HGO-RECORD-DIGEST-MISMATCH` warning. Filed here because it touches the
exact same `authorSourceRoot` handling gap in the same ceremony mode, and
the root cause investigation for the consumption bug above should check
whether they share a cause before treating them as two separate fixes.

## Affected artifacts

- `plugins/pipeline-core/lib/human-guard-override.mjs` —
  `consumeHumanGuardOverride()` (~line 2621 onward, including the
  drift/expiry check around ~line 2713-2721 that calls
  `authorEligiblePaths(repo.root, capability.eligiblePaths,
  capability.authorSourceRoot)`), and `describeHumanGuardOverrideSelection()`
  (~line 2850, the `authorSourceRoot: null` display bug).
- `plugins/pipeline-core/hooks/guard-testpath.mjs` — the catch-all at
  lines 260-262 that converts any internal `consumeHumanGuardOverride`
  exception into an indistinguishable `{status: "absent"}`, hiding the
  real failure reason from both the log and the human-facing denial
  message.

## Triage

Not yet decided — this item is filed to preserve the finding, not close
it. Recommended next step for whoever picks this up: reproduce with
temporary diagnostic instrumentation (a scratch-local, non-committed
`console.error` at each `continue`/`return` branch inside
`consumeHumanGuardOverride`, or a small isolated unit test constructing a
capability record and calling the function directly) BEFORE re-engaging
the PO for a live signature — the 30-minute TTL is real but not the
scarce resource; a PO passphrase entry against a still-unfixed bug is.
`guard-testpath.mjs`'s silent catch-all (lines 260-262) should also be
loosened to at least log the real status/code it swallowed, even if the
human-facing denial message stays unchanged for now — this is what made
the live ceremony undiagnosable in real time.
