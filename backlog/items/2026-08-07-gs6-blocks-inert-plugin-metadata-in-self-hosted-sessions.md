---
schema: pipeline.backlog-item.v1
id: pipeline.gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions
type: defect
owner: pipeline
status: closed
created: 2026-08-07
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "586f59edcffb9cebca139f1f4394a3c9ed9a66f9"
closure_evidence: "plugins/pipeline-core/hooks/guard-gate-strength.test.mjs"
source: "0.5.2 release session, 2026-08-07: PO asked why a release cannot run end-to-end through the Pipeline with only the final signature as the human step, for the version-surface strip specifically."
due: 2026-09-06
expires: 2026-09-06
---

# GS-6 blocks the version field in `plugin.json` exactly as hard as it blocks guard code

## Description

`guard-gate-strength.mjs`'s `LIVE_PLUGIN_RULE` (GS-6) refuses every Edit/Write
inside the currently-enforcing plugin root, with no in-session override by
design (`recordHumanGuardDenial` is wired only from `guard-testpath.mjs` and
`codex-pretool-guard.mjs` — never from `guard-gate-strength.mjs` or
`guard-lifecycle-ready.mjs`'s shell-lane twin). The stated threat model is
specific: "a guard *script* is re-read on every invocation, so writing
`process.exit(0)` into the installed `guard-push.mjs` disarms the push gate
immediately." That threat does not apply to `.claude-plugin/plugin.json` or
`.codex-plugin/plugin.json` — inert metadata with no code path any guard
reads to decide whether it fires. GS-6 does not distinguish the two: both
live under the same `insideLivePlugin()` root check.

In the Pipeline's own self-hosted repo (ADR-0015), this checkout's
`plugins/pipeline-core/` is *also* the currently-registered local-development
plugin root, so `livePluginRoots()` resolves to this same checkout and the
rule fires on both classes of file identically. Measured 2026-08-07: an Edit
to bump `plugins/pipeline-core/.claude-plugin/plugin.json`'s `version` field
(stripping the release `+build` cachebuster, a required step before every
tagged release per `docs/release-0.5.2-readiness.md`) was refused with the
same GS-6 message as an edit to `guard-push.mjs` itself would get.

## Triggering situation

PO asked directly, mid release: "why doesn't this go through the normal
path — a release must be possible through the Pipeline, the only human step
at the end should be the signature on the final candidate." The honest
answer: for guard-enforcing code, that restriction is correct and
intentional (self-authorizing a weaker gate is the hole `human-guard-
override.mjs`'s own header names and refuses to reopen). For the two-line
version bump specifically, it is not load-bearing — it is a side effect of
GS-6 protecting the whole plugin root as one undifferentiated unit, not a
considered decision that version bumps need a detached human edit.

## Affected artifact

`plugins/pipeline-core/hooks/guard-gate-strength.mjs` (`LIVE_PLUGIN_RULE`,
`insideLivePlugin()`); its shell-lane twin in `guard-lifecycle-ready.mjs`
(`GUARD-GATE-STRENGTH-SHELL`); `plugins/pipeline-core/lib/human-guard-
override.mjs` (`pipeline-author-repair` mode already exists for
`plugins/pipeline-core/**` edits generally, but is not reachable for GS-6
denials — only for `guard-testpath.mjs`/Codex-adapter denials).

## Proposal

1. Split GS-6's scope: keep the blanket, override-free refusal for files a
   guard actually reads to decide whether it fires (`hooks/**`, the `lib/*`
   modules those hooks import) — that part must stay exactly as strict as it
   is now, per the module's own stated reasoning.
2. For the remainder of the live plugin root that carries no guard logic
   (starting with the two `plugin.json` manifests' `version` field, the
   narrowest concrete case) — route the denial through the existing
   `human-guard-override.mjs` `pipeline-author-repair` flow instead of a bare
   refusal, the same audited request → plan → capability → apply sequence
   already used for other `plugins/pipeline-core/**` edits. This keeps a
   real human step (the PO explicitly authorizes the specific edit) without
   requiring them to leave the session and use a text editor for a
   mechanical, low-risk field.
3. Explicitly out of scope: nothing here should make the *signature* step of
   a release skippable or delegable — only the mechanical, no-design-latitude
   version-surface edit that currently forces a detached manual step for no
   security reason tied to this specific field.
4. Write a regression test asserting the split: a `hooks/*.mjs` edit stays
   refused with no override path; a `plugin.json` version-only edit becomes
   reachable through `pipeline-author-repair`.

## Triage (filled in by the Elephant of the next Pipeline session)

**Merge note (2026-08-26, moved from frontmatter):** Two branches independently closed this item on the same date (2026-08-18) citing the same underlying resolution (ADR-0058 Guard Maintenance Window), with different closure commits. The origin/sprint_phoenix side recorded closure_commit 88dc3ba6952f226ed4f9caa57bad982cb660a425, closure_evidence pointing at this backlog item file itself rather than the test file. Kept here as this note rather than a second closure field; both branches' closing Triage narratives are preserved below.

- **Decision:** accept-open.
- **Rationale:** the item's own proposal already draws the correct
  distinction (guard-reading code stays override-free; inert metadata gets a
  routed human-approval path instead of a bare refusal) and names a concrete
  first case (`plugin.json` version field). This is guardrail-class work —
  touches `guard-gate-strength.mjs`/`guard-lifecycle-ready.mjs` and
  `human-guard-override.mjs`'s wiring — so it needs design-tier effort and a
  T1 Critic round on the result, not a same-session mechanical patch, and
  cannot itself be applied from inside a GS-6-governed session (the same
  constraint that produced this finding).
- **Assignment (if accepted):** `goldfish-deep` with a T1 Critic round,
  matching the discipline already used for adjacent guard-scope items
  (`2026-08-06-local-plugin-install-attestation-does-not-bind-external-marketplace-root.md`).
  Should be scoped together with
  `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`'s
  candidate #3, since both describe the same shape of gap (guard drawn at a
  directory boundary, not at what needs protecting) on overlapping code.
- **Date:** 2026-08-07

### 0.6.0 release-bar confirmation (2026-08-18)

Re-checked during the Nova 0.6.0 release triage sweep: the 2026-08-07
decision above is already specific and bounded (split GS-6's scope; route
inert `plugin.json` version edits through the existing
`pipeline-author-repair` flow; keep guard-reading code override-free) with a
dispatch assignment already named (goldfish-deep + T1 Critic, bundled with
the related push-release-flow item's candidate #3). It names no sprint, so
per the release bar it stays a same-release dispatch target rather than a
close. Not attempted here — it is guard-wiring code (`guard-gate-strength.mjs`,
`human-guard-override.mjs`) that this session's read-only scope does not
authorize touching, and needs an independent Critic round per the item's own
rationale.

### Closure, 2026-08-18 (evening) — superseded by ADR-0058, not the proposed route

**Decision:** Closed. A wave-1 dispatch against this item found the
underlying need already resolved, but by a different, already-shipped,
already-Critic-reviewed mechanism than this item's own Proposal —
ADR-0058's Guard Maintenance Window (`docs/adr/0058-guard-maintenance-
window.md`, accepted `586f59ed`), which explicitly names this exact item
(2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md)
as one of its two motivating incidents and explicitly evaluates and
**rejects** the item's proposed HGO-based route: HGO's `chat`-mode
activation is "an ordinary in-session command a ready session can simply
run itself" — not a real human gate for GS-6.

Implementing this item's literal Proposal today would mean either
weakening `hooks/**`'s already-tested override-free posture (regression
against `GST27`/`GST28`, which pin "GS-6 is never lifted by this path,
even with a real, valid, exactly-matching armed capability" as an
invariant) or wiring a second, less-audited lift path GMW's own design
process already considered and turned down. Neither is a same-session
mechanical patch.

**The underlying need — a real human-authorized route for the
`plugin.json` version-bump case, without a detached manual edit — is
satisfied today via GMW's heavier, time-boxed, PO-signed ceremony.**
`NEVER_LIFTABLE_KERNEL_PATHS` hard-blocks only ~7 kernel files
(`guard-gate-strength.mjs`, `hooks.json`, `guard-lifecycle-ready.mjs`,
`guard-command-grammar.mjs`, `tool-write-target.mjs`, `guard-maintenance-
window.mjs`, `project/critical-human-proof.json`); `.claude-plugin/
plugin.json` and `.codex-plugin/plugin.json` are not in that list and are
already reachable through an armed GMW window. Verified live:
`node --test plugins/pipeline-core/hooks/guard-gate-strength.test.mjs` →
36/36 pass, including `GST20` ("a real armed GS-6 window lifts an
ordinary plugin file but a kernel path stays refused") — proving exactly
the split this item asked for, just through GMW rather than HGO.

The one thing NOT delivered relative to the item's original ask: GMW's
ceremony is heavier (time-boxed window, not the lighter one-shot HGO
flow envisioned here). That is a legitimate remaining "is this the right
amount of friction for a two-line version bump" design question, but it
is a GMW-ergonomics question, not this item's own defect — left open
only if a future session wants to raise it as its own, narrower item.
- **Date:** 2026-08-18

**Update 2026-08-18 (Elephant, Phoenix backlog-clearing pass):** the accepted
fix has since landed via a different, already-shipped mechanism than the
`goldfish-deep`+T1-Critic path this Triage assigned: `guard-gate-strength.mjs`
(lines 220-240) now gates whether a GS-6 hit can be lifted on
`isNeverLiftableKernelPath` (`guard-maintenance-window.mjs:120-128`,
`NEVER_LIFTABLE_KERNEL_PATHS`), which does NOT include
`.claude-plugin/plugin.json` — exactly the split this item's own Proposal
asked for (guard-reading code stays override-free; inert metadata gets a
routed, signed Guard Maintenance Window path instead of a bare refusal).
Confirmed identical in Nova, i.e. this was reviewed shared architecture, not
a drive-by patch. Closing.
