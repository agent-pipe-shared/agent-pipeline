# ADR-0001: Distributing the Operating Model as a Plugin/Marketplace

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

## Context

The Operating Model today exists as three copies across `<PROJECT_A>`/`<PROJECT_B>`/`<PROJECT_C>`, with documented divergence — the central anti-pattern found in the stocktaking. Hooks (the hard guardrails) can only be distributed across projects via `~/.claude/settings.json` or plugins; `--add-dir` does not load hooks. Only the plugin/marketplace path offers versioning, pinning, AND hook distribution; plugins are path-independent via the local cache copy (`~/.claude/plugins/cache`) — decisive for two machines with different local paths.

## Decision (E1, verbatim)

> Distribution: plugin/marketplace from this repo; binding committed per project (`extraKnownMarketplaces` + `enabledPlugins`); `~/.claude` for personal settings only

Detail: this repo (planned `{{REPO_OWNER}}/agent-pipeline`, private) is the marketplace (`.claude-plugin/marketplace.json`) and carries the `pipeline-core` plugin (skills/, agents/, hooks/). Each project repo commits the binding in its `.claude/settings.json` and is thereby self-describing: a fresh clone on any machine is sufficient. No submodule, no symlinks, no copy-paste.

## Consequences

**Positive:**

- Hooks are distributed and versioned centrally for the first time; ends copy-paste inheritance.
- Path-independent (laptop + main PC); projects are correctly bound immediately after a fresh clone.

**Negative / risks:**

- Plugin cache can go stale: during the SHA phase a change only propagates on refresh; a first offline binding fails (Critic finding L3-03). Mitigation: bootstrap with an SHA/staleness check ([ADR-0010](0010-session-bootstrap.md), condition A5).
- New dependency on the GitHub remote for updates; day-to-day operation after setup continues to run offline.

## Rejected alternatives

- **git submodule** — pins exactly, but is the most error-prone option (detached HEAD, empty directories) and hits freshly starting Goldfish sessions particularly hard.
- **Symlinks** — disabled by default on Windows (needs Admin/Developer Mode); the documentation itself recommends import over symlink.
- **Copy-sync / template repo** — exactly today's anti-pattern: no update channel, documented divergence.
- **npm package** — fits only `<PROJECT_A>`; the plugin system's tag-based SemVer resolution does not apply to npm sources.
- **Global `~/.claude` as carrier** — not project-versioned, not self-describing; dependency on unversioned user scope breaks on a fresh clone, as documented.

## Addendum (2026-07-11): install-scope canonicalization + auto-update posture

Running this operating model across two machines surfaced a double registration: the plugin binding existed both as the committed project-scope entry (E1, per project) AND, once, as an additional user-scope-global install on one machine. Two independent registrations mean two caches and two update paths — an unscoped `claude plugin update` (default `--scope user`) left the project-scope install stale (per fact-check against the shipped CLI behavior).

**D1 — Project-scope is the only canonical install path.** The committed `.claude/settings.json` already forces the project binding unavoidably (E1); an extra user-scope-global install is only a redundant second path and is discouraged in the setup output (see `setup.mjs`). Project-scope is self-describing for adopters and pinnable per project. Operational ritual: `claude plugin marketplace update agent-pipeline` → `claude plugin update pipeline-core@agent-pipeline --scope project` → `/reload-plugins`.

**D2 — No committed `autoUpdate` flag; the canon stays detect-and-prompt.** `autoUpdate` is documented only for managed settings; a committed project-level key is undocumented/unproven and is not carried in this repo's shipped configs. Background auto-update, where a user enables it locally, runs without the git credential helper and needs `GITHUB_TOKEN`/`GH_TOKEN` in the environment for a **private** marketplace repo — otherwise it fails silently at startup; `/reload-plugins` stays a manual step in every case (no hook can reload a running session). Consequence for an adopter: against the **public** upstream marketplace repo the native `/plugin → Marketplaces` auto-update toggle needs no token; bind the pipeline into your own **private** fork or repo instead, and the token caveat applies there. The distribution/update canon therefore stays the existing detect-and-prompt mechanism (the staleness-check hook plus the reload reminder in the bootstrap protocol, `harness/session-bootstrap.md` step 5b) — the native toggle is documented only as an optional, per-machine, non-committable convenience with these caveats named honestly.

**Consequence for E1:** E1 (committed project binding) stays valid unchanged; this addendum clarifies that project-scope is also the only *update* target scope, and that no auto-update automation is committed.

## Status

Accepted (2026-07-03, Checkpoint 1) · **Addendum** 2026-07-11 (install-scope canonicalization, see above) · Basis: Register E1. No standalone follow-up. Versioning phases: [ADR-0002](0002-versioning-sha-then-semver.md); staleness operation: [ADR-0010](0010-session-bootstrap.md).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0001: Verteilung des Operating Model als Plugin/Marketplace

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Nachtrag** 2026-07-11 (Install-Scope-Kanonisierung, s. u.) · **Grundlage:** Register E1

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

## Nachtrag (2026-07-11): Install-Scope-Kanonisierung + Auto-Update-Haltung

Der Betrieb dieses Operating Model über zwei Maschinen hinweg deckte eine Doppelregistrierung auf: Die Plugin-Bindung existierte sowohl als committeter Project-Scope-Eintrag (E1, je Projekt) ALS AUCH, einmalig, als zusätzlicher User-Scope-Global-Install auf einer Maschine. Zwei unabhängige Registrierungen bedeuten zwei Caches und zwei Update-Pfade — ein unscoped `claude plugin update` (Default `--scope user`) ließ die Project-Scope-Installation stale (Faktencheck gegen das ausgelieferte CLI-Verhalten).

**D1 — Project-Scope ist der einzige kanonische Install-Weg.** Die committete `.claude/settings.json` erzwingt die Project-Bindung ohnehin unvermeidbar (E1); ein zusätzlicher User-Scope-Global ist nur der redundante zweite Pfad und wird in der Setup-Ausgabe abgeraten (siehe `setup.mjs`). Project-Scope ist self-describing für Adopter und je Projekt pinbar. Betriebs-Ritual: `claude plugin marketplace update agent-pipeline` → `claude plugin update pipeline-core@agent-pipeline --scope project` → `/reload-plugins`.

**D2 — Kein committeter `autoUpdate`-Flag; Kanon bleibt Detect-and-Prompt.** `autoUpdate` ist nur für managed settings dokumentiert; ein committeter Projekt-Key ist undokumentiert/unbelegt und wird in den mitgelieferten Configs dieses Repos nicht geführt. Aktiviert ein Adopter lokal Hintergrund-Auto-Update, läuft es ohne Git-Credential-Helper und braucht `GITHUB_TOKEN`/`GH_TOKEN` in der Umgebung für ein **privates** Marketplace-Repo — sonst scheitert es still beim Start; `/reload-plugins` bleibt in jedem Fall ein manueller Schritt (kein Hook kann eine laufende Session neu laden). Konsequenz für einen Adopter: Gegen das **öffentliche** Upstream-Marketplace-Repo braucht der native `/plugin → Marketplaces`-Auto-Update-Toggle keinen Token; bindet ein Adopter die Pipeline stattdessen an einen eigenen **privaten** Fork bzw. ein privates Repo, greift dort der Token-Vorbehalt. Der Verteilungs-/Update-Kanon bleibt deshalb der bestehende Detect-and-Prompt-Mechanismus (der Staleness-Check-Hook plus der Reload-Reminder im Bootstrap-Protokoll, `harness/session-bootstrap.md` Schritt 5b) — der native Toggle wird nur als optionaler, per-Maschine nicht committbarer Komfort mit ehrlich benannten Vorbehalten dokumentiert.

**Konsequenz für E1:** E1 (committete Project-Bindung) bleibt unverändert gültig; dieser Nachtrag präzisiert, dass Project-Scope auch der einzige *Update*-Zielscope ist und dass keine Auto-Update-Automatik committet wird.

## Wiedervorlage

Keine eigene. Versionierungsphasen: [ADR-0002](0002-versioning-sha-then-semver.md); Staleness-Betrieb: [ADR-0010](0010-session-bootstrap.md).
