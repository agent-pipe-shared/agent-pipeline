<!-- po-language: de -->

# Sentinel Backlog-Akzeptanzmatrix

Stand: lokaler Sentinel-Kandidat; diese Matrix ist eine Arbeits- und
Evidenzprojektion, kein Backlog-Übergang und keine Release-Freigabe.

| Item | Tatsächlicher lokaler Befund | Frische Evidenz | Weiterer Abschlussbedarf |
| --- | --- | --- | --- |
| SNT-0 Codex-Advisory-Transport | Der Produktionsadapter bleibt bei `sandbox_selection_unavailable` ehrlich fail-closed; ohne eine vom Codex-Host bereitgestellte, attestierende `launch`/`finalize`-Bridge startet kein Advisory-Kind. Der von PO und ADR-0041 dauerhaft freigegebene frische lokale Read-only-`consult-advisor` hat nach diesem typisierten Stopp genau eine Frage erfolgreich im Funktionsäquivalenzpfad beantwortet. | Advisory-Bridge 5/5, Sandbox-Runtime 2/2; realer Produktionspfad typisiert no-child; kandidatengebundener sanitierter Status `.pipeline/runtime/sentinel-functional-equivalent-pass.json`. | **PO-autorisierter Gate-Pass unter Restzusicherung:** gültig bis Widerruf durch PO oder bis eine funktionsfähige Codex-CLI-Selected-Sandbox verfügbar ist. Keine attestierte Selected-Sandbox-Ausführung, keine OS-Isolation und keine Modellidentität; kein Export, keine Mutation, keine Auto-Apply. |
| AFK-Annahmemodus | Der eingeschränkte Claude-Worker ist strikt; Codex meldet für diesen Worker typisiert `unavailable` ohne Mutation. Das sessiongebundene Keep-Awake ist eine getrennte Funktion und bleibt verfügbar. | AFK-Regression 83/83 | vollständige Close-/Disposition-Evidenz |
| Kanonischer Worktree-Lifecycle | Implementierung und Cleanup-Recovery vorhanden | 24 Lifecycle- plus 5 Cleanup-/Controller-Tests | beide Close-Profile im Abschlusskandidaten |
| Codex-Validator-Parität | Host-readback vorhanden, generischer Validator lokal nicht verfügbar | reproduzierbar `unavailable` | versionsgebundener A/B-Preflight |
| Codex-Sandbox-Critic | schwächere network-open Lane vorhanden | Sandbox-/Selector-Tests grün | starkes Upstream-/PO-Gate weiter offen |
| Dokumentationsarchitektur | Hawkeye-Inventar vorhanden | Capability-Inventar geprüft | HAW-E-Content-/Sprachabschluss |
| Zwei-Kanal-Publikation | Plan-/Journaloberflächen vorhanden | noch kein aktueller Zwei-Remote-Fetch-back | HAW-E-Release-Gate |
| Execution-Model-Switchback | Die reine Soll/Ist-Reconciliation und die Compact-Projektion sind implementiert; sie akzeptieren ausschließlich `main-session`-Host-Introspection und verwerfen Subagent-Receipts. | Main-Session-Route 6/6, Post-Compact-Reground 24/24; der aktuelle Host liefert keine Hauptsession-Attestierung. | **Host-abhängig, nicht erledigt:** eine echte Host-Attestierung einspeisen und die einmalige sichtbare Drift-Return-Request-Evidenz am Kandidaten belegen. |
| Nonblocking Continuity | Continuity- und Resume-Verträge vorhanden | 151 Continuity-/Host-/Interaktionschecks | Kandidatenbindung und Close-Evidenz |
| PO-Gate-Worktree-Authority | Primary-/Linked-Worktree-Authority vorhanden | 25 Authority-Checks grün | finaler Kandidaten-Readback |
| Push-Guard-Worktree-Target | Target-Binding vorhanden | 7 Binding-Checks grün | regulärer Push + Fetch-back (gesperrt) |
| Regulierte Dokument-Hooks | Der reine, private Impact-Schnitt, die immutable `da_`-Adapterregistrierung und die feste Linux/user-systemd-Ausführungsgrenze sind geliefert: exakt gebundene Repository-Digests, kanonische Triggerauswertung, einzelverlinkter physischer SHA-Adapter und ein typed `adapter-unavailable` außerhalb der nachgewiesenen Cgroup-Lane. | Dokument-Hooks 1/1; private Binding-/Adapter-/Renderer-Tests 8/8, beide in Full Verify registriert. | Private Request-/Response-Framing und Job-Lifecycle, Policy-/Binding-Staging, HMAC-Receipt, Review-/Rationale- und Recovery-Kette sowie HAW-E-Gate. |
| Session Keep-Awake | Sessiongebundener Controller/Lifecycle vorhanden; unabhängig vom nicht verfügbaren Codex-Hintergrund-Worker. | Controller- und Cleanup-Checks grün | Plattform-/Ablauf-Evidenz |
| Source-available-Lizenz | keine abschließende Rechtsentscheidung | — | benannte menschliche Rechte-/Legal-Freigabe |
| Stateful-Design-Template | Checkliste in Template und Elephant-Vertrag ergänzt | Dokumentvertrag grün | in finalem Kandidaten erneut belegen |
| T1-Governance-Preflight | Paket-/Preflight-Oberflächen vorhanden | Full Verify registriert | AC-genaue Abschlusszuordnung |
| Scoped-Verify-Registration | additive Registrierung implementiert | Inventar-/Verify-Tests grün | Kandidatengebundene Close-Evidenz |
| HAW-C | teilweise geliefert | Impact-Auswertung, private Adapterregistrierung und feste systemd-Ausführungsgrenze im lokalen Kandidaten geprüft | private Request-/Response-/Review-/Recovery-Vertikale vollständig integrieren |
| HAW-E | offen | — | Lizenz, gemeinsame Freigabe, Publish und Fetch-back |

## Codex-Kompatibilitätsregel

Die Capability-Inventur verlangt für jede inventarisierte Oberfläche eine
explizite Claude- und Codex-Disposition. Nicht verfügbare oder
hostabhängige Funktionen werden grundsätzlich nicht substituiert; sie bleiben
mit einem stabilen Reason-Code sichtbar und blockieren ausschließlich das
betroffene Gate. Die einzige dokumentierte Ausnahme ist ADR-0041: nach genau
einem typisierten Codex-Sandbox-Stopp darf der PO-autorisierte lokale
funktionale Äquivalenz-Pass dieses Gate mit explizit schwächerer Restzusicherung
tragen, bis PO-Widerruf oder eine funktionsfähige Codex-CLI-Selected-Sandbox.
