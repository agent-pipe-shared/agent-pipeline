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

## Protected assets

- Pipeline State, Continuity, runtime projection, cleanup descriptors, and
  owner nonces;
- repository history and publication authority;
- credentials and secret-bearing paths or command input;
- plugin source/installation identity;
- the denial, authorization, consumption, rejection, and expiry audit trail;
- the invariant that one authorization permits at most one exact tool input.

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

## Crash and ambiguity rules

Authorization is durable only after the capability and authenticated audit
event exist. Consumption happens before allow. Therefore an adapter crash:

- before consume leaves the capability armed and still subject to all fresh
  preimage checks;
- during the exclusive consume transaction fails closed;
- after durable consume never permits replay, even when the eventual tool
  outcome is unknown.

No success is inferred from an absent response.

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
