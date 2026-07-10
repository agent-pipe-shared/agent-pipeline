# ADR-0030: Governance Layer — advisory Guidelines vs. enforcing Policies, hierarchy Repo > User > Managed

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · AP1 tuning session · as of 2026-07-07

**Status:** accepted (2026-07-07, PO plan approval "AP1 TUNING") · **Basis:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` package P6, `governance/examples/README.md`

## Context

The pipeline is increasingly oriented toward being handed off to third parties (AP1 context). An adopting project/organization needs a place for its own conventions (style guides, naming conventions) AND for binding, partly machine-checkable rules (license allowlists, security policies) — both clearly separated from the pipeline's own infrastructure (`guardrails/*`, `harness/checklists/*`), which continues to govern exclusively HOW the pipeline itself works, not what a hosted project must fulfill.

## Decision

**Two governance categories**, strictly separated (`governance/examples/README.md`):

1. **Guidelines (advisory)** — `governance/…/guidelines/`: numbered principles (layering, naming, error handling, etc.). Deviations are ALLOWED but must be named and justified in the plan artifact — a guideline never blocks a gate by itself. Automatically loaded into the Elephant/Critic context (`pipeline-start`/`critic-review` skills consume the manifest path `governance.guidelines_path`).
2. **Policies (enforcing)** — `governance/…/policies/`: machine-checkable (semgrep rules via `rules_dir`, license allowlist `license-allowlist.json` against `third-party-licenses.json`) AND human-reviewed, but binding (`checklist.md`). A policy violation blocks: for machine-checkable policies the automated security-scan gate fails ([ADR-0027](0027-gate-philosophie.md)); for the non-machine-checkable checklist, the Critic checks off EVERY item BEFORE the push gate is reached — any item marked "NOT MET" is a blocking finding.

**Hierarchy** (mirrors Claude Code's own settings precedence):

1. **Repo** — the project's own `governance/…` directories (or wherever `.claude/pipeline.yaml` points) are the project-specific layer; they override the user level.
2. **User** (`~/.claude/`) — personal preferences apply only where the repo level is silent.
3. **Managed Settings** (Enterprise) — a centrally administered layer that sits ABOVE both Repo and User and cannot be overridden by either — the organization's non-negotiable floor (data protection, license law, security baseline). This repo itself ships NO managed-settings layer — that is a deployment-time concern of the adopting organization.

**Only generic examples in this repo:** exclusively `governance/examples/**` (fictional fixtures: example guidelines, `license-allowlist.json`, `third-party-licenses.example.json`, `semgrep/example-rule.yml`, `checklist.md`) are shipped — real organizational policies of an actually adopting organization stay OUTSIDE this repo (AP2 subject, not part of this session).

**Boundary (dedup-confirmed, `governance/examples/README.md`):** `harness/checklists/*` and `guardrails/*` remain the pipeline's OWN infrastructure (how the pipeline itself works); `governance/examples/**` is the THIRD, independent layer — project-owned governance that a hosted project defines and the pipeline consumes. No mixing of the three layers.

## Consequences

**Positive:** An adopting project gets a clear, generic starting point (copy the directory, delete the example fixtures, enter its own guidelines/policies) without touching the pipeline's own infrastructure; the advisory/enforcing split prevents style questions from accidentally becoming blockers, or conversely binding rules being misread as mere recommendations.

**Negative:** One more consumption path in `pipeline-start`/`critic-review` (governance paths as a required input); the non-machine-checkable checklist still relies on Critic diligence — no technical enforcement that every item is actually checked.

**Risk:** A real organization could accidentally enter real policy content into `governance/examples/` instead of into its own project-specific copy. Mitigation: the naming convention (`examples/`) and the README warning make the fixture character explicit; real content is an AP2 subject.

## Rejected alternatives

- **A single governance category without an advisory/enforcing split** — rejected; blurs exactly the distinction between "should" and "must" that QG-06 (binary gates) already requires at the technical level.
- **Placing governance content directly in `guardrails/*`** — rejected; mixes the pipeline's own infrastructure with project-specific third-party content (dedup principle, see above).
- **Onboarding real organizational policies already in this session** — rejected (out of scope); AP2 is the explicitly designated place for that.

## Status / follow-up

AP2 — integration of real, project-specific governance content for an actually adopting organization.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

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
