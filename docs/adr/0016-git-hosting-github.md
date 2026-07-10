# ADR-0016: Git hosting — stay with GitHub

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-03, Checkpoint 2, Q8) · **Basis:** Register E14

## Context

Checkpoint 2 raised the fundamental question of which git-hosting provider to use across all projects (CP2 Q8). The PO decided to stay with GitHub rather than switch — paired with documented mitigations and an ongoing-observation duty via tipping-point triggers in the tooling radar.

## Decision (E14, verbatim)

> Git hosting: stay with GitHub (CP2 Q8, 2026-07-03) — mitigations M1–M8, tipping-point triggers GH-T1–GH-T7 in the tooling radar, re-review 2026-08-31

## Consequences

**Positive:** No migration effort; the existing toolchain (`gh` CLI, three project remotes, plugin-marketplace distribution via GitHub) remains valid.

**Negative:** The risks that prompted the CP2 question are not eliminated by switching, only bounded by mitigations M1–M8 — residual risk remains.

**Risk:** A gradual shift in the baseline (e.g. GitHub pricing/policy changes) could go unnoticed if the tipping-point triggers aren't monitored. Mitigation: GH-T1–GH-T7 are a fixed part of the tooling radar (baseline check, R-KUPP pattern).

## Rejected alternatives

- **Switching git-hosting provider** (e.g. self-hosted/GitLab) — was itself the subject of the CP2-Q8 review; the register documents only the outcome (stay), the detailed trade-off analysis lives in the dated decision memo, not in the register.

## Re-review

**2026-08-31** — bundled with the general pricing review ([ADR-0006](0006-modell-effort-policy.md)); ongoing observation duty for tipping-point triggers GH-T1–GH-T7 in the tooling radar until then.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0016: Git-Hosting — bei GitHub bleiben

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 4 · Stand 2026-07-06

**Status:** akzeptiert (2026-07-03, Checkpoint 2, Q8) · **Grundlage:** Register E14

## Kontext

Checkpoint 2 stellte die Grundsatzfrage nach dem Git-Hosting-Anbieter für alle Projekte (CP2 Q8). the PO entschied, bei GitHub zu bleiben, statt zu wechseln — verbunden mit dokumentierten Mitigations und einer Beobachtungspflicht über Kipp-Trigger im Tooling-Radar.

## Entscheidung (E14, wortgetreu)

> Git-Hosting: bei GitHub bleiben (CP2 Q8, 2026-07-03) — Mitigations M1–M8, Kipp-Trigger GH-T1–GH-T7 im Tooling-Radar, Wiedervorlage 31.08.2026

## Konsequenzen

**Positiv:** Kein Migrationsaufwand; bestehende Toolchain (`gh`-CLI, drei Projekt-Remotes, Plugin-Marketplace-Verteilung über GitHub) bleibt gültig.

**Negativ:** Die Risiken, die die CP2-Frage aufwarf, werden nicht durch einen Wechsel beseitigt, sondern durch Mitigations M1–M8 begrenzt — Restrisiko bleibt bestehen.

**Risiko:** Schleichendes Kippen der Ausgangslage (z. B. Preis-/Policy-Änderungen bei GitHub) bliebe unbemerkt, wenn die Kipp-Trigger nicht beobachtet werden. Mitigation: GH-T1–GH-T7 sind fester Bestandteil des Tooling-Radars (Grundlauf-Prüfung, R-KUPP-Muster).

## Verworfene Alternativen

- **Wechsel des Git-Hostings** (z. B. Self-Hosted/GitLab) — war Gegenstand der CP2-Q8-Prüfung selbst; das Register dokumentiert nur das Ergebnis (bleiben), die Detailabwägung liegt im datierten Entscheidungsmemo, nicht im Register.

## Wiedervorlage

**31.08.2026** — gebündelt mit dem generellen Preis-Review ([ADR-0006](0006-modell-effort-policy.md)); laufende Beobachtungspflicht der Kipp-Trigger GH-T1–GH-T7 im Tooling-Radar bis dahin.
