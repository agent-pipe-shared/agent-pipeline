---
schema: pipeline.backlog-item.v1
id: pipeline.gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger
type: requirement
owner: pipeline
status: open
created: 2026-08-07
source: PO requirement (APS, 2026-08-07) — the finalized GMW and HGO modules in the next plugin version must write their evidence cleanly into the audit ledger Phoenix delivers; the information to log is "what was approved, when, why, by whom". Recorded with the concrete gaps the Elephant found on verification against the bound Phoenix acceptance criteria.
---

# GMW and HGO approval evidence must land in Phoenix's Human Governance Decision Ledger

## Description

Two mechanisms in this plugin grant a human the power to stand a guard down:

- **HGO** — human-guard-override (`plugins/pipeline-core/lib/human-guard-override.mjs`),
  the attended, single-use, audit-chained override consumed by `guard-testpath`
  and siblings when `gates.push_approval` is `chat`.
- **GMW** — Guard Maintenance Window (ADR-0058,
  `plugins/pipeline-core/lib/guard-maintenance-window.mjs`), the PO-signed,
  time-boxed record that lets GS-6 and TP-* honour one additional narrow allow.

Phoenix's PHX-2 package (Human Governance Decision Ledger, issue #30) is the
system of record these must feed. The PO requirement is that both, in their
finalized form, write their evidence into that ledger cleanly.

**The requested fields already have a home in the bound acceptance criteria.**
`specs/sprint-phoenix-epic/acceptance.md` H-AC-11 requires a reviewer be able
to reconstruct "request, actor/authority class and assurance, time and
assurance, exact scope, stable reason code, policy and rule digests, evidence,
outcome, consumption, revocation, expiry, correction, and supersession". Mapped
to the PO's four questions:

| PO question | Acceptance criterion |
| --- | --- |
| **what** was approved | H-AC-11 "request … exact scope"; H-AC-04's required binding dimensions (candidate, package, artifact, environment, action, rule, validity, single-use) |
| **when** | H-AC-11 "time and assurance" — and H-AC-05: locally attributed time must be recorded at the *lower* assurance class, never claimed as trusted time |
| **why** | H-AC-11 "stable reason code" |
| **by whom** | H-AC-11 "actor/authority class and assurance" |

## Three gaps found on verification, not assumed

**1. H-AC-12's enumeration does not name GMW.** H-AC-12 lists the existing
paths that must reference and validate the canonical decision ID before a
transition becomes effective: `guard-devplan`, `guard-push`, `pipeline-state`,
release planning, deploy approval/consumption, and Git-guard override
consumption. HGO is covered by that last entry. **GMW is absent** — the
acceptance criteria were written 2026-07-26 and GMW arrived in this branch on
2026-08-07 via the marketplace snapshot merge (`cca5ad8`). Any conformance run
against H-AC-12 as written would pass while GMW remains entirely outside the
ledger.

**2. GMW keeps no history at all today — its record is destroyed on close.**
`storagePaths()` places the window at
`<git-common-dir>/agent-pipeline/guard-maintenance-window/window.json`:
machine-local private state, not a portable append-only record.
`installGuardMaintenanceWindow` writes it with `writeAtomic` (overwrite), and
`closeGuardMaintenanceWindow` does `unlinkSync(paths.window)`. So after a
window is closed — the normal, encouraged end state — **there is no durable
evidence that it ever existed**, what it lifted, or for how long. This is the
single largest obstacle to the PO requirement: the audit trail is not merely
in the wrong place, for GMW it is not retained. H-AC-06's append-only rule for
portable records is the shape needed; GMW currently implements the opposite.

**3. "by whom" collides with Phoenix's own privacy design, and must not be
resolved by simply logging a name.** H-AC-05 states that a portable repository
record "SHALL contain only the non-identifying authority/actor class and
assurance; any natural-person attribution or joinable pseudonymous reference
SHALL remain in the separately protected, erasable machine-local profile", and
H-AC-13 rejects portable persistence of natural-person identifiers, joinable
pseudonyms and free-form rationale outright. So "by whom" is answerable, but
through **two records in different trust zones** — a portable one carrying
authority/actor class plus assurance, and a restricted machine-local one
carrying attribution, with no join handle between them (H-AC-11). The same
split applies to "why": a stable reason code is portable, the operator's
free-form reason is not. GMW's current `subject.reason` is free text and its
`intent` carries `featureId`/`planSha256`/`specSha256`/`candidate`, so the
split has to be designed, not assumed.

## Triggering situation

PO requirement stated 2026-08-07, immediately after the guard-blocked
verify-registration items were closed (commit `550b21f`), and framed as
forward work: "später sicherstellen, dass der finale GMW und HGO in der
nächsten Version ihre Evidenzen sauber in den Audit-Ledger schreiben, den
Phoenix dann liefert". The finalized GMW referred to is being produced in a
separate session; this item is the Phoenix-side obligation to receive it.

## Affected artifact

`specs/sprint-phoenix-epic/acceptance.md` (H-AC-11/H-AC-12 and, for the
retention question, H-AC-06), `specs/sprint-phoenix-epic/spec.md` §4.2/§7.4
(the PHX-2 human ledger and authority integration inventory), and on the
producing side `plugins/pipeline-core/lib/guard-maintenance-window.mjs`
(`storagePaths`, `installGuardMaintenanceWindow`,
`closeGuardMaintenanceWindow`) and
`plugins/pipeline-core/lib/human-guard-override.mjs`.

## Proposal

**Owner: PO / Phoenix implementation phase.** This is a requirement to satisfy,
not a decision to take — but three sub-decisions sit inside it and are
disclosed rather than pre-selected:

1. **H-AC-12 amendment.** Add GMW to the enumerated set of authority-granting
   paths. Mechanical once agreed, but it edits a bound acceptance artifact, so
   it follows the ordinary reviewed rebind path rather than an in-session edit.
2. **GMW retention.** Decide whether GMW emits a ledger event at *install*
   (window opened) and at *close*, or whether the window record itself becomes
   an append-only portable artifact. The first preserves GMW's current private
   storage and adds an emission; the second changes GMW's own storage contract.
   Emission is likely the smaller change and keeps the machine-local/portable
   split H-AC-05 needs, but this is the design call, not a foregone conclusion.
3. **The two-record split for actor and reason.** Design which fields are
   portable (authority/actor class, assurance, stable reason code, scope
   digests, rule ids, validity bounds) and which stay restricted machine-local
   (natural-person attribution, free-form reason), with no join handle — per
   H-AC-05/H-AC-11/H-AC-13.

Sequencing: this cannot complete before the finalized GMW lands from the other
session, and it should not be designed in ignorance of it. The Phoenix-side
work that *can* proceed independently is the H-AC-12 amendment and the field
mapping above.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Design (2026-08-07):** `specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md`
- **Review (2026-08-07):** Critic verdict `fail` on the first revision; findings F1..F7 in `specs/sprint-phoenix-epic/evidence/phx-ledger-intake-design-critic-review-f68a17d.md`, each resolved or explicitly bounded in the design (rework `PHX-LEDGER-INTAKE-rework-1`).
- **Review round 2 (2026-08-07):** five further findings resolved in rework `PHX-LEDGER-INTAKE-rework-2`; the material outcome for the PO is that proposal point 3's "no join handle" is **not attainable** for the GMW half — H-AC-11's first clause requires the portable record to carry the values that constitute the join — so the design now discloses the residual and asks for a decision (design §5.2 R-3, O-4).
- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
