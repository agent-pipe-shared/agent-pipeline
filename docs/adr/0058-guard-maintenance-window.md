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

**Governs:** plugins/pipeline-core/hooks/guard-gate-strength.mjs, plugins/pipeline-core/hooks/guard-testpath.mjs, plugins/pipeline-core/lib/human-guard-override.mjs, plugins/pipeline-core/lib/po-approval-proof.mjs, plugins/pipeline-core/lib/tool-write-target.mjs, plugins/pipeline-core/hooks/guard-command-grammar.mjs, plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs, plugins/pipeline-core/hooks/hooks.json, docs/human-guard-override-threat-model.md, docs/po-approval-proof-contract.md

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

3. **A hardcoded, permanently non-liftable kernel, closed under import and
   test-enforced.** Guard scripts are re-read on every invocation, so a window
   covering the file that verifies windows would let the first edit disable
   its own expiry check. `guard-gate-strength.mjs`, the new window-verifier
   module, `hooks/hooks.json`, `lib/tool-write-target.mjs`,
   `hooks/guard-command-grammar.mjs`, `hooks/guard-lifecycle-ready.mjs`, the
   file carrying the trust anchor (`project/critical-human-proof.json`,
   already GS-2), and `lib/critical-human-proof-policy.mjs`/
   `lib/po-approval-proof.mjs` (the two modules that verify a window and every
   push/deploy/publication/release-preflight proof) are excluded from every
   window's effective scope regardless of what a signed payload claims —
   checked before any window lookup happens at all, not merely by convention.
   The kernel must also be closed under first-party IMPORT, not just these
   entries' own bytes, or a window could reach the same code through one
   import hop. NVA-A7FIX-2 replaced a hand-walked version of that closure
   (twice found incomplete by Critic review) with a static invariant test,
   `guard-maintenance-window-kernel-closure.test.mjs`, that fails on any
   future edit adding an import to a kernel file without extending
   `NEVER_LIFTABLE_KERNEL_PATHS` to match; the full, current, test-enforced
   enumeration is listed in `docs/guard-maintenance-window-threat-model.md`'s
   "Protected assets" section rather than duplicated a third time here.

**Correction, 2026-08-10 (found by a round-2 Critic review of a design that proposes growing this
kernel).** Decision 3 enumerates the kernel by name and has never been amended since — this ADR is
the decision authority for that list (`plugins/pipeline-core/lib/self-application-attestation-gate.mjs:45-47`
already treats "whether the kernel list should grow" as "one ADR-0058 decision"), so a design that
proposes a new member without amending this ADR leaves the authoritative record silently incomplete
the moment the code change lands. Stated as a standing process, so this does not need rediscovering
per future module: **a `NEVER_LIFTABLE_KERNEL_PATHS` addition is a decision of this ADR, recorded
here as a dated correction at the time the addition is proposed** — never merely a code-review
outcome on the file that hosts the array. The correction names the new module, the capability-
bearing artifact it computes that makes it kernel-eligible (Decision 3's own test: would a window
covering this file let the first edit disable the very check that gates it), and the design or
dispatch that raised it.

**First application of that process.** `specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-
into-the-human-ledger.md` §15.1.6 (iv) proposes `plugins/pipeline-core/lib/guard-authority-ledger-
intake.mjs` as an eighth kernel entry once that module ships (it does not exist yet): it will host
`ledgerConfirmsLiveGmwGrant`, whose return value becomes a term of the lift condition — exactly
Decision 3's own recursive-hole test. Endorsed here as the correct kernel classification, contingent
on that module actually landing; the array itself is edited by whichever dispatch ships the module,
not by this correction. This does not resolve the SEPARATE, already-pending question named at
`self-application-attestation-gate.mjs:45-47` — **which is about two modules, not one, and the first
version of this paragraph named only one of them.** The source comment reads: "This module is
deliberately not in `NEVER_LIFTABLE_KERNEL_PATHS`; GS-8's module is not either, and whether the
kernel list should grow is one ADR-0058 decision about both." "This module" is
`self-application-attestation-gate.mjs` itself — governed, for the live-enforcing copy, by GS-6 (the
same window-liftable rule the intake module above sits under), not by GS-8. "GS-8's module" is the
sibling file it imports and compares against, `./public-core-origin-allowlist.mjs`
(`self-application-attestation-gate.mjs:22-23`). Both memberships are open, both are outside this
design's scope, and both are left open below for their own dated correction when addressed.

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
- `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs`'s addition to
  `NEVER_LIFTABLE_KERNEL_PATHS` (2026-08-10 correction above) is endorsed but
  not yet applied — the array itself is edited when that module ships, not
  here. Trigger: land alongside that module.
- Two kernel-membership questions raised at `self-application-attestation-gate.mjs:45-47` remain
  undecided by this ADR — corrected here from an earlier version of this bullet, which named only
  one of them and mislabeled it (see the 2026-08-10 correction above). Neither is the intake module
  above; both are a separate module, a separate decision:
  - `plugins/pipeline-core/lib/self-application-attestation-gate.mjs` itself (the live-enforcing
    copy is governed by GS-6, the window-liftable rule).
  - `plugins/pipeline-core/lib/public-core-origin-allowlist.mjs`, GS-8's actual module.

  Owner `pipeline`. **Trigger:** resolved when a dated correction to this ADR either adds the
  relevant path(s) to `NEVER_LIFTABLE_KERNEL_PATHS` or records, on the record, that the
  maintenance-cost tradeoff (permanently uneditable under any window, per Decision 3) is accepted
  and the exposure stays — the same two-way trigger shape §15.1.6 (v) of the caching design now uses
  for the analogous `guard-testpath.mjs` question, not a default of leaving the question open
  indefinitely.
- `plugins/pipeline-core/hooks/guard-testpath.mjs`'s own membership in
  `NEVER_LIFTABLE_KERNEL_PATHS` — the question the entry above uses only as an
  analogy — is itself raised here, not yet decided.
  `backlog/items/2026-08-10-guard-testpath-not-kernel-protected-like-its-
  sibling.md` names the same recursive-hole shape Decision 3 already protects
  `guard-gate-strength.mjs` against: `guard-testpath.mjs` is the enforcement
  hook for the entire TP-* rule family, so a GS-6 window opened for any
  legitimate, unrelated purpose would let its first edit weaken or remove a
  TP-* refusal, and that edit would survive the window's own expiry — this
  file's own `Governs:` line already lists `guard-testpath.mjs`, so the
  question sits squarely inside this ADR's authority. `PIPE-WP-GTP-KERNEL`
  (2026-08-11) attempted the array addition the backlog item proposes and
  correctly stopped rather than ship it without this recorded decision —
  the stop is what surfaced that the question had only ever been used as an
  analogy above, never itself tracked.

  Owner `pipeline`. **Trigger:** the same two-way shape as the entry above —
  a dated correction that either adds the path to
  `NEVER_LIFTABLE_KERNEL_PATHS` or records that the maintenance-cost
  tradeoff is accepted and the exposure stays. The backlog item names the
  cost precisely: once added, a genuine bug in TP-*'s own enforcement logic
  would need a different, out-of-session route to fix (the PO editing it
  directly, or a separate installed-plugin-copy workflow) — the same
  limitation this repository already accepts for `guard-gate-strength.mjs`
  today. That tradeoff is the PO's to weigh, not a default either way.

  **Resolved, 2026-08-11 (PO decision).** The exposure stays;
  `guard-testpath.mjs` is NOT added to `NEVER_LIFTABLE_KERNEL_PATHS`. PO
  rationale, recorded as given: a GMW window is itself human-authorized to
  open — it requires the PO's own signature — and this repository's guard
  system is built to bound what an AGENT can do without a human step, not
  to bound the PO, who can already change any file directly, guard or no
  guard, outside a session entirely. Any edit reachable through an active
  window, including one to `guard-testpath.mjs`, only becomes reachable
  after the PO has already signed that window into existence. On that
  reasoning, the marginal exposure this bullet raised is not accepted as a
  live risk worth the permanent-uneditability cost. This resolves the
  two-way trigger above by the second branch: the tradeoff was weighed, not
  defaulted, and the exposure stays.
