# ADR-0034: Precedence — Central Deploy Policy vs. Project Manifest, a New Axis

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · SDLC Release/Deploy extension · as of 2026-07-11

**Status:** accepted (2026-07-11, sub-spec `specs/2026-07-11-sdlc-release-deploy/spec_s1-canon.md`, umbrella `specs/2026-07-11-sdlc-release-deploy/spec.md` §2.2/§2.4) · **Basis:** [ADR-0030](0030-governance-layer.md) (governance layer), [ADR-0033](0033-release-promotion-phase.md) (release/promotion phase), PO decisions (2026-07-11)

## Context

Hosted/enterprise setups need a central deploy policy that can override a project manifest. [ADR-0030](0030-governance-layer.md) already distinguishes advisory guidelines from enforcing policies AND delivers a repo>user<managed hierarchy — but NO central-beats-project precedence between two repo-level artifacts (a central deploy policy vs. a project manifest). That's a new axis, which this decision explicitly draws.

## Decision

A central deploy policy (`deploy-policy.yaml`, under the manifest field `governance.policies_path`, schema `pipeline.deploy-policy.v0`) with three hardness modes:

- **`advisory`** — a guideline: informs the plan, the Critic flags undocumented deviations.
- **`mandate`** (default when a central policy exists) — a hard floor; a deviation is allowed ONLY via a valid, non-expired exception entry in `docs/risks.md`.
- **`strict`** — a hard floor, no exceptions (larger/enterprise setups).

"Harder" is machine-decidable PER FIELD (a partial order): `adapters`/`targets` = allowlist, the project must configure a subset; gate hardness is ordinal `off < warn < blocking` resp. gate type `automated < human` — the project may deviate only UPWARD; boolean requirements (e.g. an evidence requirement) — a central `true` binds; otherwise an exact match, central silence = the project decides.

**Enforcement is server-side PRIMARY** (a repo-file policy is editable by the same agent it's meant to constrain) — GitHub environments with required reviewers, tag/branch protection, OIDC trust conditions are the load-bearing wall; the repo guard (a push-gate extension, a follow-up slice of the release/deploy extension) is defense-in-depth.

## Consequences

**Discovery-path limitation (documented verbatim):** The policy is discovered via the PROJECT'S OWN field `governance.policies_path` — at the repo level, the bound project can opt out by omitting/redirecting this field with ZERO technical resistance. That is accepted and STATED, not hidden: repo-level enforcement is defense-in-depth; the BINDING channel for an organization is deployment time (managed settings pinning the policy path/content) plus the server-side prod controls above. In a hosted project, a missing/redirected `policies_path` where an organization expects one is a STANDING Critic finding (review criterion).

**Blast-radius asymmetry:** A malformed/unreadable policy declaration is a `validate-manifest` WARNING + a deploy-scope-bounded fail-closed (an accident must not break the whole repo); a substantive violation of a VALID policy is a `validate-manifest` ERROR via `verify` (loud by design — a real violation blocks until fixed or covered). Detail mechanics: follow-up slices of the release/deploy extension.

**Positive:** Closes the new precedence axis explicitly instead of silently folding it into ADR-0030; three modes instead of all-or-nothing respect that small setups need an override, and even large setups need a documented exception path.

**Negative:** One more consumption path (loader/precedence engine, a follow-up slice); repo-level enforcement stays structurally bypassable (see above).

## Rejected alternatives

- **A central policy always maximally hard** — rejected (PO objection): small setups need an override, even large ones need a documented exception path → three modes.
- **A new manifest field for discovery** — rejected: a fixed filename under the existing `policies_path` suffices, no new field needed.
- **Reuse ADR-0030's hierarchy unchanged** — rejected: doesn't express the new axis (central vs. project manifest, both repo-level).

## Status / follow-up

Harden the discovery path once a real hosted organization actually consumes the policy.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0034: Präzedenz — zentrale Deploy-Policy vs. Projekt-Manifest, eine neue Achse

> Agent-Pipeline v0.1.0-draft · SDLC-Release/Deploy-Erweiterung · Stand 2026-07-11

**Status:** akzeptiert (2026-07-11, Sub-Spec `specs/2026-07-11-sdlc-release-deploy/spec_s1-canon.md`, Umbrella `specs/2026-07-11-sdlc-release-deploy/spec.md` §2.2/§2.4) · **Grundlage:** [ADR-0030](0030-governance-layer.md) (Governance-Layer), [ADR-0033](0033-release-promotion-phase.md) (Release/Promotion-Phase), PO-Entscheidungen (2026-07-11)

## Kontext

Gehostete/Enterprise-Setups brauchen eine zentrale Deploy-Policy, die ein Projekt-Manifest übersteuern kann. [ADR-0030](0030-governance-layer.md) unterscheidet bereits advisory Guidelines von enforcing Policies UND liefert eine Repo>User<Managed-Hierarchie — aber KEINE zentral-schlägt-Projekt-Präzedenz zwischen zwei Repo-Ebenen-Artefakten (zentrale Deploy-Policy vs. Projekt-Manifest). Das ist eine neue Achse, die diese Entscheidung explizit einzieht.

## Entscheidung

Eine zentrale Deploy-Policy (`deploy-policy.yaml`, unter dem Manifest-Feld `governance.policies_path`, Schema `pipeline.deploy-policy.v0`) mit drei Härtegrad-Modi:

- **`advisory`** — Richtlinie: informiert den Plan, der Critic flaggt undokumentierte Abweichungen.
- **`mandate`** (Default, wenn eine zentrale Policy existiert) — harte Untergrenze; Abweichung NUR über einen gültigen, nicht abgelaufenen Ausnahme-Eintrag in `docs/risks.md`.
- **`strict`** — harte Untergrenze, keine Ausnahmen (größere/Enterprise-Setups).

„Härter" ist maschinell entscheidbar PRO FELD (partielle Ordnung): `adapters`/`targets` = Allowlist, Projekt muss Teilmenge konfigurieren; Gate-Härte ordinal `off < warn < blocking` bzw. Gate-Typ `automated < human` — Projekt darf nur nach OBEN abweichen; Boolean-Pflichten (z. B. Evidenz-Pflicht) — zentrales `true` bindet; sonst exakter Abgleich, zentral schweigend = Projekt entscheidet.

**Durchsetzung ist server-seitig PRIMÄR** (eine Repo-Datei-Policy ist vom selben Agenten editierbar, den sie einschränken soll) — GitHub-Environments mit Required Reviewers, Tag-/Branch-Protection, OIDC-Trust-Bedingungen sind die tragende Wand; der Repo-Guard (Push-Gate-Erweiterung, Folge-Slice der Release/Deploy-Erweiterung) ist Defense-in-Depth.

## Konsequenzen

**Discovery-Pfad-Limitierung (wörtlich dokumentiert):** Die Policy wird über das PROJEKT-EIGENE Feld `governance.policies_path` entdeckt — auf Repo-Ebene kann das gebundene Projekt durch Weglassen/Umbiegen dieses Felds mit NULL technischem Widerstand aussteigen. Das ist akzeptiert und AUSGESPROCHEN, nicht versteckt: Repo-Ebenen-Durchsetzung ist Defense-in-Depth; der BINDENDE Kanal für eine Organisation ist Deployment-Zeit (Managed Settings, die den Policy-Pfad/-Inhalt anpinnen) plus die serverseitigen Prod-Kontrollen oben. In einem gehosteten Projekt ist ein fehlendes/umgebogenes `policies_path`, wo eine Organisation eines erwartet, ein STANDING Critic-Befund (Review-Maßstab).

**Blast-Radius-Asymmetrie:** Eine fehlerhaft deklarierte Policy (unlesbar/malformed) ist eine `validate-manifest`-WARNUNG + ein deploy-scope-begrenztes Fail-Closed (ein Unfall darf nicht das ganze Repo brechen); ein inhaltlicher Verstoß gegen eine GÜLTIGE Policy ist ein `validate-manifest`-ERROR über `verify` (laut nach Design — ein echter Verstoß blockt, bis er behoben oder gedeckt ist). Detail-Mechanik: Folge-Slices der Release/Deploy-Erweiterung.

**Positiv:** Schließt die neue Präzedenz-Achse explizit, statt sie ADR-0030 stillschweigend unterzuschieben; drei Modi statt Alles-oder-nichts respektieren, dass kleine Setups Override brauchen und selbst große Setups einen dokumentierten Ausnahmepfad.

**Negativ:** Weiterer Konsumpfad (Loader/Präzedenz-Engine, Folge-Slice); die Repo-Ebenen-Durchsetzung bleibt strukturell umgehbar (s. o.).

## Verworfene Alternativen

- **Zentrale Policy immer maximal hart** — verworfen (PO-Einwand): kleine Setups brauchen Override, selbst große brauchen einen dokumentierten Ausnahmepfad → drei Modi.
- **Ein neues Manifest-Feld für die Discovery** — verworfen: fester Dateiname unter dem bestehenden `policies_path` reicht, kein neues Feld nötig.
- **ADR-0030s Hierarchie unverändert wiederverwenden** — verworfen: drückt die neue Achse (zentral vs. Projekt-Manifest, beide Repo-Ebene) nicht aus.

## Wiedervorlage

Den Discovery-Pfad härten, sobald eine reale gehostete Organisation die Policy tatsächlich konsumiert.
