---
schema: pipeline.backlog-item.v1
id: pipeline.gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions
type: defect
owner: pipeline
status: open
created: 2026-08-07
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

Not yet triaged. Filed same-session as the workaround (PO edits the two
files directly per the guard's own stated escape hatch) so the 0.5.2 release
is not blocked on this being resolved first.
