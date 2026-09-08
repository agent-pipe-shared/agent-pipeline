# ADR-0074: port origin/main's `authorize-critical` single-command ceremony (ADR-0061) into Phoenix

> Previously numbered ADR-0065 (until 2026-08-27).

> Agent-Pipeline · Sprint Phoenix · as of 2026-08-18

**Status:** accepted (2026-08-18, PO instruction — Option A of
`backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`'s
2026-08-18 PO Decision: "port ADR-0061 ... into Phoenix now"). **Ports**
origin/main's `0061-uniform-human-approval-ceremony.md` into this repo's own
numbering (this repo's own `0061` is already taken by
`0070-local-supervisor-state-authority.md`, an unrelated renumbering-collision
survivor per `docs/adr/README.md` — see that file's Conventions section on
per-repo numbering). **Constrains** the same set origin/main's ADR-0061
constrains here: [ADR-0055](0055-critical-human-proof-waiver.md),
[ADR-0056](0056-push-approval-mode.md),
[ADR-0058](0058-guard-maintenance-window.md),
[ADR-0059](0059-signed-human-guard-override.md).

**Governs:** plugins/pipeline-core/scripts/po-human-approval.mjs, plugins/pipeline-core/scripts/po-human-approval.test.mjs, plugins/pipeline-core/lib/critical-action-approval-request.mjs, plugins/pipeline-core/lib/critical-action-approval-request.test.mjs, plugins/pipeline-core/scripts/po-approval-gate.mjs, plugins/pipeline-core/scripts/po-approval-gate.test.mjs, plugins/pipeline-core/scripts/push-prepare.mjs, plugins/pipeline-core/scripts/push-prepare.test.mjs, docs/push-release-flow.md

## Context

`backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`'s
2026-08-12 occurrence recorded that origin/main's ADR-0061 (2026-08-07) —
collapsing the two-step `prepare-critical`/`approve-critical` critical-action
ceremony into one `authorize-critical` command — was never ported into
`sprint_phoenix`. This branch's own `plugins/pipeline-core/scripts/po-human-approval.mjs`
had no `authorize-critical` at all, and `docs/push-release-flow.md` still
described only the superseded two-step form. An Elephant following this
repo's own canonical push-release doc therefore handed a PO the wrong
ceremony for what origin/main and the installed plugin build actually shipped.

The underlying failure mode origin/main's ADR-0061 exists to remove, quoted
from that ADR's own Context section: *"a separate `po-human-approval.mjs
approve-critical` invocation, which signed the stale request left on disk by
[a failed prepare-critical's] silent failure without noticing — the
confirmation text looked entirely normal, and only the candidate hash inside
it revealed the wrong subject."* Two independent commands sharing state only
through a filesystem path meant a failed first step plus a successful second
step could sign the wrong thing with no error at any point.

**Divergence check before porting (per this port's own dispatch stop
condition):** Phoenix's `po-human-approval.mjs` has diverged substantially
from origin/main's — Phoenix carries the fork-disposition trio (ADR-0072,
`GOVERNANCE_FORK_DISPOSITION_APPROVAL`) and a fourth `CRITICAL_COMMAND_KINDS`
member (`feature-package-reconcile`, PHX-WP-POHUMAN-SIGNING-ERGO) that
origin/main's snapshot examined here does not carry; origin/main in turn
carries `--human-name`/`humanName` authority records, a machine-scoped
configuration plane for the approval directory, a `signer` artifact, and a
GF-105 command-rendering helper that Phoenix does not have. None of that
touches the two-step-to-one-step collapse itself: the field shapes
`authorize-critical` needs (`{plan, spec, kind, subjectSha256, expiresAt,
featureId}` in, `{request, proof}` artifacts out) are identical in both
versions, and the request-building/validation logic origin/main factored into
`criticalApprovalRequest()` is byte-for-byte the same validation Phoenix's
`prepare-critical` branch already ran inline. The divergence is additive
surface area on each side, not a conflicting definition of the ceremony this
port touches — so the port proceeds, adapted to Phoenix's actual shape rather
than blind-copied from origin/main's (per this port's own dispatch briefing,
field 2).

## Decision

Add `authorize-critical` to `plugins/pipeline-core/scripts/po-human-approval.mjs`
as a new command, alongside the existing `prepare-critical`/`approve-critical`
(kept, unremoved, exactly as origin/main also keeps them):

- Fails closed before touching disk if the human's key material (`po-private.pem`,
  `po-public.pem`, `trust-policy.json`) is absent — `"run setup before
  authorize-critical"`.
- Builds the critical-action request via the same validation and
  `createCriticalActionApprovalRequest` call `prepare-critical` uses —
  factored into one shared `criticalApprovalRequest()` helper so the two
  commands cannot independently drift into two definitions of the binding.
- **Writes that request to the fixed artifact path unconditionally,
  overwriting whatever was already there.** This is the mechanism that
  removes the stale-request failure mode: nothing already on disk is ever
  read as the thing to sign, only the object this exact invocation just
  built.
- Shows the human a summary (action kind, candidate commit/tree, subject
  digest, expiry, feature id, intent digest, and an explicit "this approval
  does NOT cover ..." bound) before the passphrase prompt, then requires the
  literal token `approve` before OpenSSL is ever invoked, mirroring
  `approve-critical`'s existing confirmation gate.
- Signs with the same OpenSSL/proof-write discipline `approve-critical`
  already uses, into the same `proof-critical-<kind>.json` artifact.

`po-approval-gate.mjs` (the agent-facing public control plane) is **not**
modified: its `GATE_COMMANDS` allowlist already excludes every signing
command by construction (a positive allowlist, not a denylist), so
`authorize-critical` — reading the private key exactly like `approve`,
`approve-critical`, `setup`, and `sign-intent` — stays unreachable from that
script with no code change required. Pinned by a regression test
(`po-human-approval.test.mjs`).

`docs/push-release-flow.md` Layers 2-3 are rewritten to present
`authorize-critical` as the recommended path, with the old two-step form kept
in a collapsed "superseded — kept for reference" section rather than deleted,
since the two-step commands remain callable.

## Consequences

**Positive.** The specific, demonstrated failure mode (stale request silently
signed) cannot recur through `authorize-critical`: pinned by a regression
test that leaves a stale request on disk from an earlier `prepare-critical`
call, then proves `authorize-critical` signs and reports only the current
call's subject, never the stale one, and that the resulting proof does not
verify against the stale subject. Phoenix's push-release doc and its
installed plugin build now agree, closing the exact mismatch the 2026-08-12
occurrence found. The human's part collapses from two invocations to one, per
origin/main's own ADR-0061 Decision 1 ("one ceremony, ... exactly three human
acts").

**Negative / deferred.** This port is deliberately scoped to the
prepare+sign collapse only (per this port's own dispatch's Forbidden
section): it does not touch `guard-push.mjs`'s `GG-03` double-confirmation
ritual, does not add `--human-name`/machine-plane/signer-artifact features
origin/main has grown since, and does not fold `OVERRIDE GG-03` into the same
ceremony (origin/main's own ADR-0061 Decision 6 defers that too, to a
separate dispatched design round). `backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`
candidates #2-#4 remain open; this port closes one concrete, previously-filed
gap, not that item's full verdict.

## Alternatives considered

- **Blind-copy origin/main's file wholesale.** Rejected per this port's own
  dispatch briefing and the divergence check above: origin/main's file
  carries unrelated features (`--human-name`, machine-plane directory
  resolution, `signer` artifacts, a GF-105 command renderer) that are out of
  this port's scope and would have introduced untested surface area with no
  DoD requiring it.
- **Remove `prepare-critical`/`approve-critical` outright.** Rejected:
  origin/main itself keeps them (its own `USAGE` string and command set still
  list both), and Phoenix's existing regression suite exercises them directly
  (`prepare-critical keeps composing push/deploy/publication requests exactly
  as before`); removing them would be an unscoped behavior change this port's
  Forbidden section (briefing field 4) does not authorize.
- **Duplicate the signing block inline for `authorize-critical` without
  factoring `criticalApprovalRequest()`.** Rejected: the whole point of the
  port is that two independent definitions of the request-building/binding
  logic are how the stale-request bug's *class* of defect happens in general,
  even though the specific bug was about signing timing, not the digest
  computation. One shared helper for `prepare-critical`/`authorize-critical`
  keeps that particular risk at zero cost, since the two branches always
  needed to compute the digest identically.

## Follow-up

- `backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`
  candidates #2 (harness classifier pre-clearance), #3 (narrowing the
  cross-repo-mutation refusal for the agent-eligible half), and #4 (a
  deliberate PO cost/benefit review of the full layer stack) remain open and
  are explicitly PO-territory, unchanged by this port.
- If Phoenix later wants origin/main's `--human-name`/signer-attribution or
  machine-scoped approval-directory resolution, that is new, separately
  scoped work — not carried by this ADR.
