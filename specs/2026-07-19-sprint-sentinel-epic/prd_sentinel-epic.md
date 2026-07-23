<!-- po-language: en -->

# PRD — Sprint Sentinel: Backlog truth and go-live

> Product Review Document for the PO gate. Status: `PO-approved; implementation
> approved with the recorded readiness exception`. Task: `sprint-sentinel-epic`
> · profile `epic` · rigor 2 · risk high. Approval covers decisions 1A–8A and
> the Public-Core/private-consumer reconciliation approved on 2026-07-20. AFK
> activation, push, tag, release, commercial relicensing, and public activation
> remain blocked until their own gates pass.

<!-- technical-spec-sha256: 2c9eacb6d28479e6406cae5cdb1024cddd537eb6ff2f22e4dd6b5caefb3c7c62 -->
<!-- public-private-reconciliation-design-sha256: 3b4cee9f23a5db1ea7318ce86a1190d1ec868561b55a7ee9b30994ff0d073075 -->
<!-- platform-support-contract-sha256: 1f9248c9719b0f53a572501a27b6e799f79d8c1b5d5187539c6249d253c4091e -->

The technical approval binds the exact neighboring [spec.md](spec.md). That
Spec also retains all Hawkeye contracts and the recorded design-phase control
contract. Drift in an input requires renewed local readiness/authority checks
and renewed PO approval before implementation continues.

The [Platform Support Contract](platform-support-contract.md) is binding
Sentinel authority. It defines capability-specific claims for Windows, Linux,
WSL, and macOS, requires native same-surface evidence, and preserves typed
negative outcomes. Docker is out of scope and never substitutes for native
evidence. The bound Windows scope records issue #33 as closed and #34–#37 as
open; a platform claim requires current Verify, security, and Critic evidence
for the same candidate.

The PO also approved the complete
[Public-Core/private-consumer design](public-private-reconciliation-design.md)
on 2026-07-20. Portable V3, Multi-CLI, Codex, plugin, harness, documentation,
schema, test, and distribution work moves into the Public Core as the sole
product authority. The private repository becomes a bound consumer for its own
versioned templates, ADRs, policies, guidelines, and extensions. User-, host-,
secret-, and runtime-specific data remains outside all repositories in the
defined user or Git-common-dir roots.

The Public README must explain installation and activation, session start,
Verify, block/feature close, update and migration, Public contribution, private
extension, and machine-local data roots. It also retains the evidenced sources
and acknowledgments for the Elephants & Goldfish model and the New SDLC.

## Summary

Sentinel ends the indeterminate state after Batman and Hawkeye. It audits every
open or in-progress backlog item against delivered production code, registered
tests, candidate-bound evidence, and canonical state; it closes fulfilled work
only through sanctioned transitions and completes genuine gaps. HAW-C and
HAW-E remain one coherent feature inside the Epic: private regulated documents,
complete review/recovery, shared release evidence, identical versions in the
private and neutral-Public channels, and atomic product close.

This is not cosmetic backlog cleanup. Code, registered tests, Verify evidence,
state, ledger, and generated projections must agree. Existing implementation is
reused and re-proven; missing close bookkeeping is never confused with product
completion.

## Binding PO exceptions and limits

- Repository-wide advisory export is configured through explicit setup
  consent. Without consent Advisory is disabled. This repository allows the
  bounded export. Codex Advisory may use Bash in addition to Read/Grep/Glob only
  in the selected `network-open/read-only` profile. Missing prerequisites are
  reported with a copyable installation command and are never auto-installed.
- The selected Codex bridge returned `sandbox_selection_unavailable`: no child
  started, no material was exported, and no receipt was created. The PO allowed
  design without an Advisory receipt; this creates no successful bootstrap or
  Advisory claim.
- The authorized Sol readiness export was rejected by tenant policy before a
  child started. The PO allowed implementation from local PRD/Spec digest,
  authority, documentation, and backlog checks, without claiming independent
  readiness. Production Codex readiness remains mandatory SNT-0 scope.
- After exactly one typed selected-sandbox `no-child` or `unavailable` stop, a
  fresh local read-only consult may answer the same single question as the
  PO-authorized functional equivalent. It remains one-question, no-export,
  no-mutation, no-auto-apply, and discloses that selected-sandbox execution, OS
  isolation, and model identity are not attested. ADR-0041 and the Spec govern.
- The recorded design and implementation route exceptions do not mutate
  `pipeline.user.v3` and do not establish observed model identity.
- AFK mode may activate only after its gate, for local reversible work in this
  Spec. It never authorizes licensing, release, remote writes, secrets,
  irreversible action, plan approval, or final acceptance.

## Why Sentinel is an Epic

The PO expanded the original HAW-C/HAW-E successor to every backlog item that
was open or in progress at the starting candidate, then admitted five native
Windows blockers. The resulting 21 obligations span runners, sandboxes,
worktrees, continuity, governance, Verify, documentation, licensing, and
release. HAW-C/HAW-E stays a single undivided feature within that Epic.

## Complete backlog scope

| Backlog ID | Starting status | Starting assessment | Required completion |
| --- | --- | --- | --- |
| `pipeline.afk-assumption-mode` | open | substantial implementation/tests, incomplete registration/close | AC audit, missing cases, Verify registration, final PO review, close |
| `pipeline.canonical-worktree-lifecycle` | open | lifecycle and cleanup code/tests present | prove both close profiles, recovery, post-commit cleanliness, close |
| `pipeline.codex-plugin-validator-host-parity` | open | reproducibly open | reconcile generic and native Codex ingestion with version binding |
| `pipeline.codex-sandbox-critic-longterm` | open | weaker read-only intermediate lane exists | complete local ACs; strong lane closes only on its original upstream gate |
| `pipeline.documentation-information-architecture` | open | substantially delivered by Hawkeye | renew content/language/link/capability evidence; close in HAW-E batch |
| `pipeline.dual-channel-publication` | open | channel split exists; v2 go-live incomplete | complete HAW-E two-channel publication and fetch-back |
| `pipeline.execution-model-switchback` | open | route receipts exist; main-session drift incomplete | observable/testable desired-versus-actual route reconciliation |
| `pipeline.nonblocking-interaction-continuity` | open | continuity/hook surfaces exist | prove trajectory, compact, and resume criteria, close |
| `pipeline.po-gate-worktree-authority` | open | mechanism and Primary readback exist | full linked-worktree/cardinality/digest evidence, close |
| `pipeline.push-guard-worktree-target` | in_progress | correction exists | regular target-worktree push and fetch-back evidence, close |
| `pipeline.regulated-document-hooks` | open | public/private foundations exist | deliver complete HAW-C; close in HAW-E batch |
| `pipeline.session-keep-awake` | open | controller/lifecycle/tests exist | platform, expiry, and cleanup evidence; close in HAW-E batch |
| `pipeline.source-available-commercial-licensing` | open | product decision was genuinely open | rights review, consistent SUL transition, human legal gate, dedicated close |
| `pipeline.stateful-design-contract-template` | open | genuine process gap | enforce authority, durability, recovery, and self-reference checklist |
| `pipeline.t1-governance-path-preflight` | open | governance packet partially exists | audit and complete path, ETA, and setup ACs, then close |
| `pipeline.verify-gate-scoped-registration` | open | root cause for omitted focused suites | narrow additive PO/task-bound registration and evidence |
| `pipeline.windows-runtime-baseline-containment` | open | issue #33 at scope admission | bound canonical closure evidence; no remaining #33 gate |
| `pipeline.windows-directory-durability` | open | issue #34, POSIX directory-fsync assumption | typed durability and native Windows/POSIX evidence |
| `pipeline.windows-private-state-assurance` | open | issue #35, POSIX modes do not prove Windows DACLs | typed assurance with fail-closed authority consumers |
| `pipeline.windows-verify-reproducibility` | open | issue #36, native Windows Full Verify gap | capability-bound fixtures and standard-account gate |
| `pipeline.windows-trusted-tool-resolution` | open | issue #37, inconsistent discovery | shared trust-bound resolver authority |

The acceptance matrix is the current-state projection; this table records the
approved starting scope and does not override later canonical transitions.

## Required outcomes

### 1. Evidence-backed backlog truth

The acceptance matrix maps original criteria, production paths, tests, Full
Verify registration, candidate evidence, and remaining work for all 21 items.
Allowed intermediate judgments are not started, partially implemented,
delivered but unproven, verified but not transitioned, and closed. File
presence never proves completion, and an old open status never by itself proves
missing implementation.

Backlog items, ledger, STATUS, and index are changed only by sanctioned writers.
Recovery accepts only recorded pre- or post-images. Structural consistency does
not eliminate the semantic audit: Sentinel identifies which completed criteria
missed a legitimate transition and which remain unfinished, without inventing
history.

### 2. Honest Codex Advisory, validator, and sandbox claims

Codex receives the production wiring for one fresh Advisory question with no
handover/chat/memory, read-only access, no auto-apply, and a current
candidate-bound receipt. The selected sandbox bridge owns execution; host
unavailability, wrong identity, or absent child evidence remains a typed
non-success. Claude routing is unchanged.

Generic validator and native Codex ingestion use the same minimal plugin and
bind claims to the actual host/CLI version. The weaker network-open Critic lane
is reported honestly; the strong input-confined/network-denied item remains
open until its upstream, preflight, shadow, T1, and PO gates truly pass.

### 3. Workflow-control completion

- Canonical repository worktrees and session temporaries are cleaned safely in
  full and light close profiles.
- Status questions, additive input, compact, and resume preserve the recorded
  next action.
- Repository language and one authoritative PRD are consistent across
  worktrees; Primary readback is the local authority.
- Push guards verify the actual target worktree and exact evidence.
- Main-session route drift is visible once and never inferred from a subagent.
- T1 packets include governance paths and an honest gate ETA or `unknown`.
- Stateful templates require issuer, replay, storage/atomicity, crash states,
  enforcement, pre/post-images, and self-reference audit before readiness.
- Scoped Verify authority adds only predeclared suites; removal, reordering, or
  weakening is prohibited.

### 4. AFK mode with final human disposition

Activation binds feature, PRD/Spec, state revision, permitted packages, time,
and final gate. Every provisional local choice is durably recorded before the
next mutation with options, recommendation, rationale, impact, and rollback.
Remote writes, merge, tag, release, licensing, secrets, external/irreversible
action, plan approval, and final acceptance remain blocked. The PO disposes
each assumption individually before close.

### 5. Source-available licensing before public activation

Current repository-owned code, documentation, and metadata use SUL-1.0.
Personal and internal business use—including internal commercial-company use
and modifying a fork for one's own purposes—is permitted subject to LICENSE.
Separate rightsholder participation is required only when Agent-Pipeline or a
substantial derivative is itself monetized: sale/licensing, paid
hosting/SaaS/managed service, white-labeling, material embedding as a value
component of a paid product, or commercial redistribution. Consulting,
training, and support remain allowed when the Pipeline itself is not the paid
product. There is no automatic Open Source conversion.

CONTRIBUTING and the separate Contributor License Agreement must establish an
explicit auditable PR gate for comprehensive rights of use, including SUL and
separate commercial relicensing, without describing German copyright as
assigned. Unknown/future forms of use require any separate declaration, form,
information, consent, and remuneration applicable law demands. No agent text
is legal advice or an effectiveness guarantee.

The PO represents the current project-authored content as 100% owner-controlled
with no known external code. Third-party text remains separately attributed.
Historical releases keep the licenses and notices shipped with them; the
current transition is not retroactive. A named human legal/rightsholder review
is mandatory before public activation or reliance on contributor relicensing.

### 6. Complete HAW-C

Sentinel completes private adapter registration, bounded Linux/WSL rendering,
policy/binding/diff impact, HMAC receipts, reviews and unaffected rationales,
the current pointer with CAS/expiry/renewal, abandonment, and crash recovery.
Private organization values, paths, templates, and output stay out of Git,
Public projections, and logs. The renderer is trusted private code inside the
OS-user boundary, not a claimed sandbox; without the required cgroup and
owner-only evidence it reports `unavailable`.

### 7. HAW-E shared go-live

HAW-E binds document evidence to both candidates, reads both channels freshly,
and selects exactly one SemVer above both baselines. `0.4.0` is only an
expectation. VERSION, plugin manifests, marketplace resolution, documentation,
and annotated tags must match. Separate private and Public consent combine only
through one short-lived authorization for the branch/worktree CAS, immutable
tags, and four guarded remote effects. Both branch/tag pairs require fresh
fetch-back. Partial publication never counts; only a higher-version
two-channel compensation is permitted after an irreparable partial effect.

HAW-E closes exactly the documentation architecture, regulated document hooks,
and keep-awake items in one Result-bound batch. Licensing, AFK, Windows, and
other controls keep their own transitions. Sentinel closes only after all 21
items and carried workstreams are complete.

## Order of work

1. Bind PRD, Spec, candidate, and the complete acceptance matrix.
2. Repair scoped Verify registration and backlog recovery.
3. Verify Codex Advisory/validator and delivered workflow controls AC by AC.
4. Complete licensing and its human/evidence gate.
5. Complete AFK, stateful design, Windows, and remaining control gaps.
6. Complete HAW-C rendering/review/recovery.
7. Recheck keep-awake, continuity, worktree, PO gate, push guard, and routing.
8. Reconcile capability/content inventory and Public English/German front-door
   parity.
9. Execute HAW-E evidence, publication, fetch-back, Result, and three-item close.
10. Complete remaining transitions, Full Verify, security, Critic, handover,
    HISTORY, and Epic close.

## Hard stops

- PRD, Spec, inherited input, or candidate drift;
- close without complete AC/evidence mapping;
- omitted relevant suites or red Full Verify/security;
- missing legal/rightsholder approval or unresolved provenance;
- private data, secrets, credentials, or organization coordinates in Public;
- AFK action outside local reversibility or without durable assumption;
- missing owner-only, cgroup, sandbox, child/stdio, or cleanup evidence;
- stale channel baseline, version drift, expired consent, third state, or absent
  fetch-back;
- one-sided publication, moved tag, partial Result, or partial state close;
- unresolved major/blocking Critic finding or an overstated assurance claim.

## Non-goals

No direct backlog-ledger edits; no inferred historical completion; no private
organization documents/renderers in Public; no sandbox claim for the private
renderer; no generic unrestricted shell bus; no silent route mutation; no
automatic model switch; no legal advice or self-issued rights approval; no
one-channel release or tag move; and no strong Codex-isolation close before its
own original gates pass.

## Definition of Done

Sentinel is complete only when all 21 scoped backlog items are closed through
candidate-bound evidence and sanctioned transitions, with exact ledger/STATUS/
index agreement. HAW-C delivers its complete private vertical; HAW-E completes
both channels at one freshly selected version with branch/tag fetch-back.
Licensing and AFK have separate human dispositions. Full Verify, security,
capability inventory, bilingual front-door documentation, and a fresh high-risk
Critic bind the final candidate. An external blocker keeps the Epic open rather
than being removed or renamed as success.

## Approved decisions

Approval selected: Epic profile; AC/evidence audit with sanctioned transitions;
properly wired one-question Advisory with the one-time design exception;
local-reversible AFK assumptions with individual final disposition; free
internal/non-commercial use but separate licensing when the Pipeline itself is
monetized; honest intermediate Codex Critic lane without claiming strong
isolation; SemVer chosen above both fresh channel baselines; dedicated evidence
for licensing, AFK, Windows, and other controls; exact HAW-E three-item batch;
Epic close only after all 21 items.
