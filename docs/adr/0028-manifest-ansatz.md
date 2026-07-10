# ADR-0028: Manifest-Ansatz — `.claude/pipeline.yaml` additiv, in-house YAML-Parser, Agents bleiben im Plugin

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR adds an optional, additive `.claude/pipeline.yaml` manifest for declarative pipeline configuration (phases, gates, security thresholds, model routing, profiles, governance) alongside the existing `.claude/pipeline.json` calibration file, which stays byte-identical and untouched — the two files have zero field overlap, and no manifest present means no behavior change. To parse the YAML without adding an npm dependency (preserving the project's zero-dependency invariant), the decision introduces a small in-house, strict block-subset YAML parser that loudly rejects unsupported syntax (anchors, flow syntax, block strings) rather than silently misinterpreting it; validation is fail-open when no manifest exists but fail-closed when a manifest is present and invalid. Agents continue to be distributed via the plugin (`plugins/pipeline-core/agents/`) rather than duplicated into `.claude/agents/`, to avoid re-introducing copy-paste divergence of centrally versioned artifacts. Status: accepted (2026-07-07).

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Leitentscheidungen 1/2/4/7, `docs/operating-model.md` §8, `guardrails/security.md` SEC-04

## Kontext

Die Pipeline konfiguriert Projekte bislang ausschließlich über `.claude/pipeline.json` (Kalibrierungsschicht, `docs/operating-model.md` §8: Projekt, Verify-Kommando, Autonomie, WIP-Limit, Worktree-Modus etc.). Der AP1-Auftrag verlangt zusätzliche, deklarative Steuerung für Phasen, Gates, Security-Schwellen, Modell-Routing, Profile und Governance-Pfade — ohne die drei bereits produktiv laufenden Projekt-Kalibrierungen (`pipeline.json`) anzutasten oder eine npm-Abhängigkeit für YAML-Parsing einzuführen (Zero-Dependency-Invariante, [SEC-04](../../guardrails/security.md)).

## Entscheidung

1. **`.claude/pipeline.yaml` ADDITIV** neben `.claude/pipeline.json`: Kalibrierung (`pipeline.json`) bleibt byte-identisch unangetastet — bestätigter Feldabgleich (`plugins/pipeline-core/lib/manifest.mjs` Kopfkommentar) zeigt Null-Überlappung zwischen `pipeline.json`-Feldern (project/verify/handover/autonomy/branchModel/verification/wipLimit/worktree/claudeMdMaxLines/stakes/constraints/ritualExtensions — Kalibrierungs-Belange) und Manifest-Feldern (schema/phases/gates/security/modelRouting/profiles/governance/flags — deklarative Pipeline-Form-Belange). Kein Manifest → Verhalten byte-identisch zu heute (reines Opt-in).
2. **In-house YAML-Parser** `yaml-lite.mjs`: ein strikter Block-Subset-Parser (Maps/Listen/Skalare/Kommentare; Anchors, `|`-Blockstrings und Flow-Syntax werden mit lauter Fehlermeldung statt stiller Fehlinterpretation abgelehnt) — wahrt die Zero-npm-Dependency-Invariante ([SEC-04](../../guardrails/security.md), Auditierbarkeit) bei kleinem, tatsächlich benötigtem Grammatikumfang. Dreistufige Validierungs-Pipeline: (a) YAML-Parse (`yaml-lite.mjs`), (b) Strukturvalidierung gegen `pipeline-manifest.schema.json` (`schema-lite.mjs`, Schema-ID `pipeline.manifest.v0`), (c) semantische Prüfungen, die ein reines JSON-Schema nicht ausdrücken kann (z. B. `profiles.active` muss ein deklariertes Profil benennen, `phases[].name` muss eindeutig sein).
3. **Fail-open als Anti-Brick-Default** (spiegelt `guard-testpath.mjs`): kein Manifest vorhanden → No-Op, Verhalten bleibt heutig. Fail-closed NUR wenn ein Manifest VORHANDEN, aber invalide ist (Validierungsschritt liefert `exit 2`, deutsche Fehlermeldung „Feld X: erwartet …, erhalten …"), sowie in Gate-Checks im Modus `blocking` (siehe [ADR-0027](0027-gate-philosophie.md)).
4. **Winzige Condition-Grammatik** für bedingte Phasen: `always|never|<flag>|!<flag>` — bewusst kein voller Ausdrucksparser; deckt den einzigen benötigten Fall (konditionale UI-Design-Phase über `flags.has_ui`).
5. **Agents bleiben im Plugin** (`plugins/pipeline-core/agents/`), NICHT unter `.claude/agents/` — bewusste, offen dokumentierte Abweichung vom ursprünglichen the PO-Auftragswortlaut. Begründung (E1): Das Plugin IST der zentrale, versionierte Verteilkanal; Projekte erhalten neue/aktualisierte Agents automatisch durch die bestehende Plugin-Bindung statt durch eine zusätzliche, projektlokal zu pflegende Kopie unter `.claude/agents/`. Eine `.claude/agents/`-Kopie würde exakt das Anti-Pattern AP1 (Copy-Paste-Divergenz zentraler Artefakte, `docs/operating-model.md` §1) wiederholen, das die gesamte Pipeline-Zentralisierung eigentlich auflöst.

## Konsequenzen

**Positiv:** Neue, deklarative Steuerungsebene ohne Risiko für die drei produktiv laufenden Projekt-Kalibrierungen; keine neue Lieferkette-Abhängigkeit (Slopsquatting-Fläche bleibt bei null, [SEC-04](../../guardrails/security.md)); die Plugin-Verteilung von Agents bleibt konsistent mit dem bereits etablierten Verteilprinzip (E1, [ADR-0001](0001-verteilung-plugin-marketplace.md)).

**Negativ:** Ein zusätzlicher, selbst gepflegter YAML-Parser statt einer Standardbibliothek — Wartungslast bleibt beim Repo; die bewusst kleine Grammatik erzeugt laute Fehler bei jedem YAML-Feature außerhalb des Block-Subsets (Anchors, Flow-Syntax, Blockstrings), was Autoren beim Verfassen des Manifests einschränkt.

**Risiko:** Die Abweichung „Agents im Plugin statt `.claude/agents/`" könnte als Nichterfüllung des ursprünglichen Auftragswortlauts missverstanden werden, wenn sie nicht sichtbar dokumentiert ist — deshalb hier explizit benannt statt stillschweigend umgesetzt.

## Verworfene Alternativen

- **YAML-Standardbibliothek als npm-Abhängigkeit** — verworfen; bricht die Zero-Dependency-Invariante ([SEC-04](../../guardrails/security.md)) und öffnet eine neue Slopsquatting-/Supply-Chain-Fläche für einen tatsächlich kleinen Grammatikbedarf.
- **Manifest-Felder in `pipeline.json` integrieren statt additiv** — verworfen; hätte die drei produktiv laufenden Projekt-Kalibrierungen invasiv anfassen müssen und das etablierte Schema (Kalibrierung ≠ deklarative Pipeline-Form) vermischt.
- **`.claude/agents/`-Kopie wie ursprünglich beauftragt** — verworfen; wiederholt Anti-Pattern AP1 (Copy-Paste-Divergenz), s. Begründung oben.

## Wiedervorlage

Keine. Grammatikbedarf wird bei Bedarf erweitert (neuer YAML-Anwendungsfall), nicht präventiv.
