# The docs, and the order to read them

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

This folder is the pipeline's optional post-setup reference map. For the one-minute
picture, start with the top-level [README](../README.md); to stand up your own copy,
read [`SETUP.md`](../SETUP.md). After setup, use this list as needed.

## Reading order

1. [`overview.md`](overview.md) — the model in one read: how work flows from
   intent to a closed change. **Optional conceptual overview after setup.**
2. [`usage.md`](usage.md) — a day in the pipeline: the concrete, session-by-session
   workflow once you are set up.
3. [`migration.md`](migration.md) — bringing an existing project under the
   pipeline, step by step.
4. [`runtime-boundary.md`](runtime-boundary.md) — what is portable methodology
   versus what is specific to Claude Code.
5. [`deploy/README.md`](deploy/README.md) — the optional Release/Promotion phase:
   the adapter-based deploy guide, relevant only once your project's manifest
   declares a `release` section.

Then, as you need them:

- [`design-decisions.md`](design-decisions.md) — the "why" behind the method: the
  foundational decisions and their rationale.
- [`operating-model.md`](operating-model.md) — the full normative rulebook. The
  authority on conflict; open it when you need the exact rule.

(Formalized decisions live in [`adr/`](adr/) — one record per decision.)

---

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# Die Dokumente und die Reihenfolge zum Lesen

Dieser Ordner ist die optionale Nachschlagekarte der Pipeline nach dem Setup. Für
das Bild in einer Minute beginnst du mit der obersten [README](../README.md); um
eine eigene Kopie aufzusetzen, liest du [`SETUP.md`](../SETUP.md). Danach nutzt du
diese Liste nach Bedarf.

## Lesereihenfolge

1. [`overview.md`](overview.md) — das Modell in einem Durchgang: wie eine
   Änderung von der ersten Absicht bis zum Abschluss läuft. **Optionale
   konzeptionelle Übersicht nach dem Setup.**
2. [`usage.md`](usage.md) — ein Tag in der Pipeline: der konkrete Ablauf,
   Sitzung für Sitzung, sobald alles eingerichtet ist.
3. [`migration.md`](migration.md) — ein bestehendes Projekt Schritt für Schritt
   unter die Pipeline bringen.
4. [`runtime-boundary.md`](runtime-boundary.md) — was übertragbare Methodik ist
   und was spezifisch für Claude Code.
5. [`deploy/README.md`](deploy/README.md) — die optionale Release/Promotion-Phase:
   der adapter-basierte Deploy-Guide, relevant erst, sobald das Manifest deines
   Projekts einen `release`-Abschnitt erklärt.

Danach, je nach Bedarf:

- [`design-decisions.md`](design-decisions.md) — das „Warum“ hinter der Methode:
  die grundlegenden Entscheidungen und ihre Begründung.
- [`operating-model.md`](operating-model.md) — das vollständige, verbindliche
  Regelwerk. Bei Widerspruch die maßgebliche Instanz; öffne es, wenn du die
  genaue Regel brauchst.

(Formalisierte Entscheidungen liegen in [`adr/`](adr/) — ein Eintrag pro
Entscheidung.)

---

Die deutsche Fassung ist eine Übersetzung des englischen Originals.
