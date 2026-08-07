---
schema: pipeline.backlog-item.v1
id: pipeline.human-authorization-prompts-ignore-the-configured-language-profile
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "PO request in the 2026-08-07 Nova session for a deliberate confirmation before PIN entry, explicitly qualified as language-profile dependent; partially delivered by NOVA-PO-CONFIRM-1 in commits 5efb0f1 and 584a598."
---

# The pre-signature confirmation prompt is English-only and ignores `runtime.humanFacingLanguage`

## Description

`plugins/pipeline-core/scripts/po-human-approval.mjs` now refuses to invoke
OpenSSL until a human reads a plain-language summary and types `approve`. The
gate itself works and is tested. What it does not do is speak the operator's
configured language: `requireExplicitConfirmation()` builds its prompt from
hardcoded English string literals, and the confirmation token is the literal
English word `approve` regardless of configuration.

This is the one part of the PO's original request that was not delivered. It
was stated as a known gap in the commit body and the dispatch record rather
than treated as complete, so this item exists to carry it rather than to
rediscover it.

The affected surface is wider than one file. The same mode-appropriate
next-step guidance now appended by `guard-lifecycle-ready.mjs`,
`guard-gate-strength.mjs`, `guard-testpath.mjs` and `codex-pretool-guard.mjs`
is also English-only. Guard denial text is arguably agent-facing and therefore
correctly English under ADR-0011; a confirmation prompt read by a human before
they authorize something irreversible is not.

## Triggering situation

The PO asked explicitly for a deliberate confirmation before the PIN entry,
and explicitly qualified it with "je nach Sprachprofil natürlich". The
implementing dispatch (`NOVA-PO-CONFIRM-1`) delivered the gate and left the
language profile unwired. The runtime already carries the value the prompt
would need: the validated continuity projection exposes
`runtime.humanFacingLanguage` (currently `en` in this repository).

## Affected artifact

- `plugins/pipeline-core/scripts/po-human-approval.mjs` —
  `requireExplicitConfirmation()` and `CONFIRMATION_TOKEN`.
- `docs/po-human-approval.md` — the "Before any signature: one explicit
  confirmation" section documents the English wording as normative.
- [ADR-0011](../../docs/adr/0011-language-policy.md) — the target-scope rule
  that makes this a defect rather than a preference: this text's primary
  reader is a human operator, not an agent.
- Secondarily, the HGO next-step guidance blocks in the four guards named
  above.

## Proposal

Resolve the human-facing language once, from the same runtime source the rest
of the session uses, and select the prompt text from it — with English as the
fallback whenever the value is absent, unreadable, or unrecognised, so the gate
can never fail open into "no prompt" because a locale lookup failed.

Two questions this item must answer rather than assume:

1. **Does the confirmation token get translated too?** A translated token is
   friendlier; an untranslated one is a stable, greppable, documentable
   constant that cannot drift between the prompt and the documentation. A
   defensible middle is to accept the English token always and the localised
   token additionally.
2. **Does guard denial guidance follow, or stay English?** Guard denials are
   read by an agent first and a human second; the confirmation prompt is read
   only by a human. These may legitimately land on opposite sides of the
   ADR-0011 target-scope rule, and the decision should be recorded rather than
   applied by reflex.

Whatever is decided, the existing cancellation semantics must not weaken: any
answer that is not an accepted confirmation token still cancels before OpenSSL
runs and before any artifact exists.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
