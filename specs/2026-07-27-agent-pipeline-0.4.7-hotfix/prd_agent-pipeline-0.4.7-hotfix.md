<!-- po-language: en -->

# PRD — Agent Pipeline 0.4.7 hotfix

> Product Review Document for the PO gate. Status: `draft; awaiting PO approval`.
> Task: `agent-pipeline-0.4.7-hotfix` · Feature · Rigor 2 · Risk high.
> Base: public 0.4.6 release at
> `9d1b3dc108eb77629ace5b82002120f5539abd8d`. Acceptance criteria:
> [spec.md](spec.md).

<!-- technical-spec-sha256: 4e7d84ef26adba239d1fdb6ea484ecfdfbb5b2c4b55dfdbe7a6b6d823b6d8c96 -->

Approval authorizes the first implementation dispatch for this design. It does
not authorize push, merge, tag, release, Issue mutation, or Pull Request
operation.

## Candidate audit status — 2026-07-28

The audited `hotfix/issue-73` candidate is 15 commits ahead of and zero commits
behind `origin/main` at the declared 0.4.6 base. The PO approved this PRD/Spec
scope on 2026-07-28; it is not a release approval and the candidate remains
subject to all required implementation and verification gates.

`047-LCY` has focused host checks, but its first independent Critic round found
missing persisted-State postimage validation and a rollback path. The follow-up
addresses those findings, yet still needs a fresh candidate-bound Critic and
the complete candidate gates. The source tree does not yet implement the H3
source/manifest-recovery or H4 WSL-IPC surfaces, and the H5 Advisor route still
uses 60/45-second rather than 180/90-second attempts. These are remaining
delivery obligations, not accepted scope reductions.

## What

0.4.7 will be a focused corrective release on top of 0.4.6. It repairs four
confirmed Issue defects, closes one narrowly recognized legacy lifecycle
adoption gap, and adjusts the two bootstrap Advisor timeouts:

- the already released 0.4.6 feature can bind its existing Result and close
  through one dedicated fail-closed continuity transition;
- governed projects can recover from an invalid source or missing generated
  manifest;
- guarded reads, diagnostics, restart state, and Codex executable binding work
  correctly on Linux, WSL, and native Windows;
- affected WSL sessions receive a controlled workaround for the current Codex
  Unix-socket failure;
- one existing backlog item receives its missing canonical admission; and
- the primary/fallback Advisors receive three minutes and one and a half
  minutes respectively.

The release becomes the clean common base for three active Sprint branches. It
contains no Sprint feature work.

## Why

0.4.6 can fail closed without offering a safe next action. It can also report a
harmless read pipeline as a cross-repository mutation, mishandle Windows paths
or restart privacy, and stop Advisors before a useful answer arrives.

On affected WSL hosts, the native Codex sandbox can write its temporary file
but fails to bind the Unix socket it needs. Enabling a broad workaround for all
WSL sessions would hide a later Codex fix and grant unnecessary local-socket
access. Today the nested diagnostic chain can reduce that specific IPC failure
to an unhelpful generic `EPERM`, so troubleshooting cannot reliably distinguish
it from filesystem, process, or network denial. The hotfix therefore needs one
coherent, testable lifecycle correction instead of unrelated string
exceptions.

## Scope

- **Legacy lifecycle adoption:** a dedicated plan/apply transition recognizes
  only the exact released `codex-onboarding-0.4.5` continuity-adoption
  preimage, reconciles its historical PRD digest with the current
  repository-scoped PO approval, binds the existing Result and exact 0.4.6
  release evidence, and advances only to the ordinary evidence-bound
  `close-feature` gate. Generic CAS authority remains unchanged.
- **Governed recovery:** invalid source state receives a read-only diagnosis
  ending in one sanctioned route or an honest terminal explanation. A missing
  generated manifest receives confirmed absent-target-only repair; existing
  manifest bytes are never overwritten.
- **PO authority rebind:** a legitimate later Spec change that leaves an older
  PRD marker and matching stale PO-gate/Continuity bindings receives one
  read-only, digest-bound, explicitly PO-confirmed cross-platform rebind. It
  updates all three authority surfaces atomically or rolls back completely;
  it never becomes a generic authority repair or force-close route.
- **Portable guard and restart:** one closed command grammar supports native
  Windows paths, the exact PowerShell bootstrap read, and the bounded
  read-only diagnostic pipeline while retaining all mutation and pre-readiness
  denials. Native Windows uses a physical trusted Codex executable and the
  shared owner-private state assurance.
- **Reactive WSL compatibility:** every session starts in the native sandbox.
  Only a real current-session Unix-socket bind `EPERM`, reproduced by a fixed
  model-free temp-file/socket verifier, can select the approved dormant profile
  for later eligible operations in that session. Later sessions start native
  again, so a Codex fix automatically stops profile use. The required
  `dangerously_allow_all_unix_sockets` escape hatch can expose otherwise
  blocked local Unix-socket daemons for that session; it enables no external
  domains and must be explicitly approved when the dormant profile is
  installed.
- **IPC diagnostics:** the original failure, fixed probe, adapter propagation,
  profile decision, validation, activation, and retirement emit one closed
  structured cause such as `local-ipc` + `af-unix-socket` + `listen` +
  `EPERM`, rather than only free-form text. A bounded owner-private
  machine-local session log retains only sanitized fields; repository or
  portable evidence contains no raw stderr, command, process identifier, or
  private socket path.
- **Backlog and Advisor policy:** add the one missing initial ledger event
  without closing the item; change only the two timeout budgets, preserving
  models, effort, attempts, workspace checks, and non-blocking exhaustion.
- **Release and Sprint handoff:** produce independent 0.4.7 platform,
  verification, security, Critic, packaging, and readback evidence. Then rebase
  all three Sprint branches onto the exact hotfix integration point and
  manually disposition collisions.

## Non-goals

- No native Apple Silicon Nova acceptance.
- No merge, cherry-pick, close, or modification of Nova Pull Request #64.
- No Nova supervisors, worker pools, forge, Antigravity, backlog
  reconciliation, or other Sprint feature.
- No general shell/PowerShell interpreter or new arbitrary pre-ready authority.
- No generic continuity migration, force close, arbitrary Result adoption, or
  manual edit of `.claude/pipeline-state.json`.
- No guessed replacement of an existing manifest.
- No eager/global WSL workaround, external network allowance, credential
  access, or additional private path.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Legacy adoption becomes a generic authority rewrite. | One exact historical/current preimage, read-only plan, digest-bound confirmed apply, shared lock, atomic CAS, and negative/replay/durability tests; ordinary CAS remains protected. |
| Guard parsing authorizes writes. | Closed grammar, per-segment validation, typed denials, hostile and outer-hook tests. |
| Manifest repair replaces foreign data. | Absent targets only; bind source, parent, plan, publication identity, and final readback. |
| WSL workaround exposes local daemons or becomes permanent. | PO-approved warning for `dangerously_allow_all_unix_sockets`; native-first per session; exact failure proof; never default; narrow duties isolated. |
| IPC troubleshooting log leaks machine-local data or becomes an activation oracle. | Closed sanitized schema, owner-private bounded local retention, no raw paths/commands/stderr, and activation consumes typed runtime results rather than log text. |
| Windows reports false privacy or runs a wrapper. | Owner/DACL assurance, physical direct executable, digest binding, no shell. |
| Sprint rebases keep conflicting implementations. | Changed-path intersection, manual disposition, renewed candidate gates. |

## Alternatives considered

- **Merge PR #64:** rejected because its 200+ files contain cumulative Nova
  work rather than a hotfix.
- **Leave recovery only in Nova:** rejected because the defect blocks the first
  public release after 0.4.6 and belongs in the common base.
- **Enable the WSL profile for every WSL session:** rejected because activation
  would precede evidence and would not retire automatically after a Codex fix.
- **Add isolated command-string exceptions:** rejected because quoting,
  redirects, pipelines, and Windows paths would retain competing heuristics.

## Coverage matrix

| Confirmed input | Disposition |
| --- | --- |
| Issue #63 | Independent bounded recovery transfer; no Nova state/evidence |
| Issue #70 | Exact missing initial event; item stays open |
| Issue #71 | Reactive current-session native failure proof, typed IPC propagation/logging, then session-only fallback |
| Issue #73 | Portable guard, fixed reads/pipeline, Windows runtime/private state, typed phases |
| Advisor request | Primary 180 seconds; fallback 90 seconds |
| Released 0.4.6 continuity | Dedicated one-shot Result/PRD reconciliation followed by the existing close gate |
| Issue #72 | Removed completely |
| Pull Request #64 | Not integrated or operated on |
| Three downstream Sprints | Clean 0.4.7 rebase base, collision manifest, renewed gates |

## DoD

Product completion requires AC-047-01 through AC-047-27 in
[spec.md](spec.md), including focused/native-platform tests, Full Verify,
blocking Security, fresh independent Critic review, packaged/installed plugin
readback, a candidate-bound standard-vs-compatible IPC probe pair, version
consistency, and Sprint collision evidence bound to one exact candidate.
Nova/PR #64 evidence is inadmissible.

## Decision points

1. Approve Issues #63, #70, #71, #73 and the Advisor budgets as one common-base
   0.4.7 hotfix.
2. Approve the exact legacy-continuity adoption repair as the sole
   pre-activation implementation slice; reject generic State authority
   widening or a manual State edit.
3. Approve the reactive native-first WSL boundary, including the disclosed
   current-session local-daemon exposure of
   `dangerously_allow_all_unix_sockets`; reject eager or global activation.
4. Approve independent Sprint rebases after 0.4.7; reject PR #64 integration.

## Technical source note

The review found no comments on Issues #63, #70, #71, #72, or #73 and no
comments, reviews, or review threads on draft PR #64. The bounded #63 reference
commits are `7de0ec8`, `bef69f7`, `17da0b2`, `8701961`, and `ddd0d6a`. Exact
state machines, invariants, tests, and forbidden transfer paths live in
[spec.md](spec.md).

The legacy-continuity repair is based on the exact released checkout evidence:
the continuity PRD digest is the reachable historical `9825ca78...`, the
current repository-scoped PO approval and released file bind
`217eff32...`, the Spec remains `5a95aa55...`, the existing Result is
`ceed30dd...`, and annotated tag `v0.4.6` dereferences to base
`9d1b3dc1...`. These values are closed preconditions, not configurable
examples.
