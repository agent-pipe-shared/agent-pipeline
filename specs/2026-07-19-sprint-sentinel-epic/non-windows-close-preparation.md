<!-- po-language: de -->

# Sentinel: Non-Windows-Close-Preparation

**Status:** Arbeitsvorbereitung, keine Backlog-Transition und keine Release-
oder Go-live-Aussage. Dieses Paket ergänzt die Akzeptanzmatrix um die
ausführbare Reihenfolge für die fünfzehn nicht-Windows-spezifischen offenen
Records. Es bleibt hinter deren kanonischen ACs, dem Backlog-Writer und allen
Human-/Remote-Gates zurück.

**Owner und Ablauf aufgeschobener Gates:** Der Sentinel Elephant hält die
Evidenzpakete zusammen; der PO ist Entscheider für Human-, Release- und
Remote-Gates. Jeder unten nicht simulierte Host-, Human- oder Remote-Nachweis
wird spätestens am **2026-08-31** erneut geprüft oder vom PO ausdrücklich
verlängert. Das Ablaufdatum ist eine Review-Grenze, keine Freigabe.

## Gemeinsame Kandidatenregel

Jedes lokale Paket endet erst mit denselben vier maschinellen Nachweisen auf
einem festen Kandidaten: fokussierte Tests, `node harness/scripts/verify.mjs`,
Security-Evidenz und ein frischer unabhängiger Critic. Danach bleibt der
jeweilige sanktionierte Writer der einzige Übergangspfad. Grüne Tests erzeugen
keinen Statuswechsel.

## PO-Plattformdisposition

Der aktuelle Codex-Host ist WSL2 und liefert die native Oberfläche
`wsl-native`; ihre Evidenz wird durch den Sentinel Elephant auf dem jeweiligen
Kandidaten erzeugt. `wsl-drvfs` bleibt davon getrennt und ohne eigenen Nachweis
typisiert offen.

Der PO akzeptiert seit 2026-07-22 das Fehlen eines nativen macOS-Hosts für den
Sentinel-Close als begrenzte Ausnahme. Sie schließt nur dieses Evidenzrestgate,
behauptet keinen macOS-Support und ersetzt keine Windows-, Linux- oder
WSL-Evidenz. Owner ist der PO; Review oder ausdrückliche Verlängerung bis
2026-08-31.

## Lokal vorbereitbare Kontrolllinien

| Item | Vorbereitete lokale Arbeit | Danach zwingend verbleibendes Gate |
| --- | --- | --- |
| `pipeline.afk-assumption-mode` | SNT-4 AC 1–7 auf `afk-assumption-mode`, `afk-ledger`, `afk-review`, `afk-transaction-host` und `afk-activation` mappen; Disabled-, Expiry-, Crash-, Rollback-, Forbidden-Action- und Final-Review-Fälle als eigene Verify-Lane bündeln. | Kandidatengebundene Writer-Evidenz und eigenständiger Close. |
| `pipeline.canonical-worktree-lifecycle` | Beide Close-Profile gegen `worktree-lifecycle.test.mjs` als reproduzierbare Fixture-/Recovery-Matrix festlegen. | Reale Profile, Post-Commit-Cleanliness und Close-Evidenz. |
| `pipeline.nonblocking-interaction-continuity` | Trajectory-, Compact- und Resume-ACs den Continuity-State/Host-/Status-Suiten zuordnen. | Kandidatengebundene Replay-Evidenz und Einzelübergang. |
| `pipeline.po-gate-worktree-authority` | Linked-Worktree-, Kardinalitäts- und Digest-Negativfälle gegen Authority-/Publisher-Suiten vollständig mappen. | Vollständige AC-Disposition und sanktionierter Einzelübergang. |
| `pipeline.stateful-design-contract-template` | Die neun Felder gegen einen konkreten Stateful-Design-Record demonstrieren; bestehende Doc-Contract-Negativfälle wiederverwenden. | Kandidatengebundene Closure-Evidenz und Einzelübergang. |
| `pipeline.t1-governance-path-preflight` | Pfad-, ETA- und Tool-Setup-ACs dem Critic-Packet-/Workflow-Preflight zuordnen; unavailable bleibt typisiert. | Eigenständige AC-/Critic-Evidenz und Close. |
| `pipeline.verify-gate-scoped-registration` | Die geschlossene SNT-7-Registrierung gegen ihre drei festen Suiten und alle Drift-Negativfälle belegen. | Aktuelle Writer-Evidenz und eigener Übergang; keine Bulk-Closure. |

## Host- oder Sitzungsattestierungen

| Item | Lokale Vorbereitung | Nicht simulierbares Restgate | Owner / Ablauf |
| --- | --- | --- |
| `pipeline.codex-plugin-validator-host-parity` | Identische Fixture-, Versions- und Command-Protokolle für native/generische Validatoren vorbereiten. | Native-vs.-Generic-A/B auf demselben Host. | Sentinel Elephant / 2026-08-31 |
| `pipeline.codex-sandbox-critic-longterm` | Fail-closed Host-, Preflight-, Select- und Runtime-Contracts weiter prüfen. | Starke input-confined/network-denied-Lane einschließlich Upstream-/Shadow-/PO-Nachweis. | Sentinel Elephant + PO / 2026-08-31 |
| `pipeline.execution-model-switchback` | Route- und Post-Compact-Driftfälle in einem Attestierungsprotokoll vorbereiten. | Echte Main-Session-Attestierung und Drift-Return-Request. | Sentinel Elephant / 2026-08-31 |
| `pipeline.push-guard-worktree-target` | Ziel-Worktree, explizite Refspec, Guard-Nachweis und Fetch-back-Protokoll vorbereiten. | Regulärer, autorisierter Ziel-Worktree-Push und Readback. | Sentinel Elephant + PO / 2026-08-31 |

## HAW-E-gebundene Arbeit

Diese drei Items dürfen nur mit einem gemeinsamen Result und exakt einem
Hawkeye-Batch transitionieren. Lokale Vorbereitung darf die Batch-Grenze nie
aufweichen.

| Item | Lokale Vorbereitung | Gemeinsames Restgate | Owner / Ablauf |
| --- | --- | --- |
| `pipeline.documentation-information-architecture` | Capability-/Language-/Link-Inventare, Operator-Journeys und Critic-Receipt-Bindung aktualisieren. | HAW-E-Result, EN/DE-Abnahme und Drei-Item-Batch. | Sentinel Elephant + PO / 2026-08-31 |
| `pipeline.regulated-document-hooks` | Jede mandatory `(bindingId,event)`-Kette bis Receipt/Review/Rationale als AC-Matrix vorbereiten. | HAW-C-Vertikale und HAW-E-Batch. | Sentinel Elephant + PO / 2026-08-31 |
| `pipeline.session-keep-awake` | Lease-, Cleanup- und Plattformfixture-Matrix sowie Nutzerdokumentation vorbereiten. | Native Plattformattestierungen und HAW-E-Batch. | Sentinel Elephant + PO / 2026-08-31 |

`pipeline.dual-channel-publication` ist ebenfalls HAW-E-relevant, aber kein
Teil des Drei-Item-Backlog-Batchs: Release-Baseline, gemeinsame Autorisierung,
vier Remote-Effekte und Fetch-back bleiben reale, nicht lokal ersetzbare
Nachweise. Owner ist der Sentinel Elephant mit PO-Entscheid; Ablauf ist
2026-08-31.

## Bereits geschlossene und explizit ausgeschlossene Linien

`pipeline.source-available-commercial-licensing` ist bereits kanonisch
geschlossen: `backlog/transitions.ndjson` Sequenz 15, die Closure
`backlog/evidence/2026-07-21-source-available-commercial-licensing.md` und
die Zeile in `backlog-acceptance-matrix.md` sind die maßgebliche Evidenz. Es
wird nicht erneut bearbeitet. Die Windows-Records `#34`–`#37` bleiben im
gebundenen Windows-Scope; Docker ist kein Ersatz für native
Windows-, Linux-, WSL- oder macOS-Evidenz.

## Ausführungsreihenfolge nach dem Windows-Merge

1. Lokal deterministische Kontrolllinien und ihre AC-Matrizen fertigstellen.
2. Host-/Session-Attestierungen ausführen und negative Ergebnisse typisiert
   behalten.
3. HAW-C-Vollständigkeit, dann HAW-E-Baseline und Drei-Item-Result herstellen.
4. Dual-Channel-Publikation und den regulären Ziel-Worktree-Push nur mit ihren
   echten Remote-Effekten durchführen.
5. Erst danach die einzelnen sanktionierten Writer-Übergänge und die finale
   21-Item-Reconciliation prüfen.

## Rollback

Diese Vorbereitung ist ohne Laufzeit-, Status- oder Remote-Nebenwirkung
reversibel: Ein normaler Revert der Commits, die diese Datei und ihren
`docs/state.md`-Verweis einführen, entfernt ausschließlich die
Arbeitsvorbereitung. Danach `node harness/scripts/check-doc-contracts.mjs` und
Full Verify auf dem Revert-Kandidaten ausführen. Kein Backlog-Item, Ledger,
Receipt oder Release-Ref wird dabei geändert oder zurückgesetzt.
