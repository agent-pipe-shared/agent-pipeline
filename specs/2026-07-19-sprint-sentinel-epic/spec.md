# Technical Spec — Sprint Sentinel Epic

Status: design candidate for PO review. This specification is implementation
authority only after the neighboring PRD is explicitly approved and the
repository state records that approval.

## 1. Identity, profile, and immutable inputs

- Epic ID: `sprint-sentinel-epic`
- V3 profile: `epic`
- Phase: `design_phase`
- Rigor: 2
- Risk: high (guardrails, private data boundary, licensing, release, remote
  refs, recovery, and public claims)
- Starting commit: `e2255dbb18d5b10f5b3d8618546b5b2e509025c2`
- Starting tree: `4ed130ded05b77599d8a1d5cd3210c858bbba835`
- Inherited Hawkeye PRD SHA-256:
  `e6f52fd9feca944cbfb74d252804f624fe6491ac8ed5c564601566060e446c56`
- Inherited Hawkeye technical Spec SHA-256:
  `40037b9c639c562f5c17fc73d552fcbd3bc4163dd4b128c54f244ed5cee8215c`
- Inherited Hawkeye implementation-slices SHA-256:
  `0797a824800e0618c87b3a2fb88df014d19cdb666dcdc2d84c7ea2e8ee49ab9c`
- Design-phase control-contract SHA-256:
  `08fcf257129317232edcc8c1237499712513f2494a4d6a5b1f23e9c7bb66cf2f`

The complete contracts in
`specs/2026-07-19-sprint-hawkeye-epic/prd_hawkeye-epic.md`,
`specs/2026-07-19-sprint-hawkeye-epic/spec.md`, and
`specs/2026-07-19-sprint-hawkeye-epic/implementation-slices.md` remain
normative wherever this Spec does not explicitly strengthen or replace them.
No Hawkeye validation, privacy, recovery, inventory, documentation, Critic,
publication, or release requirement is dropped by omission from this overlay.
Any byte drift in those three inherited inputs requires a Sentinel Spec update,
new readiness evidence, and renewed PO approval before implementation resumes.

## 2. Recorded PO exceptions and limits

The PO made these session-scoped decisions on 2026-07-19:

1. Sentinel design may proceed without an advisory receipt because the selected
   Codex bridge returned `sandbox_selection_unavailable`. The attempted bridge
   started no child, exported no repository material, and persisted no receipt.
   This exception authorizes design authorship only. It does not permit a false
   bootstrap/advisory claim and does not waive the implementation, readiness,
   Critic, Verify, security, or PO plan gates.
2. The design route is `gpt-5.6-sol` with `high` effort. This is an explicit
   exception to the registered `xhigh` effort for this session.
3. The future implementation route is `gpt-5.6-terra` with `high` effort. It
   is a PO route exception and still requires bounded Goldfish dispatches and
   observed route evidence before each implementation package.
4. AFK assumption mode is requested. It may activate only after PRD approval,
   only for reversible local work inside this exact Spec, and never authorizes
   remote writes, tags, releases, licensing decisions, secrets, irreversible
   actions, plan approval, or final acceptance.
5. The external Sol readiness export was explicitly authorized but rejected by
   the governing tenant policy before any child or export. The PO permits this
   Sentinel plan to enter implementation without an independent readiness
   receipt, using the local PRD/Spec digest, PO-authority, documentation, and
   backlog validation as this gate's bounded evidence. No independent-readiness
   claim is made. Production Codex readiness wiring remains mandatory SNT-0
   scope and must be proven before later regular readiness claims.
6. On 2026-07-20 the PO permanently authorized a narrowly bounded Codex
   functional-equivalent pass. After exactly one typed selected-sandbox
   `no-child` or `unavailable` stop, one fresh local internal hard-read-only
   `consult-advisor` subagent may answer the same single question without
   handover, memory, mutation, network export, raw-answer persistence, or
   auto-apply. An answer in that boundary is gate-capable for the affected PO
   gate, bootstrap/readiness decision, Critic prerequisite, and Epic-close
   prerequisite until the PO revokes the authorization or a functional Codex
   CLI selected sandbox is available. It is not native sandbox success: no
   selected-sandbox execution is attested, and OS isolation and model identity
   are not asserted. ADR-0041 supersedes ADR-0040's no-gate/no-fallback outcome
   only for this exact PO-authorized functional equivalent.

These exceptions do not alter `pipeline.user.v3`. The Codex advisory wiring is
a required Sentinel deliverable; later sessions return to the registered route
unless the PO records another explicit exception.

## 2a. Approved public-core/private-consumer reconciliation amendment

The PO approved the complete neighboring
`public-private-reconciliation-design.md` on 2026-07-20 with SHA-256
`9c07cb392f550ef34380676f9f86fe0f4b53a82349d94b0a96858a9ad09238bd`.
It is an additive Sentinel implementation authority and changes the delivery
topology without dropping any existing Sentinel, Hawkeye, evidence, privacy,
licensing, Critic, release, or recovery obligation.

The amendment establishes three non-overlapping ownership layers:

1. `agent-pipe-shared/agent-pipeline` and the local
   `the Public Core checkout` checkout are the sole Public Core
   development and release authority for portable V3, Multi-CLI, Codex,
   plugin, harness, documentation, schema, test, and distribution work.
2. `the private consumer repository` becomes a versioned private consumer/extension
   repository containing project intent, templates, ADRs, policies,
   guidelines, private extensions, handover, and private decisions. It must
   not retain an independently modified copy of portable Public Core.
3. Machine/user/runtime data, secrets, local paths, host/SSH identities,
   cache, locks, credentials, HMAC keys, and device-bound receipts live only
   in platform-native user roots or the owner-only Git-common-dir runtime.
   They are not tracked even by the private repository.

`pipeline.user.yaml` remains the sole V3 project source authority. A new
tracked `.agent-pipeline/` extension root may contain only secret-free,
portable private project extensions referenced by that authority or the
existing governance manifest. The current worktree-local `.pipeline/runtime/`
is migration input, not a target contract.

The existing private Sentinel candidate is a transfer source. It is not closed
as the product before reconciliation. Every changed path/commit must be
classified as `public-core`, `public-extension-point`, `private-overlay`,
`generated-rebuild`, `superseded`, or `blocked`. Transfer occurs as small,
verified Public feature slices with one repository write target at a time per
ADR-0019; the local Public `feat/v0.3-reconciliation` branch is a separate
input and receives the same evidence-based disposition.

The final Public README is part of the delivery contract. It must document the
complete operator path for install/activate, session start, verification,
session/block close, feature close, update/migration, Public contribution,
private extension use, and machine-local data roots. It must also preserve and
make explicit the historical acknowledgments, including Dave Rensin for the
Elephants & Goldfish model and Addy Osmani, Shubham Saboo, and Sokratis
Kartakis for *The New SDLC With Vibe Coding*, plus the third historically
referenced source after exact inventory.

The Codex functional-equivalent fallback is Public Core behavior only after a
technical sandbox failure without a domain answer. Domain findings, policy
denial, candidate drift, wrong identity, or an impermissible action never
trigger it. Its final gate-capable status always carries
`functional-equivalent-read-only; OS isolation not asserted` and never claims
selected-sandbox execution, OS isolation, or observed model identity.

## 3. Required outcomes and backlog ownership

The PO expanded Sentinel after the first design draft: every physical backlog
item whose frontmatter is `open` or `in_progress` at the starting candidate is
in scope. `backlog/items/TEMPLATE.md` is not an item, and the already closed
`pipeline.runner-v2-installation-cutover` is audit input but not reopened.

Sentinel owns exactly these 16 backlog items:

1. `pipeline.afk-assumption-mode` (`open`)
2. `pipeline.canonical-worktree-lifecycle` (`open`)
3. `pipeline.codex-plugin-validator-host-parity` (`open`)
4. `pipeline.codex-sandbox-critic-longterm` (`open`)
5. `pipeline.documentation-information-architecture` (`open`)
6. `pipeline.dual-channel-publication` (`open`)
7. `pipeline.execution-model-switchback` (`open`)
8. `pipeline.nonblocking-interaction-continuity` (`open`)
9. `pipeline.po-gate-worktree-authority` (`open`)
10. `pipeline.push-guard-worktree-target` (`in_progress`)
11. `pipeline.regulated-document-hooks` (`open`)
12. `pipeline.session-keep-awake` (`open`)
13. `pipeline.source-available-commercial-licensing` (`open`)
14. `pipeline.stateful-design-contract-template` (`open`)
15. `pipeline.t1-governance-path-preflight` (`open`)
16. `pipeline.verify-gate-scoped-registration` (`open`)

It also completes the two carried Hawkeye workstreams:

- HAW-C: the complete regulated-document private renderer,
  review/rationale/current-pointer, and recovery vertical;
- HAW-E: release-document evidence, version planning, two-channel publication,
  recoverable product close, and final release documentation.

The 16 backlog items are not treated as 16 independent product releases.
Licensing closes first under its dedicated authority and evidence. AFK closes
only after its own behavior and recovery evidence are green. The original
three Hawkeye product items retain their exact Result-bound atomic batch close
inside HAW-E. Sentinel closes only when all 16 items and both carried
workstreams are complete. Items whose implementation already exists are not
declared complete from file presence: they need acceptance-criterion mapping,
registered Verify evidence, candidate binding, and a sanctioned backlog
transition. Genuinely unfinished items retain their full original contract.

### Starting reconciliation classification

This table is a design hypothesis to be proven in SNT-7, not closure evidence:

At the design candidate,
`node plugins/pipeline-core/scripts/check-backlog-state.mjs` reports the item
files, transition ledger, closure evidence, and generated projections as
structurally valid. The suspected defect is therefore not current byte-level
projection corruption. SNT-7 must determine which completed acceptance
criteria never received a legitimate close transition and which items are
still substantively incomplete.

| Item | Starting hypothesis | Sentinel obligation |
| --- | --- | --- |
| AFK assumption mode | substantial production/tests exist; absent from aggregate Verify and backlog close | audit, complete gaps, register, prove, close |
| canonical worktree lifecycle | lifecycle/session-cleanup implementation and tests exist | map every AC, prove both close profiles and cleanup, close |
| Codex plugin-validator parity | reproduced open: generic validator rejects host-accepted manifest/skill semantics | implement versioned native-vs-generic parity evidence |
| Codex sandbox Critic long-term | network-open read-only intermediate exists; strong lane remains upstream-dependent | finish every locally possible AC; strong close remains blocked until its original upstream/PO gate is truly satisfied |
| documentation information architecture | substantial Hawkeye delivery exists | re-audit content/capability/language evidence and close only in HAW-E batch |
| dual-channel publication | earlier channel separation exists; publication v2/atomic two-channel close is incomplete | finish through HAW-E exact readback |
| execution model switchback | route receipts exist; main-session drift/re-grounding behavior is not yet proven complete | finish observed desired/actual route reconciliation and tests |
| nonblocking interaction continuity | production/hook/test surfaces exist | replay trajectory/compact/resume ACs, register all tests, close |
| PO-gate worktree authority | production validator exists and current Primary readback is valid | prove linked-worktree/cardinality/digest cases in Full Verify, close |
| push-guard worktree target | correction exists; status explicitly awaits fresh regular push/readback | execute exact candidate/evidence/readback proof, then close |
| regulated document hooks | public/private foundations exist; HAW-C renderer/review/recovery vertical incomplete | finish full HAW-C and close only in HAW-E batch |
| session keep-awake | controller/lifecycle/tests exist and current session uses them | audit platform/cleanup/expiry claims, close only in HAW-E batch |
| source-available licensing | genuinely open | execute SNT-1 with human legal/rightsholder gate |
| stateful design template | genuinely open | add and enforce early authority/durability/recovery/enforcement checklist |
| T1 governance preflight | governance packet code exists; full ETA/tool-setup contract may be partial | AC-by-AC audit, finish missing surfaces, register and close |
| scoped Verify registration | genuinely open and explains unregistered delivered suites | implement narrow additive registration authority before bulk reconciliation close |

## 4. Work packages and ordering

### SNT-0 — authority, baseline, and Codex advisory transport

1. Bind this PRD and Spec to the exact candidate and repository-scoped German
   PO authority before implementation.
2. Add a production Codex host integration that can execute the existing
   `advisor-consult` contract through the selected
   `sandboxed-readonly-host-bridge.mjs` path.
3. The Codex route is a fresh Sol consult, never a fabricated native Codex
   advisor and never a Claude/Fable substitution.
4. The coordinator must remain the sole route/retry/receipt authority. The
   child receives exactly one question, fresh context, no handover/chat/memory,
   read-only repository access, no auto-apply, and the exact selected sandbox
   binding.
5. Success produces a current `pipeline.advisory-receipt.v1` plus bound sandbox
   execution evidence. `host-mode-unavailable`, stale selection, wrong model,
   protocol error, or missing child evidence remains fail-closed.
6. Raw question, answer, prompt, transport, repository-private coordinates, and
   adapter errors are never persisted. Tests prove successful Sol dispatch,
   no-child behavior, wrong-identity rejection, candidate/queue binding,
   cleanup, and absence of raw transport artifacts.
7. Claude routing remains unchanged: native Fable with its registered Opus and
   same-runner consult fallbacks only.
8. Every installation exposes an explicit repository-level advisor-export
   consent in Setup. Missing or declined consent disables Advisory without a
   probe or bootstrap failure; Advisory is optional until the repository owner
   explicitly enables the export. This repository records the PO's approval.
9. The selected Codex `network-open/read-only` child may use Bash in addition
   to Read/Grep/Glob. Bash is never accepted through an unbound host fallback;
   repository writes, missing profile readback, missing child evidence, wrong
   identity, incomplete stdio, or incomplete cleanup remain fail-closed.
10. When a configured prerequisite is absent, Setup and bootstrap diagnostics
    identify the exact missing tool, explain the affected claim, and print a
    copyable Bash installation command. They never auto-install or turn the
    missing prerequisite into a ready result.
11. The PO-authorized functional-equivalent pass in §2(6) is the only SNT-0
    exception after one typed selected-sandbox `no-child` or `unavailable`
    stop. It remains one-question, fresh, local, read-only, no-export and
    no-auto-apply; it records the residual assurance and cannot claim selected
    sandbox execution, OS isolation, or model identity. A local failure, second
    question, mutation, export, or any other typed failure remains fail-closed
    and has no further fallback.

SNT-0 must be green before Sentinel readiness, Critic, or later-session
bootstrap claims rely on either the repaired attested Codex route or the exact
PO-authorized functional-equivalent pass in §2(6), with its residual assurance
disclosed in every resulting gate claim.

### SNT-1 — source-available commercial licensing

1. Perform and record a provenance/rightsholder review for code,
   documentation, templates, hooks, skills, generated files, and accepted
   contributions.
2. Select one standard-near source-available internal-use license plus a
   separate commercial-license path. The result must be called source
   available/fair source, never OSI Open Source.
3. The PO approval of the PRD selects these boundaries unless changed:
   non-commercial external redistribution is allowed with preservation of
   notices; affiliates, employees, contractors, and service providers may use
   the software solely for the licensee's internal operations; independent
   consulting, training, and support remain allowed when the Pipeline itself
   is not sold, hosted, white-labelled, or embedded as the paid product; the
   restriction is durable and has no automatic Open-Source conversion date.
4. Direct commercial exploitation—including sale, paid distribution,
   white-labeling, product embedding, hosted/SaaS, or managed-service value
   substantially derived from Agent-Pipeline—requires a separate commercial
   license.
5. Update `LICENSE`, `LICENSE-DOCS`, `NOTICE`, `CONTRIBUTING.md`, README,
   SPDX headers, plugin/marketplace metadata, examples, and license checks as
   one consistent change. Historic releases and third-party licenses remain
   truthfully attributed.
6. Add an explicit commercial contact path and contributor rights mechanism.
   Price and contract terms remain outside the repository.
7. Obtain a named human legal/rightsholder review before public activation.
   Agent output is not legal advice and cannot serve as that approval.
8. Close only `pipeline.source-available-commercial-licensing` through the
   sanctioned backlog writer with candidate-bound Result and private/public
   license-gate digests. HAW-E consumes this closed result as a hard
   prerequisite; HAW-E never silently edits licensing terms.

No HAW-E Result intent, SemVer sealing, consent, version mutation, tag, ref,
remote publication, or product-backlog close may occur while SNT-1 is open,
unreviewed, or unbound to both product candidates.

### SNT-2 — documentation information architecture

1. Revalidate the Hawkeye content, authority, language, and capability
   inventories against the integrated candidate.
2. Keep the three-level public axis: benefit-led `README.md`, maintained
   visual `PIPELINE_FLOW.md`, and normative `docs/operating-model.md`.
   `SETUP.md` remains the task guide.
3. Preserve complete English authority and German reader parity for the three
   public entry documents. Resolve active V2 and language-authority drift.
4. Retain Overview/Usage/index stubs for the approved one-release migration
   period unless fresh link evidence justifies another PO decision.
5. Document the complete operator journeys for document hooks, keep-awake,
   AFK mode, Codex advisory recovery, licensing, and two-channel release.
6. Capability claims must be generated from production and test evidence and
   distinguish supported, optional, host-dependent, unavailable, and planned.
7. Documentation changes must not change gates or authority silently.

### SNT-3 — session keep-awake completion

1. Retain `pipeline.user.yaml` as source and the generated runtime as a
   projection; old V3 sources without the field keep no-effect compatibility.
2. Start only after an honestly completed bootstrap. Use fixed allowlisted
   Windows/WSL, Linux, and macOS adapters; never accept a user command.
3. Bind at most one controller to the exact cleanup session. Preserve the
   non-renewable twelve-hour lease, heartbeat identity rules, and typed
   `active|disabled|unavailable|cleanup-pending|stopped` states.
4. Normal close and recovery stop only the exact owned adapter. Identity drift
   never authorizes PID/process-name cleanup. `cleanup-pending` blocks Close.
5. Verify platform fixtures and user documentation, then close
   `pipeline.session-keep-awake` only with exact candidate evidence.

### SNT-4 — AFK assumption mode

1. Default is disabled and behavior is byte/semantics-equivalent when absent.
2. Activation binds feature ID, PRD/Spec digests, state/continuity revision,
   package allowlist, start/expiry, final review gate, and immutable forbidden
   action classes.
3. Only a recommended option that is in scope, local, reversible, and no weaker
   than current security/authority may be provisionally selected.
4. Before the next mutation, append a durable decision record containing the
   trigger, options, recommendation, provisional choice, rationale, effect,
   rollback point, and pending PO disposition.
5. Remote writes, merge, tag, release, licensing choice, secrets,
   irreversible/external effects, plan approval, scope expansion, and final
   acceptance remain blocked.
6. The final human gate lists every assumption. Rejection deterministically
   restores the recorded rollback point or opens a newly approved package.
   Missing disposition blocks Close and release.
7. Close `pipeline.afk-assumption-mode` only after disabled-path, activation,
   expiry, crash recovery, rejection rollback, forbidden-action, and final
   review tests are green.

### SNT-5 / HAW-C — regulated-document vertical

The complete HAW-C contract in the inherited Spec remains binding. Sentinel
must finish, integrate, and prove at least these surfaces:

1. immutable opaque ID reservations and private adapter/binding registration;
2. owner-only private roots/inboxes and exact Policy/binding/adapter/repository
   digest validation;
3. bounded Linux/eligible-WSL `systemd-run` renderer execution with fixed argv,
   coordinator-owned copies, framed bounded stdio, cgroup ownership, timeout,
   descendant cleanup, and typed unavailability elsewhere;
4. frozen-base/candidate Git impact evaluation with the restricted NFC POSIX
   glob contract and correct add/delete/rename behavior;
5. HMAC-bound private receipts connected to public lifecycle projections
   without exposing private values or correlatable raw digests;
6. review and unaffected-rationale import, CAS current pointers, expiry and
   renewal, mandatory/advisory behavior, abandonment, and close blockers;
7. journalled adjacent-state recovery for every multi-step private mutation;
8. focused tests registered in Full Verify, privacy canaries, capability
   inventory evidence, and bilingual user documentation.

HAW-C exits only when every configured mandatory `(bindingId,event)` can reach
a candidate-bound receipt plus current review/rationale or blocks Close with a
typed recoverable non-success state.

### SNT-6 / HAW-E — evidence, two-channel release, and atomic close

The complete HAW-E contract in the inherited Spec remains binding. Sentinel
must finish, integrate, and prove:

1. release-document-evidence v1 and fixed current-pointer CAS binding all
   configured document lifecycle/review/rationale evidence to both product
   candidates;
2. fresh exact observations of private and neutral-public branch, commit,
   tree, version surfaces, and annotated stable tags, with at most 15-minute
   age/skew and no DNS/auth failure represented as a baseline;
3. one derived SemVer strictly greater than both reachable channel baselines;
   `0.4.0` remains only an expectation until this decision is fresh;
4. equality of VERSION, both plugin manifests, both marketplace resolutions,
   target tags, and release documentation;
5. pointer-first publication v2, separate unexpired channel consents, one
   joint authorization, exact private branch/worktree CAS, immutable annotated
   tags, four guarded remote branch/tag effects, and fresh fetch-back;
6. two-pointer compensation and a strictly higher synchronized replacement
   release after any non-recoverable post-ref partial failure; existing tags
   are never moved or deleted;
7. one Result, exact state transition, the inherited three-item Hawkeye
   backlog batch, close journal, off-ref close commit, Full Verify, Security
   Evidence, delta Critic, and fresh final high-risk Critic;
8. no one-channel success, direct tracked-state v2 authority, generic push,
   inferred baseline, partial backlog close, or unbound success claim.

The three-item HAW-E batch remains exactly:
`pipeline.documentation-information-architecture`,
`pipeline.regulated-document-hooks`, and `pipeline.session-keep-awake`.
Licensing and AFK use their separately evidenced transitions and must already
be closed before Sentinel's final Epic close.

### SNT-7 — backlog truth reconciliation and close-ritual repair

1. Enumerate physical `backlog/items/*.md` records from validated frontmatter;
   exclude the template and compare exact IDs/statuses with
   `backlog/transitions.ndjson`, `backlog/STATUS.md`, and `backlog/index.json`.
2. For every target item, build an acceptance matrix with one of:
   `not-started`, `partial`, `candidate-delivered-unproven`,
   `verified-awaiting-transition`, or `closed`. Each non-closed classification
   names production paths, test paths, aggregate-Verify registration, missing
   evidence, and its sanctioned close authority.
3. Treat stale backlog state as a defect, not permission to hand-edit it. A
   delivered item may transition only when its original ACs map to current
   candidate evidence and the ledger head/projections are current.
4. Diagnose whether an earlier close ritual omitted eligible backlog
   transitions, lost a postimage, or correctly left incomplete items open.
   Repair the generic close/transition integration and crash recovery before
   replaying any affected close.
5. Use only `check-backlog-state.mjs` sanctioned single/batch operations.
   Never directly edit an item status, ledger, STATUS, or index. Every recovery
   accepts exact before/after bytes; a third state fails closed.
6. Preserve authority-specific ordering: licensing closes independently before
   HAW-E mutation; the three inherited Hawkeye items close in their exact
   Result-bound batch; remaining items close only from their own verified
   acceptance matrix. No bulk command may manufacture completion.
7. Final reconciliation proves all 16 target items `closed`, exactly one legal
   transition suffix per operation, regenerated projections equal the item
   files/ledger, and no unrelated closed item was reopened or rewritten.

## 5. Test-first implementation sequence

Every production package is preceded by a separately frozen focused test
package. The implementation order is:

1. authority/baseline tests, then SNT-0 host/advisory wiring;
2. SNT-7 read-only backlog/implementation acceptance matrix, then the narrow
   scoped Verify-registration mechanism;
3. close-ritual/backlog recovery tests and completion of already-delivered but
   unproven control items;
4. licensing decisions, provenance fixtures, and license-gate tests, then
   SNT-1 implementation and independent close;
5. AFK contract tests, then SNT-4 implementation;
6. remaining HAW-C renderer/review/recovery tests, then SNT-5 implementation;
7. keep-awake completion and platform regression packages;
8. integration checkpoint and capability/content inventory reconciliation;
9. documentation implementation and bilingual parity checks;
10. release-evidence/version/publication/backlog/close tests, then HAW-E;
11. full deterministic chain, security evidence, readiness/delta/final reviews,
   exact remote readback, backlog/state close, and handover/history sync.

Interlinked small production edits may be bundled into one Goldfish briefing,
but no production implementation is authored by the Elephant. A test package
cannot weaken existing protected tests or change the approved Spec.

## 6. Mandatory gates and stop conditions

Stop the affected work on any of the following:

- PRD/Spec/inherited-contract/candidate digest drift;
- missing observed route evidence or unapproved model/effort change;
- unresolved Advisory, readiness, Critic blocker/major, or unsupported
  assurance claim;
- licensing decision/review/provenance/license-gate incomplete;
- dirty or ambiguous product candidate;
- missing/expired document review or rationale;
- private-path, private-value, secret, credential, or HMAC-key leakage;
- owner-only, cgroup, sandbox-profile, child/stdio, or cleanup evidence absent,
  except for the exact ADR-0041 PO-authorized functional-equivalent pass whose
  mandatory disclosure states that selected-sandbox execution, OS isolation,
  and model identity are not asserted;
- AFK action outside the reversible local allowlist or without a durable
  assumption record;
- stale/ambiguous channel observation, version-surface mismatch, non-annotated
  or non-ancestral tag, consent/authorization expiry, or pointer drift;
- unexpected local/remote ref, branch/worktree/index, transaction, Result,
  state, backlog, journal, or recovery bytes;
- one-channel publication, failed fetch-back, partial close, or red Full
  Verify/Security Evidence.

No plan approval is push authority. No AFK record is plan, licensing, release,
tag, remote-write, or final acceptance authority.

## 7. Verification and evidence

Required deterministic evidence includes:

- focused unit/integration/negative/crash fixtures for every new writer and
  bridge;
- runner-neutral Claude and Codex route fixtures with exact observed identity;
- Linux/WSL supported renderer fixtures plus typed unsupported-platform cases;
- private-data leak canaries over Git diff, logs, receipts, runtime projections,
  Result, release artifacts, and public documentation;
- license/provenance, contributor, SPDX, stale-claim, and third-party-license
  checks;
- AFK disabled/allowed/forbidden/expiry/recovery/final-disposition checks;
- one AC/evidence/transition matrix for every open/in-progress starting item,
  plus ledger/projection drift and crash-recovery tests;
- current capability inventory from production and registered Verify evidence;
- EN/DE heading, link, anchor, Mermaid, capability, and normative-ID parity;
- the single full `node harness/scripts/verify.mjs` evidence bound to the exact
  candidate;
- configured security scanners with honest PASS/SKIPPED semantics;
- fresh delta reviews after licensing or contract overlap and a final
  high-risk Critic bound to both delivered channel candidates.

## 8. Completion contract

Sentinel is complete only when:

1. the Codex Sol advisory route is production-wired and evidenced either by
   attested selected-sandbox execution or by the exact ADR-0041
   PO-authorized functional-equivalent pass, with its residual assurance
   disclosed and without claiming native sandbox success;
2. all starting backlog items have an evidence-backed acceptance matrix and
   every previously delivered-but-unclosed control is either proven/closed or
   completed without rewriting history;
3. the licensing and AFK backlog items are independently closed with their
   required human dispositions and evidence;
4. HAW-C satisfies its complete inherited exit criteria;
5. private and neutral-public channels carry the same freshly derived SemVer
   and both branch/tag delivery pairs have exact remote fetch-back;
6. the HAW-E Result/state/three-item backlog batch/close journal is complete;
7. all 16 target backlog items are `closed` and projections/ledger agree;
8. final Verify, Security Evidence, capability inventory, bilingual docs, and
   high-risk Critic bind the exact final candidates;
9. handover and HISTORY describe the actual delivered and residual state
   without claiming stronger isolation, legal assurance, or release success
   than the evidence supports.
