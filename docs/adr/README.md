# ADR-Index — Agent-Pipeline

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This directory holds the project's Architecture Decision Records, which formalize the canonical decision register (E1–E25) plus the DoD-mandated decisions from the Checkpoint-1 conditions — the register wins on conflict. Each ADR is a German-language decision record (context, decision, consequences, discarded alternatives, follow-up) carrying a short English summary at its top; entries are numbered sequentially (`NNNN-<slug>.md`) and listed in the table below, and an ADR is never rewritten but superseded by a new one.

> Agent-Pipeline v0.1.0-draft · Sprint 1 (PAINKILLER) · Stand 2026-07-06

Architecture Decision Records der Agent-Pipeline. Die ADRs formalisieren das kanonische Entscheidungsregister **E1–E25** sowie die DoD-Pflicht-Entscheidungen aus den Checkpoint-1-Auflagen. **Bei Widerspruch gewinnt das Register.** Die Kandidaten ADR-1…9 entsprechen 0001…0009; die von Auflage A6 geforderten „ADR-10/ADR-11" sind 0010/0011. **E16/E17 haben KEINE eigenen ADRs** — sie sind Revisionsabschnitte in [0006](0006-modell-effort-policy.md) bzw. [0011](0011-sprachen-policy.md) (never-rewrite-Konvention: Revision statt neuem ADR, weil sie bestehende E6-/A6-Entscheidungen chirurgisch ändern, keine neuen Sachverhalte eröffnen).

> **Modellnamen in ADRs sind historisch.** Konkrete Modellnennungen in den ADRs spiegeln die Standard-Defaults des ursprünglichen Autoren-Teams (2026) zum jeweiligen Entscheidungszeitpunkt wider — sie sind Teil des historischen Belegs und werden nicht nachträglich generisiert. Die eigenen Modelle konfigurierst du in `pipeline.user.yaml`.

| Nr | Titel | Status | Datum |
|---|---|---|---|
| [0001](0001-verteilung-plugin-marketplace.md) | Verteilung des Operating Model als Plugin/Marketplace (E1) | akzeptiert | 2026-07-03 |
| [0002](0002-versionierung-sha-dann-semver.md) | Versionierungsstrategie — SHA-Phase, dann SemVer (E2) | akzeptiert | 2026-07-03 |
| [0003](0003-rollen-implementierung-subagents.md) | Rollen-Implementierung — Goldfish-Subagent, Critic read-only + `--bare`-Stufe (E3) | akzeptiert | 2026-07-03 |
| [0004](0004-spec-rigor-stufen-ears.md) | Spec-Rigor in drei Stufen + EARS-Akzeptanzkriterien (E4) | akzeptiert | 2026-07-03 |
| [0005](0005-quality-gates-dod.md) | Quality-Gate-Kette und zweigeteilte DoD (E5) | akzeptiert | 2026-07-03 |
| [0006](0006-modell-effort-policy.md) | Modell- und Effort-Policy je Rolle (E6) | akzeptiert | 2026-07-03 |
| [0007](0007-workflows-ultracode-opt-in.md) | Dynamic Workflows/Ultracode als Task-Opt-in (E7, A2) | akzeptiert | 2026-07-03 |
| [0008](0008-permissions-worktree-policy.md) | Permission- und Worktree-Policy je Projekt (E8, A4) | akzeptiert | 2026-07-03 |
| [0009](0009-session-hygiene-lifecycle.md) | Session-Hygiene und Session-Lifecycle (E9) | akzeptiert | 2026-07-03 |
| [0010](0010-session-bootstrap.md) | Session-Bootstrap-Mechanismus (A5/A6) | akzeptiert | 2026-07-03 |
| [0011](0011-sprachen-policy.md) | Sprachen-Policy — Deutsch für Menschen, Englisch für Agenten (A6) | akzeptiert | 2026-07-03 |
| [0012](0012-handover-kanonisierung.md) | Staffelstab — Kanonisierung der Handover-Quelle (E10, A9) | akzeptiert | 2026-07-03 |
| [0013](0013-git-guard-union.md) | git-guard als zentrale Union + Projekt-Deny-Config (E11) | akzeptiert | 2026-07-03 |
| [0014](0014-critic-kontrakt.md) | Critic-Kontrakt (E12, A10) | akzeptiert | 2026-07-03 |
| [0015](0015-selbstanwendung.md) | Selbstanwendung der Pipeline auf das Pipeline-Repo (E13) | akzeptiert | 2026-07-03 |
| [0016](0016-git-hosting-github.md) | Git-Hosting — bei GitHub bleiben (E14) | akzeptiert | 2026-07-06 |
| [0017](0017-push-policy-standing-approval.md) | Push-Policy — Standing-Approval für `main`-Push (E15) | akzeptiert | 2026-07-06 |
| [0018](0018-retro-prozess-elephant-selbstverfasst.md) | Retro-Prozess-Revision — Elephant verfasst Close-Retro selbst (E18) | akzeptiert | 2026-07-06 |
| [0019](0019-projekt-abgrenzung-ein-repo-ein-elephant.md) | Projekt-Abgrenzung — Ein Repo, ein Elephant zur Zeit (E19) | akzeptiert | 2026-07-06 |
| [0020](0020-el01-enforcement-goldfish-pflicht.md) | EL-01-Enforcement — Implementierung nur als gebriefter Goldfish-Dispatch (E20) | akzeptiert | 2026-07-06 |
| [0021](0021-prd-po-gate.md) | PRD-PO-Gate vor dem ersten Implementierungs-Dispatch (E21) | provisorisch | 2026-07-06 |
| [0022](0022-light-profil-xhigh-default.md) | Light-Dispatch-Profil + Goldfish-`xhigh`-Standard-Default (E22) | akzeptiert | 2026-07-06 |
| [0023](0023-elephant-kontext-diaet.md) | Elephant-Kontext-Diät & Latenz-Maßnahmenbündel (E23) | akzeptiert | 2026-07-06 |
| [0024](0024-critic-stufung-datenbasiert.md) | Critic-Stufung — datenbasierte Revision des E12/E6-Staffings (E24) | akzeptiert | 2026-07-06 |
| [0025](0025-haiku-research-fetcher.md) | Haiku-Research-Fetcher — Rescope von MP-03 (E25) | akzeptiert | 2026-07-06 |
| [0026](0026-rollenschnitt-elephant-goldfish-critic.md) | Rollenschnitt Elephant/Goldfish/Critic — Formalisierung + `plan-verifier` | akzeptiert | 2026-07-07 |
| [0027](0027-gate-philosophie.md) | Gate-Philosophie — genau 2 blockierende Human-Gates, QG-06-Revision | akzeptiert | 2026-07-07 |
| [0028](0028-manifest-ansatz.md) | Manifest-Ansatz — `.claude/pipeline.yaml` additiv, in-house YAML-Parser | akzeptiert | 2026-07-07 |
| [0029](0029-file-handoffs-status.md) | File-Handoffs & Status — `pipeline-state.json`, Evidenz-Frische statt Selbstberechnung | akzeptiert | 2026-07-07 |
| [0030](0030-governance-layer.md) | Governance-Layer — advisory Guidelines vs. enforcing Policies | akzeptiert | 2026-07-07 |
| [0031](0031-modell-routing-manifest.md) | Modell-Routing im Manifest — maschinenlesbare Projektion (Verweis ADR-0006) | akzeptiert | 2026-07-07 |
| [0032](0032-projekt-doku-struktur.md) | Projekt-Doku-Struktur — Release-Traceability, SBOM-Konvention, lebendes Architektur-Dokument (GREENFIELD) | akzeptiert | 2026-07-07 |

## Wiedervorlagen

| ADR | Termin / Trigger |
|---|---|
| [0002](0002-versionierung-sha-dann-semver.md) | Umstieg auf SemVer bei Stabilität (Kriterium OFFEN, Phase 5) |
| [0006](0006-modell-effort-policy.md) | **31.08.2026** — Preis-Review (Sonnet-5-Einführungspreis endet) |
| [0007](0007-workflows-ultracode-opt-in.md) | <PROJECT_B>-Sonderregel entfällt mit abgeschlossener Guard-Migration |
| [0008](0008-permissions-worktree-policy.md) | **ERLEDIGT** (Phase 4, 2026-07-04) — Worktree-Verdikt `worktree: off` je Projekt in den Migrationsdossiers, von the PO mit Phase-4-Abnahme bestätigt (s. ADR-Body „Wiedervorlage") |
| [0010](0010-session-bootstrap.md) | Bootstrap-Baustein (Phase 3), Zwei-Rechner-Validierung (Phase 4) |
| [0016](0016-git-hosting-github.md) | **31.08.2026** — gebündelt mit dem Preis-Review (0006); Kipp-Trigger GH-T1–GH-T7 laufend im Tooling-Radar |
| [0023](0023-elephant-kontext-diaet.md) | Messziel-Prüfung an der nächsten Feature-Session (Elephant-Anteil ≤50 %, Feature-Session <$30, Wall −30 %, First-Pass unverändert) |

## Konventionen

Format je ADR: Kontext → Entscheidung (wortgetreu zum Register) → Konsequenzen → Verworfene Alternativen → Wiedervorlage. Neue ADRs erhalten die nächste fortlaufende Nummer (`NNNN-<slug>.md`) und einen Eintrag in der Tabelle oben. Ein ADR wird nie umgeschrieben, sondern durch ein neues ADR ersetzt (Status „ersetzt durch NNNN").
