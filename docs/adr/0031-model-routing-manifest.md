# ADR-0031: Model Routing in the Manifest — Machine-Readable Projection, `model-policy.md` Stays Canonical

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · AP1 tuning session · as of 2026-07-07

**Status:** accepted (2026-07-07, PO plan approval "AP1 TUNING") · **Basis:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` packages P2/P7, [ADR-0006](0006-model-effort-policy.md), `policies/model-policy.md`

## Context

`.claude/pipeline.yaml` ([ADR-0028](0028-manifest-approach.md)) introduces a `modelRouting` block (role → model/effort) that, at first glance, could look like a second source for model/effort decisions alongside `policies/model-policy.md` and [ADR-0006](0006-model-effort-policy.md) (register E6, revised E16). That would contradict the "ONE source of truth" principle (`docs/operating-model.md`, anti-pattern AP1) — this ADR clarifies that it is not a second source.

## Decision

The manifest block `modelRouting` (`.claude/pipeline.yaml`) is a **machine-readable PROJECTION** of the existing model policy — not an independent, competing decision point. `policies/model-policy.md` remains canonical on any conflict. Example content from this repo:

```yaml
modelRouting:
  elephant:
    model: profile-bound
    effort: profile-bound
    note: "MP-01/E26 — Profile Fable Advisor (Cost/Quality) default"
  goldfish:
    model: sonnet-5
    effort: xhigh
  critic:
    model: sonnet-5
    effort: max
    note: "Fable 5 required for A-G-S (MP-07)"
```

- **Elephant:** model/effort is profile-bound (`profile-bound`) — the manifest deliberately does NOT encode a fixed value, because the real value depends on the active profile (`advisor`/`design-first`, E26) and possibly on the model-switch point (step 3c, `docs/operating-model.md` §3.2); a fixed manifest value would create drift the moment the profile changes.
- **Goldfish:** default **Sonnet 5 / `xhigh`** (E22 standard default, [ADR-0022](0022-light-profile-xhigh-default.md); minimum Sonnet 5, no Haiku, E6/[ADR-0006](0006-model-effort-policy.md)).
- **Critic:** default **Sonnet 5 / `max`**; Fable 5 escalation for architecture/guardrail/security diffs (A-G-S) per [ADR-0024](0024-critic-staffing-data-based.md)/E24 (data-based revision of the original E12 trigger staffing).

**Relation to [ADR-0006](0006-model-effort-policy.md):** revision/reference, not a replacement — this ADR does not introduce a new model decision, it only describes how the already register-fixed model policy (E6, revised E16, extended E24/E25) is made visible/machine-readable in the manifest.

## Consequences

**Positive:** tools/hooks that read the manifest can inspect the current model-routing state programmatically (e.g. for future dispatch automation) without having to parse `policies/model-policy.md`; the projection surfaces drift between manifest and policy instead of silently allowing it.

**Negative:** two artifacts (manifest block + `model-policy.md`) must be kept in sync on every model-policy change — a manual maintenance risk, knowingly accepted for the benefit of the machine-readable projection.

**Risk:** a stale `modelRouting` entry in the manifest could be mistakenly read as current policy if `model-policy.md` was revised in the meantime (e.g. at the 2026-08-31 price review, [ADR-0006](0006-model-effort-policy.md) follow-up). Mitigation: this ADR explicitly names `model-policy.md` as canonical on conflict; a sync check at future model-policy revisions is recommended practice, not an automated enforcement of this delivery.

## Rejected alternatives

- **`modelRouting` as an independent, manifest-authoritative model decision** — rejected; would devalue `policies/model-policy.md` and [ADR-0006](0006-model-effort-policy.md) as the canonical source and create a second truth (anti-pattern AP1).
- **No `modelRouting` block in the manifest** — rejected; the AP1 plan (package P2) explicitly requires it as machine-readable visibility, among other things for future automation.
- **Fixed model/effort values for the Elephant in the manifest** — rejected in favor of `profile-bound`, because a fixed value would contradict the profile logic (E26) as soon as the active profile changes.

## Follow-up

Bundled with the model-policy follow-up (**2026-08-31**, price review, [ADR-0006](0006-model-effort-policy.md)): sync check between `modelRouting` and `model-policy.md` at that occasion.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0031: Modell-Routing im Manifest — maschinenlesbare Projektion, `model-policy.md` bleibt kanonisch

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Paket P2/P7, [ADR-0006](0006-model-effort-policy.md), `policies/model-policy.md`

## Kontext

`.claude/pipeline.yaml` ([ADR-0028](0028-manifest-approach.md)) führt einen Block `modelRouting` ein (Rolle → Modell/Effort), der auf den ersten Blick eine zweite Quelle für Modell-/Effort-Entscheidungen neben `policies/model-policy.md` und [ADR-0006](0006-model-effort-policy.md) (Register E6, revidiert E16) sein könnte. Das wäre ein Widerspruch zum Prinzip „EINE Quelle der Wahrheit" (`docs/operating-model.md`, Anti-Pattern AP1) — dieses ADR stellt klar, dass es keine zweite Quelle ist.

## Entscheidung

Der Manifest-Block `modelRouting` (`.claude/pipeline.yaml`) ist eine **maschinenlesbare PROJEKTION** der bestehenden Modell-Policy — kein eigenständiger, konkurrierender Entscheidungsort. `policies/model-policy.md` bleibt bei jedem Konflikt kanonisch. Beispiel-Inhalt dieses Repos:

```yaml
modelRouting:
  elephant:
    model: profilgebunden
    effort: profilgebunden
    note: "MP-01/E26 — Profil Fable Advisor (Cost/Quality) Standard"
  goldfish:
    model: sonnet-5
    effort: xhigh
  critic:
    model: sonnet-5
    effort: max
    note: "Fable 5 Pflicht bei A-G-S (MP-07)"
```

- **Elephant:** modell-/effortabhängig vom aktiven Profil (`profilgebunden`) — das Manifest bildet bewusst KEINEN festen Wert ab, weil der reale Wert vom Profil (`advisor`/`design-first`, E26) und ggf. dem Modellwechsel-Punkt (Schritt 3c, `docs/operating-model.md` §3.2) abhängt; eine feste Manifest-Angabe würde hier Drift erzeugen, sobald sich das Profil ändert.
- **Goldfish:** Default **Sonnet 5 / `xhigh`** (E22-Standard-Default, [ADR-0022](0022-light-profile-xhigh-default.md); Minimum Sonnet 5, kein Haiku, E6/[ADR-0006](0006-model-effort-policy.md)).
- **Critic:** Standard **Sonnet 5 / `max`**; Fable-5-Eskalation bei Architektur-/Guardrail-/Security-Diffs (A-G-S) nach [ADR-0024](0024-critic-staffing-data-based.md)/E24 (datenbasierte Revision des ursprünglichen E12-Trigger-Staffings).

**Verhältnis zu [ADR-0006](0006-model-effort-policy.md):** Revision/Verweis, keine Ersetzung — dieses ADR führt keine neue Modell-Entscheidung ein, sondern beschreibt ausschließlich, wie die bereits registerfeste Modell-Policy (E6, revidiert E16, ergänzt E24/E25) im Manifest sichtbar/maschinenlesbar gemacht wird.

## Konsequenzen

**Positiv:** Tools/Hooks, die das Manifest lesen, können den aktuellen Modell-Routing-Stand programmgestützt einsehen (z. B. für künftige Dispatch-Automation), ohne `policies/model-policy.md` parsen zu müssen; die Projektion macht Drift zwischen Manifest und Policy sichtbar, statt sie stillschweigend zuzulassen.

**Negativ:** Zwei Artefakte (Manifest-Block + `model-policy.md`) müssen bei jeder Modell-Policy-Änderung synchron gehalten werden — ein manuelles Pflegerisiko, bewusst in Kauf genommen für den Nutzen der maschinenlesbaren Projektion.

**Risiko:** Ein veraltetes `modelRouting` im Manifest könnte fälschlich als aktuelle Policy gelesen werden, wenn `model-policy.md` zwischenzeitlich revidiert wurde (z. B. beim Preis-Review 31.08.2026, [ADR-0006](0006-model-effort-policy.md) Wiedervorlage). Mitigation: dieses ADR benennt `model-policy.md` explizit als bei Konflikt kanonisch; ein Sync-Check bei künftigen Modell-Policy-Revisionen ist empfohlene Praxis, kein automatisierter Zwang dieser Lieferung.

## Verworfene Alternativen

- **`modelRouting` als eigenständige, im Manifest führende Modell-Entscheidung** — verworfen; würde `policies/model-policy.md` und [ADR-0006](0006-model-effort-policy.md) als kanonische Quelle entwerten und eine zweite Wahrheit schaffen (Anti-Pattern AP1).
- **Kein `modelRouting`-Block im Manifest** — verworfen; der AP1-Plan (Paket P2) verlangt ihn ausdrücklich als maschinenlesbare Sichtbarkeit, u. a. für künftige Automation.
- **Feste Modell-/Effort-Werte für den Elephant im Manifest** — verworfen zugunsten von `profilgebunden`, weil ein fester Wert der Profil-Logik (E26) widerspräche, sobald das aktive Profil wechselt.

## Wiedervorlage

Gebündelt mit der Modell-Policy-Wiedervorlage (**31.08.2026**, Preis-Review, [ADR-0006](0006-model-effort-policy.md)): Sync-Check zwischen `modelRouting` und `model-policy.md` bei dieser Gelegenheit.
