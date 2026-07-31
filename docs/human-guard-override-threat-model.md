# Attended Human guard override threat model

Status: normative security input for the 0.4.7 hotfix candidate.

## Purpose and security boundary

The attended override is a recovery capability for one exact tool call that
normal Pipeline guards have already denied. It does not disable a guard,
change guard policy, grant a session-wide exception, or authorize publication.
The Human authorizes a digest-bound request after reviewing the ordinary guard
denials and supplying a reason.

The trusted computing base is:

- the loaded `pipeline-core` manifest, central Codex adapter, override library,
  and override CLI;
- the physical repository and Git common-directory identities;
- the Pipeline State/Continuity preimage;
- owner-private local storage and its operating-system access controls;
- the Human who reviews the plan and confirms the exact authorization action.

The model does not treat an agent instruction, environment variable, free-form
guard prefix, or possession of a request digest as Human authority.

## Actors and authority boundaries

The relevant adversaries are an untrusted/compromised agent, a local process
that can race or replace checkout files, a caller replaying a previously
reviewed action, and an operator or tool attempting to turn a local recovery
into a publication or Security exception. A same-OS-owner attacker remains a
residual risk; the controls below are intended to reject accidental,
partial, stale, and cross-boundary tampering rather than to claim protection
against full owner compromise.

Three boundaries remain separate and non-substitutable:

- An attended guard override admits at most one otherwise eligible local tool
  input. It is not State authority, Result-migration authority, publication
  authority, or Security-ignore authority.
- The PO-authorized Phoenix `Result.md`/`result.md` collision migration is a
  separate, digest-bound State-writer transaction. The PO explicitly selects
  the canonical Result in the read-only plan and confirms its exact apply
  action; case, mtime, path order, or an agent suggestion never selects it.
- Publication uses its own candidate-, channel-, destination-, expiry-, and
  executor-bound authority. Security findings have no generic ignore
  capability: a scanner exception, where separately supported, is an exact
  content-bound policy input and remains candidate-bound. Neither a Human
  guard override, Result migration, nor publication executor can create,
  widen, or consume a Security ignore.

## Protected assets

- Pipeline State, Continuity, runtime projection, cleanup descriptors, and
  owner nonces;
- repository history and publication authority;
- credentials and secret-bearing paths or command input;
- plugin source/installation identity;
- the denial, authorization, consumption, rejection, and expiry audit trail;
- the invariant that one authorization permits at most one exact tool input.
- the two colliding Result candidates, the PO-selected canonical Result, the
  inactive Result's fixed archive destination, lifecycle artifact binding, and
  the State/Continuity revision, resume, and authority bindings;
- the private Result-migration HMAC key and journal, including its preimage,
  postimage, archive move, lifecycle update, and recovery disposition;
- the exact publication candidate OID/tree, destination ref/channel,
  approval expiry, fixed executor identity, one-use execution state, and
  remote readback receipt;
- blocking Security findings and the narrow, separately governed,
  content-bound scanner-exception policy, if one exists.

## Threats and controls

| Threat | Control |
| --- | --- |
| An agent broadens a denial into a session bypass | Capability binds canonical tool name/input digest, complete denial set, repository and plugin preimages; it expires and is consumed once. |
| A free-form environment override bypasses Codex guards | The central adapter forces the typed capability route and disables the legacy Git override inside that adapter. |
| Authorization is inferred from prose | A read-only plan is followed by a reason-bound preparation result and one exact `--plan-sha256`, `--selection-sha256`, `--reason-sha256`, `--activate` action. |
| Replay or parallel double use | Per-plan exclusive consume lock; capability is atomically rewritten to `consumed` before the tool call is admitted. |
| Repository, State, plugin, denial, or input drift | Fresh physical observations must equal every bound preimage before consumption. Plugin identity includes the manifest, central adapter, override policy library, and override CLI. |
| Capability tampering | Capability records carry an HMAC authenticated by the owner-private audit key. |
| Audit deletion, replacement, reordering, or editing | Strict sequence plus previous-MAC linkage, HMAC verification, and a separately authenticated ledger-head anchor; deleting either or both ledger/head files while retaining the key fails closed. An armed capability is unusable unless its exact authorization event is present. Missing material is never silently regenerated. |
| Symlink, hardlink, weak POSIX mode, or weak native-Windows DACL | Every existing target ancestor is physically inspected; symlink traversal, single-link, mode, and DACL assurance failures fail closed. |
| Secret disclosure through audit | Audit events contain digests and bounded identifiers, never raw tool input, Human reason, owner nonce, repository-private path, or secret. |
| Override reaches a protected operation | State/runtime/private paths, outside-root paths, secret patterns, descriptor deletion, plugin installation, every Git invocation including aliases, push/tag/merge/release, operators, redirects, substitutions, and unparseable commands are non-overridable. Bash recovery is additionally closed to a small read-only diagnostic executable allowlist plus exact single-file `node --check`; interpreter evaluation and arbitrary scripts are never override-eligible. |
| Adapter persistence or verification fails | The original guard denial remains controlling and the adapter emits only a sanitized failure code. |
| A case-fold collision silently chooses, overwrites, or deletes a Result | The Phoenix exception is eligible only for one quiescent, physically safe feature package with both distinct regular single-link candidates and an absent fixed archive target. The PO-selected canonical target is bound by path, digest, and identity; the unselected source may only be locally renamed to `archive/<inactive basename>`. No content rewrite, other checkout, Git ref, remote, outcome, decision, or close transition is permitted. |
| A migration changes State but leaves lifecycle/authority bindings incoherent | The plan binds State, continuity revision, PRD/Spec, both candidates, lifecycle manifest, archive absence, and complete State/lifecycle postimages. Apply holds the normal continuity lock, changes lifecycle retention/authority and State/Continuity together, advances the revision once, and reads back the complete converged postimage. |
| A crash, forged journal, or replay turns a partial Phoenix migration into success | The private Git-common-dir journal is owner-private, physical-path checked, HMAC authenticated, and bound to the exact plan/pre/postimage. Recovery accepts only the same plan and the expected preimage-or-postimage at every step; conflicting, missing, malformed, or tampered journal/State/lifecycle/archive bytes fail closed. |
| A caller publishes another candidate, reuses a publication approval, or substitutes an executor | The fixed publication executor must first durably consume the exact `push-authorized` authority under raw-digest CAS. The authority binds candidate OID/tree, channel, destination ref, approval interval, attempt ID, and executor digest; subsequent observation and fetch/readback are bound transitions, not inferred success. |
| A recovery or publication path suppresses a Security finding | There is no `security-ignore` authority in these paths. A blocking finding remains blocking unless a separate exact content-bound scanner policy applies to that finding; broad/rule-wide suppression, a changed value or position, missing policy, and any attempt to route the exception through a Human override fail closed. |

## Crash and ambiguity rules

Authorization is durable only after the capability and authenticated audit
event exist. Consumption happens before allow. Therefore an adapter crash:

- before consume leaves the capability armed and still subject to all fresh
  preimage checks;
- during the exclusive consume transaction fails closed;
- after durable consume never permits replay, even when the eventual tool
  outcome is unknown.

No success is inferred from an absent response.

### Phoenix case-migration recovery

The constrained Phoenix exception is local archival recovery, not a general
case-normalization feature. After the PO confirms the exact plan, the writer
first durably publishes the HMAC-authenticated journal. It then moves only the
inactive local Result to the plan-bound archive path, updates the package
lifecycle record so that exactly the selected target is active authority and
the moved file is archive-only, and writes the bound State/Continuity
postimage. State binds the selected Result authority and matching
revision/resume/update fields exactly once.

If interrupted before, during, or after any of those steps, a retry may only
replay that authenticated journal under the same lock and plan bindings. It
re-observes each archive, lifecycle, and State pre/postimage before continuing;
only the full postimage may return an applied/replayed disposition, after which
the journal can be retired. An unresolved journal-retirement failure, partial
move, or uncertain external state is not success and never permits a second
revision or an alternative canonical selection.

### Publication and Security recovery

Once publication execution begins, its authority is durably one-use before an
external mutation is attempted. A timeout, process loss, malformed executor
result, or missing remote readback leaves the result unknown/consumed or
blocked; it must be resolved through the separately authorized publication
state machine, never by rerunning a push or treating local completion as
remote success. Security evidence is likewise fail-closed: an unavailable,
changed, or unmatched exception policy does not downgrade a finding.

## Platform contract

Linux, WSL, and macOS use physical paths, single-link checks, and owner-only
POSIX modes. Native Windows uses the existing private-state DACL assessor and
directory hardener; an unavailable or non-secure assurance result rejects the
operation. Platform-simulated negative tests supplement, but do not replace, a
native-Windows package/readback run before a production release claim.

## Residual risks

Risk owner: Agent-Pipeline maintainers. Review deadline: before any expansion
beyond attended local recovery, and no later than the 0.4.8 design gate.

- A process already acting as the same operating-system owner can modify both
  code and local security state; HMAC and physical identity checks turn
  accidental or partial tampering into a denial but are not a defense against
  full owner compromise.
- The guard-to-tool boundary cannot hold a filesystem lock across execution.
  A concurrent actor could change an otherwise eligible target after
  consumption. The exact input remains fixed, replay is impossible, and
  high-impact paths/actions remain non-overridable, but callers must still
  avoid concurrent repository mutation during an attended recovery.
- Opaque in-repository scripts can have behavior not derivable from their
  argv. Human review remains mandatory; the override is not a sandbox.

These residual risks are accepted only for attended local recovery. They do
not weaken push, release, deployment, credential, State, or private-descriptor
controls.
