# ADR-0011: Language Policy for Public Core and Private Overlays

## Status

Accepted on 2026-07-03; revised for the public-core/private-overlay split during Phase 2.

## Context

Runtime artifacts benefit from a single portable language, while a private project may configure a different language for its operator-facing material. Treating those needs as one repository-wide bilingual rule created duplicate documents, unnecessary context, and a risk of publishing private identity or project details.

## Decision

English is canonical for the public core.

- Public runtime and internal product artifacts are English-only. This includes `docs/adr/**`, `policies/**`, `guardrails/**`, `roles/**`, `templates/**`, harness and plugin material, specs, and review artifacts intended for reuse.
- `README.md`, `SETUP.md`, `docs/overview.md`, and `docs/usage.md` remain English-canonical public front doors. They may have explicitly marked German reference material when maintained as a bounded reader aid; the English version remains authoritative.
- Public artifacts do not contain full parallel German copies below the English body.

A private overlay may configure the language of operator-facing content, including chat, local handovers, project state, commit messages, pull-request descriptions, and project-specific documentation. The primary-reader rule applies inside that private scope: structures and machine-facing fields remain English, while filled content may follow the configured reader language.

The overlay rule never changes the public-core language and never authorizes personal identity, private paths, private repository coordinates, or local session history in a public artifact. Material crossing from private to public is translated, minimized, and reviewed at the boundary.

Critic reviews check the target path against this matrix and flag unmarked mixed-language content or duplicate translations.

## Consequences

The public core remains portable, compact, and unambiguous. Private projects retain readable operator-facing workflows without turning personal preferences into product policy.

Cross-boundary delivery requires an explicit language and privacy pass. A term may remain untranslated when it is a stable project concept, but explanatory prose still follows the target scope.

## Rejected Alternatives

- Full bilingual copies of every artifact: they waste context and drift independently.
- All content in the private operator language: it reduces public portability and runtime consistency.
- All private content in English: it removes a useful project-level configuration without improving the public trust boundary.

## Follow-up

None.
