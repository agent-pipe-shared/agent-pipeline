# ADR-0059: extend the Human Guard Override with a signed admission path, so `signature` mode is usable without one bespoke mechanism per guard

> Agent-Pipeline · Sprint Nova · as of 2026-08-07

**Status:** accepted (2026-08-07, PO instruction, chat) — *"sehr gut! ja genau
das brauchen wir zeitnah als 0.5.2 fix/erweiterung bevor wir mit dem rest
weiter machen. Ein für alle Mal endlich eine Lösung, die das Arbeiten an und
mit der Pipeline human-authorisiert wieder 'normal' macht."* Motivating
framing from the same exchange: *"diese Pipeline soll den Agenten im Zaum
halten und nicht den Human permanent aufhalten... man darf alles umgehen
dürfen und das muss easy to use sein... [statt] irgendwelche Skripte und Code
zeilen... ins Terminal [zu] kopieren [ein] generelles sauberes Lift-Verfahren
für alle Guards, was dann Approval sauber regelt und auch einen Audit
ermöglicht."* **Refines** [ADR-0058](0058-guard-maintenance-window.md);
**extends** `docs/human-guard-override-threat-model.md`.

## Context

`lib/human-guard-override.mjs` ("HGO") already classifies almost every kind
of in-project guard denial — Edit/Write on an in-root path, `apply_patch`,
Bash commands, writer-owned-project-policy emergencies — and already has a
full request/plan/authorize/consume/audit pipeline for admitting one exact,
single-use, attended override. Its one structural weakness, stated in its own
callers' comments (`guard-testpath.mjs`'s `overrideAdmitted` block): the
existing `authorizeHumanGuardOverride()` activation step is an ordinary
in-session command a ready agent session can simply run itself. That is
harmless in `chat` mode (an attribution record, not proof, exactly like
`chat`-mode push approval per ADR-0056) but disqualifying in `signature`
mode — admitting it there would let an agent clear its own gate, so today it
is not admitted there at all. The practical result, confirmed repeatedly this
session: in this repository's actual configured `signature` mode, HGO covers
none of the denials it is capable of classifying. Every one of them currently
has exactly one route — the PO acts entirely outside any agent session — and
that route is realized today as ad hoc generated shell commands the PO copies
into a terminal by hand, one bespoke shape per guard, with no unified audit
surface. [ADR-0058](0058-guard-maintenance-window.md) built one clean,
time-boxed, signed lift specifically for GS-6/TP-*-class sustained editing;
this ADR gives the SAME underlying primitive to everything else HGO already
classifies, so there is one consistent mechanism rather than two-plus-N ad
hoc ones.

## Decision

### 1. A signed admission path, alongside the existing chat-mode one — not a replacement

`authorizeHumanGuardOverride()` (the `activate: true`, in-session path) is
unchanged and stays `chat`-mode-only, exactly as today. A new function,
`authorizeHumanGuardOverrideBySignature()`, arms the identical
`pipeline.human-guard-override-capability.v2` record via a genuine detached
Ed25519 proof instead of an in-session boolean: it reuses
`lib/po-approval-proof.mjs` unmodified — the same primitive
[ADR-0058](0058-guard-maintenance-window.md) uses, and the same one push
approval already uses ([ADR-0056](0056-push-approval-mode.md)) — verified
against the trust anchor already committed in
`project/critical-human-proof.json`. No new key ceremony: one anchor, three
consumers (push, GMW, HGO-signed).

There is still no in-session "activate" step for this path, by the same
principle ADR-0058 already established: presence of a valid, correctly-bound
signature *is* the authorization. The PO's manual action is exactly: inspect
the prepared request's digest, sign it externally, hand back the proof. An
agent-safe `authorize-by-signature` CLI subcommand only verifies and arms —
it cannot succeed without a genuine signature it is structurally incapable of
producing.

### 2. The consuming side is untouched

`consumeHumanGuardOverride()` does not change at all. It already validates a
capability's integrity and match against the exact current tool call without
caring how the capability was armed. This is the reason the change is small:
one new arming function, zero changes to matching/consumption/audit.

### 3. Calling guards gain a mode-appropriate offer, not a mode-appropriate gate

Today's callers gate on mode BEFORE trying to consume (`overrideAdmitted =
approvalMode === "chat"`), which is what makes `signature` mode a hard wall.
That gate is replaced with: always attempt `consumeHumanGuardOverride()`
first (harmless — it only succeeds against a genuinely armed, matching
capability, regardless of mode); if nothing is armed, `recordHumanGuardDenial()`
as today, and print the mode-appropriate next step — the existing `chat`-mode
`plan`/`authorize --activate` sequence in `chat` mode, or the new
`prepare-authorization` / (external sign) / `authorize-by-signature` sequence
in `signature` mode. `authorizeHumanGuardOverride()` (the weak path) itself
additionally refuses outright when the resolved mode is `signature` — a
second, defense-in-depth check, not reliance on the calling guard alone to
keep it out of reach.

### 4. Every denial reports the next step, not just a refusal

Explicit PO requirement mid-design (chat, 2026-08-07): *"es muss nur
sichergestellt sein, dass die ganzen Blockierungen diesen Pfad dann auch
zurückmelden, damit der Agent überhaupt weiß, was er tun muss."* Every guard
in the family that can route through HGO must, on denial, state the exact
next command for the CURRENTLY CONFIGURED mode — never a bare "BLOCKED" with
no continuation. This is a DoD item for the dispatch, not aspirational prose:
each affected guard's denial-path test asserts the printed next-step command
matches the live configuration.

### 5. What this does NOT extend to

Cross-repository-boundary targets (a worktree of this same repository, a
genuinely different repository, marketplace metadata, an agent's own
memory/config directories outside the project root) stay explicitly outside
HGO's authority, exactly as today — `HGO-NONOVERRIDABLE-CROSS-BOUNDARY` keeps
routing to `external-operator-required`, never to a signed capability. HGO's
entire physical-identity model (`topology()`, `physicalRoot()`, the plugin
tree hash) is scoped to one repository; extending its authority across that
boundary is a different problem with a different, narrower fix (worktree
recognition in `GUARD-CROSS-REPO-MUTATION` specifically — tracked as
follow-up, not part of this ADR) rather than something HGO should absorb.
GS-1/GS-2/GS-3/GS-4/GS-5/GS-7 (the files that decide a gate's own strength)
remain outside GMW for the same reason ADR-0058 already gives.

**Correction, 2026-08-07 (found while acting on this Decision):** the
paragraph above originally claimed these paths' "existing
`writer-owned-project-policy-emergency` HGO class is the correct, narrower,
exact-action route for those, and it is what this ADR makes usable in
`signature` mode" — implying `guard-gate-strength.mjs` (the guard that
actually enforces GS-1..GS-5/GS-7) already consulted HGO and only needed the
signed path added. That was false: `guard-gate-strength.mjs` never called
`consumeHumanGuardOverride()` or any HGO function at all for these six
paths — by design, per its own header comment ("There is no in-session
override, because an in-session override for 'may I weaken my own gate' is
the same hole with an extra step"), added after the T1 Critic's F5 finding
that these files had NO gate whatsoever. `protectedPath()` in
`human-guard-override.mjs` does classify them, but only for OTHER guards'
generic writer-owned-policy edits elsewhere in the project — it was never
wired to `guard-gate-strength.mjs` itself. So these six paths had zero lift
mechanism, signed or otherwise, until the follow-up below.

**Follow-up decision (2026-08-07, PO instruction — a live session was
blocked on GS-7 with no route at all):** extend `guard-gate-strength.mjs`
with a SIGNED-ONLY lift for GS-1..GS-5/GS-7 (never GS-6, which keeps its own
GMW mechanism unchanged), mirroring Decision 3's always-attempt-consume
pattern — but with an additional, absolute constraint the other guards do
not need: `authorizeHumanGuardOverride()` (the chat-mode path) must refuse
to arm a capability for any of these six exact paths UNCONDITIONALLY,
regardless of the configured `gates.push_approval` mode — not merely
"refused unless chat mode" like every other HGO consumer. Only
`authorizeHumanGuardOverrideBySignature()` may ever arm one. This is
stricter than Decision 2's "consuming side doesn't care how a capability was
armed" for the ordinary guard family: for gate-strength paths specifically,
an in-session chat-mode capability must never be *creatable* in the first
place, not merely inadmissible at consume time — because these are the
files that decide what "chat mode" even means, so any acceptance of a
chat-armed capability here is circular by construction. Tracked and
implemented as a direct follow-up dispatch on this same ADR, not a new one.

## Consequences

**Positive.** One primitive (`po-approval-proof.mjs`), three consumers (push,
GMW, HGO), one audit shape, one CLI family. `signature` mode — this
repository's actual configured, strongest setting — stops being a wall that
makes HGO's existing classification machinery unusable, without weakening
what `signature` mode means anywhere else. The PO's manual step shrinks to
"inspect a digest, sign it" for the whole guard family that HGO already
understands, not a different copy-pasted shell incantation per guard.

**Negative.** `human-guard-override.mjs` gains a second arming path to keep
correct under review, and the calling guards' denial messages need to stay
synchronized with both modes' exact next-step commands — a real, ongoing
maintenance surface, not a one-time cost.

**Risk:** covered by the existing HGO threat model
(`docs/human-guard-override-threat-model.md`) for everything downstream of
"a capability got armed" — that document's controls (audit HMAC chain,
physical preimage checks, one-time consumption) do not care how arming
happened. The new risk surface is narrow and specific to arming itself: the
signature verification path must reject exactly as fail-closed as
`po-approval-request.mjs verify` already does (missing/malformed proof,
wrong key, expired/replayed intent) — a regression there would be a full HGO
bypass, not a partial one, so it gets the same test rigor as GMW's fail-closed
expiry parsing (ADR-0058 Decision 4).

## Alternatives considered

- **Build a bespoke signed override for each denial class separately
  (cross-repo, writer-owned-policy, generic Bash/Edit).** Rejected: exactly
  the "two-plus-N ad hoc mechanisms" problem this ADR exists to close.
- **Fold this into GMW itself (extend its time-boxed window to cover
  everything HGO covers).** Rejected per ADR-0058 Decision 2's own reasoning,
  reaffirmed here: a time-boxed window is the wrong shape for config-deciding
  or one-shot actions — open edit access for a duration is strictly more
  dangerous than a proof bound to one exact, already-reviewed tool input.
- **Extend HGO's authority across the repository boundary (worktrees, other
  repos).** Rejected — see Decision 5; a different, narrower, separately
  tracked fix.

## Follow-up

- Worktree recognition in `GUARD-CROSS-REPO-MUTATION` (`guard-lifecycle-ready.mjs`):
  treat a write target inside a path listed in this repository's own
  `git worktree list` as in-boundary, while everything else stays refused.
  Not part of this ADR's implementation; same dispatch family, separate
  scoped task.
- A local ergonomics helper so the PO's manual step is one short, memorable
  command rather than a long generated one — raised in the same discussion,
  not yet designed.
