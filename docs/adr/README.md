# ADR-Index — Agent-Pipeline

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This directory holds the project's Architecture Decision Records, which formalize the canonical decision register (E1–E25) plus the DoD-mandated decisions from the Checkpoint-1 conditions — the register wins on conflict. Each ADR is an English-primary decision record (context, decision, consequences, discarded alternatives, follow-up) with a full German reference translation below a skip marker; entries are numbered sequentially (`NNNN-<slug>.md`) and listed in the table below, and an ADR is never rewritten but superseded by a new one.

> Agent-Pipeline v0.1.0-draft · Sprint 1 (PAINKILLER) · as of 2026-07-06

The candidate ADR-1…9 correspond to 0001…0009; the "ADR-10/ADR-11" required by condition A6 are 0010/0011. **E16/E17 have NO ADRs of their own** — they are revision sections in [0006](0006-model-effort-policy.md) and [0011](0011-language-policy.md) respectively (never-rewrite convention: a revision instead of a new ADR, because they surgically amend existing E6/A6 decisions without opening any new subject matter).

> **Model names in ADRs are historical.** Concrete model mentions in the ADRs reflect the standard defaults of the original author team (2026) at the respective decision point — they are part of the historical record and are not retroactively genericized. Configure your own models in `pipeline.user.yaml`.

| No. | Title | Status | Date |
|---|---|---|---|
| [0001](0001-distribution-plugin-marketplace.md) | Distribution of the operating model as plugin/marketplace (E1) | accepted | 2026-07-03 |
| [0002](0002-versioning-sha-then-semver.md) | Versioning strategy — SHA phase, then SemVer (E2) | accepted | 2026-07-03 |
| [0003](0003-role-implementation-subagents.md) | Role implementation — Goldfish subagent, Critic read-only + `--bare` tier (E3) | accepted | 2026-07-03 |
| [0004](0004-spec-rigor-tiers-ears.md) | Spec rigor in three tiers + EARS acceptance criteria (E4) | accepted | 2026-07-03 |
| [0005](0005-quality-gates-dod.md) | Quality-gate chain and two-part DoD (E5) | accepted | 2026-07-03 |
| [0006](0006-model-effort-policy.md) | Model and effort policy per role (E6) | accepted | 2026-07-03 |
| [0007](0007-workflows-ultracode-opt-in.md) | Dynamic workflows/Ultracode as task opt-in (E7, A2) | accepted | 2026-07-03 |
| [0008](0008-permissions-worktree-policy.md) | Permission and worktree policy per project (E8, A4) | accepted | 2026-07-03 |
| [0009](0009-session-hygiene-lifecycle.md) | Session hygiene and session lifecycle (E9) | accepted | 2026-07-03 |
| [0010](0010-session-bootstrap.md) | Session bootstrap mechanism (A5/A6) | accepted | 2026-07-03 |
| [0011](0011-language-policy.md) | Language policy — German for humans, English for agents (A6) | accepted | 2026-07-03 |
| [0012](0012-handover-canonicalization.md) | Handover baton — canonicalization of the handover source (E10, A9) | accepted | 2026-07-03 |
| [0013](0013-git-guard-union.md) | git-guard as central union + project deny-config (E11) | accepted | 2026-07-03 |
| [0014](0014-critic-contract.md) | Critic contract (E12, A10) | accepted | 2026-07-03 |
| [0015](0015-self-application.md) | Self-application of the pipeline to the pipeline repo (E13) | accepted | 2026-07-03 |
| [0016](0016-git-hosting-github.md) | Git hosting — staying with GitHub (E14) | accepted | 2026-07-06 |
| [0017](0017-push-policy-standing-approval.md) | Push policy — standing approval for `main` push (E15) | accepted | 2026-07-06 |
| [0018](0018-retro-process-elephant-authored.md) | Retro-process revision — Elephant authors the close retro itself (E18) | accepted | 2026-07-06 |
| [0019](0019-project-scoping-one-repo-one-elephant.md) | Project boundary — one repo, one Elephant at a time (E19) | accepted | 2026-07-06 |
| [0020](0020-el01-enforcement-goldfish-duty.md) | EL-01 enforcement — implementation only as a briefed Goldfish dispatch (E20) | accepted | 2026-07-06 |
| [0021](0021-prd-po-gate.md) | PRD/PO gate before the first implementation dispatch (E21) | provisional | 2026-07-06 |
| [0022](0022-light-profile-xhigh-default.md) | Light dispatch profile + Goldfish `xhigh` default (E22) | accepted | 2026-07-06 |
| [0023](0023-elephant-context-diet.md) | Elephant context diet & latency measure bundle (E23) | accepted | 2026-07-06 |
| [0024](0024-critic-staffing-data-based.md) | Critic tiering — data-based revision of the E12/E6 staffing (E24) | accepted | 2026-07-06 |
| [0025](0025-haiku-research-fetcher.md) | Haiku research fetcher — rescope of MP-03 (E25) | accepted | 2026-07-06 |
| [0026](0026-role-split-elephant-goldfish-critic.md) | Role cut Elephant/Goldfish/Critic — formalization + `plan-verifier` | accepted | 2026-07-07 |
| [0027](0027-gate-philosophy.md) | Gate philosophy — exactly 2 blocking human gates, QG-06 revision | accepted | 2026-07-07 |
| [0028](0028-manifest-approach.md) | Manifest approach — `.claude/pipeline.yaml` additive, in-house YAML parser | accepted | 2026-07-07 |
| [0029](0029-file-handoffs-status.md) | File handoffs & status — `pipeline-state.json`, evidence freshness instead of self-calculation | accepted | 2026-07-07 |
| [0030](0030-governance-layer.md) | Governance layer — advisory guidelines vs. enforcing policies | accepted | 2026-07-07 |
| [0031](0031-model-routing-manifest.md) | Model routing in the manifest — machine-readable projection (reference ADR-0006) | accepted | 2026-07-07 |
| [0032](0032-project-doc-structure.md) | Project documentation structure — release traceability, SBOM convention, living architecture document (GREENFIELD) | accepted | 2026-07-07 |
| [0033](0033-release-promotion-phase.md) | Release/Promotion phase — optional, adapter-based SDLC tail phase | accepted | 2026-07-11 |
| [0034](0034-deploy-precedence-central-vs-project.md) | Precedence — central deploy policy vs. project manifest, a new axis | accepted | 2026-07-11 |
| [0035](0035-codex-native-normal-critic.md) | Codex normal Critic through a native host boundary | accepted | 2026-07-15 |

### Resubmissions

| ADR | Date / trigger |
|---|---|
| [0002](0002-versioning-sha-then-semver.md) | Switch to SemVer once stable (criterion OPEN, phase 5) |
| [0006](0006-model-effort-policy.md) | **2026-08-31** — price review (Sonnet-5 introductory pricing ends) |
| [0007](0007-workflows-ultracode-opt-in.md) | `<PROJECT_B>` special rule lapses once the guard migration is complete |
| [0008](0008-permissions-worktree-policy.md) | **DONE** (phase 4, 2026-07-04) — worktree verdict `worktree: off` per project in the migration dossiers, confirmed by the PO with the phase-4 acceptance (see ADR body "Resubmission") |
| [0010](0010-session-bootstrap.md) | Bootstrap building block (phase 3), two-machine validation (phase 4) |
| [0016](0016-git-hosting-github.md) | **2026-08-31** — bundled with the price review (0006); tipping triggers GH-T1–GH-T7 tracked ongoing in the tooling radar |
| [0023](0023-elephant-context-diet.md) | Measurement-goal check at the next feature session (Elephant share ≤50%, feature session <$30, wall time −30%, first-pass unchanged) |

### Conventions

Format per ADR: context → decision (verbatim to the register) → consequences → discarded alternatives → resubmission. New ADRs receive the next sequential number (`NNNN-<slug>.md`) and an entry in the table above. An ADR is never rewritten, only superseded by a new one (status "superseded by NNNN").

**Numbering is per-repo, not 1:1 with any other copy of this project:** ADR numbers here are assigned independently of numbering in any other copy or fork of this codebase that may exist elsewhere — the same number is not guaranteed to denote the same topic across copies, and vice versa. This is an accepted, documented instance of that general fact, not a defect.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

Architecture Decision Records der Agent-Pipeline. Die ADRs formalisieren das kanonische Entscheidungsregister **E1–E25** sowie die DoD-Pflicht-Entscheidungen aus den Checkpoint-1-Auflagen. **Bei Widerspruch gewinnt das Register.** Die Kandidaten ADR-1…9 entsprechen 0001…0009; die von Auflage A6 geforderten „ADR-10/ADR-11" sind 0010/0011. **E16/E17 haben KEINE eigenen ADRs** — sie sind Revisionsabschnitte in [0006](0006-model-effort-policy.md) bzw. [0011](0011-language-policy.md) (never-rewrite-Konvention: Revision statt neuem ADR, weil sie bestehende E6-/A6-Entscheidungen chirurgisch ändern, keine neuen Sachverhalte eröffnen).

> **Modellnamen in ADRs sind historisch.** Konkrete Modellnennungen in den ADRs spiegeln die Standard-Defaults des ursprünglichen Autoren-Teams (2026) zum jeweiligen Entscheidungszeitpunkt wider — sie sind Teil des historischen Belegs und werden nicht nachträglich generisiert. Die eigenen Modelle konfigurierst du in `pipeline.user.yaml`.

| Nr | Titel | Status | Datum |
|---|---|---|---|
| [0001](0001-distribution-plugin-marketplace.md) | Verteilung des Operating Model als Plugin/Marketplace (E1) | akzeptiert | 2026-07-03 |
| [0002](0002-versioning-sha-then-semver.md) | Versionierungsstrategie — SHA-Phase, dann SemVer (E2) | akzeptiert | 2026-07-03 |
| [0003](0003-role-implementation-subagents.md) | Rollen-Implementierung — Goldfish-Subagent, Critic read-only + `--bare`-Stufe (E3) | akzeptiert | 2026-07-03 |
| [0004](0004-spec-rigor-tiers-ears.md) | Spec-Rigor in drei Stufen + EARS-Akzeptanzkriterien (E4) | akzeptiert | 2026-07-03 |
| [0005](0005-quality-gates-dod.md) | Quality-Gate-Kette und zweigeteilte DoD (E5) | akzeptiert | 2026-07-03 |
| [0006](0006-model-effort-policy.md) | Modell- und Effort-Policy je Rolle (E6) | akzeptiert | 2026-07-03 |
| [0007](0007-workflows-ultracode-opt-in.md) | Dynamic Workflows/Ultracode als Task-Opt-in (E7, A2) | akzeptiert | 2026-07-03 |
| [0008](0008-permissions-worktree-policy.md) | Permission- und Worktree-Policy je Projekt (E8, A4) | akzeptiert | 2026-07-03 |
| [0009](0009-session-hygiene-lifecycle.md) | Session-Hygiene und Session-Lifecycle (E9) | akzeptiert | 2026-07-03 |
| [0010](0010-session-bootstrap.md) | Session-Bootstrap-Mechanismus (A5/A6) | akzeptiert | 2026-07-03 |
| [0011](0011-language-policy.md) | Sprachen-Policy — Deutsch für Menschen, Englisch für Agenten (A6) | akzeptiert | 2026-07-03 |
| [0012](0012-handover-canonicalization.md) | Staffelstab — Kanonisierung der Handover-Quelle (E10, A9) | akzeptiert | 2026-07-03 |
| [0013](0013-git-guard-union.md) | git-guard als zentrale Union + Projekt-Deny-Config (E11) | akzeptiert | 2026-07-03 |
| [0014](0014-critic-contract.md) | Critic-Kontrakt (E12, A10) | akzeptiert | 2026-07-03 |
| [0015](0015-self-application.md) | Selbstanwendung der Pipeline auf das Pipeline-Repo (E13) | akzeptiert | 2026-07-03 |
| [0016](0016-git-hosting-github.md) | Git-Hosting — bei GitHub bleiben (E14) | akzeptiert | 2026-07-06 |
| [0017](0017-push-policy-standing-approval.md) | Push-Policy — Standing-Approval für `main`-Push (E15) | akzeptiert | 2026-07-06 |
| [0018](0018-retro-process-elephant-authored.md) | Retro-Prozess-Revision — Elephant verfasst Close-Retro selbst (E18) | akzeptiert | 2026-07-06 |
| [0019](0019-project-scoping-one-repo-one-elephant.md) | Projekt-Abgrenzung — Ein Repo, ein Elephant zur Zeit (E19) | akzeptiert | 2026-07-06 |
| [0020](0020-el01-enforcement-goldfish-duty.md) | EL-01-Enforcement — Implementierung nur als gebriefter Goldfish-Dispatch (E20) | akzeptiert | 2026-07-06 |
| [0021](0021-prd-po-gate.md) | PRD-PO-Gate vor dem ersten Implementierungs-Dispatch (E21) | provisorisch | 2026-07-06 |
| [0022](0022-light-profile-xhigh-default.md) | Light-Dispatch-Profil + Goldfish-`xhigh`-Standard-Default (E22) | akzeptiert | 2026-07-06 |
| [0023](0023-elephant-context-diet.md) | Elephant-Kontext-Diät & Latenz-Maßnahmenbündel (E23) | akzeptiert | 2026-07-06 |
| [0024](0024-critic-staffing-data-based.md) | Critic-Stufung — datenbasierte Revision des E12/E6-Staffings (E24) | akzeptiert | 2026-07-06 |
| [0025](0025-haiku-research-fetcher.md) | Haiku-Research-Fetcher — Rescope von MP-03 (E25) | akzeptiert | 2026-07-06 |
| [0026](0026-role-split-elephant-goldfish-critic.md) | Rollenschnitt Elephant/Goldfish/Critic — Formalisierung + `plan-verifier` | akzeptiert | 2026-07-07 |
| [0027](0027-gate-philosophy.md) | Gate-Philosophie — genau 2 blockierende Human-Gates, QG-06-Revision | akzeptiert | 2026-07-07 |
| [0028](0028-manifest-approach.md) | Manifest-Ansatz — `.claude/pipeline.yaml` additiv, in-house YAML-Parser | akzeptiert | 2026-07-07 |
| [0029](0029-file-handoffs-status.md) | File-Handoffs & Status — `pipeline-state.json`, Evidenz-Frische statt Selbstberechnung | akzeptiert | 2026-07-07 |
| [0030](0030-governance-layer.md) | Governance-Layer — advisory Guidelines vs. enforcing Policies | akzeptiert | 2026-07-07 |
| [0031](0031-model-routing-manifest.md) | Modell-Routing im Manifest — maschinenlesbare Projektion (Verweis ADR-0006) | akzeptiert | 2026-07-07 |
| [0032](0032-project-doc-structure.md) | Projekt-Doku-Struktur — Release-Traceability, SBOM-Konvention, lebendes Architektur-Dokument (GREENFIELD) | akzeptiert | 2026-07-07 |
| [0033](0033-release-promotion-phase.md) | Release/Promotion-Phase — optionale, adapter-basierte SDLC-Tail-Phase | akzeptiert | 2026-07-11 |
| [0034](0034-deploy-precedence-central-vs-project.md) | Präzedenz — zentrale Deploy-Policy vs. Projekt-Manifest, eine neue Achse | akzeptiert | 2026-07-11 |
| [0035](0035-codex-native-normal-critic.md) | Normaler Codex-Critic über eine native Host-Grenze | akzeptiert | 2026-07-15 |

## Wiedervorlagen

| ADR | Termin / Trigger |
|---|---|
| [0002](0002-versioning-sha-then-semver.md) | Umstieg auf SemVer bei Stabilität (Kriterium OFFEN, Phase 5) |
| [0006](0006-model-effort-policy.md) | **31.08.2026** — Preis-Review (Sonnet-5-Einführungspreis endet) |
| [0007](0007-workflows-ultracode-opt-in.md) | <PROJECT_B>-Sonderregel entfällt mit abgeschlossener Guard-Migration |
| [0008](0008-permissions-worktree-policy.md) | **ERLEDIGT** (Phase 4, 2026-07-04) — Worktree-Verdikt `worktree: off` je Projekt in den Migrationsdossiers, von the PO mit Phase-4-Abnahme bestätigt (s. ADR-Body „Wiedervorlage") |
| [0010](0010-session-bootstrap.md) | Bootstrap-Baustein (Phase 3), Zwei-Rechner-Validierung (Phase 4) |
| [0016](0016-git-hosting-github.md) | **31.08.2026** — gebündelt mit dem Preis-Review (0006); Kipp-Trigger GH-T1–GH-T7 laufend im Tooling-Radar |
| [0023](0023-elephant-context-diet.md) | Messziel-Prüfung an der nächsten Feature-Session (Elephant-Anteil ≤50 %, Feature-Session <$30, Wall −30 %, First-Pass unverändert) |

## Konventionen

Format je ADR: Kontext → Entscheidung (wortgetreu zum Register) → Konsequenzen → Verworfene Alternativen → Wiedervorlage. Neue ADRs erhalten die nächste fortlaufende Nummer (`NNNN-<slug>.md`) und einen Eintrag in der Tabelle oben. Ein ADR wird nie umgeschrieben, sondern durch ein neues ADR ersetzt (Status „ersetzt durch NNNN").

**Nummerierung ist repo-eigen, nicht 1:1 mit anderen Kopien dieses Projekts:** ADR-Nummern werden hier unabhängig von der Nummerierung in etwaigen anderen Kopien oder Forks dieses Codebase vergeben — dieselbe Nummer bezeichnet nicht garantiert dasselbe Thema über Kopien hinweg, und umgekehrt. Das ist eine akzeptierte, dokumentierte Instanz dieser generellen Tatsache, kein Defekt.
