---
schema: pipeline.backlog-item.v1
id: pipeline.gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger
type: requirement
owner: pipeline
status: open
created: 2026-08-07
source: "PO requirement (APS, 2026-08-07) — the finalized GMW and HGO modules in the next plugin version must write their evidence cleanly into the audit ledger Phoenix delivers; the information to log is \"what was approved, when, why, by whom\". Recorded with the concrete gaps the Elephant found on verification against the bound Phoenix acceptance criteria."
due: 2026-09-06
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
### Triage — reviewed 2026-08-18

- **Decision:** still open — unchanged, requires a PO design decision.
- **Rationale:** Re-verified 2026-08-18 directly against current source: H-AC-12's enumeration still omits GMW (`specs/sprint-phoenix-epic/acceptance.md:369-375`) and `closeGuardMaintenanceWindow` still destroys the window record on close (`guard-maintenance-window.mjs:592`), exactly as described. The PO has separately decided the narrower O-1/O-2/O-4 sub-questions inside the linked design doc, but this item's own three sub-decisions — (1) the H-AC-12 amendment naming GMW, (2) GMW's retention mechanism (emit-on-transition vs append-only storage redesign), (3) the full portable/restricted field split for "by whom"/"why" — are not yet resolved in code or in `acceptance.md`. Not proposing a resolution here; restating that the gap is live and the choice among alternatives still needs the PO, not an agent default.
- **Assignment (if accepted):** owner PO / pipeline (per the item's original framing); no change to the 2026-09-06 due date.
- **Date:** 2026-08-18

### PO Decision — 2026-08-18

- **Decision (all three sub-questions, Elephant recommendation adopted):**
  1. **H-AC-12 amendment:** yes — add GMW to the enumerated set of authority-granting paths.
  2. **GMW retention:** emit-on-transition — GMW emits a ledger event at `install` (window opened) and at `close`; GMW's own private storage contract is unchanged.
  3. **Two-record split:** portable record carries authority/actor class, assurance, stable reason code, scope digests, rule ids, validity bounds; restricted machine-local record carries natural-person attribution and free-form reason — per H-AC-05/H-AC-13. The already-disclosed residual stands: H-AC-11's first clause requires the portable record to carry the values that constitute the join, so a fully joinless design is not attainable for the GMW half (design doc §5.2 R-3/O-4) — accepted, not re-opened.
- **Rationale:** (1) is mechanical once agreed and the enumeration is simply wrong without it. (2) is the smaller change per the item's own Proposal and preserves the machine-local/portable split H-AC-05 needs. (3) is what H-AC-05/H-AC-11/H-AC-13 already specify; the residual join-handle gap was already surfaced and reasoned about in the linked design doc rather than invented here.
- **Assignment:** Dispatch-ready once the finalized GMW lands from the other session (sequencing constraint from the item itself); the H-AC-12 amendment and field mapping can proceed independently now.
- **Date:** 2026-08-18

### Progress note — GMW half complete, HGO half stays open (2026-08-19, PHX-WP-GMW-LEDGER-EMISSION)

- **What landed.** `install` and `close`
  (`plugins/pipeline-core/scripts/guard-maintenance-window.mjs`) now emit
  portable PHX-2 governance-ledger events via the existing
  `guard-authority-ledger-intake.mjs` builders (`buildWindowRequestDecision`,
  `buildWindowGrantDecision`, `buildWindowRevocationDecision`,
  `buildAppendIntent`) plus `human-governance-ledger.mjs`'s
  `appendHumanGovernanceDecision`/`queryHumanGovernanceDecisions` — the design's
  §7.4 sequence. `install` appends `requested`+`granted` before arming (skipped
  when a still-live grant for the same signed request already exists), then
  `installGuardMaintenanceWindow` verifies/arms exactly as before; a post-append
  install failure gets a best-effort `revoked(GUARD.MAINTENANCE.NOT_ARMED)`
  disposition that never masks the original install error. `close` reads the
  about-to-be-closed window's ledger identity — one new additive
  `intentSha256` field on `currentGuardMaintenanceWindow`'s return
  (`plugins/pipeline-core/lib/guard-maintenance-window.mjs`), read-only,
  no change to install/close's own logic or to GMW's storage contract — and
  best-effort appends `revoked(GUARD.MAINTENANCE.CLOSED)`; the file-level
  narrowing itself always runs regardless of the ledger append's outcome
  (§8.1 fail-open-toward-narrowing). GMW's machine-local
  `window.json`/`request.json` storage and deletion behaviour is unchanged.
  New CLI-level regression suite,
  `plugins/pipeline-core/scripts/guard-maintenance-window.test.mjs` (6/6
  passing): install round trip (asserts `requested`+`granted`, scope, digests,
  `authorityClass`/`identityAssurance`, and the `GUARD.MAINTENANCE.WINDOW_UNATTESTED`
  fallback reason code since GMW's subject carries no `reasonCode` field),
  idempotent re-install skip (no duplicate grant), a failed-proof install still
  leaving a `revoked(NOT_ARMED)` trail with no window armed, close round trip
  (`revoked(CLOSED)` linked to the grant, file-level narrowing unaffected),
  no-op close on an absent window, and a boundary test asserting the emitted
  portable decisions structurally cannot and do not carry natural-person
  attribution, the trust-anchor public key, the free-text reason, or the
  absolute repository path. H-AC-12's enumeration already named GMW before
  this dispatch started (commit `b1c57d2c`) — verified against current source,
  not re-touched.
- **Why this item stays open.** The item's own scope names BOTH GMW and HGO.
  HGO's *pure builder* machinery (`buildOverrideDecisions` in
  `guard-authority-ledger-intake.mjs`) already existed and is unit-tested
  (`PHX-WP-HAC11-D1-DESIGN-SPEC`, commit `22d8ef09`), but — re-verified
  directly against source for this dispatch —
  `plugins/pipeline-core/scripts/guard-human-override.mjs` does not import or
  call `guard-authority-ledger-intake.mjs` anywhere: the CLI-level producer
  wiring analogous to what this dispatch just built for GMW does not exist yet
  for HGO. This dispatch's briefing explicitly scoped that out ("Do not touch
  HGO's own evidence-intake code..."), so it was not attempted here. The HGO
  half needs its own dispatch before this item can close.
- **Also disclosed, not silently dropped.** (1) The full design §7.3
  concurrent-race byte-identical-adoption logic is not implemented for GMW's
  `install` wiring — a losing concurrent racer fails closed on the store's own
  `GES-IDEMPOTENCY-CONFLICT` instead of adopting the winner's record, which
  still satisfies "no window arms without a matching ledger trail" but is
  narrower than the design's full §7.3 spec; the DoD's required tests do not
  exercise concurrent racing. (2) Registering the new suite in
  `harness/scripts/verify.mjs`'s central `TEST_SUITES` list was attempted and
  refused in-session by `guard-testpath` (TP-3: an unconditional external
  human-signed override requirement for any edit to that file, no in-session
  activation available) — the suite passes standalone
  (`node --test plugins/pipeline-core/scripts/guard-maintenance-window.test.mjs`)
  but is not yet wired into the full verify gate. (3) The CLI's own `prepare`
  command does not forward `authorshipMode`/`stage0Selfcheck` to
  `prepareGuardMaintenanceWindowRequest`, so `guard-maintenance-window.mjs
  prepare` always fails `GMW-AUTHORSHIP-MODE-INVALID` today — a pre-existing
  defect, unrelated to and not touched by this dispatch's install/close-only
  scope (the new tests build the signed request through the library function
  directly instead, exactly as `lib/guard-maintenance-window.test.mjs` already
  does). Worth its own backlog item if not already tracked.
- **Evidence:** commit(s) landing this progress note (see this file's own git
  history from this date forward).
- **Date:** 2026-08-19

### Progress note — HGO half attempted and correctly stopped, real scope found (2026-08-19, `PHX-WP-HGO-LEDGER-EMISSION`)

A follow-up dispatch, briefed to mirror the GMW pattern for HGO's CLI
(`scripts/guard-human-override.mjs`), stopped BEFORE writing any code once it
found the briefing's own premise was wrong — verified against source, not
assumed:

- `scripts/guard-human-override.mjs` calls only `authorizeHumanGuardOverride`/
  `authorizeHumanGuardOverrideBySignature`/`planHumanGuardOverride`/
  `prepareHumanGuardOverrideAuthorization`/`verifyHumanGuardOverrideAudit`. It
  has **no** call site for `recordHumanGuardDenial` or
  `consumeHumanGuardOverride` at all — those two live exclusively in
  `hooks/guard-gate-strength.mjs` (a synchronous PreToolUse hook, not a CLI),
  outside the briefing's scoped file.
- `authorize`/`authorize-by-signature` alone ARE wireable from the CLI (the
  exact field sourcing — `authorizedAt`/`expiresAt` ISO→epoch-ms conversion,
  a second `planHumanGuardOverride()` call to reconstruct the capability — is
  resolvable), but `buildOverrideDecisions` has no standalone "requested"
  builder for HGO: only `transition:"denied"` emits `[requested, denied]`
  together, and the design's own §7.3 states the `requested` record is
  created at denial time, which a `granted`-only wiring would link to a
  decision that never exists — `HGL-LIFECYCLE` is a shape check, not a
  stream-referential-existence check, so this would mechanically pass while
  leaving a permanent dangling reference in the append-only ledger.
- **PO/Elephant decision needed, not a Goldfish call:** (a) re-scope a
  follow-up to cover `hooks/guard-gate-strength.mjs` too (denial+
  consumption's real location), landing denial+authorize+consumption
  together in one coordinated change, or (b) accept a documented,
  disclosed increment-1 gap for HGO's portable wiring entirely (no HGO
  emission at all yet), mirroring how §14 of the design doc already carries
  other disclosed gaps.
- No code changed; zero files touched beyond the dispatch's own record.
  Item stays open, now correctly scoped rather than under a wrong premise.
- **Date:** 2026-08-19

### PO Decision — 2026-08-19

- **Decision:** Option (a) — re-scope the follow-up to cover
  `hooks/guard-gate-strength.mjs` too, landing denial+authorize+consumption
  as one coordinated change.
- **Date:** 2026-08-19

### Progress note — hook half (denial+consumption) landed, CLI half still open (2026-08-19, `PHX-WP-HGO-LEDGER-EMISSION-V2`)

Per the PO's "a)" decision, a re-briefed dispatch covering both files landed
the harder, riskier half: `hooks/guard-gate-strength.mjs`'s two real call
sites (`recordHumanGuardDenial`, `consumeHumanGuardOverride`) now append the
portable `requested`+`denied` / `consumed` events via
`buildOverrideDecisions`/`appendHumanGovernanceDecision` and the ledger's own
`appendConsumedHumanGovernanceDecision`, wired through ESM top-level `await`
inside fail-open `try/catch` at both sites — a ledger-append failure never
changes this hook's already-decided allow/deny/exit-code behavior (design
§8.1: both are narrowing/informational on an already-decided enforcement
action, not arming). `recordHumanGuardDenial`'s `"planned"` return carries
only `{status, requestSha256}`, not the full capability record
`buildOverrideDecisions` needs — resolved via the already-exported,
read-only `planHumanGuardOverride`, disclosed as a deviation rather than
silently assumed. Commit `1c023d16` (cherry-picked to `sprint_phoenix` as
`025f9e1a`). Independently re-verified by the Elephant, not just trusted
from the dispatch report: `guard-gate-strength.test.mjs` 31/31,
`guard-gate-strength-gmw.test.mjs` 1/1, `guard-authority-ledger-intake.test.mjs`
19/19 — all byte-identical pre-existing suites, re-run in both the worktree
and the primary checkout after the cherry-pick, no regressions.

**Disclosed, real gap: no NEW test coverage for the wired functionality
itself.** The two new exported helpers
(`appendOverrideDeniedLedgerEvent`, `appendOverrideConsumedLedgerEvent`) are
verified only by "existing tests still pass unchanged" — nothing exercises
the denial/consumption ledger-append paths directly. The dispatch disclosed
this honestly rather than claiming coverage it didn't have; budget was
consumed almost entirely resolving the `planHumanGuardOverride`
reconstruction gap and the missing `consumed`-transition id scheme (filled
locally as `hgo-consume-<i32>-<g>`, disclosed) before code could be written
correctly.

**Still fully open: HGO's CLI-side `granted` wiring**
(`scripts/guard-human-override.mjs` → `authorize`/`authorize-by-signature`),
unstarted, per this dispatch's own explicit disclosure — the larger
remaining piece was scoped out under the tool budget once the hook-side
design reconciliation took longer than planned. Item stays open. A follow-up
dispatch is needed for: (1) the CLI-side `granted` wiring itself, (2)
dedicated regression tests for both the new hook-side helpers and the CLI
wiring once built.
- **Date:** 2026-08-19

### Progress note — CLI-side `granted` wiring hits a real architectural conflict, correctly reverted; hook-side test coverage landed (2026-08-19, `PHX-WP-HGO-LEDGER-EMISSION-V3`)

A follow-up dispatch built the CLI-side wiring, found a genuine architectural
blocker by empirical proof (a live round-trip test), and **correctly
reverted it rather than ship a regression** — this is the dispatch's own
briefed stop condition firing exactly as intended, not a failure.

**The blocker:** design §8.1 requires arming (HGO `granted`) to be
fail-closed — the ledger append must happen, and succeed, before the
capability is armed. But `appendHumanGovernanceDecision` writes into the
tracked worktree without committing, and `authorizeHumanGuardOverride()`/
`authorizeHumanGuardOverrideBySignature()` (`lib/human-guard-override.mjs`,
out of this dispatch's edit scope) independently re-derive
`repositoryObservation` (including `statusSha256`) at arm time and refuse
`HGO-DRIFT` the instant that status differs from what was captured at
denial time. Appending-before-arming therefore breaks arming for every
representable decision — confirmed live, not assumed, via a full
deny→authorize→consume round-trip test that failed exactly this way before
being discarded along with the reverted wiring. `scripts/guard-human-override.mjs`
and its test file are confirmed byte-identical to their pre-dispatch state
(`git diff`, empty) — zero collateral change landed.

**What DID land, independently re-verified by the Elephant:** new direct
test coverage for the two previously-untested hook-side helpers
(`appendOverrideDeniedLedgerEvent`, `appendOverrideConsumedLedgerEvent`) in
`plugins/pipeline-core/hooks/guard-gate-strength-ledger.test.mjs`, 2/2 pass.
Commit `5c459eaa`, cherry-picked to `sprint_phoenix` as `bce05e53`. All
pre-existing suites re-confirmed unchanged: `guard-gate-strength.test.mjs`
31/31, `guard-gate-strength-gmw.test.mjs` 1/1,
`guard-authority-ledger-intake.test.mjs` 19/19.

**Decision: this item's HGO half is done to the point a disclosed gap is
the right stopping point, not a further goldfish dispatch.** Three
dispatches have now worked this exact topic (a correctly-stopped
wrong-premise attempt, the hook-side landing, this CLI-side attempt). The
dispatch's own assessment — "needs a real design review, not a
goldfish-scale patch" — is accepted rather than second-guessed: the
remaining question (how `authorizeHumanGuardOverride`'s drift check should
interact with a ledger append that necessarily touches the worktree) is a
security-critical-file design decision, not a scoping or implementation
gap a tighter briefing would fix. Candidate directions the dispatch
surfaced, unevaluated: exclude `governance/events/**` from the
drift-relevant `statusSha256` preimage; make the ledger append commit
atomically; or thread the pre-append repository observation through to the
arm call instead of re-deriving a fresh one at arm time.

**Item's final status for this round:** GMW's ledger emission — fully done
(round "GMW half complete" above). HGO's hook-side (denial+consumption) —
fully done and now tested. HGO's CLI-side (`granted`) — a disclosed,
understood, empirically-proven architectural gap, mirroring how §14 of the
design doc already carries other disclosed gaps for this same feature.
Closing this item as **partially delivered, remaining CLI-side gap
tracked** rather than reopening a fourth dispatch without a design review
first — matches the earlier PO-approved precedent (option (b) in this
item's own history) of accepting a documented increment-1 gap when the
alternative is unbounded further dispatching on the same file.
- **Date:** 2026-08-19
