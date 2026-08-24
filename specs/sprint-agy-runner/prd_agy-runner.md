<!-- po-language: de -->

# PRD — Antigravity CLI (`agy`) als vollwertiger 3. Runner im Agent-Pipeline-Ökosystem

> **Product Review Document (PO-Gate)**
> **Feature ID:** `sprint-agy-runner`
> **Profile / Rigor / Risk:** Epic / Rigor 2 / Klasse Hoch (Kerninfrastruktur & Runner-Integration)
> **Status:** `entwurf` (wartet auf PO-Freigabe zur ersten Implementierungs-Wave)
> **Referenzen:** Issues [#69](https://github.com/agent-pipe-shared/agent-pipeline/issues/69), [#92](https://github.com/agent-pipe-shared/agent-pipeline/issues/92), [#15](https://github.com/agent-pipe-shared/agent-pipeline/issues/15); ADRs [0006](../../docs/adr/0006-model-effort-policy.md), [0036](../../docs/adr/0036-runner-honest-profiles-v2.md), [0051](../../docs/adr/0051-dual-runner-tri-platform-development-contract.md), [0057](../../docs/adr/0057-runner-platform-support-is-an-implementation-obligation.md).

---

## 1. What (Was wird gebaut?)

Agent-Pipeline unterstützt aktuell **Claude Code** und **Codex** als produktive Runner. Antigravity existiert bisher nur als nicht-funktionaler Alpha-Grenzdeskriptor (`antigravity-alpha-adapter.mjs`), der mit `AGY-ALPHA-NOT-ACTIVATED` fail-closed blockiert.

In diesem Sprint wird **Antigravity CLI (`agy`) mit der Gemini-Modellfamilie als 3. vollwertiger, auditierbarer und technisch hart durchgesetzter Runner** implementiert.

Die Unterstützung umfasst zwingend **beide Schichten**:
1. **Interaktive Entwickler-Session (Dimension A):** Der Entwickler arbeitet im Repository direkt mit Antigravity (IDE oder CLI `agy`). Das System führt den Session-Start, Onboarding-Prüfungen, Lifecycle-Checks und harte Pre-Tool-Guardrails (`guard-git`, `guard-push`, `guard-lifecycle-ready`) über native Antigravity-Hooks (`.agents/plugins.json`) aus.
2. **Programmatischer Dispatch & Rollen-Hosts (Dimension B):** Automatisierte Pipeline-Scripts (z. B. Subagenten-Dispatch für *Goldfish*, unabhängiges *Critic-Review* und *Advisory*) rufen `agy` im Headless-Modus auf, werten strukturierte Ergebnisse/Usage aus und erstellen kryptografisch/strukturell gebundene Receipts.

---

## 2. Why & Zentrale Invarianten

1. **Harte technische Durchsetzung (Keine Prompt-Only-Scheinsicherheit):**
   - Ein Runner darf in der Pipeline nicht schwächer abgesichert sein als die anderen.
   - Ein Agent darf weder seine eigenen Guardrails modifizieren noch Tests unbemerkt aushebeln können.
   - Antigravity nutzt daher clientseitige `PreToolUse`- und `SessionStart`-Hooks (`plugins.json` in `.agents/`), die unerlaubte Befehle (z. B. ungeprüftes `git push`, unautorisierte Dateimodifikationen vor Freigabe) vor der Ausführung abfangen und den Exit-Code 2 liefern.

2. **Runner-Autarkie ([ADR-0057](../../docs/adr/0057-runner-platform-support-is-an-implementation-obligation.md) Decision 2a):**
   - Kein Runner darf Vorbedingung für einen anderen sein. Antigravity muss jeden unterstützten Lifecycle-Schritt vollständig autark ohne Claude- oder Codex-Präsenz abschließen können.

3. **Keine erfundene Parität ([#92](https://github.com/agent-pipe-shared/agent-pipeline/issues/92)):**
   - Native Eigenheiten (wie Geminis Token-Zählung, Thinking-Effort-Modi und Hook-Events) werden typisiert und ehrlich abgebildet; nicht-existierende Features werden nicht fingiert.

---

## 3. Modell-Mapping (Gemini-Familie)

Basierend auf den Modellstärken und Kostenstrukturen gilt folgende feste Zuordnung:

| Pipeline-Rolle / Duty | Modell | Effort | Begründung |
|---|---|---|---|
| **Design Phase (Epic / Feature)** | `gemini-3.1-pro-high` | `high` | Maximale Denktiefe für Architektur, Konsistenz & Invarianten |
| **Execution Phase (Goldfish Implementor / Deep)** | `gemini-3.7-flash-high` | `high` / `medium` | Sehr hohe Codiergeschwindigkeit & Präzision bei TDD |
| **Mechanic / Wartungs-Tasks** | `gemini-3.7-flash-low` | `low` | Token-schonend für rein mechanische Kleinarbeiten |
| **Critic (Normal)** | `gemini-3.7-flash-high` | `high` | Schnelles, gründliches 4-Augen-Review |
| **Critic (High-Risk / T1)** | `gemini-3.1-pro-high` | `max` | Höchste Gründlichkeit für sicherheits- und lifecycle-kritische Prüfungen |
| **Advisory Consultation** | `gemini-3.1-pro-high` | `high` | Fundierte Analyse bei Architekturentscheidungen |

---

## 4. Scope

- **Konfiguration & Mappings:**
  - [`plugins/pipeline-core/config/runner-mappings.json`](../../plugins/pipeline-core/config/runner-mappings.json): Gemini-Direktselektoren und Aliase.
  - [`plugins/pipeline-core/config/routing-authority.json`](../../plugins/pipeline-core/config/routing-authority.json): Worktypes & Duties für `antigravity`.
  - [`plugins/pipeline-core/config/runner-profiles-v3.json`](../../plugins/pipeline-core/config/runner-profiles-v3.json): Profil-Definitionen für `antigravity`.
  - [`pipeline.user.schema.json`](../../pipeline.user.schema.json): Zulassung von `antigravity` in `runners.enabled` und `runners.default`.

- **Execution Plane & CLI-Integration:**
  - `plugins/pipeline-core/lib/antigravity-execution-host.mjs`: Headless CLI Wrapper (`agy --prompt --output-format json`).
  - Result-Parser, Token-Usage-Normalisierung, Fehler-Taxonomie (`AGY-INVOCATION-ERROR`, `AGY-AUTH-REQUIRED` etc.).

- **Onboarding & Lifecycle:**
  - [`plugins/pipeline-core/lib/project-onboarding-v3.mjs`](../../plugins/pipeline-core/lib/project-onboarding-v3.mjs) & [`project-onboarding-ready-gate.mjs`](../../plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs): Threading von `runner: "antigravity"` ohne harte Abweisung.
  - Integration von Antigravity in `RUNNERS_WITHOUT_APP_SERVER`.

- **Harte Guardrails & Hooks:**
  - Generierung und Wartung von `.agents/plugins.json` mit Verknüpfung zu den bestehenden Pipeline-Guards (`guard-git`, `guard-push`, `guard-lifecycle-ready`, `guard-devplan`).

- **Critic & Subagents:**
  - `plugins/pipeline-core/scripts/critic-antigravity-host.mjs`: Isolierter Critic-Review-Host für Antigravity mit Receipt-Erzeugung.
  - Subagenten-Definitionen für Goldfish / Elephant / Critic.

- **Dokumentation & ADRs:**
  - `docs/adr/0067-tri-runner-antigravity-integration.md`: Formale Entscheidung.
  - Aktualisierung von [`docs/runner-support.md`](../../docs/runner-support.md) und [`docs/runner-platform-conformance.md`](../../docs/runner-platform-conformance.md).

---

## 5. Non-Goals (Explizit ausgeschlossen)

- Kein generischer Google Vertex-Cloud-Provider oder direkte API-Key-Bypass-Implementierung (nur offizieller `agy` CLI-Weg).
- Keine Aufweichung der bestehenden Claude- und Codex-Guards.
- Kein automatisches Ändern globaler Systempfade außerhalb des Workspace- bzw. User-Cache-Bereichs.

---

## 6. Risiken & Mitigation

1. **Risiko: Drift zwischen Claude- und Antigravity-Hooks.**
   - *Mitigation:* Beide Hook-Konfigurationen (`hooks/hooks.json` und `.agents/plugins.json`) greifen auf dieselben zugrundeliegenden MJS-Guard-Dateien (`guard-git.mjs`, `guard-push.mjs` etc.) zu.
2. **Risiko: Regressionsbrüche bei bestehenden Claude/Codex-Tests.**
   - *Mitigation:* Jede Wave wird mit `node harness/scripts/verify.mjs` gegen die gesamte bestehende Suite (380+ Tests) validiert.
3. **Risiko: Plattform-Unterschiede (Linux / macOS / Windows).**
   - *Mitigation:* Saubere Pfad-Normalisierung und Shell-Portabilität gemäß [ADR-0051](../../docs/adr/0051-dual-runner-tri-platform-development-contract.md) / [ADR-0057](../../docs/adr/0057-runner-platform-support-is-an-implementation-obligation.md).

---

## 7. Geplante Umsetzungs-Waves

- **Wave 1:** Manifeste, Schemas, Modell-Mappings & Profile v3 (`antigravity`).
- **Wave 2:** Execution Host, Headless `agy` Invocations- & Result-Parser.
- **Wave 3:** Harte Antigravity Hook-Infrastruktur (`.agents/plugins.json`) & Guard-Verdrahtung.
- **Wave 4:** Onboarding-, Lifecycle- & Bootstrap-Threading (`pipeline-start`).
- **Wave 5:** Critic-Host Adapter (`critic-antigravity-host.mjs`), Receipts & Subagents.
- **Wave 6:** Full Conformance Suite, ADR-0067, Dokumentation & Verify-Abschluss.
