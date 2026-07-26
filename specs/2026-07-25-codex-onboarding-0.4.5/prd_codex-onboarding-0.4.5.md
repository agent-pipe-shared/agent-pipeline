<!-- po-language: en -->

# PRD — Deterministic fresh Codex onboarding (0.4.5)

> Product Review Document for the PO gate. Status: `formally approved;
> implementation candidate awaiting operator live test`.
> Task: `codex-onboarding-0.4.5` · profile `feature` · rigor 2 · risk high.
> Priority: pull forward as 0.4.5 because the current first-use lifecycle blocks
> reliable project work. Approval authorizes implementation dispatch only; it
> does not authorize push, merge, tag, publication, Issue closure, or release.

<!-- technical-spec-sha256: 9778003693e1c6f16745d3cef81b495fed2599b44b50a470d899df4cb8a1b512 -->

The technical approval binds the exact neighboring [spec.md](spec.md). Any
change to that file after approval invalidates the implementation gate until
the revised pair is presented and approved again.

## Problem

Agent Pipeline 0.4.4 can recover a fresh Codex root, but it does not yet expose
one truthful first-use lifecycle. Portable configuration may be reported as
applied while required Codex runtime files, a host restart, valid continuity,
or repository/session capabilities are still missing.

The result is a sequence of individually plausible but contradictory stages:
setup appears successful, bootstrap later rejects generated state, diagnostics
suggest a migration-only or manual repair, the same Codex process attempts
dispatch before loading new project runtime, and cleanup or Git operations run
before their host prerequisites are known.

This is the fourth correction in the fresh-onboarding line. Another isolated
condition or message change is not acceptable. The fix must make the complete
path deterministic and must remain fail-closed at the earliest incomplete
stage.

## Outcome

A fresh Codex project advances through one explicit lifecycle:

1. `portable-seed-required`
2. `kickoff-required` for the exact Codex reserved runtime mount, otherwise
   `runtime-initialization-required`
3. `host-repository-init-required` after kickoff; the empty read-only runtime
   mount remains explicitly unattested until the digest-bound host Git
   initialization completes
4. exactly one project-session restart
5. `ready`

Names are binding for this implementation unless a review finds a schema
collision. Each state is typed and machine-readable, exposes one sanctioned
next action, and is shared by onboarding, V3 bootstrap authority, continuity,
session startup, and dispatch.

`ready` means all mandatory dimensions passed for the same current source,
projection, native runtime readback, repository capability, and continuity
binding. It is never inferred from one successful setup command.

## Product decisions

### 1. One public owner

`project-onboarding-v3` owns fresh-project classification and progression.
Runner-profile migration remains an internal, tested convergence primitive for
missing runtime targets; users are not sent to discover a migration-only flag.

Root `setup.mjs`, `pipeline-start`, and onboarding consume the same convergence
validator. They may format the result for their audience but may not define
competing readiness rules.

### 2. Generated output must validate immediately

Every file written by a completed stage passes its responsible schema,
manifest, source, and projection validators before that stage succeeds.

Generated projections remain protected. No diagnostic may instruct a user or
agent to edit `.claude/pipeline.yaml`, `.codex/config.toml`, or a generated
agent definition directly. Repair always names the authoritative source and a
sanctioned plan/apply operation with readback.

### 3. Runtime initialization is onboarding work

For runner `codex`, missing `.codex/config.toml` or required agent definitions
produce `runtime-initialization-required` and an onboarding-owned initialization
plan. Apply is explicit, transactional, idempotent, and immediately read back.

Portable seed completion remains visibly non-ready while runtime is pending.

### 4. Restart is a real barrier

Creating or materially changing project-local Codex runtime persists
`restart-required`. The current process cannot dispatch implementation,
Goldfish, Advisor, or session activation from those new definitions.

The barrier clears only when a new Codex process produces a native, digest-bound
readback of the effective project config and required agents. File existence,
mtime comparisons, a user assertion, or App-Server health alone are not
accepted as proof. If the host cannot provide the readback, the state remains
non-ready with a typed unsupported-capability result.

The readback also carries a host-authenticated process-generation digest that
must differ from the generation which wrote the runtime. The raw generation
nonce stays outside repository/model input. Environment variables, PID/time
heuristics, same-process values, and replayed receipts cannot clear the barrier.

Restart is performed by a plugin-local, digest-bound one-use launch wrapper.
It stores only a token digest in private state, passes the raw token only to
the newly spawned Codex process, consumes it once under CAS, and still requires
the host-native loaded config/agent chain. The token proves the launch; the
native loaded-chain proves effective runtime. Neither can be self-asserted by
the model.

### 5. Kickoff is sanctioned continuity initialization

A pristine project without valid continuity is `kickoff-required`, not damaged.
A reviewed kickoff plan turns the supplied project goal into initial continuity,
then the sanctioned writer applies it and `continuity-status` validates it.

An arbitrary or empty `docs/state.md` is not continuity. Established malformed
continuity remains a separate damaged state and never receives the pristine
initializer.

### 6. Capabilities precede side effects

Before cleanup, temporary worktrees, remote diagnosis, session activation, or
dispatch, the lifecycle independently classifies:

- Git repository validity and control-path writability;
- repository mode;
- required worktree/session operations;
- project runtime target writability;
- Codex App-Server execution/daemon status.

Host-managed Git is explicitly non-applicable for Git lifecycle operations; it
is not a local repository success. App-Server execution denied, not running,
and unavailable remain different states with different recovery.

Host-managed mode may complete portable onboarding and read-only bootstrap, but
it cannot report session/dispatch readiness when Git, cleanup, or worktree
operations are unavailable. Session and dispatch run stronger intent-specific
checks immediately before their first side effect; earlier bootstrap readiness
does not substitute for them.

An ordinary empty local root may advance through portable seeding only when
the reviewed transaction includes Git initialization and proves Git/root
capability first. Host-managed roots never attempt that Git mutation.

Readiness is evaluated for an explicit intent
(`onboarding|bootstrap|session|dispatch`). App-Server health is not required to
write or inspect the portable seed, but it is required before bootstrap
confirmation, session activation, cleanup, Advisor, or dispatch. This prevents
a generic `ready` result from hiding an operation-specific host failure.

### 7. Remediation is executable data

Operator actions contain an executable and complete argv array plus mutation,
confirmation, and expected-readback fields. Human output is one single-line,
copy-safe rendering of those exact arguments.

No detachable flags, wrapped root/value pairs, shell chains, incomplete
`--initialize-missing-runtime` instructions, or generic `codex doctor`
recommendations are allowed.

## Scope

### PO-approved 0.4.5 rescope

After the operator live-test sequence, the PO explicitly narrowed Issue #61
and this hotfix to the functional fresh-empty-folder path that the current
Codex hook surface can enforce. Native interception for Codex implementation,
Goldfish, and subagent-launch events that are not exposed through the declared
shell/file mutation hooks is not a 0.4.5 completion claim. It is carried into
the prepared P2 follow-up Issue with `sprint:NONE`, an owner, and an expiry.
Issue #25 separately retains installation ceremony and confirmation-count UX.
This rescope preserves fail-closed enforcement for every entry point actually
declared by 0.4.5; it does not permit a fabricated hook capability.

### Lifecycle and validation

- Extend the project onboarding classifier, CLI, schema, and E2E fixtures.
- Make V3 bootstrap authority the common convergence readback.
- Validate the generated manifest through the canonical manifest loader.
- Route direct setup through fresh/adoption/migration lifecycle classification.
- Preserve all existing source, owned-key, preimage, drift, rollback, and
  explicit-activation protections.

### Runtime, restart, and continuity

- Expose onboarding-owned Codex runtime initialization.
- Add the persisted restart barrier and native project-runtime readback.
- Add pristine kickoff plan/apply and immediate continuity validation.
- Keep damaged continuity on a separate fail-closed repair path.

### Capability and enforcement

- Add ordered repository/worktree/runtime capability observation.
- Make repository-mode results consistent across onboarding, calibration,
  freshness, bootstrap, and session startup.
- Refine App-Server error mapping and bounded recovery guidance.
- Block bootstrap success, session activation, cleanup/worktree creation, the
  implemented Pipeline-owned dispatch callers, and every declared Codex
  shell/file mutation entry point at the appropriate non-ready states.
- Cover actual command callers and hook wiring; prose-only blocking is not
  sufficient.

### Release surface

- Register focused suites in the single Verify gate.
- Update maintained onboarding documentation and examples.
- Keep committed version surfaces unchanged while the verified worktree
  candidate is installed locally and live-tested.
- Only after explicit live acceptance, move `VERSION` plus the Claude and Codex
  plugin manifests from 0.4.4 to 0.4.5 and add the 0.4.5 changelog.

## Acceptance criteria

- [ ] Every mandatory first-use stage is represented by one typed lifecycle
      state and overall `ready` is impossible while any stage is pending.
- [ ] Freshly generated `.claude/pipeline.yaml` immediately passes the
      canonical manifest validator.
- [ ] Source and every generated projection are drift-free after each
      successful apply/readback.
- [ ] No supported recovery directly edits a generated projection.
- [ ] Missing Codex runtime targets yield a complete onboarding-owned plan.
- [ ] Remediation is complete structured argv and copy-safe single-line text.
- [ ] Runtime initialization is transactional, idempotent, and deterministic.
- [ ] Runtime creation/change persists `restart-required`.
- [ ] Only a fresh native effective-runtime readback clears the restart barrier.
- [ ] Bash, Edit, Write, `apply_patch`, and every implemented Pipeline-owned
      dispatch caller are blocked until runtime readback and all preceding
      readiness gates pass.
- [ ] Native Codex implementation, Goldfish, and subagent-launch events outside
      the declared shell/file hook surface are explicitly deferred to the
      prepared `sprint:NONE` follow-up and are not represented as enforced.
- [ ] A pristine root without continuity reports `kickoff-required`.
- [ ] Sanctioned kickoff produces state accepted by `continuity-status`.
- [ ] Damaged continuity is never treated as pristine.
- [ ] Invalid, empty, or read-only Git controls are classified before cleanup,
      worktree, remote, or dispatch operations.
- [ ] A normal empty local root initializes Git inside the reviewed portable
      transaction; a Codex host-managed root never attempts Git initialization
      in the workspace sandbox and uses only the separately confirmed,
      digest-bound host helper after kickoff.
- [ ] The host helper creates no commit, mutates no `.codex/**`, migrates only
      private continuity, never reruns the full inspector at the host boundary,
      and requires exactly one project-session restart.
- [ ] After that restart the repository is locally writable with a
      receipt-bound plugin-managed runtime; the read-only mount alone never
      yields `ready`, and no runtime initialization/readback or second restart
      is requested.
- [ ] Host-managed roots cannot pass `session` or `dispatch` intent without
      the required repository/session/worktree capabilities.
- [ ] App-Server execution denied, unavailable, not running, and ready remain
      distinct with bounded guidance.
- [ ] Replaying any completed stage causes no unintended change.
- [ ] Combined results contain no readiness claim alongside a failed
      prerequisite.
- [ ] Pristine continuity requires absence of handover, machine state, and
      private continuity history; any inconsistent present input is damaged.
- [ ] Fixtures cover incomplete runtime, invalid generated manifest, projection
      drift, restart enforcement/readback unavailable, pristine and damaged
      continuity, read-only controls, roots with spaces, and degraded
      App-Server capability.
- [ ] Focused tests, Full Verify, blocking Security, and an independent
      high-risk Critic pass on the exact 0.4.5 candidate.

## Non-goals

- General preference/configuration UI; Issue #25 owns it.
- Automatic remote creation or Git identity configuration.
- General liveness supervision or autonomous continuation.
- Broad persistence of runner workarounds outside onboarding.
- Reimplementation of the Claude first-binding lifecycle.
- Platform certification beyond the tested runner/platform matrix; the
  lifecycle still renders exact argv for Linux, macOS, and Windows.
- Automatic tag, GitHub Release, marketplace publication, push, merge, or
  Issue closure.

## Delivery and acceptance sequence

1. Lifecycle kernel, common convergence validator, and copy-safe remediation.
2. Capability ordering, Codex runtime initialization, restart/native readback,
   and kickoff.
3. Bootstrap/session/Advisor/dispatch enforcement plus hook coverage.
4. E2E matrix, maintained documentation, Full Verify, blocking Security, and
   independent Critic.
5. Install the exact tested worktree locally through the sanctioned Codex
   plugin development/cachebuster flow and read back the active candidate
   digests.
6. Stop for the operator's live onboarding test. Incorporate any findings and
   repeat automated checks plus local installation until the operator accepts
   the behavior.
7. Only after explicit live acceptance, change the committed version surfaces
   to 0.4.5, add the changelog, rerun the required checks, and prepare the final
   commit. Push, tag, merge, publication, Issue closure, and release remain
   separate explicit actions.

Each slice must remain testable and fail-closed. No slice may temporarily report
`ready` without the later mandatory stages.

## Risks and controls

| Risk | Control |
| --- | --- |
| A fifth parallel state machine | `project-onboarding-v3` is the sole public lifecycle owner. |
| Restart claimed without host evidence | Native loaded-runtime receipt or typed unavailable; no heuristic fallback. |
| Host-managed mode masks unusable Git | Git operations are explicitly non-applicable and remain blocked. |
| Broad guard change weakens existing protection | Additive lifecycle gate; retain drift/preimage checks; high-risk Critic. |
| Copy-safe text diverges from executed args | Render human command from the same closed argv structure and test it exactly. |
| Version bump mistaken for release | Separate push/tag/publication/release gates remain blocked. |

## Rollback

The repository change rolls back by ordinary revert. A failed onboarding stage
uses its transaction journal and preimages to restore the previous state.
Already completed consumer stages are not silently downgraded or rewritten by
an older plugin; unsupported newer state remains fail-closed.

## PO approval requested

Approval means:

- this PRD and the bound Spec are the implementation authority;
- the current tracked feature may switch to `codex-onboarding-0.4.5` in
  `design`, then to execution only after approval is recorded;
- implementation is delegated through bounded Goldfish packages;
- the functional candidate is verified and independently reviewed;
- the exact tested worktree is installed locally for the operator's live test
  before committed version changes or a final commit;
- live findings may reopen implementation and must pass the same checks again;
- version finalization and final commit wait for explicit live acceptance;
- remote delivery and release actions remain separately gated.

Reply with the exact word `approved` to open implementation. Any requested
change keeps the plan in design and requires an updated digest/readiness check.
