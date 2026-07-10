# ADR-0031: Modell-Routing im Manifest — maschinenlesbare Projektion, `model-policy.md` bleibt kanonisch

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR decides that the `modelRouting` block introduced in `.claude/pipeline.yaml` is a machine-readable *projection* of the existing model/effort policy, not a second, competing source of truth — `policies/model-policy.md` (and ADR-0006) remains canonical whenever the two conflict. Rationale: without this clarification, the new manifest block risked violating the "single source of truth" principle (Anti-Pattern AP1) by letting tooling read model/effort assignments straight from the manifest instead of the policy file. Status: accepted 2026-07-07; the tradeoff accepted is a manual sync burden between the manifest and the policy file, flagged for review alongside the next model-policy pricing review (2026-08-31).

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Paket P2/P7, [ADR-0006](0006-modell-effort-policy.md), `policies/model-policy.md`

## Kontext

`.claude/pipeline.yaml` ([ADR-0028](0028-manifest-ansatz.md)) führt einen Block `modelRouting` ein (Rolle → Modell/Effort), der auf den ersten Blick eine zweite Quelle für Modell-/Effort-Entscheidungen neben `policies/model-policy.md` und [ADR-0006](0006-modell-effort-policy.md) (Register E6, revidiert E16) sein könnte. Das wäre ein Widerspruch zum Prinzip „EINE Quelle der Wahrheit" (`docs/operating-model.md`, Anti-Pattern AP1) — dieses ADR stellt klar, dass es keine zweite Quelle ist.

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
- **Goldfish:** Default **Sonnet 5 / `xhigh`** (E22-Standard-Default, [ADR-0022](0022-light-profil-xhigh-default.md); Minimum Sonnet 5, kein Haiku, E6/[ADR-0006](0006-modell-effort-policy.md)).
- **Critic:** Standard **Sonnet 5 / `max`**; Fable-5-Eskalation bei Architektur-/Guardrail-/Security-Diffs (A-G-S) nach [ADR-0024](0024-critic-stufung-datenbasiert.md)/E24 (datenbasierte Revision des ursprünglichen E12-Trigger-Staffings).

**Verhältnis zu [ADR-0006](0006-modell-effort-policy.md):** Revision/Verweis, keine Ersetzung — dieses ADR führt keine neue Modell-Entscheidung ein, sondern beschreibt ausschließlich, wie die bereits registerfeste Modell-Policy (E6, revidiert E16, ergänzt E24/E25) im Manifest sichtbar/maschinenlesbar gemacht wird.

## Konsequenzen

**Positiv:** Tools/Hooks, die das Manifest lesen, können den aktuellen Modell-Routing-Stand programmgestützt einsehen (z. B. für künftige Dispatch-Automation), ohne `policies/model-policy.md` parsen zu müssen; die Projektion macht Drift zwischen Manifest und Policy sichtbar, statt sie stillschweigend zuzulassen.

**Negativ:** Zwei Artefakte (Manifest-Block + `model-policy.md`) müssen bei jeder Modell-Policy-Änderung synchron gehalten werden — ein manuelles Pflegerisiko, bewusst in Kauf genommen für den Nutzen der maschinenlesbaren Projektion.

**Risiko:** Ein veraltetes `modelRouting` im Manifest könnte fälschlich als aktuelle Policy gelesen werden, wenn `model-policy.md` zwischenzeitlich revidiert wurde (z. B. beim Preis-Review 31.08.2026, [ADR-0006](0006-modell-effort-policy.md) Wiedervorlage). Mitigation: dieses ADR benennt `model-policy.md` explizit als bei Konflikt kanonisch; ein Sync-Check bei künftigen Modell-Policy-Revisionen ist empfohlene Praxis, kein automatisierter Zwang dieser Lieferung.

## Verworfene Alternativen

- **`modelRouting` als eigenständige, im Manifest führende Modell-Entscheidung** — verworfen; würde `policies/model-policy.md` und [ADR-0006](0006-modell-effort-policy.md) als kanonische Quelle entwerten und eine zweite Wahrheit schaffen (Anti-Pattern AP1).
- **Kein `modelRouting`-Block im Manifest** — verworfen; der AP1-Plan (Paket P2) verlangt ihn ausdrücklich als maschinenlesbare Sichtbarkeit, u. a. für künftige Automation.
- **Feste Modell-/Effort-Werte für den Elephant im Manifest** — verworfen zugunsten von `profilgebunden`, weil ein fester Wert der Profil-Logik (E26) widerspräche, sobald das aktive Profil wechselt.

## Wiedervorlage

Gebündelt mit der Modell-Policy-Wiedervorlage (**31.08.2026**, Preis-Review, [ADR-0006](0006-modell-effort-policy.md)): Sync-Check zwischen `modelRouting` und `model-policy.md` bei dieser Gelegenheit.
