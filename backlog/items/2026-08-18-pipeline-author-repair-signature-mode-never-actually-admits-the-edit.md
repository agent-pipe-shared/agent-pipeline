---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-author-repair-signature-mode-never-actually-admits-the-edit
type: defect
owner: pipeline
status: closed
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

Not yet decided — still open, this update only narrows the diagnosis
(read-only investigation, 2026-08-18, no guard/hook file touched, no
live PO ceremony run).

**The `describeHumanGuardOverrideSelection()` display bug is now FULLY
CONFIRMED** (code inspection alone, no repro needed): it hardcodes
`planHumanGuardOverride({..., authorSourceRoot: null})` when replanning a
stored request for display. For a `pipeline-author-repair-candidate`
request, `authorSourceRoot(repo.root, null)` returns `null` immediately
(`typeof candidate !== "string"`), `authorEligiblePaths` then throws
`HGO-AUTHOR-ROOT`, caught by the surrounding `catch { continue }`
(~line 2890) — the record is silently skipped. This function
structurally cannot resolve ANY author-repair-candidate request,
unconditionally; it is a separate bug from the consumption bug below,
does not affect whether consumption itself works, and its fix is
independent: give it the request's own `candidateSourceRoot` (already
recorded on the `author-repair-required` response and re-derivable from
`request.eligiblePaths`) instead of a hardcoded `null` — or, since
`authorSourceRoot()` only ever accepts one physical value anyway,
`join(repo.root, "plugins", "pipeline-core")` whenever
`request.mode === "pipeline-author-repair-candidate"`.

**The consumption bug itself is NOT confirmed as a code defect.** A
targeted repro (`scratch/critic-hgo-repro/repro-signature-author-repair.mjs`,
left in place, gitignored) drove `authorizeHumanGuardOverrideBySignature()`
+ `pipeline-author-repair` mode together end to end — deny → plan →
prepare → sign with a scratch Ed25519 key → authorize-by-signature →
consume — and it **succeeded** (`armed` then `consumed`, clean exit) when
the retried `toolInput` is byte-identical to the originally denied one.
Notably, this exact combination (signature mode + author-repair mode
together) has **zero existing test coverage**: every
`authorizeHumanGuardOverrideBySignature` test omits `authorSourceRoot`,
and the one test that does cover author-repair mode
(`human-guard-override.test.mjs:1134-1220`) uses chat mode, not
signature mode — so this combination was previously untested in both
directions.

Given the repro succeeds when inputs are byte-identical, the most
probable real cause of the two live failures (OT09 ceremony, and now the
C2f goldfish dispatch hitting the identical wall on a different guarded
edit) is the **first, silent filter gate** in `consumeHumanGuardOverride()`
(`human-guard-override.mjs:2689-2691`): `capability.toolInputSha256 !==
toolInputSha256`. A non-match there does not error — it `continue`s past
that capability and falls through to `{status: "absent"}`, indistinguishable
from an unarmed request. Any field difference between the tool call that
produced the original denial and the manually retried tool call (e.g. an
optional field like `replace_all` present in one but not the other) would
silently fail this match. Secondary, untested candidate:
`capability.root !== repo.root` (~line 2714), a possible `rootDir`/
`projectDir` resolution mismatch between the CLI ceremony's `--repo` and
the live hook's resolved root — not ruled out; the isolated repro drives
the library functions directly and cannot exercise the real hook's root
resolution end to end.

**Recommended next step, revised:** the diagnostic gap is now precise
enough that a THIRD blind live-ceremony attempt is still not warranted.
`guard-testpath.mjs`'s silent catch-all (lines 260-262) should be
loosened, but the real fix needs to go further than originally scoped:
even a non-throwing `consumeHumanGuardOverride()` result
(`{status:"absent"}` or `{status:"replan", code:"HGO-DRIFT"}`) currently
gives no visibility into which capability file (if any) came close to
matching, or on which specific field (`toolInputSha256`, `root`,
`denials`, expiry) it diverged. Add temporary, scoped instrumentation
that logs — per skipped capability file — exactly which equality check
in the ~2689-2721 chain first failed, land it, then run ONE more live
ceremony attempt with that instrumentation in place: that turns the next
attempt into a one-shot diagnosis instead of a third blind burn of PO
TTL. Only after that log confirms the exact failing check should a
correctness fix be written.

### PO decision, 2026-08-18 (20-item decision batch) -- diagnostic instrumentation landed

PO decision: A -- schedule a diagnostic ceremony now. Landed the
recommended instrumentation directly (turned out NOT to need a TP-3
ceremony -- `plugins/pipeline-core/lib/human-guard-override.mjs` itself
admitted the edit normally; only its own `.test.mjs` companion has ever
been observed as protected in this repo's guard classification, and
that too admitted the new regression test without a refusal):

- `consumeHumanGuardOverride()`'s `drifted` boolean (the SECOND,
  lock-protected re-validation check at ~line 2725, distinct from the
  coarse first-pass filter at ~line 2700 that produces a silent
  `{status:"absent"}` for a request that never matched at all) is now
  computed from a named `driftChecks` object (`status`, `root`,
  `toolName`, `toolInputSha256`, `denials`, `plugin`, `policy`,
  `repository`, `authorEligiblePaths`). On a genuine drift-after-match
  rejection, the appended `HGO-DRIFT` audit entry now carries a new
  `driftedChecks` array naming exactly which of those keys diverged --
  purely additive to the audit event object, no control-flow or return-
  value change (`consumeHumanGuardOverride()`'s own return shape is
  unchanged, confirmed by the full pre-existing suite staying green).
- New regression test `NVA-W3-16` in `human-guard-override.test.mjs`
  drives a real (not raw-file-tampered) drift-after-match case: commits
  an empty commit between `authorizeHumanGuardOverride()` and
  `consumeHumanGuardOverride()` so the coarse pre-filter still matches
  (same tool/input/denials) but the repository observation differs at
  the deeper check, asserts the audit entry's `driftedChecks` deep-
  equals `["repository"]`.
- `node --test human-guard-override.test.mjs`: 72/73 pass (71
  pre-existing + this new one); the one remaining failure is the
  already-tracked, pre-existing `HGO-EXTERNAL-MARKETPLACE` marketplace-
  staleness case (unrelated).

**What this does NOT do:** it does not fix the live OT09/C2f failure
mode itself, and it does not add coverage for the specific
`authorEligiblePaths` drift key (the prime suspect for pipeline-author-
repair + signature mode specifically) -- constructing that exact
reproduction synthetically was out of scope for this dispatch and is
still the open diagnostic question. **Next step, per the item's own
recommendation:** the NEXT live ceremony attempt against a real
pipeline-author-repair + signature-mode denial will now have this
instrumentation in place; if it fails again, `driftedChecks` in the
resulting audit entry (`.git/agent-pipeline/human-guard-overrides/audit.jsonl`)
tells the Elephant exactly which named check to fix, turning the third
attempt into a one-shot diagnosis as intended. Status stays `open`.
- **Date:** 2026-08-18

## Closure, 2026-08-19

The root cause was found the same day, later in the session, and codified
as a CLAUDE.md Hard Rule (commit `18dc9ab9`): the denial is a
`toolInputSha256` byte-identity mismatch between the exact tool call that
seeded the plan/request and the one retried after the PO signs — any
difference (a re-derived `old_string`/`new_string`, a different absolute
path spelling, an optional field present in one call and not the other)
silently fails `consumeHumanGuardOverride()`'s match. The commit message
states this was "confirmed empirically fixing OT09 and C2f" — OT09 being
this item's own triggering ceremony. This item's own diagnostic
instrumentation (`NVA-W3-16`, `driftedChecks`) was built in parallel but
was not what ultimately diagnosed it; the byte-identity preflight
(seed a fresh request via an intentionally-denied dry run of the exact
intended retry, build the ceremony from that request's own hash, replay
the identical call) is now the documented, repeatable fix.

One small, separately-confirmed residual bug found by the triage pass
that investigated this closure: `describeHumanGuardOverrideSelection()`
hardcodes `authorSourceRoot: null`, causing a non-blocking
`HGO-RECORD-DIGEST-MISMATCH` warning specifically in author-repair
mode. Cosmetic (does not block admission), not filed as its own item —
worth a one-line fix + test whenever someone next touches this file.

Closing; the byte-identity discipline is now durable in CLAUDE.md and has
already prevented a repeat of this failure mode later in the same
session (the OT09/C2f TP-3 ceremonies this session ran cleanly on the
first attempt using the seed-then-replay protocol).
