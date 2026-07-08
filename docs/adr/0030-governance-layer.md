# ADR-0030: Governance-Layer — advisory Guidelines vs. enforcing Policies, Hierarchie Repo > User > Managed

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Paket P6, `governance/examples/README.md`

## Kontext

Die Pipeline richtet sich zunehmend auf Weitergabe an Dritte aus (AP1-Kontext). Ein adoptierendes Projekt/Unternehmen braucht einen Ort für eigene Konventionen (Styleguides, Namenskonventionen) UND für verbindliche, teils maschinell prüfbare Regeln (Lizenz-Allowlists, Security-Policies) — beides klar getrennt von der Pipeline-eigenen Infrastruktur (`guardrails/*`, `harness/checklists/*`), die weiterhin ausschließlich regelt, WIE die Pipeline selbst arbeitet, nicht was ein gehostetes Projekt erfüllen muss.

## Entscheidung

**Zwei Governance-Kategorien**, strikt getrennt (`governance/examples/README.md`):

1. **Guidelines (advisory)** — `governance/…/guidelines/`: nummerierte Prinzipien (Layering, Naming, Error-Handling etc.). Abweichungen sind ERLAUBT, müssen aber im Plan-Artefakt benannt und begründet werden — eine Guideline blockt nie selbst ein Gate. Wird automatisch in den Elephant-/Critic-Kontext geladen (`pipeline-start`/`critic-review`-Skills konsumieren den Manifest-Pfad `governance.guidelines_path`).
2. **Policies (enforcing)** — `governance/…/policies/`: maschinell prüfbar (semgrep-Regeln via `rules_dir`, Lizenz-Allowlist `license-allowlist.json` gegen `third-party-licenses.json`) UND menschlich geprüft, aber verbindlich (`checklist.md`). Ein Policy-Verstoß blockt: für maschinell prüfbare Policies schlägt das automatisierte Security-Scan-Gate fehl ([ADR-0027](0027-gate-philosophie.md)); für die nicht-maschinell prüfbare Checkliste hakt der Critic JEDEN Punkt ab, BEVOR das Push-Gate erreicht wird — jeder Punkt „NICHT ERFÜLLT" ist ein blockierender Befund.

**Hierarchie** (spiegelt Claude Codes eigene Settings-Präzedenz):

1. **Repo** — die projekteigenen `governance/…`-Verzeichnisse (bzw. wohin `.claude/pipeline.yaml` zeigt) sind die projektspezifische Schicht; sie überschreiben die User-Ebene.
2. **User** (`~/.claude/`) — persönliche Präferenzen, gelten nur, wo die Repo-Ebene schweigt.
3. **Managed Settings** (Enterprise) — zentral administrierte Ebene, sitzt ÜBER Repo UND User und ist von KEINER der beiden überschreibbar — die nicht verhandelbare Untergrenze der Organisation (Datenschutz, Lizenzrecht, Security-Baseline). Dieses Repo liefert selbst KEINE Managed-Settings-Schicht — das ist ein Deployment-Zeit-Belang der adoptierenden Organisation.

**Nur generische Beispiele in diesem Repo:** Ausschließlich `governance/examples/**` (fiktive Fixtures: Beispiel-Guidelines, `license-allowlist.json`, `third-party-licenses.example.json`, `semgrep/example-rule.yml`, `checklist.md`) werden ausgeliefert — echte Unternehmensrichtlinien einer tatsächlich adoptierenden Organisation bleiben AUSSERHALB dieses Repos (AP2-Gegenstand, nicht Teil dieser Session).

**Abgrenzung (dedup-bestätigt, `governance/examples/README.md`):** `harness/checklists/*` und `guardrails/*` bleiben die Pipeline-EIGENE Infrastruktur (wie die Pipeline selbst arbeitet); `governance/examples/**` ist die DRITTE, eigenständige Schicht — projekteigene Governance, die ein gehostetes Projekt definiert und die Pipeline konsumiert. Keine Vermischung der drei Schichten.

## Konsequenzen

**Positiv:** Ein adoptierendes Projekt bekommt einen klaren, generischen Startpunkt (Verzeichnis kopieren, Beispiel-Fixtures löschen, eigene Guidelines/Policies eintragen) ohne die Pipeline-eigene Infrastruktur anzufassen; die Zweiteilung advisory/enforcing verhindert, dass Stilfragen versehentlich zu Blockern werden oder umgekehrt verbindliche Regeln als bloße Empfehlung missverstanden werden.

**Negativ:** Ein weiterer Konsumpfad in `pipeline-start`/`critic-review` (Governance-Pfade als Pflicht-Input); die nicht-maschinelle Checkliste bleibt auf Critic-Sorgfalt angewiesen — kein technischer Zwang, jeden Punkt tatsächlich zu prüfen.

**Risiko:** Eine reale Organisation könnte versehentlich echte Policy-Inhalte in `governance/examples/` statt in ihre eigene, projektspezifische Kopie eintragen. Mitigation: Namenskonvention (`examples/`) und die README-Warnung machen den Fixture-Charakter explizit; echte Inhalte sind AP2-Gegenstand.

## Verworfene Alternativen

- **Eine einzige Governance-Kategorie ohne advisory/enforcing-Trennung** — verworfen; verwischt genau den Unterschied zwischen „sollte" und „muss", den QG-06 (binäre Gates) für die technische Ebene bereits fordert.
- **Governance-Inhalte direkt in `guardrails/*` ablegen** — verworfen; vermischt Pipeline-eigene Infrastruktur mit projektspezifischem Fremdinhalt (Dedup-Grundsatz, s. o.).
- **Reale Unternehmensrichtlinien bereits in dieser Session einpflegen** — verworfen (out of scope); AP2 ist der explizit vorgesehene Ort dafür.

## Wiedervorlage

AP2 — Einbindung realer, projektspezifischer Governance-Inhalte für eine tatsächlich adoptierende Organisation.
