# ADOPT-D: how this repository adopts its architecture map (diagnosis, Ruling 160)

Dispatch ADOPT-D-20261009 (goldfish-deep, Sonnet 5.5 / xhigh). Read-only diagnosis against candidate `434a01bb1`.
No state-writing verb was run; no file other than this report was written. Independent review: pending. PO acceptance:
pending. Captures (git-ignored, repo-root `evidence/ADOPT-D-20261009/`): `propose.txt` (exit 0), `check-sprint-scope.txt`
(exit 0, `ok: true`, disposition `deferred`). Line numbers below are at this candidate.

Ruling 160 (quoted, scope of this diagnosis): "The new decision must go through the D4 route itself (typed state, priced
staged proposal, one durable signed PO decision, evidence set), which is exactly AC-9." and "Adopting mid-sprint must not
lock the remaining 0.7.0 slices out."

## Headline findings

1. **No recovery verb is needed.** A signed `deferred` state is superseded by a fresh signed `approved-scoped` decision
   through `prepare` -> PO signature -> `apply`. `applyAdoptionDecision` has no check against an existing state and
   overwrites `architecture/adoption-state.json` atomically (`scripts/architecture-adoption.mjs:273-334`,
   `lib/architecture-adoption-authority.mjs:166-170`). `propose` prints `decisionOptions: []` and "No repeat adoption
   decision: retain the existing durable disposition" while a state exists (`:248`, `:254-256`; `propose.txt`), but that is
   advisory output only, `apply` never reads it.
2. **The scope is load-bearing and a sprint-only scope would lock the remaining slices out.** Fitness class 9 (profile
   drift) is evaluated against the signed snapshot only when the signed scope covers all of `architecture/map`,
   `project/pipeline.json` and `pipeline.user.yaml` (`scripts/architecture-fitness.mjs:742-743`). Otherwise class 9 is
   `unavailable`, and an `unavailable` class 9 is tolerated as report-only ONLY under the `deferred` disposition
   (`lib/architecture-entry-readiness.mjs:189-196`). Under `approved-scoped` it makes the planning fitness not ready
   (`:438-447`, `ARCHITECTURE-FITNESS-NOT-READY`) and every later `set-phase --phase implementation` is refused.
3. **Ruling 160's premise about the profile is inaccurate.** `architecture/agent-first-profile.v1.json` is not a required
   artifact: the inherited profile ships at `plugins/pipeline-core/architecture/agent-first-profile.v1.json` (exists;
   `specs/sprint-alfred-epic/spec.md:515`), AC-8 (`acceptance.md:25`) names no path, and the code only carries the id
   `inherited-agent-first` (`architecture-fitness.mjs:64`, `:1067`). Nothing has to be created for the profile.
4. **The gates act only at the planning boundary.** None of the adoption-state readers sits on the Goldfish dispatch path,
   the commit path or an Edit/Write path (see (c)). In-flight dispatches are not refused by adoption.
5. **The deferral lapses on 2026-10-20 anyway** (`adoption-state.json` `reviewDate`; `resolveAdoptionState` re-raises
   `adoption-required` at or after the earliest of `expiresAt`/`reviewDate`, `architecture-adoption.mjs:89-106`), after
   which `set-phase implementation` fails closed with `expired-deferral` (`:354-360`).

## (a) The D4 command sequence

All verbs are `node plugins/pipeline-core/scripts/architecture-adoption.mjs <verb>`. There is no `--help` (an unknown
option throws, `:481`); the valid verbs are `status | propose | prepare | apply | check` (`:573`). `--scope` may repeat
and also sets the task scope to its last value (`:454-457`); `--root` defaults to the cwd.

| # | Step | Who | Writes state? | Notes |
|---|------|-----|---------------|-------|
| 0 | `status --json`, `check --json --scope <plan dir>`, `propose --json` | agent | no | Baseline. `status` exits 1 only for `adoption-required` (`:502`). Today: `deferred`, `check` ok. |
| 1 | Land every map prerequisite and freeze the three bound inputs (see (b)) | agent (dispatches) | files, committed | The signature binds HEAD commit+tree and three input digests; nothing may move afterwards. |
| 2 | `prepare --decision approved-scoped --scope <s> [--scope <s2> ...] --rationale <text> --decision-ref <ref> --decided-at <canonical ISO>` | agent | no (prints a request, `lib:134-138`) | `--decision-ref` and `--decided-at` are required (`lib:83-86`; the CLI passes `decidedAt = null` when omitted, which throws). Request mode is `signature` in this repo (`readHumanApprovalMode`), `chat-attributed-unattested` in chat mode. The request carries candidate = HEAD commit/tree and the digests of `project/pipeline.json`, `pipeline.user.yaml` and every file in `architecture/map/` (`lib:67-102`). |
| 3 | PO signs the intent | PO | no | Intent `pipeline.po-approval-intent.v1`, kind `architecture-adoption`, policyRevision `adoption-authority-v1` (`lib:121-132`); proof `pipeline.po-approval-proof.v1` (`intentSha256`, `keyReference`, `publicKey`, `signatureBase64`) verified by `verifyAgainstTrustAnchors` (`lib:160-163`). Shape as in the existing state (`adoption-state.json:58-64`). |
| 4 | `apply --decision approved-scoped --scope ... --rationale <identical> --decision-ref <identical> --request <file> --proof <file> --by <name> --json` | agent, immediately after the signature | **yes** (`architecture/adoption-state.json`) | `requireCurrent` demands HEAD commit+tree and all three digests identical to step 2 (`lib:152`, `ADOPTION-AUTHORITY-INPUT-CHANGED`) and the recomputed subject hash equal to the signed one (`:301-302`). `--rationale` defaults to a fixed text (`:444`), so omitting it or any flag that differs from `prepare` yields `ADOPTION-AUTHORITY-SUBJECT-MISMATCH`. `decidedAt` is taken from the signed request (`:296`). |
| 5 | Commit `architecture/adoption-state.json` | agent | commit | Later commits do not invalidate the signature: read-time verification runs without `requireCurrent` (`:85`). Only fitness class 9 compares the snapshot afterwards (see (c)). |
| 6 | Readback: `status --json`, `check --scope`, the preflight `architectureOrientation` block, entry readiness | agent | no | Orientation currently reports `decision-recorded`, state `deferred`, `physicalMap.status: present-unvalidated`, `nextAction: null` (preflight output, this run). |

Constraints on steps 2-4: the repo's rule "no tree mutation while a HEAD-bound PO command is outstanding" applies
verbatim, so the swarm must be quiet from `prepare` until `apply` returns. The deferral signature uses a legacy
path-bound repository fingerprint that `acceptsLegacyDeferredIdentity` tolerates for `deferred` only
(`lib:27-33`); a new decision uses the `origin`-URL fingerprint (`lib:20-25`) and falls back to a checkout-path-bound
fingerprint when no `origin` remote exists, which would not survive the second machine. Not checked here (open item 3).
The `--request`/`--proof` inputs are JSON files read by the CLI (`:466-471`); how the request file is produced under the
closed shell grammar (no redirects; the capture wrapper adds header lines) was not resolved (open item 2).

## (b) Map artifacts: existence and currency at HEAD

| Artifact | Exists | Current? |
|---|---|---|
| `architecture/adoption-state.json` | yes, `deferred`, signed 2026-09-20, `reviewDate` 2026-10-20 | superseded by this route |
| `architecture/map/{index,backlog,governance,harness,pipeline-core,schemas}.md`, `overview.html` | yes | loads as a valid bundle: `propose` reports 5 modules (backlog, governance, harness, pipeline-core, schemas), `uncoveredPaths: []`, `unknownCoverageShare: 0`, stage 1 effort "measured". Last touched 2026-09-29/30 (`b36a220db`, `96dd4a5c1`); contract currency against the many 0.7.0 commits since is **not measured** (preflight: `present-unvalidated`). |
| Module contracts (stage 2) | yes | all ~140 listed contract paths report `status: available`; none dangling (`propose.txt`). |
| `architecture/fitness-model.json`, `architecture/baseline.json` | yes | stage 3 effort "measured" (both files present); shape validity is what `inspectArchitectureEntryReadiness` checks (`:273-287`), not run here. |
| Profile | `plugins/pipeline-core/architecture/agent-first-profile.v1.json` yes; `architecture/agent-first-profile.v1.json` no | not required; see headline 3. `fitness-model.json` `profileId` names the applied profile. |
| `AGENTS.md` re-entry pointer to `architecture/map/index.md` | not read | required by entry readiness (`:340-349`) and AC-23; unverified (open item 4). |
| `architecture/design-materialization.json` | no | the alternative "approved design package" route (`resolveAdoptionState:63-69`) is not in use and not needed. |
| Inputs the signature freezes | `project/pipeline.json`, `pipeline.user.yaml`, all files under `architecture/map/` | any later byte change is class-9 drift (see (c)). Regenerating `overview.html` after signing counts. |

## (c) What changes for in-flight work once adopted

Consumers of the adoption state (`rg -l` over `plugins/pipeline-core` and `harness`, non-test): `lib/guard/entry-gates.mjs`,
`lib/architecture-entry-readiness.mjs`, `scripts/architecture-fitness.mjs` (class 9), `scripts/pipeline-start-preflight.mjs`
(orientation readback), `scripts/pipeline-state.mjs:427` (entry readiness), `hooks/guard-push.mjs:146` (push currency),
`lib/guard-maintenance-window.mjs:514` (protected-file list only), `harness/scripts/verify.mjs:310` (test registration).

| Gate | Fires when | Deferred (today) | Approved-scoped (after) |
|---|---|---|---|
| AC-17 disposition, `architectureAdoptionAuthorityVerdict` (`entry-gates.mjs:100-127`) | only on `pipeline-state.mjs set-phase --phase implementation [--verify-command ...]` (`:23-32`); scope = the active feature's `planPath` from `project/pipeline-state.json` (`:40-51`) | passes if `planPath` is under a signed scope entry (`architecture-adoption.mjs:395-413`) | same rule; plans under `specs/sprint-alfred-epic/` pass if that directory is a scope entry |
| Planning fitness, `architectureFitnessAuthorityVerdict` (`entry-gates.mjs:145-211`) | same transition; surface = every repo-relative path token named in the plan (`:77-86`) | findings are report-only when the library entry gate says `ready` (hotfix 10, `:180`) | **findings block** unless overall status is `pass`/`excepted`; the hotfix does not apply |
| Entry readiness (`architecture-entry-readiness.mjs:264-460`) | via `pipeline-state.mjs` and hotfix 10 | `ready`, fitness report-only (`:419-437`) | needs blocking status `pass`/`excepted` (`:438`) |
| Class 9 profile drift (`architecture-fitness.mjs:732-781`) | planning fitness | `unavailable` tolerated (`entry-readiness:189-196`) | evaluated against the signed snapshot; `unavailable` when scope omits any of the three bound inputs (`:742-743`) and then blocking; a **finding** after any later change to `project/pipeline.json`, `pipeline.user.yaml` or a file in `architecture/map/` until re-adopted or excepted |
| Checkpoint map debt (AC-18 consumer, `entry-readiness:351-364`) | next planning boundary | refuses even under deferral if a checkpoint push left debt | unchanged |
| Push currency (`guard-push.mjs:146`) | push boundary | call site **not traced** | not traced |

Not on the Goldfish dispatch path, the commit path or an Edit/Write path: no hit in `hooks/guard-dispatch*`, commit or
write guards in the consumer list. A stale map therefore does not refuse a dispatch or a commit; it can refuse the **next
`set-phase --phase implementation`** (new feature/plan transition) and a checkpoint-debt planning boundary. Whether the
remaining 0.7.0 slices still pass through such a transition was not established (`project/pipeline-state.json` was not
read; open item 5).

## (d) Recommended scope

Facts: `scopeValue` rejects `*`, `.`, absolute paths and `..`, and requires bounded repo-relative entries
(`lib:57-65`), so "the whole repository" is not expressible as one entry; it would have to be enumerated top-level
directories. The plan match is a prefix test per entry (`architecture-adoption.mjs:399-405`). The scope must contain the
three class-9 inputs.

Recommendation: `specs/sprint-alfred-epic/`, `architecture/map`, `project/pipeline.json`, `pipeline.user.yaml` (four
`--scope` flags; parents such as `architecture` and `project` also satisfy `:743`). Reasons: (1) plan match needs the sprint
directory; (2) class 9 needs the other three or the repo locks itself out at the next transition; (3) rule evaluation in
planning mode uses the plan's own path tokens, so a wider scope adds no checks, only more bound surface; (4) widening is
one further signed decision later, whereas a wrong wide scope cannot be narrowed without another ceremony. Alternative
for the PO: add `plugins/pipeline-core/` (the module most of the sprint edits) once ADOPT-P0 shows its fitness is green.
Do not set `--review-date`/`--expires` on the `approved-scoped` decision: either would re-raise `adoption-required` after
that date (`:89-106`); the signed dates are only mandatory for `deferred` (`lib:116`).

## (e) AC-9 evidence set and slice plan

AC-9 (`acceptance.md:26`): "typed state, priced staged proposal, one durable PO decision, evidence recorded", verified by
a "dogfood evidence set under `specs/sprint-alfred-epic/evidence/`". Proposed set: (1) `status --json` before and after;
(2) the priced staged proposal `propose --json` captured **before `apply`** at the final HEAD (after adoption `propose`
returns no decision options); (3) the `prepare` request, the proof reference and the `apply --json` output plus the
adoption-state blob SHA and the commit that carries it; (4) post-adoption `check --scope`, entry readiness and planning
fitness for the sprint plan showing class 9 not blocking; (5) the preflight orientation readback with state
`approved-scoped`; (6) this diagnosis report.

Ordered slices:
- **ADOPT-P0 (read-only measurement):** run entry readiness and planning-mode fitness at HEAD for the sprint plan; list
  findings and map staleness; answer open items 4 and 5. Decides whether P1 is needed and whether baseline debt must be
  accepted first (no retroactive fabrication, `propose` stage 3).
- **ADOPT-P1 (map currency, only if P0 shows staleness):** refresh `architecture/map/*` and, if needed, baseline/fitness
  model, one dispatch per artifact family; finish by committing so `architecture/map/*`, `project/pipeline.json` and
  `pipeline.user.yaml` are final.
- **ADOPT-P2 (stage the proposal):** capture `propose --json` at the final HEAD; Elephant presents scope and proposal.
- **ADOPT-P3 (sign):** `prepare` at that HEAD, PO signature, `apply` at once with identical flags, commit
  `architecture/adoption-state.json`; swarm quiet for the whole window.
- **ADOPT-E:** AC-9 evidence set above, then VERIFY-AC against the adopted state.

## Open items and decisions Ruling 160 does not settle

1. Final scope (recommendation in (d)); the PO decides at the signing step.
2. The CLI that emits the signature digest and turns a PO signature into the proof file for kind `architecture-adoption`
   was not found: only `lib/architecture-adoption-authority.mjs` and `scripts/control-placement.mjs` name the kind and
   `po-human-approval.mjs` does not mention adoption. Resolve at the start of ADOPT-P3 (read `po-approval-proof.mjs`,
   `control-placement.mjs`), together with how the request JSON file is produced under the shell grammar.
3. Whether an `origin` remote exists in this checkout (fingerprint v2 versus path-bound fallback).
4. `AGENTS.md` pointer and the validity of `fitness-model.json` and `baseline.json` at HEAD: not measured.
5. Whether remaining 0.7.0 slices cross a `set-phase implementation` transition, and the push-currency call site.

Deviations of this run: advisor not consulted and the finalizer script was not dry-run before the 44-call notice (budget);
`--help` was attempted once (exit 1, no state write).
