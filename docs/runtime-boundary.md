# Runtime boundary

Agent-Pipeline has a portable methodology and runner integrations that can
enforce configured controls. A route in `pipeline.user.yaml` records the V3
choice; it does not attest to model identity or establish universal parity
between hosts.

## Supported integrations

Claude Code uses the native plugin and hook integration. Codex uses the
project's Codex plugin manifest and `PreToolUse` adapter. Antigravity uses its
native hook integration and translates its tool envelopes into the same guard
decisions. When installed and loaded, the Codex and Antigravity adapters can
hard deny commands and file writes. A denied operation does not proceed through
that adapter; adapter failures also fail closed. The adapters do not provide
OS isolation, identity attestation, or a guarantee that every possible host
path is covered.

The implementation and tests are the authoritative coverage references:

| Runner | Blocking entry point | Relevant tests |
| --- | --- | --- |
| Claude Code | Native plugin hooks in [`hooks.json`](../plugins/pipeline-core/hooks/hooks.json) | Hook-specific suites under [`hooks/`](../plugins/pipeline-core/hooks/) |
| Codex | [`codex-pretool-guard.mjs`](../plugins/pipeline-core/hooks/codex-pretool-guard.mjs) and [`codex-hooks.json`](../plugins/pipeline-core/hooks/codex-hooks.json) | [`codex-pretool-guard.test.mjs`](../plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs) |
| Antigravity | [`antigravity-pretool-guard.mjs`](../plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs) and [`hooks.json`](../plugins/pipeline-core/hooks.json) | [`antigravity-pretool-guard.test.mjs`](../plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs) |

These adapters invoke the configured provider-neutral guards for the tool
operations they recognize. Coverage is bounded by the installed manifest,
project configuration, recognized envelope, and host delivery path. Controls
that only report, remind, or rely on an attended workflow remain advisory.
See [`enforcement.md`](enforcement.md) for the generated guard registry and
[`runner-support.md`](runner-support.md) for the maintained support table.

## Installation and delivery prerequisites

The project must use the current V3 authority and the runner's supported
integration. Bind or install the runner plugin at the documented project scope,
generate or refresh its runtime projection through the supported onboarding
path, and restart the host when that path requires it. Keep source and runtime
readbacks aligned. A source checkout's generated files are projections; do not
hand-edit them. If the adapter is absent, stale, disabled, pointed at a
different project root, or the host does not deliver its native hook event, the
methodology still applies but that adapter cannot enforce the operation.

The native Codex selected-sandbox route remains the preferred attested route.
If that route returns one typed `no-child` or `unavailable` result, the
PO-authorized exception is limited to one fresh internal hard-read-only consult
for the same question. It permits no handover, memory, mutation, network
export, raw-answer retention, auto-apply, second question, or retry. A
functional-equivalent pass does not establish native sandbox execution, OS
isolation, or model identity.

## Portable responsibilities

Roles, specifications, evidence, review separation, handover, and the
deterministic-check-before-review practice work under any runtime that can read
the repository and run commands. On a runner without a configured blocking
integration, the operator must perform those controls manually and preserve the
same evidence discipline. Consult [`SETUP.md`](../SETUP.md) to bind the
integration before relying on its blocking behavior.

---

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; German reference translation. -->

# Laufzeitgrenze

Agent-Pipeline hat eine übertragbare Methodik und Runner-Integrationen, die
konfigurierte Kontrollen durchsetzen können. Eine Route in
`pipeline.user.yaml` dokumentiert die V3-Auswahl; sie bestätigt weder die
Modellidentität noch eine universelle Gleichheit zwischen Hosts.

## Unterstützte Integrationen

Claude Code verwendet die native Plugin- und Hook-Integration. Codex verwendet
das Codex-Plugin-Manifest des Projekts und den `PreToolUse`-Adapter.
Antigravity verwendet seine native Hook-Integration und übersetzt seine
Tool-Umschläge in dieselben Guard-Entscheidungen. Bei korrekter Installation
und Aktivierung können die Codex- und Antigravity-Adapter Befehle und
Dateischreibvorgänge hart ablehnen; Adapterfehler führen ebenfalls zu einer
Ablehnung. Die Adapter liefern weder OS-Isolation noch Identitätsattestierung
und garantieren keine Abdeckung jedes möglichen Hostpfads.

Die maßgeblichen Abdeckungsquellen sind die Implementierung und ihre Tests:

| Runner | Blockierender Einstiegspunkt | Relevante Tests |
| --- | --- | --- |
| Claude Code | Native Plugin-Hooks in [`hooks.json`](../plugins/pipeline-core/hooks/hooks.json) | Hook-spezifische Suiten unter [`hooks/`](../plugins/pipeline-core/hooks/) |
| Codex | [`codex-pretool-guard.mjs`](../plugins/pipeline-core/hooks/codex-pretool-guard.mjs) und [`codex-hooks.json`](../plugins/pipeline-core/hooks/codex-hooks.json) | [`codex-pretool-guard.test.mjs`](../plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs) |
| Antigravity | [`antigravity-pretool-guard.mjs`](../plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs) und [`hooks.json`](../plugins/pipeline-core/hooks.json) | [`antigravity-pretool-guard.test.mjs`](../plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs) |

Die Adapter rufen die konfigurierten, runnerneutralen Guards für erkannte
Werkzeugoperationen auf. Ihre Abdeckung ist durch Manifest,
Projektkonfiguration, erkanntes Umschlagformat und Host-Zustellung begrenzt.
Kontrollen, die nur melden, erinnern oder einen betreuten Ablauf voraussetzen,
sind beratend. Siehe [`enforcement.md`](enforcement.md) für das generierte
Guard-Register und [`runner-support.md`](runner-support.md) für die gepflegte
Runner-Tabelle.

## Voraussetzungen für Installation und Zustellung

Das Projekt muss die aktuelle V3-Autorität und die unterstützte Integration des
Runners verwenden. Plugin am dokumentierten Projektpfad binden, die
Runtime-Projektion über den Onboarding-Pfad erzeugen oder aktualisieren und den
Host neu starten, wenn der Ablauf das verlangt. Source und Runtime-Readbacks
müssen zusammenpassen. Fehlt der Adapter, ist er veraltet, deaktiviert, auf ein
anderes Projektverzeichnis gerichtet oder liefert der Host kein natives Hook-
Ereignis, bleibt die Methodik anwendbar, aber dieser Adapter kann die Operation
nicht durchsetzen.

Die native Codex-Selected-Sandbox-Route bleibt der bevorzugte attestierte Weg.
Wenn sie einmalig `no-child` oder `unavailable` meldet, ist die PO-autorisierte
Ausnahme auf genau einen frischen internen hard-read-only-Consult zur selben
Frage begrenzt. Handover, Memory, Mutation, Netzwerkexport,
Rohantwort-Aufbewahrung, Auto-Apply, eine zweite Frage und Retry sind nicht
zulässig. Ein Funktionsäquivalenz-Pass bestätigt weder native
Sandbox-Ausführung noch OS-Isolation oder Modellidentität.

Rollen, Spezifikationen, Evidenz, Review-Trennung, Handover und die Praxis,
deterministische Checks vor dem Review auszuführen, funktionieren unter jeder
Runtime, die Repository und Befehle ausführen kann. Ohne blockierende
Integration führt der Operator diese Kontrollen manuell durch. Vor dem Vertrauen
auf Blocking zuerst [`SETUP.md`](../SETUP.md) zur Runner-Bindung lesen.
