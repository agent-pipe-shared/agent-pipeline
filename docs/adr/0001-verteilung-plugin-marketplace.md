# ADR-0001: Verteilung des Operating Model als Plugin/Marketplace

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E1

## Kontext

Das Operating Model existiert heute dreifach kopiert in <PROJECT_A>/<PROJECT_B>/<PROJECT_C>, mit belegter Divergenz — das zentrale Anti-Pattern der Bestandsaufnahme. Hooks — die harten Guardrails — lassen sich projektübergreifend nur über `~/.claude/settings.json` oder Plugins verteilen; `--add-dir` lädt keine Hooks. Nur der Plugin-/Marketplace-Weg bietet Versionierung, Pinning UND Hook-Verteilung; Plugins sind über die Cache-Kopie (`~/.claude/plugins/cache`) pfadunabhängig — entscheidend für zwei Rechner mit unterschiedlichen Pfaden.

## Entscheidung (E1, wortgetreu)

> Verteilung: Plugin/Marketplace aus diesem Repo; Bindung committed je Projekt (`extraKnownMarketplaces` + `enabledPlugins`); `~/.claude` nur Persönliches

Präzisierung: Dieses Repo (geplant `{{REPO_OWNER}}/agent-pipeline`, privat) ist der Marketplace (`.claude-plugin/marketplace.json`) und trägt das Plugin `pipeline-core` (skills/, agents/, hooks/). Jedes Projekt-Repo committet die Bindung in `.claude/settings.json` und ist damit self-describing: frischer Klon auf beliebigem Rechner genügt. Kein Submodule, keine Symlinks, kein Copy-Paste.

## Konsequenzen

**Positiv:**

- Hooks werden erstmals zentral verteilt und versioniert; Ende der Copy-Paste-Vererbung.
- Pfadunabhängig (Laptop + Haupt-PC); Projekte nach frischem Klon sofort korrekt gebunden.

**Negativ / Risiken:**

- Plugin-Cache kann veralten: in der SHA-Phase propagiert eine Änderung erst bei Refresh; Offline-Erstbindung schlägt fehl (Critic-Befund L3-03). Mitigation: Bootstrap mit SHA-/Staleness-Check ([ADR-0010](0010-session-bootstrap.md), Auflage A5).
- Neue Abhängigkeit vom GitHub-Remote für Updates; der Alltagsbetrieb nach Einrichtung läuft offline weiter.

## Verworfene Alternativen

- **git submodule** — pinnt exakt, ist aber die fehleranfälligste Option (Detached-HEAD, leere Verzeichnisse) und trifft ausgerechnet frisch startende Goldfish-Sessions.
- **Symlinks** — unter Windows per Default deaktiviert (Admin/Developer Mode nötig); die Doku rät selbst zum Import statt Symlink.
- **Copy-Sync / Template-Repo** — exakt das heutige Anti-Pattern: kein Update-Kanal, belegte Divergenz.
- **npm-Paket** — passt nur zu <PROJECT_A>; die Tag-basierte SemVer-Auflösung des Plugin-Systems greift bei npm-Quellen nicht.
- **Globales `~/.claude` als Träger** — nicht projektversioniert, nicht self-describing; Abhängigkeit von unversioniertem User-Scope bricht belegt auf frischem Klon.

## Wiedervorlage

Keine eigene. Versionierungsphasen: [ADR-0002](0002-versionierung-sha-dann-semver.md); Staleness-Betrieb: [ADR-0010](0010-session-bootstrap.md).
