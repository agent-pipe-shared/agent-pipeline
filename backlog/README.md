# Backlog — Agent-Pipeline

> Menschengerichtete Prozess-Doku (ADR-0011) — der Item-Inhalt selbst ist ebenfalls Deutsch (backlog-Items-Prosa), Frontmatter-Feldnamen und Item-Dateistruktur (`backlog/items/TEMPLATE.md`) sind Englisch.

## Zweck

Der Backlog ist der einzige Ort, an dem Verbesserungen, Beobachtungen und offene Fragen zur Pipeline selbst **versioniert** landen — nie nur im Chat-Verlauf einer Session (Grundsatz P2/§5.1 in [`docs/operating-model.md`](../docs/operating-model.md)). Er ist die konkrete Umsetzung des Feedback-Loops aus [`docs/operating-model.md` §7](../docs/operating-model.md#7-feedback-loop).

## Item-Typen

Jedes Item trägt genau einen Typ im Frontmatter-Feld `type`:

| Typ | Bedeutung | Typische Quelle |
|---|---|---|
| `workflow-improvement` | Verbesserungs- oder Präzisierungsvorschlag am Pipeline-Prozess selbst — inkl. Nachschärfen offener ADR-Kriterien und Kalibrierungsarbeit vor einer Migration | Elephant-Close-Retro (`/close`), Projekt-Erfahrung, offene ADR-Wiedervorlage |
| `tooling-radar` | Ergebnis eines Radar-Laufs oder eine ADR-Wiedervorlage aus dem Tooling-Radar-Kontrakt | monatlicher Radar-Lauf ([`policies/tooling-policy.md` §4](../policies/tooling-policy.md)) |
| `defect` | Lücke, Widerspruch oder Drift in einem bestehenden Pipeline-Artefakt (Doku widerspricht Regelwerk, Guardrail lückenhaft) | Critic-Befund, Drift-Check, Selbstbeobachtung |
| `idea` | Unausgereifter Vorschlag ohne ausgearbeiteten Antrag — Priorisierung und Ausformulierung stehen noch aus | spontane Beobachtung, Diskussion mit the PO |

`workflow-improvement` und `tooling-radar` sind die einzigen Typen, die operating-model.md bzw. tooling-policy.md bereits namentlich vorsehen ([`docs/operating-model.md` §7](../docs/operating-model.md), [`policies/tooling-policy.md` §4 R1](../policies/tooling-policy.md)); `defect` und `idea` ergänzen die Taxonomie um die beiden Fälle „etwas ist kaputt" und „noch keine ausgereifte Position" — beide waren bisher nirgends verankert.

## Ablage & Format

- Ein Item = eine Datei unter `backlog/items/`, Namensschema `YYYY-MM-DD-kurzer-deutscher-slug.md` (Datum = `created`, nicht Fälligkeitsdatum).
- Struktur und Pflicht-Frontmatter: [`backlog/items/TEMPLATE.md`](items/TEMPLATE.md) — Pflichtfelder `type` / `status` / `created` / `source`; optionale Felder (z. B. `due` für terminierte Wiedervorlagen) sind im Template als solche markiert.
- Items werden **nie gelöscht**, nur im Status fortgeschrieben (Append-Charakter wie bei HISTORY-Dateien, vgl. [`docs/operating-model.md` §6](../docs/operating-model.md#6-staffelstab--handover-e10-auflage-a9)) — abgelehnte oder erledigte Items bleiben mit Begründung liegen.

### Status-Lebenszyklus

`new` → (`accepted` | `deferred` | `rejected`) → `done` (nur nach `accepted`)

- **new** — angelegt, noch nicht triagiert.
- **accepted** — angenommen, einer Phase/einem Release zugeordnet (im Item vermerkt).
- **deferred** — zurückgestellt, mit Bedingung/Zeitpunkt für die nächste Prüfung.
- **rejected** — abgelehnt, Begründung ist Pflicht und bleibt im Item stehen.
- **done** — umgesetzt; Referenz auf den umsetzenden Commit/ADR/PR ergänzt.

## Triage-Regeln

Nach [`docs/operating-model.md` §7](../docs/operating-model.md#7-feedback-loop): Die Triage übernimmt der **Elephant der nächsten Pipeline-Session** (nicht der Goldfish, der ein Item anlegt — Trennung von Vorschlag und Entscheid).

1. Alle Items mit `status: new` sichten (an einer natürlichen Session-/Phasengrenze, nicht mitten in einer Ausführungsaufgabe).
2. Je Item entscheiden: **annehmen** (Phase/Release im Item vermerken) / **ablehnen** (Begründung im Item, `status: rejected`) / **zurückstellen** (`status: deferred`, Bedingung nennen).
3. Duplikate mergen: Das jüngere Item verweist auf das ältere (`merged-into: <dateiname>`), `status: rejected` mit Begründung „Duplikat von …".
4. Bei Unklarheit über Tragweite (Architektur-/Guardrail-Bezug, Kosten, Irreversibles): the PO entscheidet, nicht der Elephant allein (operating-model §2.1).
5. Die Triage-Entscheidung wird **im Item selbst** dokumentiert (Abschnitt „Triage" im Template) — nie nur mündlich oder im Chat vermerkt.

## Release-Zyklus (SHA-Phase)

Solange die Pipeline in der SHA-Phase versioniert wird ([ADR-0002](../docs/adr/0002-versionierung-sha-dann-semver.md)), propagiert **jeder Commit auf `main` sofort** an die gebundenen Projekte — es gibt keinen gebündelten Release-Schritt dazwischen. Das macht die **Triage selbst zum eigentlichen Release-Gate**: Ein angenommenes Item, das umgesetzt und gemerged wird, wirkt sofort auf allen Maschinen/Projekten, die zum nächsten Zeitpunkt refreshen. Ab der SemVer-Phase kommen gebündelte Releases mit CHANGELOG-Eintrag dazu (das Umstiegskriterium wird als eigenes Backlog-Item dokumentiert).

## Close-Retro

Jede abgeschlossene Projekt-Session endet (Teil des `/close`-Rituals) mit einem **vom Session-Elephant selbst verfassten Retro** zur Frage „Was soll die Pipeline nächstes Mal besser machen?". Die Antwort ist entweder ein konkretes Backlog-Item (meist `type: workflow-improvement`) bzw. ein Transfer-Item an den Pipeline-Elephant, oder ein bewusstes, explizit notiertes „nichts" — Schweigen ist keine gültige Antwort ([`docs/operating-model.md` §7](../docs/operating-model.md#7-feedback-loop)). **the PO wird dazu nicht mehr per Ritualfrage abgefragt**; er reicht eigene Beobachtungen nebenbei über seinen eigenen Kanal ein.

## Tooling-Radar (Sonderfall)

Der Tooling-Radar hat einen eigenen, bereits vollständig spezifizierten Kontrakt in [`policies/tooling-policy.md` §4](../policies/tooling-policy.md) (R1–R5): monatliches Intervall, fester Anker (erster `/close` eines Kalendermonats), feste Prüfquellen, Output-Kontrakt (Was ist neu / betroffene Regel / Empfehlung `prüfen`\|`adoptieren`\|`ignorieren`), Null-Item-Pflicht bei ergebnislosem Lauf, und eine Sonderregel für ADR-Wiedervorlagen. Dieser Abschnitt verweist nur darauf, um Drift zwischen zwei Beschreibungen desselben Prozesses zu vermeiden — maßgeblich ist `policies/tooling-policy.md`.

## OFFEN

- OFFEN (Phase 4): Der `/close`-Skill (close-block) schreibt die Triage-Erinnerung noch nicht automatisiert. Die Radar-Nachhol-Regel ist als Prüfschritt „Tooling-Radar fällig?" im close-block-Skill (Schritt 7) und in `harness/checklists/session-close.md` verankert; der eigenständige `/radar`-Skill bleibt offen.
- Schema-Format für **Kalibrierungsdateien** ist entschieden (mit der Plugin-Lieferung): JSON (`.claude/pipeline.json`, [`docs/operating-model.md` §8](../docs/operating-model.md#8-projekt-kalibrierungsschicht)). Backlog-Items bleiben bewusst Markdown+Frontmatter — sie sind menschenlesbare Prozess-Artefakte, keine Skill-Kalibrierung.

## Verweise

- [`docs/operating-model.md` §7](../docs/operating-model.md) — Feedback-Loop (Quelle der Triage- und Retro-Regeln)
- [`policies/tooling-policy.md` §4](../policies/tooling-policy.md) — Tooling-Radar-Kontrakt R1–R5
- [`policies/model-policy.md` MP-20/MP-21](../policies/model-policy.md) — Kosten-Telemetrie, Preis-Review-Wiedervorlage
- [`docs/adr/0002-versionierung-sha-dann-semver.md`](../docs/adr/0002-versionierung-sha-dann-semver.md) — SHA-Phase, SemVer-Wiedervorlage
