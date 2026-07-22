<!-- po-language: de -->

# AC-Matrix — Sentinel #36: Native SSH-Fixture

Status: **PO-freigegebene Testhärtung; Closure offen**
Datum: 2026-07-22
Scope: `pipeline.windows-verify-reproducibility` (#36), ausschließlich die
anonyme Public-Push-Account-Probe in `guard-push.test.mjs`.

## Vertrag

Die Test-Fixture darf auf einem nativen Windows-Standardkonto niemals auf eine
reale SSH-Installation zurückfallen. Sie stellt neben dem POSIX-Shebang-Helper
einen nativen `ssh.cmd`-Shim bereit. Beide Shims geben denselben konfigurierten
Test-Account aus; fehlt der Override, verwenden sie `agent-pipe-shared`.

## Akzeptanzkriterien

| AC | Nachweis |
| --- | --- |
| AC-36F.1 | Die Fixture setzt den Plattform-PATH mit `node:path` `delimiter`; kein fest verdrahteter POSIX-Trenner bleibt. |
| AC-36F.2 | Auf Windows ist `ssh.cmd` vorhanden und liefert die GitHub-Account-Probe ohne Netzwerkzugriff oder reale SSH-Ausführung. |
| AC-36F.3 | Ein gesetztes `FAKE_SSH_ACCOUNT=wrong-account` wird vom CMD-Shim ausgegeben; PG26h bleibt ein echter Block-Negativtest. |
| AC-36F.4 | Die POSIX-Fixture bleibt für Nicht-Windows funktionsgleich; PG26a und PG26h sind fokussiert grün. |
| AC-36F.5 | Full Verify, Security-Evidenz, ein unabhängiger Critic und ein nativer Windows-Lauf binden den Kandidaten. |

## Grenzen und Rollback

Kein Produktions-Guard, keine reale SSH-Konfiguration, kein PATH-Discovery und
keine Backlog-Transition. Der Rollback ist ein normaler Revert des
Fixture-Commits; die fokussierte Suite und Full Verify werden auf dem Revert
erneut ausgeführt.
