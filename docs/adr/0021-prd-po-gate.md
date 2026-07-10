# ADR-0021: PRD-PO Gate Before the First Implementation Dispatch

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** provisional ("let's test it this way for now", PO directive 2026-07-05, tuning session) · **Basis:** Register E21

## Context

Before Register E21 there was no binding product sign-off point between solution design and the first implementation dispatch. The PO introduced a PRD gate at the tuning session, explicitly as a trial.

## Decision (E21, verbatim in intent)

After solution design and passed readiness, and BEFORE the first implementation dispatch, the PO approves a German `prd_<topic>.md` — product rationale (what/why/scope/non-goals/risks/alternatives), NOT acceptance criteria (those stay agent-facing English in the spec; PRD and spec reference each other, no duplication). **Mandatory when rigor ≥1 OR classification high; a true stage-0 fast path no longer applies** (only small hotfixes without product relevance are exempt). Approval via EL-17a; "approved" is a gate, not a UI dialog. Filed at `specs/<task>/prd_<topic>.md`. `sdp_<topic>.md` is an optional companion artifact WITHOUT a gate (enterprise reservation). Implemented in: operating-model §3.2 (step 3b)/§3.1/§3.3, `roles/elephant.md` EL-19, `templates/prd.md`, kickoffs (commit `6b8b1c3`). Provisional ("let's test it this way for now"); full ADR formalization deferred to Phase 2.

**Addendum (PO finding 2026-07-05 evening, R-M14):** gate held ≠ gate fulfilled — the draft must henceforth be surfaced PROACTIVELY as a READABLE document on the device (a repo path alone is not a valid presentation), with explicit waiting for the literal word "approved"; a failure to present it counts as a process incident. EL-19 anchored in the bootstrap 1d list plus a third confirmation line (commit `fc725c6`).

## Consequences

**Positive:** binding product check before implementation cost is incurred; PRD and spec stay separate (product rationale vs. acceptance criteria) instead of duplicated maintenance.

**Negative:** an extra gate step before every rigor-≥1/classification-high effort; no true stage-0 fast path left for hotfixes with product relevance.

**Risk:** the gate gets held formally but isn't actually read ("gate held ≠ gate fulfilled"). The addendum responds directly to this: proactive readable presentation plus explicit waiting for the literal word "approved".

## Rejected alternatives

- **Moving acceptance criteria into the PRD instead of the spec** — rejected to avoid duplicated maintenance; PRD and spec reference each other.
- **A pure UI dialog as approval** — rejected; "approved" is a gate, not a UI mechanism.

## Status / follow-up

Formalization status provisional — confirmation/revision after practical experience from the feature phase; no fixed date named in the register.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0021: PRD-PO-Gate vor dem ersten Implementierungs-Dispatch

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
