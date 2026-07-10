# ADR-0029: File Handoffs & Status — `pipeline-state.json`, Plan Artifacts, Evidence Freshness Instead of Self-Computation

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

## Context

The two new gates ([ADR-0027](0027-gate-philosophy.md)) need deterministic, git-committed state — "has plan approval already been recorded?", "has this push already been approved?" — that can be neither chat memory nor a hand-edited file (exactly the kind of silent, unauditable state change the gates exist to prevent). At the same time, plan artifacts themselves lacked a uniform home.

## Decision

1. **`.claude/pipeline-state.json`** (schema `pipeline.state.v0`) is written **EXCLUSIVELY** through the CLI `harness/scripts/pipeline-state.mjs` — never hand-edited. Subcommands: `set-feature`, `set-phase`, `approve-plan --by <name>`, `revoke-plan --by <name>`, `approve-push --by <name>` (the latter records `forCommit` = current `git rev-parse HEAD`). All `--by` subcommands refuse an empty/missing `--by` (exit 2, German error message) — an unattributed approval would be exactly the unauditable state change this CLI exists to prevent. The file is git-committed and pretty-printed (JSON, `null, 2`) — it IS the audit trail, not just a runtime cache (same philosophy as `.claude/guard-override.log.jsonl`).
2. **Residual risk named (like Guard Override):** the CLI is not technically hardened against agentic misuse (an agent could in theory still edit the file directly, bypassing the CLI). The safeguard is **procedural + git-forensic**: every state change lands as its own attributed commit in history; a freehand edit outside the CLI would be visible in the diff (missing `schema`/`planApproval` pattern, no CLI signature) and thus discoverable in Critic/review — the same construction [ADR-0013](0013-git-guard-union.md)/E11 already established for the Guard Override mechanism.
3. **Plan artifacts** live under `.claude/plans/<feature>.md` (template: `templates/dev-plan.md`) — a uniform, versioned location instead of ad-hoc chat approvals or scattered spec variants.
4. **Gates check EVIDENCE FRESHNESS, never compute themselves** (10-second hook budget): the push-gate hook reads `evidence/verify-latest.json` and (if the manifest declares a security gate) `evidence/security-latest.json` — checking only `exitCode === 0` AND `commit === current HEAD` (`git rev-parse HEAD`). The hook itself NEVER runs `verify` or the security scan — it only reads whether a check already ran and whether that state is still current.
5. **Stop hook `stop-suggest.mjs`** non-blockingly suggests the next phase/gate at the end of each main session turn, fed from manifest + state (`activeFeature.phase` → phase sequence → associated gate). Fail-open on missing/broken manifest or state (silent exit 0) — no noise without a manifest.

## Consequences

**Positive:** a single, git-forensically traceable state writer instead of N possible freehand edits; gates stay within the 10-second hook budget because they never compute, only read; the stop-hook suggestion lowers friction without introducing another blocking mechanism.

**Negative:** one more CLI building block every session must know (`approve-plan`/`approve-push` instead of "just edit the file"); the evidence-freshness check is only as good as the underlying `verify`/security runs — a manipulated evidence artifact produced outside this CLI would go unnoticed by the gates (identical residual risk to QG-03's evidence-writer contract).

**Risk:** as with any Guard-Override-style mechanism, the safeguard stays procedural rather than technically watertight — a deliberate, honestly named trade-off (no "fully secure" overclaim).

## Rejected alternatives

- **Chat/session memory as proof of approval** — rejected; contradicts the core principle "what exists only in chat does not exist" (`docs/operating-model.md` §5.1).
- **Allowing direct freehand edits of `pipeline-state.json`** — rejected; exactly the unauditable state change the CLI exists to prevent.
- **Gates compute `verify`/security scan themselves instead of reading evidence** — rejected; blows the 10-second hook budget and duplicates the gate chain (QG-02, ONE gate command).
- **Mandatory plugin guard against any direct `pipeline-state.json` write** — deferred (no plugin mandate); documented per-project as a recommended `guard-config` addition, not a hard requirement of this delivery.

## Status

Accepted 2026-07-07 (PO plan approval "AP1 TUNING"). Basis: `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` guiding decision 3, [ADR-0012](0012-handover-canonicalization.md), `guardrails/quality-gates.md` QG-03. Open follow-up: a recommended project-specific `guard-config` addition against direct edits of `pipeline-state.json` remains OPEN (no plugin mandate) — see risks section of the AP1 plan.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0029: File-Handoffs & Status — `pipeline-state.json`, Plan-Artefakte, Evidenz-Frische statt Selbstberechnung

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Leitentscheidung 3, [ADR-0012](0012-handover-canonicalization.md), `guardrails/quality-gates.md` QG-03

## Kontext

Die beiden neuen Gates ([ADR-0027](0027-gate-philosophy.md)) brauchen einen deterministischen, git-committeten Zustand — „ist die Plan-Freigabe schon verbucht?", „wurde dieser Push schon genehmigt?" — der weder Chat-Gedächtnis noch eine freihändig editierte Datei sein darf (genau die Art von stiller, unauditierbarer Zustandsänderung, die die Gates verhindern sollen). Zugleich fehlte ein einheitlicher Ablageort für Plan-Artefakte selbst.

## Entscheidung

1. **`.claude/pipeline-state.json`** (Schema `pipeline.state.v0`) wird **AUSSCHLIESSLICH** über die CLI `harness/scripts/pipeline-state.mjs` geschrieben — nie handeditiert. Subcommands: `set-feature`, `set-phase`, `approve-plan --by <name>`, `revoke-plan --by <name>`, `approve-push --by <name>` (Letzteres verbucht `forCommit` = aktueller `git rev-parse HEAD`). Alle `--by`-Subcommands verweigern ein leeres/fehlendes `--by` (Exit 2, deutsche Fehlermeldung) — eine unattribuierte Freigabe wäre exakt die unauditierbare Zustandsänderung, die diese CLI verhindern soll. Die Datei ist git-committet und pretty-printed (JSON, `null, 2`) — sie IST der Audit-Trail, nicht nur ein Laufzeit-Cache (gleiche Philosophie wie `.claude/guard-override.log.jsonl`).
2. **Restrisiko benannt (wie Guard-Override):** Die CLI ist technisch nicht gegen agentischen Missbrauch gehärtet (ein Agent könnte theoretisch die Datei dennoch direkt editieren, außerhalb der CLI). Die Absicherung ist **prozedural + git-forensisch**: jede Zustandsänderung landet als eigener, attribuierter Commit in der Historie; ein Freihand-Edit außerhalb der CLI wäre im Diff sichtbar (fehlendes `schema`/`planApproval`-Muster, keine CLI-Signatur) und damit im Critic-/Review-Blick auffindbar — genau die Konstruktion, die [ADR-0013](0013-git-guard-union.md)/E11 für den Guard-Override-Mechanismus bereits etabliert hat.
3. **Plan-Artefakte** leben unter `.claude/plans/<feature>.md` (Template: `templates/dev-plan.md`) — ein einheitlicher, versionierter Ablageort statt Ad-hoc-Chat-Freigaben oder verstreuter Spec-Varianten.
4. **Gates prüfen EVIDENZ-FRISCHE, nie selbst rechnen** (10-Sekunden-Hook-Budget): Der Push-Gate-Hook liest `evidence/verify-latest.json` und (falls das Manifest eine Security-Gate deklariert) `evidence/security-latest.json` — geprüft wird jeweils nur `exitCode === 0` UND `commit === aktueller HEAD` (`git rev-parse HEAD`). Der Hook führt selbst NIE `verify` oder den Security-Scan aus — er liest nur, ob bereits geprüft wurde und ob dieser Stand noch aktuell ist.
5. **Stop-Hook `stop-suggest.mjs`** schlägt am Ende jedes Haupt-Session-Turns nicht-blockierend die nächste Phase/das nächste Gate vor, gespeist aus Manifest + State (`activeFeature.phase` → Phasenfolge → zugehöriges Gate). Fail-open bei fehlendem/kaputtem Manifest oder State (silent exit 0) — kein Rauschen ohne Manifest.

## Konsequenzen

**Positiv:** Ein einziger, git-forensisch nachvollziehbarer Zustandsschreiber statt N möglicher Freihand-Edits; Gates bleiben im 10-Sekunden-Hook-Budget, weil sie nie selbst rechnen, nur lesen; die Stop-Hook-Suggestion senkt die Reibung, ohne einen weiteren blockierenden Mechanismus einzuführen.

**Negativ:** Ein weiterer CLI-Baustein, den jede Session kennen muss (`approve-plan`/`approve-push` statt „einfach die Datei anpassen"); die Evidenz-Frische-Prüfung ist nur so gut wie die zugrunde liegenden `verify`-/Security-Läufe — ein manipuliertes Evidenz-Artefakt außerhalb dieser CLI bliebe von den Gates unbemerkt (identisches Restrisiko wie bei QG-03s Evidenz-Schreiber-Kontrakt).

**Risiko:** Wie bei jedem Guard-Override-artigen Mechanismus bleibt die Absicherung prozedural statt technisch wasserdicht — bewusst in Kauf genommen und hier wie dort ehrlich benannt (kein „vollständig sicher"-Overclaim).

## Verworfene Alternativen

- **Chat-/Session-Gedächtnis als Freigabe-Nachweis** — verworfen; widerspricht dem Grundprinzip „was nur im Chat existiert, existiert nicht" (`docs/operating-model.md` §5.1).
- **Direktes Freihand-Editieren von `pipeline-state.json` erlauben** — verworfen; genau die unauditierbare Zustandsänderung, die die CLI verhindern soll.
- **Gates berechnen `verify`/Security-Scan selbst statt Evidenz zu lesen** — verworfen; sprengt das 10-Sekunden-Hook-Budget und dupliziert die Gate-Kette (QG-02, EIN Gate-Kommando).
- **Verpflichtender Plugin-Guard gegen jede `pipeline-state.json`-Direktschreibung** — zurückgestellt (kein Plugin-Zwang); je Projekt als empfohlene `guard-config`-Ergänzung dokumentiert, kein hartes Muss dieser Lieferung.

## Wiedervorlage

Empfohlene projektspezifische `guard-config`-Ergänzung gegen Direkt-Edits von `pipeline-state.json`: OFFEN, kein Plugin-Zwang (Risiken-Abschnitt des AP1-Plans).
