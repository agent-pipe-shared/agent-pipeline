# Lokale Grundlage für den isolierten Codex-Critic

**Stand:** Batman BTM-F2–F5 · F2-Zwischenklasse real verifiziert · produktiv
weiterhin standardmäßig inaktiv

Diese Grundlage trennt die technische Vorbereitung von jeder späteren
Produktivaktivierung. Sie ändert weder die heutige Critic-Route noch den durch
[ADR-0035](adr/0035-codex-native-normal-critic.md) begrenzten Host-Fallback. Die
vier unabhängigen Aussagen und das Bedrohungsmodell stehen in
[critic-isolation-threat-model.md](critic-isolation-threat-model.md).

## Implementierte Verträge

- **F2:** Zwei geschlossene Permission-Intents unterscheiden das starke,
  netzwerkgesperrte Ziel von der netzoffenen Read-only-Zwischenklasse. Der
  öffentliche, nur mit `--run` startbare Preflight erzeugt frische A/B-
  Fixtures und einen Loopback-Canary, führt dasselbe feste Payload einmal als
  Host-Kontrolle und einmal über
  `codex sandbox --sandbox-state-json` aus und schreibt einen mode-0600-
  Receipt. Intent und echter, vom CLI konsumierter
  `codex/sandbox-state-meta`-State bleiben getrennt; beide Byte-Digests sowie
  CLI- und Sandbox-Helper-Artefakte sind gebunden. Der Preflight klassifiziert
  Linux/WSL/DrvFS, vergleicht Child-/stdin-/EOF-/stdout-/stderr-Semantik, prüft
  Reads, Writes, Netzwerk und Canaries und begrenzt First Event, semantische
  Lease, Gesamtlaufzeit, Streams und die verifizierte eigene Prozessgruppe.
  Die Zwischenklasse erlaubt genau einen frischen Coordinator-Scratch-Root,
  führt daraus zusätzlich nur den App-Server-`initialize`/`initialized`-
  Handshake aus und stoppt vor `thread/start`; sie ruft kein Modell auf. Die
  starke Kompilierung verwendet
  kein `:minimal`-Makro: Node, Payload, Loader, Shared Libraries, `/proc/self`
  und `/dev/null` werden als Runtime-Read-Set einzeln aufgelöst.
- **F3:** Geschlossene Request-, Journal-, Verdict- und Receipt-Verträge binden
  Inputs, Nonces, Kandidat, Profil, Preflight, Lebenszyklus, Verdict und
  Cleanup. Ein PID oder wiederholter Output erneuert keine semantische Lease;
  Verdict-Bytes verbieten einen zweiten Modelllauf.
- **F4:** Eine versionierte Policy führt Codex CLI `0.144.6` auf WSL2/DrvFS und
  WSL2/nativ nur als `intermediate-preflight-candidate`. Ein lokaler Receipt
  wird bei Versions-, Artefakt-, Boot-, Alters-, Profil-, Plattform- oder
  Netzwerkdrift herabgestuft. Die Zwischenklasse behält das Literal
  `sandbox-read-only-except-coordinator-scratch; input/network isolation not
  asserted`. Genau ein
  Same-Runner-Fallback ist ausschließlich für freigegebene technische
  Pre-Verdict-Fehler zulässig und behält
  `functional-equivalent-read-only; OS isolation not asserted`.
- **F5:** Shadow-Vergleiche binden je Positiv- und Seeded-Negativ-Fall dasselbe
  Paket an beide Lanes und klassifizieren semantische Abweichungen. Ein
  Shadow-Receipt kann nur das Aktivierungsgate, nie das Critic-Gate des
  Kandidaten erfüllen. Der Aktivierungsvertrag führt ein mode-0600,
  hashverkettetes Journal mit vollständigem Routen-Inventar, Evidenzbindung,
  PO-Attribution, Compare-and-replace-Entscheidung, exaktem Replay und
  Suspendierung bei Drift.

## Nachweisgrenze

Die fokussierten Vertragstests einschließlich des fixen Child-/stdio-Payloads
sind im Host-Kontext mit **14/14 + 1/1** grün. Derselbe Child-Kontrolltest
verliert innerhalb einer bereits aktiven äußeren Codex-Sandbox erwartungsgemäß
Ausgabe; genau diese Kontextverfälschung ist der Grund für die A/B-Trennung des
Preflights.

Der vollständige finale Runner wurde am 2026-07-18 außerhalb einer bereits
aktiven äußeren Host-Sandbox mit Codex CLI `0.144.6` auf WSL2 im nativen
WSL-Dateisystem ausgeführt.
CLI und der per Arg0-Dispatch aufgelöste `codex-linux-sandbox`-Helper waren in
diesem Stand dasselbe Artefakt mit SHA-256
`a31ae9450a26216eb1e7c53102fd42123dd675974310b0e2ca3aa4cb622a2c15`.
Die wiederholte finale Zwischenklasse endete nach 8.027 ms mit
`terminalCode: ok` und `eligibility: intermediate`: erlaubter Read, genau ein
erlaubter Scratch-Write, technischer Write-Deny überall sonst,
Child-/stdio-/EOF-/Exit-Gleichheit, App-Server-Initialisierung und acht
unveränderte Canaries waren grün; externe/synthetisch-sensitive Reads und
Loopback-Netzwerk waren wie deklariert nicht isoliert. Der sanitisierte Receipt
hatte SHA-256
`10b807458a40678bf794476ba2e0204b9976c5b90b32834248954cb6b27f5347`.

Die identische finale starke Lane endete dagegen fail-closed mit
`terminalCode: child-stdio-error`, `eligibility: none` und unvollständigem
Lifecycle; alle acht Canaries blieben unverändert. Ihr Receipt hatte SHA-256
`be2e5e402ad760d94547a545b10d70399534fe09c7ffce3c4ce9e6a253fccba9`.
Damit reproduziert der echte Harness den bekannten Upstream-Blocker, ohne
einen starken Assurance-Claim zu erzeugen.

Der finale mode-0600-Zwischenklassen-Receipt liegt als kurzlebige lokale
Evidenz außerhalb des Repository. Die Repository-Dokumentation bleibt damit am
kanonischen Checkout auffindbar, ohne laufzeitabhängige oder private Evidenz zu
veröffentlichen.

Damit sind der eigenständige F2-Runner und die lokale Zwischenklasse belegt.
Nicht belegt und nicht aktiviert sind:

- Shadow Runs gegen reale Critic-Urteile;
- Full Verify und ein frischer unabhängiger T1-Review der Aktivierung;
- eine PO-freigegebene Änderung der produktiven Route;
- die starke Klasse auf nativem Linux, WSL2/DrvFS und WSL2/nativ.

Die starke Lane bleibt durch
[`openai/codex#33543`](https://github.com/openai/codex/issues/33543) und die
dreiteilige, frische, netzwerkgesperrte Kompatibilitätsmatrix gesperrt. Issue-
Schließung oder Supporttext allein genügen nicht. Jede spätere Aktivierung
benötigt die separaten F5-Evidenzen und ein ausdrückliches PO-Gate.

## Artefakte

- `harness/profiles/codex-critic-{strong,intermediate}.v1.json`
- `harness/scripts/codex-sandbox-preflight.{mjs,test.mjs}`, separater
  Host-Kontrolltest, festes Payload und Receipt-Schema
- `plugins/pipeline-core/scripts/codex-isolated-critic-contract.mjs` und die
  vier isolierten Request-/Journal-/Verdict-/Receipt-Schemas
- `plugins/pipeline-core/lib/codex-sandbox-compatibility.{mjs,test.mjs}` sowie
  Policy- und Projektionsschemas
- `plugins/pipeline-core/scripts/codex-critic-shadow.{mjs,test.mjs}` und Schema
- `plugins/pipeline-core/scripts/critic-route-activation.{mjs,test.mjs}` und
  Schema

Keines dieser Artefakte ist in der produktiven Critic-Route oder im statischen
Verify-Aggregat aktiviert.
