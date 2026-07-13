# ADR-0028: Manifest Approach — `.claude/pipeline.yaml` additive, in-house YAML parser, agents stay in the plugin

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-07, PO plan approval "AP1 TUNING") · **Basis:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` guiding decisions 1/2/4/7, `docs/operating-model.md` §8, `guardrails/security.md` SEC-04

## Context

The Pipeline has so far configured projects exclusively via `.claude/pipeline.json` (calibration layer, `docs/operating-model.md` §8: project, verify command, autonomy, WIP limit, worktree mode, etc.). The AP1 mandate calls for additional, declarative control over phases, gates, security thresholds, model routing, profiles, and governance paths — without touching any of the three already-live project calibrations (`pipeline.json`) and without introducing an npm dependency for YAML parsing (zero-dependency invariant, [SEC-04](../../guardrails/security.md)).

## Decision

1. **`.claude/pipeline.yaml` ADDITIVE** alongside `.claude/pipeline.json`: calibration (`pipeline.json`) stays byte-identical and untouched — a confirmed field comparison (`plugins/pipeline-core/lib/manifest.mjs` header comment) shows zero overlap between `pipeline.json` fields (project/verify/handover/autonomy/branchModel/verification/wipLimit/worktree/claudeMdMaxLines/stakes/constraints/ritualExtensions — calibration concerns) and manifest fields (schema/phases/gates/security/modelRouting/profiles/governance/flags — declarative pipeline-shape concerns). No manifest present → behavior byte-identical to today (pure opt-in).
2. **In-house YAML parser** `yaml-lite.mjs`: a strict block-subset parser (maps/lists/scalars/comments; anchors, `|` block strings, and flow syntax are loudly rejected rather than silently misinterpreted) — preserves the zero-npm-dependency invariant ([SEC-04](../../guardrails/security.md), auditability) for a small, actually-needed grammar. Three-stage validation pipeline: (a) YAML parse (`yaml-lite.mjs`), (b) structural validation against `pipeline-manifest.schema.json` (`schema-lite.mjs`, schema ID `pipeline.manifest.v0`), (c) semantic checks that a plain JSON schema can't express (e.g. `profiles.active` must name a declared profile, `phases[].name` must be unique).
3. **Fail-open as anti-brick default** (mirrors `guard-testpath.mjs`): no manifest present → no-op, behavior stays as today. Fail-closed ONLY when a manifest IS present but invalid (validation step returns `exit 2`, German error message "Field X: expected …, got …"), and in gate checks running in `blocking` mode (see [ADR-0027](0027-gate-philosophy.md)).
4. **Tiny condition grammar** for conditional phases: `always|never|<flag>|!<flag>` — deliberately not a full expression parser; covers the one case actually needed (conditional UI-design phase via `flags.has_ui`).
5. **Agents stay in the plugin** (`plugins/pipeline-core/agents/`), NOT under `.claude/agents/` — a deliberate, openly documented deviation from the original PO mandate wording. Rationale (E1): the plugin IS the central, versioned distribution channel; projects get new/updated agents automatically via the existing plugin binding instead of via an additional, project-locally maintained copy under `.claude/agents/`. A `.claude/agents/` copy would repeat exactly the anti-pattern AP1 is meant to dissolve (copy-paste divergence of central artifacts, `docs/operating-model.md` §1).

## Consequences

**Positive:** a new, declarative control layer with no risk to the three live project calibrations; no new supply-chain dependency (slopsquatting surface stays at zero, [SEC-04](../../guardrails/security.md)); plugin distribution of agents stays consistent with the already-established distribution principle (E1, [ADR-0001](0001-distribution-plugin-marketplace.md)).

**Negative:** an additional, self-maintained YAML parser instead of a standard library — maintenance burden stays with the repo; the deliberately small grammar produces loud errors for any YAML feature outside the block subset (anchors, flow syntax, block strings), constraining manifest authors.

**Risk:** the "agents in the plugin instead of `.claude/agents/`" deviation could be misread as non-fulfillment of the original mandate wording if left undocumented — hence it is named explicitly here rather than implemented silently.

## Rejected alternatives

- **YAML standard library as an npm dependency** — rejected; breaks the zero-dependency invariant ([SEC-04](../../guardrails/security.md)) and opens a new slopsquatting/supply-chain surface for an actually small grammar need.
- **Fold manifest fields into `pipeline.json` instead of additive** — rejected; would have invasively touched the three live project calibrations and blurred the established schema (calibration ≠ declarative pipeline shape).
- **`.claude/agents/` copy as originally mandated** — rejected; repeats anti-pattern AP1 (copy-paste divergence), see rationale above.

## Follow-up

None. Grammar scope is extended on demand (new YAML use case arises), not preemptively.

## Phase-2 authority and failure-mode amendment (2026-07-13)

The original "untouched" and "zero overlap" statements describe the runtime file shapes,
not independent authorship. In a compiler-managed installation, `pipeline.user.yaml` is the
authored intent and `setup.mjs` produces the disjoint `.claude/pipeline.json` and
`.claude/pipeline.yaml` runtime projections. A project that does not use the compiler may
instead author `.claude/pipeline.yaml` directly; it must not mix both ownership modes.

All manifest consumers share one validation authority: parse, schema and semantic checks.
Absence remains an opt-in no-op. A present invalid or unreadable manifest produces a
structured invalid result; the standalone validator and full verify exit 2. Advisory helpers
may deliberately collapse absent/invalid to no active manifest, while enforcement consumers
must use the structured result and their documented fail matrix. `setup.mjs` validates the
complete generated manifest through this same authority before writing any source or runtime
file, preventing partial compiles from an invalid projection.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0028: Manifest-Ansatz — `.claude/pipeline.yaml` additiv, in-house YAML-Parser, Agents bleiben im Plugin

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Leitentscheidungen 1/2/4/7, `docs/operating-model.md` §8, `guardrails/security.md` SEC-04

## Kontext

Die Pipeline konfiguriert Projekte bislang ausschließlich über `.claude/pipeline.json` (Kalibrierungsschicht, `docs/operating-model.md` §8: Projekt, Verify-Kommando, Autonomie, WIP-Limit, Worktree-Modus etc.). Der AP1-Auftrag verlangt zusätzliche, deklarative Steuerung für Phasen, Gates, Security-Schwellen, Modell-Routing, Profile und Governance-Pfade — ohne die drei bereits produktiv laufenden Projekt-Kalibrierungen (`pipeline.json`) anzutasten oder eine npm-Abhängigkeit für YAML-Parsing einzuführen (Zero-Dependency-Invariante, [SEC-04](../../guardrails/security.md)).

## Entscheidung

1. **`.claude/pipeline.yaml` ADDITIV** neben `.claude/pipeline.json`: Kalibrierung (`pipeline.json`) bleibt byte-identisch unangetastet — bestätigter Feldabgleich (`plugins/pipeline-core/lib/manifest.mjs` Kopfkommentar) zeigt Null-Überlappung zwischen `pipeline.json`-Feldern (project/verify/handover/autonomy/branchModel/verification/wipLimit/worktree/claudeMdMaxLines/stakes/constraints/ritualExtensions — Kalibrierungs-Belange) und Manifest-Feldern (schema/phases/gates/security/modelRouting/profiles/governance/flags — deklarative Pipeline-Form-Belange). Kein Manifest → Verhalten byte-identisch zu heute (reines Opt-in).
2. **In-house YAML-Parser** `yaml-lite.mjs`: ein strikter Block-Subset-Parser (Maps/Listen/Skalare/Kommentare; Anchors, `|`-Blockstrings und Flow-Syntax werden mit lauter Fehlermeldung statt stiller Fehlinterpretation abgelehnt) — wahrt die Zero-npm-Dependency-Invariante ([SEC-04](../../guardrails/security.md), Auditierbarkeit) bei kleinem, tatsächlich benötigtem Grammatikumfang. Dreistufige Validierungs-Pipeline: (a) YAML-Parse (`yaml-lite.mjs`), (b) Strukturvalidierung gegen `pipeline-manifest.schema.json` (`schema-lite.mjs`, Schema-ID `pipeline.manifest.v0`), (c) semantische Prüfungen, die ein reines JSON-Schema nicht ausdrücken kann (z. B. `profiles.active` muss ein deklariertes Profil benennen, `phases[].name` muss eindeutig sein).
3. **Fail-open als Anti-Brick-Default** (spiegelt `guard-testpath.mjs`): kein Manifest vorhanden → No-Op, Verhalten bleibt heutig. Fail-closed NUR wenn ein Manifest VORHANDEN, aber invalide ist (Validierungsschritt liefert `exit 2`, deutsche Fehlermeldung „Feld X: erwartet …, erhalten …"), sowie in Gate-Checks im Modus `blocking` (siehe [ADR-0027](0027-gate-philosophy.md)).
4. **Winzige Condition-Grammatik** für bedingte Phasen: `always|never|<flag>|!<flag>` — bewusst kein voller Ausdrucksparser; deckt den einzigen benötigten Fall (konditionale UI-Design-Phase über `flags.has_ui`).
5. **Agents bleiben im Plugin** (`plugins/pipeline-core/agents/`), NICHT unter `.claude/agents/` — bewusste, offen dokumentierte Abweichung vom ursprünglichen the PO-Auftragswortlaut. Begründung (E1): Das Plugin IST der zentrale, versionierte Verteilkanal; Projekte erhalten neue/aktualisierte Agents automatisch durch die bestehende Plugin-Bindung statt durch eine zusätzliche, projektlokal zu pflegende Kopie unter `.claude/agents/`. Eine `.claude/agents/`-Kopie würde exakt das Anti-Pattern AP1 (Copy-Paste-Divergenz zentraler Artefakte, `docs/operating-model.md` §1) wiederholen, das die gesamte Pipeline-Zentralisierung eigentlich auflöst.

## Konsequenzen

**Positiv:** Neue, deklarative Steuerungsebene ohne Risiko für die drei produktiv laufenden Projekt-Kalibrierungen; keine neue Lieferkette-Abhängigkeit (Slopsquatting-Fläche bleibt bei null, [SEC-04](../../guardrails/security.md)); die Plugin-Verteilung von Agents bleibt konsistent mit dem bereits etablierten Verteilprinzip (E1, [ADR-0001](0001-distribution-plugin-marketplace.md)).

**Negativ:** Ein zusätzlicher, selbst gepflegter YAML-Parser statt einer Standardbibliothek — Wartungslast bleibt beim Repo; die bewusst kleine Grammatik erzeugt laute Fehler bei jedem YAML-Feature außerhalb des Block-Subsets (Anchors, Flow-Syntax, Blockstrings), was Autoren beim Verfassen des Manifests einschränkt.

**Risiko:** Die Abweichung „Agents im Plugin statt `.claude/agents/`" könnte als Nichterfüllung des ursprünglichen Auftragswortlauts missverstanden werden, wenn sie nicht sichtbar dokumentiert ist — deshalb hier explizit benannt statt stillschweigend umgesetzt.

## Verworfene Alternativen

- **YAML-Standardbibliothek als npm-Abhängigkeit** — verworfen; bricht die Zero-Dependency-Invariante ([SEC-04](../../guardrails/security.md)) und öffnet eine neue Slopsquatting-/Supply-Chain-Fläche für einen tatsächlich kleinen Grammatikbedarf.
- **Manifest-Felder in `pipeline.json` integrieren statt additiv** — verworfen; hätte die drei produktiv laufenden Projekt-Kalibrierungen invasiv anfassen müssen und das etablierte Schema (Kalibrierung ≠ deklarative Pipeline-Form) vermischt.
- **`.claude/agents/`-Kopie wie ursprünglich beauftragt** — verworfen; wiederholt Anti-Pattern AP1 (Copy-Paste-Divergenz), s. Begründung oben.

## Wiedervorlage

Keine. Grammatikbedarf wird bei Bedarf erweitert (neuer YAML-Anwendungsfall), nicht präventiv.
