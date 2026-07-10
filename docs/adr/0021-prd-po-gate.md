# ADR-0021: PRD-PO-Gate vor dem ersten Implementierungs-Dispatch

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR records a provisional Product Owner gate inserted after solution design and readiness, but before the first implementation dispatch: for work at rigor level ≥1 or high classification, the PO must approve a German `prd_<topic>.md` (product rationale — what/why/scope/non-goals/risks/alternatives) before implementation may start; acceptance criteria stay in the English, agent-facing spec rather than being duplicated into the PRD. A true stage-0 fast path (small, product-irrelevant hotfixes) is exempt. The gate is a literal-confirmation checkpoint, not a UI dialog, and a later addendum tightens it further: the PRD must be proactively surfaced as a readable document (not just referenced by repo path), with explicit waiting for the literal approval word — because early practice showed the gate being nominally held without being genuinely read. Status is provisional pending experience from the feature phase; full ADR formalization is deferred to a later phase.

> Agent-Pipeline v0.1.0-draft · Sprint 1 · Stand 2026-07-06

**Status:** provisorisch („testen wir erst mal so", the PO-Direktive 2026-07-05, Tuning-Session) · **Grundlage:** Register E21

## Kontext

Vor Register E21 gab es keinen verbindlichen Produkt-Freigabepunkt zwischen Lösungsdesign und erstem Implementierungs-Dispatch. the PO führte an der Tuning-Session ein PRD-Gate ein, ausdrücklich als Test.

## Entscheidung (E21, wortgetreu)

> PRD-PO-Gate (the PO-Direktive 2026-07-05, Tuning-Session): Nach Lösungs-Design + bestandenem Readiness und VOR dem ersten Implementierungs-Dispatch gibt the PO ein deutsches `prd_<topic>.md` frei — Produkt-Rationale (Was/Warum/Scope/Nicht-Ziele/Risiken/Alternativen), NICHT Akzeptanzkriterien (die bleiben agent-facing englisch in der Spec; PRD/Spec referenzieren einander, keine Doppelung). **Pflicht bei Rigor ≥1 ODER Klasse hoch; echter Stufe-0-Fast-Path entfällt** (kleine Hotfixe ohne Produkt-Review). Freigabe per EL-17a; „freigegeben" = Gate (kein UI-Dialog). Ablage `specs/<task>/prd_<topic>.md`. `sdp_<topic>.md` = optionales Begleitartefakt OHNE Gate (Enterprise-Vorbehalt). Umgesetzt: operating-model §3.2 (Schritt 3b)/§3.1/§3.3, roles/elephant.md EL-19, templates/prd.md, Kickoffs (Commit `6b8b1c3`). Provisorisch („testen wir erst mal so"). ADR-Formalisierung Phase 2. **Nachtrag (the PO-Befund 2026-07-05 abends, R-M14):** Gate gehalten ≠ Gate erfüllt — die Vorlage erfolgt künftig PROAKTIV als LESBARES Dokument aufs Gerät (Repo-Pfad allein ist keine Vorlage), mit explizitem Warten auf das wörtliche „freigegeben"; unterlassene Vorlage = Prozess-Inzident. EL-19 in Bootstrap-1d-Liste + dritte Bestätigungszeile verankert (Commit `fc725c6`)

## Konsequenzen

**Positiv:** Verbindlicher Produkt-Check vor Implementierungskosten; PRD und Spec bleiben getrennt (Produkt-Rationale vs. Akzeptanzkriterien) statt Doppelpflege.

**Negativ:** Zusätzlicher Gate-Schritt vor jedem Rigor-≥1-/Klasse-hoch-Vorhaben; kein echter Stufe-0-Fast-Path mehr für Hotfixe mit Produktrelevanz.

**Risiko:** Gate wird formal gehalten, aber nicht wirklich gelesen („Gate gehalten ≠ Gate erfüllt"). Der Nachtrag reagiert direkt darauf: proaktive lesbare Vorlage + explizites Warten auf das wörtliche „freigegeben".

## Verworfene Alternativen

- **Akzeptanzkriterien ins PRD verlagern statt in die Spec** — verworfen, um Doppelpflege zu vermeiden; PRD/Spec referenzieren einander.
- **Reiner UI-Dialog als Freigabe** — verworfen; „freigegeben" ist ein Gate, kein UI-Mechanismus.

## Wiedervorlage

Formalisierungsstatus provisorisch — Bestätigung/Revision nach Praxiserfahrung der Feature-Phase; kein festes Datum im Register genannt.
