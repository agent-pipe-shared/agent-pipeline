# Guard Maintenance Window threat model

Status: normative security input for the Nova baseline. Sibling document to
`docs/human-guard-override-threat-model.md` (the "HGO" single-tool-call
attended override) — a structurally different mechanism, not a variant of it,
so it gets its own threat model rather than a shoehorned section. See
[ADR-0058](adr/0058-guard-maintenance-window.md) for the decision this
document supports.

## Purpose and security boundary

A Guard Maintenance Window (GMW) is a bounded-duration, PO-signed record that
a small, closed set of self-protecting guard rules (GS-6, the live plugin
root; TP-*, configured protected test paths) must honor as an alternative
"allow" path, in addition to their existing unconditional deny. It does not
grant ambient authority over anything else: not push, not publication, not the
files that decide a gate's own strength (GS-1, GS-2, GS-3, GS-4, GS-5, GS-7),
not `.git`/`.codex`, not secrets.

The trusted computing base is: the loaded `pipeline-core` manifest and its
guard scripts, the GMW library and CLI, the physical repository and Git
common-directory identity, the committed trust anchor
(`project/critical-human-proof.json`), and the PO who reviews a prepared
request's digest and signs it on a device the agent does not control.

The model does not treat an agent instruction, an environment variable, a
free-form guard prefix, or possession of a request digest as PO authority —
identical to HGO's own boundary.

## What makes this different from HGO, and why that matters here

HGO's activation step, once a request is planned, is an ordinary command a
ready agent session can run itself; what makes it a real gate in `signature`
mode is that it is *never admitted at all* there (`guard-testpath.mjs`,
`overrideAdmitted`). GMW has no equivalent step to admit or refuse: the
guard's allow path is "a validly-signed, unexpired, correctly-bound window
record exists," full stop — there is nothing for an in-session command to
arm. This is the central property this whole design depends on; every threat
below assumes it holds and is written to catch a change that would break it.

## Protected assets

- The unconditional-deny behavior of GS-1 through GS-5 and GS-7 — never
  reachable through this mechanism, regardless of what a signed payload
  claims to name.
- The never-liftable kernel: `hooks/guard-gate-strength.mjs`, the GMW
  verifier module, `hooks/hooks.json`, `lib/tool-write-target.mjs`,
  `hooks/guard-command-grammar.mjs`, `hooks/guard-lifecycle-ready.mjs`, and
  `project/critical-human-proof.json` (the trust anchor).
- The window record's cryptographic integrity and its TTL.
- The audit visibility of an open or recently-closed window (the bootstrap
  warning).

## Threats and controls

| Threat | Control |
| --- | --- |
| An agent arms a window itself, or is instructed/injected into arming one | There is no arming step. A window's validity is derived fresh from a signed proof on every guarded call; nothing the agent can run creates or strengthens that proof. |
| A window is used to widen scope beyond GS-6/TP-* | The verifier accepts only rule IDs from the closed set `{GS-6, TP-*}`; any other named rule ID makes the whole window invalid, not partially honored. |
| A GS-6 window covers the code that verifies GS-6 windows (recursive hole) | A hardcoded kernel path list is checked BEFORE any window lookup; kernel paths deny unconditionally regardless of an armed window's scope or claims. |
| A window's effect outlives its TTL (e.g. a config file keeps changed bytes) | Out of reach structurally: GS-1..GS-5/GS-7 (the files whose *bytes* persisting matters) are never in the liftable set, so there is nothing this mechanism can leave behind after expiry except ordinary product-code commits, which are already subject to Verify/Critic/push-approval like any other commit. |
| A malformed or absent expiry is treated as "never expires" | Validity requires a *finite* parsed expiry strictly greater than now; an unparseable or missing timestamp is invalid, inverting the known failure polarity found elsewhere in this codebase (`human-guard-override.mjs`'s `expired = new Date(x).getTime() <= nowMs`, where `NaN <= nowMs` is `false`). |
| A signed window is replayed later, or against a different repository | The signed subject binds a fresh nonce and the physical repository/common-dir identity (not a path string), reusing the existing `topology()` discipline; a proof signed for one physical repository does not verify against another, and a consumed/expired nonce is not reusable. |
| A signed window claims an unbounded or excessive TTL | The verifier clamps effective expiry to `min(signedExpiresAt, openedAt + MAX_TTL)` with a fixed, short `MAX_TTL`; a longer signed value is silently capped, never honored in full. |
| Tampering with the stored window record (edited TTL, scope, or signature) | The record's signature is re-verified against the trust anchor on every read, not cached as a boolean; any byte change invalidates it exactly as tampering with a push-approval proof would. |
| The window is used to plant a change that a later session trusts as "already reviewed" | GMW confers edit permission only. It carries no Verify/Critic/publication authority of any kind — a change made under a window is an ordinary uncommitted-then-committed diff, subject to every downstream gate (Verify, Critic, push-approval) exactly as if GS-6 had never fired. |
| A stale or currently-open window goes unnoticed across sessions | The SessionStart bootstrap check re-derives validity through the same verifier the guards call (never a self-declared status field) and warns — loudly if currently valid, once informationally if expired-but-present — without blocking startup. |
| A same-session worktree/separate-checkout trick bypasses GS-6 without any window or human step at all | Not closed by new guard code in this iteration (see ADR-0058 Follow-up); closed today by discipline — this repository's own delivery convention already requires a human/PO action before a guard-code change becomes live in the enforcing copy, and this feature's own implementation follows that convention. Recorded as a residual risk, not claimed as solved. |
| The trust anchor itself is rewritten to forge future windows | `project/critical-human-proof.json` is GS-2 protected today and is additionally part of the GMW kernel — never in a liftable scope, so no window can ever make its own anchor mutable. |

## Residual risks

Risk owner: Agent-Pipeline maintainers. Review deadline: before any expansion
of the liftable scope beyond GS-6/TP-*, and before this mechanism is reused
for `deploy`/`publication`.

- A process already acting as the same operating-system owner as the PO's
  signing device is a boundary this design does not defend against, identical
  to every other detached-signature primitive in this repository.
- The worktree/separate-checkout bypass path noted above is real and
  unmitigated by guard code; it is mitigated only by the same operational
  discipline this repository already relies on for every other guard-code
  change. A dedicated guard closing it is tracked as follow-up work, not
  claimed here.
- The bootstrap tree-hash comparison (ADR-0058 point 6) states a fact
  ("the plugin root changed during this window") without judging whether that
  change was reviewed; a human still has to look.
