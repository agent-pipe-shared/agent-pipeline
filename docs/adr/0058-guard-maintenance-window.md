# ADR-0058: a signed, time-boxed maintenance window lets the PO lift a narrow set of self-protecting guard rules, with no in-session activation step

> Agent-Pipeline · Sprint Nova · as of 2026-08-07

**Status:** accepted (2026-08-07, PO instruction, chat) — *"bitte baue einen fix der
dafür sorgt, dass generell dieser Blocker durch mich liftbar ist für die Arbeit an
der Pipeline durch die Pipeline... ein Mechanismus den du nicht selber auslösen
kannst aber der es mir ermöglicht auch für einen Zeitraum solche guards alle zu
liften... eine Prüfung und Warnung [beim bootstrap] wenn etwas nicht wieder
aktiviert wurde (kein fail! aber Warnung)"*. **Refines** [ADR-0056](0056-push-approval-mode.md);
**extends** the "Attended Human guard override" system described in
`docs/human-guard-override-threat-model.md`.

## Context

`guard-gate-strength.mjs` Rule GS-6 unconditionally refuses every Edit/Write to
the "live plugin root" — the copy of `plugins/pipeline-core` that is *currently
enforcing the guards in this session*. It has no override path of any kind: it
does not call the existing v2 "Human Guard Override" (HGO) capability system at
all, unlike its sibling rules. This is deliberate, and the file's own header
records why: a real, dated incident showed that with nothing technically
stopping it, a past session edited `pipeline.user.yaml` to weaken the push gate
on its own authority — proof that "an agent that can weaken its own gate has no
gate." `guard-testpath.mjs`'s TP-* rules do reach the HGO system, but only when
`gates.push_approval` is `"chat"`; in `"signature"` mode (this repository's
actual configured value) even TP-* has no usable in-session override, because
HGO's own activation step is an ordinary command a ready session can simply run
itself — admitting it in `signature` mode would make the refusal theatre
(`guard-testpath.mjs`, the `overrideAdmitted` comment block).

Because of GS-6, this session — running as the very plugin whose code lives
under `plugins/pipeline-core/` — cannot make a single Edit/Write anywhere in
that tree, including small, fully-specified bugfixes. This has now happened
repeatedly (`backlog/items/2026-08-07-release-preflight-cli-base-commit-not-peeled.md`,
`backlog/items/2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`)
and is a real, recurring block on the Pipeline's own self-application
(ADR-0015). The documented escape hatch — "the PO edits this file directly,
outside an agent session" — works, but costs a full manual round trip for
every single fix and leaves no audit trail of what was lifted, when, or why.

An independent advisory consult (fresh-context review of `guard-gate-strength.mjs`,
`guard-testpath.mjs`, `lib/human-guard-override.mjs`, `docs/po-approval-proof-contract.md`,
and `docs/human-guard-override-threat-model.md`, 2026-08-07) confirmed the shape
below is sound under specific conditions and flagged concrete failure modes
that the Decision section incorporates directly: a recursive-verifier hole (the
window's own verifying code must itself stay permanently un-liftable), effects
that outlive the window (a lifted config file keeps its new bytes after
expiry), a known fail-open pattern for a malformed expiry timestamp elsewhere
in this codebase (`human-guard-override.mjs`), and the risk of a broad
"lift everything" default being strictly more dangerous than a narrow one.

## Decision

A new, separate mechanism — the **Guard Maintenance Window** (GMW) — lets the
PO, and only the PO, temporarily lift a closed, explicit set of guard rules for
a bounded time, using the same detached-Ed25519 "PO approval proof" primitive
already established for push approval (ADR-0056, `lib/po-approval-proof.mjs`,
`docs/po-approval-proof-contract.md`). The agent can `prepare` a digest-bound
request; it structurally cannot produce a valid proof for it, exactly as it
cannot today for a push in `signature` mode.

1. **No in-session activation step.** Presence of a valid, unexpired,
   correctly-bound signed window record *is* the window — there is no separate
   "arm" command for the agent to run, confused into running, or be instructed
   to run. This closes the exact failure mode HGO's `chat`-mode branch
   documents as disqualifying (`guard-testpath.mjs` `overrideAdmitted` block):
   an activation step that is "an ordinary command a ready session can run" is
   not a human gate. The PO's entire manual action is: inspect the prepared
   request's digest, sign it externally (their own already-established flow,
   `docs/po-approval-proof-contract.md`), and hand back the proof — after
   which an agent-safe `install` step (verify-and-place only, cannot succeed
   without a genuine signature) makes it visible to the guards.

2. **Narrow, closed liftable universe — GS-6 and TP-\* only.** GS-1 through
   GS-5 and GS-7 (`pipeline.user.yaml`, `project/critical-human-proof.json`,
   `project/pipeline.yaml`, the `guard-config.json` variants) decide a gate's
   *strength* — they are the dial itself, not code the Pipeline needs to
   dogfood-fix. They stay permanently non-liftable by this mechanism, exactly
   as today: PO edits them directly, outside a session. Only GS-6 (the live
   plugin root, minus the kernel below) and TP-* (configured test paths) are
   ever eligible for a window. A signed request naming any other rule ID is
   rejected before verification is even attempted.

3. **A hardcoded, permanently non-liftable kernel.** Guard scripts are re-read
   on every invocation, so a window covering the file that verifies windows
   would let the first edit disable its own expiry check. `guard-gate-strength.mjs`,
   the new window-verifier module, `hooks/hooks.json`, `lib/tool-write-target.mjs`,
   `hooks/guard-command-grammar.mjs`, `hooks/guard-lifecycle-ready.mjs`, and the
   file carrying the trust anchor (`project/critical-human-proof.json`, already
   GS-2) are excluded from every window's effective scope regardless of what a
   signed payload claims — checked before any window lookup happens at all, not
   merely by convention.

4. **Bounded TTL, enforced in code, fail-closed on a malformed clock.** The
   verifier clamps effective expiry to `min(signedExpiresAt, openedAt + MAX_TTL)`
   with a fixed, short `MAX_TTL` (hours, not days). Expiry parsing follows the
   inverse of the known bug pattern already present once in this codebase
   (`human-guard-override.mjs`'s `expired = new Date(x).getTime() <= nowMs`,
   which a malformed timestamp turns into `NaN <= nowMs → false`, i.e. never
   expires): a window is valid only when its parsed expiry is a finite number
   strictly greater than now — unparseable means invalid, never means
   unbounded.

5. **Physical-repository and content binding.** The signed subject binds a
   fresh nonce, the physical repository/common-dir identity (reusing the
   existing `topology()` discipline, not a path string — ADR-0056's T6 lesson
   about a nested repository minting its own anchor applies unchanged here),
   the exact scope rule IDs, the TTL, the reason, and the live-plugin tree hash
   at the moment the window was prepared. A window is bound to the repository
   it was signed for and to nothing broader.

6. **Bootstrap surfaces it; bootstrap never blocks on it.** A SessionStart
   check re-derives validity through the same verifier the guards call (never
   a self-declared status field) and: a currently-valid window prints a loud
   warning naming scope, reason, and remaining time; an expired-but-present
   window prints one informational cleanup note, not a recurring nag; if a
   GS-6-scoped window was used, the current live-plugin tree hash is compared
   against the opening hash bound in the signed payload and a mismatch is
   stated as fact ("the plugin root changed during this window") without a
   verdict on whether that change was reviewed. This directly answers the PO's
   requirement: a check and a warning, never a failure.

7. **Effects on GS-1-class files are still out of reach.** Because scope is
   closed to GS-6/TP-* only, a window cannot be used to rewrite
   `push_approval` or the trust anchor mid-window — the mechanism that made
   `chat`-mode HGO unsafe under `signature` mode does not reappear here.

## Consequences

**Positive.** The Pipeline can fix its own guard/plugin code and its own
protected test files inside the same self-hosted session that needs the fix,
with a real human gate that the agent is cryptographically incapable of
forging or self-triggering, an audit trail of what was lifted and why, and no
"forgot to turn it back off" risk because there is nothing to turn off —
expiry is automatic and enforced in code.

**Negative.** A second signed-proof ceremony exists alongside the push-approval
one (same primitive, different `kind`), which is one more thing the PO
operates, however small. `guard-gate-strength.mjs` and `guard-testpath.mjs`
both grow a second code path (kernel-check, then window-check, then the
existing unconditional deny) that must be kept correct under Critic review —
guard code is exactly the class of change this repository already treats as
highest-scrutiny.

**Risk:** a same-session worktree-then-merge trick could in principle let an
agent bypass GS-6 entirely without any human step, by developing and then
silently merging a change into the live-enforcing copy's working tree via an
ordinary (non-Edit/Write) git command. This ADR does not close that path with
new guard code — it is closed by discipline: this repository's own delivery
convention already requires a human/PO action (review, then install/merge) before
any guard-code change becomes live, and the implementation of this very
feature follows that convention rather than exercising the trick it would
otherwise demonstrate. Recorded as a residual risk worth a dedicated guard in
its own right (see Follow-up).

## Alternatives considered

- **Extend HGO's existing single-tool-call capability to cover GS-6.** Rejected:
  HGO's `chat`-mode activation step is an ordinary in-session command, which is
  exactly the property that makes it inadmissible in `signature` mode
  (`guard-testpath.mjs`'s own reasoning) — reusing that shape for GS-6 would
  reintroduce the same hole one file over.
- **A broad "lift everything" window with no per-rule scoping.** Rejected on
  the advisory consult's explicit finding: a window that also covers GS-1..GS-5/GS-7
  lets an agent commit a weakened `push_approval` whose effect outlives the
  window entirely. Scope is closed and enumerated, never a wildcard.
- **Rely solely on the "separate installed plugin copy" workflow already hinted
  at in GS-6's own code comments.** Not rejected — kept as the *primary* route
  and unaffected by this ADR. But it cannot substitute for same-session testing
  of a guard fix against the very session enforcing it, which is this
  repository's daily mode under ADR-0015; the window is the complementary route
  for exactly that case.

## Follow-up

- The residual worktree-merge risk noted under Consequences should get its own
  guard (e.g. refusing a same-repo merge/checkout that changes bytes under a
  live plugin root without a passing Critic record for the merged commit) —
  not yet built; track as a backlog item once GMW itself has shipped and been
  Critic-reviewed.
- `deploy`/`publication` are untouched by this ADR; if a maintenance-window
  need is ever raised for them, the shape proven here (closed scope, no
  activation step, bounded TTL) is the template to reuse.
