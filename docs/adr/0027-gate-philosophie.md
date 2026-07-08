# ADR-0027: Gate-Philosophie — genau 2 blockierende Human-Gates, hook-durchgesetzt, Manifest-Modi als Kalibrierung

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Leitentscheidung 5, [ADR-0017](0017-push-policy-standing-approval.md), [ADR-0021](0021-prd-po-gate.md), `guardrails/quality-gates.md` QG-06

## Kontext

Die Pipeline kennt bereits zwei Human-Gate-Vorläufer: das PRD-PO-Gate ([ADR-0021](0021-prd-po-gate.md), Schritt 3b) und die Push-Freigabe ([ADR-0017](0017-push-policy-standing-approval.md), in diesem Repo standing-approved). Beide liefen bisher rein prozessual (Prosa/Prüfweise), nie technisch durchgesetzt. Zugleich führt das neue Manifest (`.claude/pipeline.yaml`, [ADR-0028](0028-manifest-ansatz.md)) je Gate einen `mode` (`blocking|warn|off`) ein — das kollidiert auf den ersten Blick mit `guardrails/quality-gates.md` QG-06 („Gates sind binär; warn-only braucht ein Ablaufdatum"). Dieser Konflikt ist im AP1-Plan bewusst benannt (Leitentscheidung 5) und wird hier aufgelöst.

## Entscheidung

**Genau zwei blockierende Human-Gates** in der Pipeline, deterministisch durch Hooks durchgesetzt statt durch Prosa-Anweisung:

1. **Dev-Plan-Gate** (`guard-devplan.mjs`) — absorbiert/verstärkt das E21-PRD-Gate: PRD und Plan werden zusammen vorgelegt; „freigegeben" wird deterministisch verbucht via `node harness/scripts/pipeline-state.mjs approve-plan --by <name>` (Grundlage des Hooks, `docs/operating-model.md` §3.2 Schritt 3b). Ein Edit/Write gegen einen nicht-exemptierten Pfad blockt, solange eine aktive Feature (`activeFeature`) noch keine `planApproved: true` trägt.
2. **Push-Gate** (`guard-push.mjs`) — prüft Evidenz-Frische (`evidence/verify-latest.json` + ggf. `evidence/security-latest.json`: `exitCode 0` UND `commit == HEAD`) sowie die Approval-Bedingung. In DIESEM Repo ist die Push-Human-Approval `standing-approved` ([ADR-0017](0017-push-policy-standing-approval.md)/E15) — das Default-Template für neue Projekte setzt `required`.

**Schritt-9-Human-Gate** (Abnahme der Erledigt-Meldung, `docs/operating-model.md` §3.2) bleibt **nicht-blockierend** (🟡-Merge v2 unverändert) — es ist kein dritter blockierender Gate-Typ, sondern die bestehende Abnahme-Semantik.

**Auflösung des QG-06-Konflikts:** Die Manifest-Gate-Modi `blocking|warn|off` sind **PROJEKT-Kalibrierung**, keine Aufweichung des binären Gate-Prinzips. QG-06 verlangt „binär, nie warn-only ohne Verfallsdatum" für EIN gegebenes Gate in EINEM gegebenen Projektzustand — das Manifest macht diesen Zustand explizit und dokumentiert statt ihn stillschweigend verfallen zu lassen (dokumentierte Konfiguration ≠ stiller Verfall, Anti-Pattern AP7). `mode: warn` verlangt zusätzlich einen begründeten Kommentar direkt im Manifest (kein `warn` ohne Begründung, spiegelt QG-06s Pflichtfelder Grund/Owner/Ablaufdatum in schlankerer Form für die Manifest-Ebene).

## Konsequenzen

**Positiv:** Aus zwei prozessualen Absichtserklärungen werden zwei technisch erzwungene Gates — ein Edit vor Plan-Freigabe oder ein Push mit veralteter/roter Evidenz ist jetzt ein Hook-Block (exit 2), nicht mehr nur ein Briefing-Verbot, das ein Goldfish übersehen könnte. Der QG-06-Konflikt ist sauber aufgelöst statt stillschweigend ignoriert.

**Negativ:** Zusätzliche Hook-Komplexität (zwei neue PreToolUse-Guards); ein invalides oder fehlkonfiguriertes Manifest kann im Fehlerfall zu WARN statt BLOCK führen (bewusst fail-open, [ADR-0028](0028-manifest-ansatz.md)).

**Risiko:** `mode: warn` könnte als bequemer Dauerzustand missbraucht werden, wenn die Begründungspflicht nicht durchgesetzt wird. Mitigation: Critic-Checkliste flankiert (`governance`-Policies, [ADR-0030](0030-governance-layer.md)); QG-06 bleibt in `guardrails/quality-gates.md` die kanonische Regel, dieses ADR ist nur ihre Anwendung auf die Manifest-Ebene.

## Verworfene Alternativen

- **Mehr als zwei blockierende Human-Gates** (z. B. je Paket ein eigenes Gate) — verworfen: the PO-Direktive verlangt ausdrücklich „genau zwei", zusätzliche Gates würden den Automode-Durchsatz gegen den in [ADR-0017](0017-push-policy-standing-approval.md) etablierten Grundsatz ausbremsen.
- **QG-06 wegen der Manifest-Modi aufweichen (warn/off als gleichwertige Dauerzustände)** — ausdrücklich verworfen; die Modi bleiben Kalibrierung mit Begründungspflicht, kein Freibrief für stillen Verfall.

## Wiedervorlage

Keine. Erste Live-Probe der beiden Gate-Hooks: W-WIRE-Welle des AP1-Plans (`hooks.json`-Verdrahtung).
