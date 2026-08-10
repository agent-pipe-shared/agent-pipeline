# ADR-0008: Permissions and Worktree Policy per Project

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

## Context

Permissions are evaluated deny → ask → allow; a deny cannot be overridden by any other level; Bash argument patterns are officially flagged as fragile. Worktrees are first-class (`claude --worktree`, `isolation: worktree`, `.worktreeinclude`; branch base defaults to `origin/HEAD`). The Checkpoint-1 review overturned the blanket worktree mandate (major finding L3-02): <PROJECT_C>'s editor-bound compile gate is fail-open inside a worktree, <PROJECT_A> pays `node_modules` cost per worktree, and Windows practice itself is ⚠ UNVERIFIED — hence a calibratable rule plus follow-up item A4 instead of an absolute mandate.

## Decision (E8, verbatim)

> Permissions committed per repo; worktree for write access per project calibration (Auflage/follow-up item A4); `defaultMode: plan` for <PROJECT_B> + <PROJECT_C>

Specifics:

- `.claude/settings.json` committed per repo (allow/ask/deny, `defaultMode`); personal loosening only in `settings.local.json`.
- Denies cut narrowly (a deny admits no exceptions); network control via WebFetch domain allowlist rather than fragile Bash argument patterns.
- Worktree is the default for write access; the binding tier and its fallback tier (e.g. branch instead of worktree) are set by project calibration.

## Consequences

**Positive:** every repo is self-describing (two machines, fresh clone); guard rules are versioned and reviewable; the `plan` default brakes costly missteps in the high-stakes projects (<PROJECT_B>: real hardware; <PROJECT_C>: expensive builds/PIE gates).

**Negative:** per-project worktree setup cost (node_modules, UE/LFS); the `plan` default costs a confirmation step in <PROJECT_B>/<PROJECT_C>'s everyday flow.

**Risk:** <PROJECT_C>'s compile gate is fail-open inside a worktree (evidenced) — worktree use for write access there is unvalidated until the A4 validation. OPEN (Phase 4, follow-up item A4): binding worktree tier, <PROJECT_A>'s `.worktreeinclude` for `.env.local`, fallback tier, and `worktree.baseRef` decision per project.

## Rejected alternatives

- **Blanket worktree mandate** — collides (evidenced) with <PROJECT_C>'s reality and unclear Windows practice; no absolute rule on a ⚠-UNVERIFIED evidence base (L3-02/L2-06).
- **Permissions only at user scope (`~/.claude`)** — not versioned, not project-specific, breaks on a fresh clone.
- **`defaultMode: plan` everywhere** — unnecessary friction for <PROJECT_A> (medium stakes); stakes should determine the discipline.

## Status

Accepted (2026-07-03, Checkpoint 1) · basis: Register E8 + follow-up item A4. Phase-4 follow-up (Auflage A4) resolved to `worktree: off` across all three project dossiers, confirmed at the Phase-4 acceptance gate; real-world practice validation deferred to each project's Sprint-1 sessions.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0008: Permission- und Worktree-Policy je Projekt

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E8 + Auflage A4

## Kontext

Permissions werden deny → ask → allow ausgewertet; ein deny ist von keiner Ebene aufhebbar; Bash-Argument-Patterns sind offiziell als fragil markiert. Worktrees sind erste Klasse (`claude --worktree`, `isolation: worktree`, `.worktreeinclude`; Branch-Basis default `origin/HEAD`). Das cp1-Review kippte die pauschale Worktree-Pflicht (major L3-02): <PROJECT_C>s Editor-gebundenes Compile-Gate ist im Worktree fail-open, <PROJECT_A> zahlt node_modules je Worktree, die Windows-Praxis ist ⚠ UNSICHER → kalibrierbare Regel + Auflage A4.

## Entscheidung (E8, wortgetreu)

> Permissions committed je Repo; Worktree für Schreibendes gemäß Projekt-Kalibrierung (Auflage A4); `defaultMode: plan` für <PROJECT_B> + <PROJECT_C>

Präzisierung:

- `.claude/settings.json` je Repo committed (allow/ask/deny, `defaultMode`); persönliche Lockerungen nur in `settings.local.json`.
- Denies eng schneiden (deny kennt keine Ausnahmen); Netzwerkkontrolle über WebFetch-Domain-Allowlist statt fragiler Bash-Argument-Patterns.
- Worktree ist der Default für Schreibendes; die verbindliche Stufe und die Fallback-Stufe (z. B. Branch statt Worktree) legt die Projekt-Kalibrierung fest.

## Konsequenzen

**Positiv:** jedes Repo self-describing (zwei Rechner, frischer Klon); Schutzregeln versioniert und reviewbar; der `plan`-Default bremst teure Fehländerungen in den High-Stakes-Projekten (<PROJECT_B>: reale Geräte; <PROJECT_C>: teure Builds/PIE-Gates).

**Negativ:** Worktree-Setupkosten je Projekt (node_modules, UE/LFS); `plan`-Default kostet einen Bestätigungsschritt im Alltag von <PROJECT_B>/<PROJECT_C>.

**Risiko:** <PROJECT_C>s Compile-Gate ist im Worktree fail-open (belegt) — dort ist Worktree-Einsatz für Schreibendes bis zur A4-Validierung nicht validiert. OFFEN (Phase 4, Auflage A4): verbindliche Worktree-Stufe, Fallback-Stufe und `worktree.baseRef`-Entscheid je Projekt.

## Verworfene Alternativen

- **Pauschale Worktree-Pflicht** — kollidiert belegt mit der <PROJECT_C>-Realität und unklarer Windows-Praxis; auf ⚠-UNSICHER-Beleglage keine absolute Regel (L3-02/L2-06).
- **Permissions nur im User-Scope (`~/.claude`)** — nicht versioniert, nicht projektspezifisch, bricht auf frischem Klon.
- **`defaultMode: plan` überall** — für <PROJECT_A> (mittlere Stakes) unnötige Reibung; Stakes bestimmen die Disziplin.

## Wiedervorlage

**Auflage A4 (Phase 4):** Worktree-Policy je Projekt validieren — besonders <PROJECT_C> (Editor-Gate fail-open!), <PROJECT_A> (`.worktreeinclude` für `.env.local`), `worktree.baseRef` je Projekt; Fallback-Stufe definieren.

**→ ERLEDIGT (Phase 4, 2026-07-04; Vermerk nachgetragen in Phase 5 auf DoD-Check-Befund):** Verdikt einheitlich `worktree: off` mit projektspezifischer Evidenz und Enablement-Pfad in allen drei Dossiers §5; vom PO mit der Phase-4-Abnahme bestätigt. Rest: realer Praxis-Nachvollzug in den jeweiligen Sprint-1-Sessions; Worktree-Enablement als AP-Sprint-Thema danach.
