# Backlog — Agent Pipeline

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Human-facing process documentation (ADR-0011) — the item content itself is also German (backlog item prose); frontmatter field names and item file structure (`backlog/items/TEMPLATE.md`) are English.

## Purpose

The backlog is the only place where improvements, observations, and open questions about the pipeline itself get **versioned** — never left only in a session's chat history (principle P2/§5.1 in [`docs/operating-model.md`](../docs/operating-model.md)). It is the concrete implementation of the feedback loop from [`docs/operating-model.md` §7](../docs/operating-model.md#7-feedback-loop).

## Item types

Every item carries exactly one type in the frontmatter field `type`:

| Type | Meaning | Typical source |
|---|---|---|
| `workflow-improvement` | Improvement or clarification proposal for the pipeline process itself — including sharpening open ADR criteria and calibration work ahead of a migration | Elephant close-retro (`/close`), project experience, open ADR follow-up |
| `tooling-radar` | Result of a radar run or an ADR follow-up from the tooling-radar contract | monthly radar run ([`policies/tooling-policy.md` §4](../policies/tooling-policy.md)) |
| `defect` | Gap, contradiction, or drift in an existing pipeline artifact (docs contradict the ruleset, guardrail has a hole) | Critic finding, drift check, self-observation |
| `idea` | Immature proposal without a worked-out case — prioritization and elaboration still pending | spontaneous observation, discussion with the PO |

`workflow-improvement` and `tooling-radar` are the only types operating-model.md and tooling-policy.md already name explicitly ([`docs/operating-model.md` §7](../docs/operating-model.md), [`policies/tooling-policy.md` §4 R1](../policies/tooling-policy.md)); `defect` and `idea` extend the taxonomy with the two cases "something is broken" and "not yet a mature position" — neither was anchored anywhere before.

## Storage & format

- One item = one file under `backlog/items/`, naming scheme `YYYY-MM-DD-short-german-slug.md` (date = `created`, not a due date).
- Structure and mandatory frontmatter: [`backlog/items/TEMPLATE.md`](items/TEMPLATE.md) — required fields `type` / `status` / `created` / `source`; optional fields (e.g. `due` for scheduled follow-ups) are marked as such in the template.
- Items are **never deleted**, only progressed in status (append-only, like HISTORY files, cf. [`docs/operating-model.md` §6](../docs/operating-model.md#6-staffelstab--handover-e10-auflage-a9)) — rejected or completed items stay in place with their rationale.

### Status lifecycle

`new` → (`accepted` | `deferred` | `rejected`) → `done` (only after `accepted`)

- **new** — created, not yet triaged.
- **accepted** — accepted, assigned to a phase/release (noted in the item).
- **deferred** — deferred, with a condition/point in time for the next review.
- **rejected** — rejected, rationale is mandatory and stays in the item.
- **done** — implemented; reference to the implementing commit/ADR/PR added.

## Triage rules

Per [`docs/operating-model.md` §7](../docs/operating-model.md#7-feedback-loop): triage is owned by the **Elephant of the next pipeline session** (not the Goldfish who created the item — separation of proposal and decision).

1. Review all items with `status: new` (at a natural session/phase boundary, not mid-execution).
2. Decide per item: **accept** (note phase/release in the item) / **reject** (rationale in the item, `status: rejected`) / **defer** (`status: deferred`, state the condition).
3. Merge duplicates: the newer item points to the older one (`merged-into: <filename>`), `status: rejected` with rationale "duplicate of …".
4. When scope is unclear (architecture/guardrail impact, cost, irreversibility): the PO decides, not the Elephant alone (operating-model §2.1).
5. The triage decision is documented **in the item itself** (section "Triage" in the template) — never only verbally or in chat.

## Release cycle (SHA phase)

As long as the pipeline is versioned in the SHA phase ([ADR-0002](../docs/adr/0002-versioning-sha-then-semver.md)), **every commit to `main` propagates immediately** to the bound projects — there is no bundled release step in between. This makes **triage itself the actual release gate**: an accepted item that gets implemented and merged takes effect immediately on every machine/project that next refreshes. From the SemVer phase onward, bundled releases with a CHANGELOG entry are added (the switchover criterion is documented as its own backlog item).

## Close-retro

Every completed project session ends (part of the `/close` ritual) with a **retro written by the session Elephant itself** on the question "What should the pipeline do better next time?". The answer is either a concrete backlog item (usually `type: workflow-improvement`) or a transfer item to the pipeline Elephant, or a deliberate, explicitly noted "nothing" — silence is not a valid answer ([`docs/operating-model.md` §7](../docs/operating-model.md#7-feedback-loop)). **The PO is no longer asked via a ritual question**; he submits his own observations separately through his own channel.

## Tooling radar (special case)

The tooling radar has its own, already fully specified contract in [`policies/tooling-policy.md` §4](../policies/tooling-policy.md) (R1–R5): monthly interval, fixed anchor (first `/close` of a calendar month), fixed review sources, output contract (What's new / affected rule / recommendation `review`|`adopt`|`ignore`), zero-item obligation for a run with no findings, and a special rule for ADR follow-ups. This section only points there, to avoid drift between two descriptions of the same process — `policies/tooling-policy.md` is authoritative.

## OPEN

- OPEN (Phase 4): the `/close` skill (close-block) does not yet automate the triage reminder. The radar catch-up rule is anchored as a check step "tooling radar due?" in the close-block skill (step 7) and in `harness/checklists/session-close.md`; a standalone `/radar` skill remains open.
- Schema format for **calibration files** is decided (shipped with the plugin): JSON (`.claude/pipeline.json`, [`docs/operating-model.md` §8](../docs/operating-model.md#8-projekt-kalibrierungsschicht)). Backlog items deliberately stay Markdown+frontmatter — they are human-readable process artifacts, not skill calibration.

## References

- [`docs/operating-model.md` §7](../docs/operating-model.md) — feedback loop (source of the triage and retro rules)
- [`policies/tooling-policy.md` §4](../policies/tooling-policy.md) — tooling-radar contract R1–R5
- [`policies/model-policy.md` MP-20/MP-21](../policies/model-policy.md) — cost telemetry, price-review follow-up
- [`docs/adr/0002-versioning-sha-then-semver.md`](../docs/adr/0002-versioning-sha-then-semver.md) — SHA phase, SemVer follow-up

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

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

Solange die Pipeline in der SHA-Phase versioniert wird ([ADR-0002](../docs/adr/0002-versioning-sha-then-semver.md)), propagiert **jeder Commit auf `main` sofort** an die gebundenen Projekte — es gibt keinen gebündelten Release-Schritt dazwischen. Das macht die **Triage selbst zum eigentlichen Release-Gate**: Ein angenommenes Item, das umgesetzt und gemerged wird, wirkt sofort auf allen Maschinen/Projekten, die zum nächsten Zeitpunkt refreshen. Ab der SemVer-Phase kommen gebündelte Releases mit CHANGELOG-Eintrag dazu (das Umstiegskriterium wird als eigenes Backlog-Item dokumentiert).

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
- [`docs/adr/0002-versioning-sha-then-semver.md`](../docs/adr/0002-versioning-sha-then-semver.md) — SHA-Phase, SemVer-Wiedervorlage
