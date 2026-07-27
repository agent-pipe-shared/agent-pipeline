# ADR-0048 — Functional same-host Goldfish supervisor

**Status:** accepted by PO instruction · **Date:** 2026-07-26

## Context

ADR-0047 established the machine-local state root and repair authority but
deliberately prohibited worker launch. Nova B1-C established only a pure pool
contract. Nova B1-I now needs a functional same-host execution path: separate
Git workspaces, real child processes, bounded liveness observation,
cancellation, result inspection and exact cleanup. A reducer or an in-process
mock is not sufficient.

The normal Codex Host Advisor did not produce a valid
`pipeline.host-advisor-status.v1` for this design run. The PO explicitly
authorized one fresh read-only fallback subagent. It returned design advice,
but no Pipeline Advisor attestation, gate decision, model-identity statement or
OS-isolation claim. The PO also explicitly authorized direct implementation by
the sole active Codex session as an EL-01/EL-16 exception for this exact
manifest. These are process exceptions, not a claim that the normal bootstrap
Advisor step passed.

The observed main-session identity is `gpt-5.6-sol` with effort `xhigh`. The PO
inserted this bounded Epic design phase before implementation and approved the
goals and implementation request in the same instruction chain.

## Decision

### Authority and execution boundary

ADR-0044 remains unchanged: the Elephant/control plane owns admission,
cancellation, result acceptance, Verify, Critic, merge and release. A worker
may execute only one already-admitted, digest-bound package. It cannot
delegate, approve, widen paths, issue credentials, import its own result,
modify the source checkout, merge, push or release.

ADR-0047 `pipeline.local-supervisor-state.v3` and B1-C
`pipeline.local-worker-pool.v1` remain unchanged. B1-I adds the companion
schemas:

- `pipeline.local-worker-supervisor-request.v1`;
- `pipeline.local-worker-supervisor-record.v1`;
- `pipeline.local-worker-supervisor-result.v1`; and
- `pipeline.local-worker-supervisor-cancel.v1`.

### Structural and semantic validation contract

The published JSON Schema owns the closed structural shape and every
constraint expressible in JSON Schema 2020-12. It is not a standalone
admission claim. The matching exported runtime validator is the canonical
semantic validator for digest equality, lexical ordering, cross-item
uniqueness, heartbeat-relative orphan bounds, cross-worker timing equality
and cleanup-lease relations.

Public acceptance is the conjunction of the structural Schema result and the
canonical semantic-validator result. The combined public contract and the
supervisor admission must accept and reject the same conformance corpus.
Representable constraints, including safe relative paths, remain duplicated
in Schema and runtime and are tested for parity. A client that runs only the
JSON Schema has performed structural validation, not B1-I admission.

The supervisor proceeds only after exact ADR-0047 `ready/noop` readback for the
same repository fingerprint, candidate digest and supervisor subject. `busy`,
`recovery-required`, unavailable or unsafe local state returns typed
non-success before a clone or process exists.

One foreground supervisor owns one pool for one repository. Its persisted
record is closed, limited to 65,536 bytes, atomically replaced, fsynced and
read back under the ADR-0047 root. It binds:

- repository fingerprint, source-root digest and planning-time source-status
  digest;
- base/candidate OIDs and candidate digest;
- dispatch, attempt, queue revision, package and pool digests;
- supervisor nonce, PID, process-start digest and boot digest;
- monotonic heartbeat, orphan and cleanup leases;
- effective capacity and the reserved recovery slot;
- every workspace member/path digest, worker subject, write set and process
  identity; and
- record and result digests.

No credential, environment value, home path, account, token, raw private
coordinate or prompt transcript is persisted in the record.

### Capacity and fallback

The B1-C effective capacity remains the minimum of configured, operator,
certified, observed and pressure bounds after Elephant/Verify/Critic
reservation. B1-I subtracts one additional recovery slot and caps a pool at 16
workers. A required unknown bound, an invalid B1-C pool, exhausted control or
recovery reserve, overlapping worker write paths, or a request larger than the
remaining capacity yields `serial-fallback-required`. The existing serial
package remains authoritative; the supervisor does not silently shrink or
partially admit a requested wave.

### Workspaces

Every admitted worker receives an independent local Git clone under:

`<ADR-0047-root>/workspaces/<lease-id>`

The adapter uses fixed `git` argv with `shell:false`,
`--local --no-hardlinks --no-checkout`, disabled hooks, no terminal prompt and
an exact detached candidate checkout. It verifies the resulting `HEAD` before
launch. A clone is not a shared Git worktree, does not register anything in the
source repository and does not claim OS isolation.

Each workspace contains an exact owner marker bound to the request, lease and
workspace path digest. The state root, workspace root and each workspace are
current-user-owned private directories. Cleanup is a separate explicit
action. It revalidates the root, marker, terminal process identity, cleanup
lease and exact persisted manifest member before deleting that one workspace.
It never scans by glob or prefix and never mutates the source checkout.

### Processes and worker adapters

The production adapter is a fixed Codex non-interactive invocation. It uses the
prepared executable identity, `codex exec`, `--strict-config`,
`--sandbox workspace-write`, `--ephemeral`, `--json`, exact `--cd`, explicit
model/effort, approval policy `never`, disabled web search and disabled
workspace command network. Its instruction is the admitted package text,
SHA-256 bound before launch and supplied over stdin rather than process argv.
The adapter neither accepts arbitrary argv nor persists authentication
material.

Provider activation requires the CLI's separate
`--allow-provider-execution` switch in addition to the request/plan digest and
`--activate`. This ADR authorizes implementation and deterministic local tests,
not a live model/provider run. A live Codex Goldfish wave therefore remains a
separate activation event with its actual authentication and network
preconditions visible.

The test adapter is fixed to the repository-owned fixture worker. Tests use
real temporary Git repositories, real independent clones and real child
processes. They do not call a model, provider, broker or network.

Every child is launched with `shell:false`, exact `cwd`, a closed environment
allowlist and bounded stdout/stderr/result sizes. On Linux, ownership is the
nonce plus PID plus `/proc` start identity plus boot digest plus executable
digest. An unavailable identity is non-success. The foreground supervisor
heartbeats only after re-observing that complete identity. Timeout or
cancellation signals only that exact revalidated PID; no process group,
prefix, name or broad kill is allowed.

Cancellation is an explicit digest-bound CLI action. It exclusively creates a
closed cancellation intent bound to request, plan, exact record and owner
identity. The foreground supervisor observes that intent, enters `draining`
and records terminal worker cancellation. A cancellation request is not itself
a terminal success claim.

### Results, crash recovery and claims

After a terminal exit, the supervisor verifies the candidate, enumerates Git
changes with fixed Git commands, detects ignored untracked files, rejects paths
outside the admitted write set, and revalidates the unchanged source checkout.
It records a bounded path/kind/mode/size/content-digest manifest plus its
digest and never applies changes to the source checkout. A zero process exit
is not Pipeline acceptance; Verify, Critic and PO authority remain separate.

If the foreground supervisor disappears, later inspection reads only the exact
record path. A live exact owner is `busy`. A dead or mismatched owner, a live
unowned child, an expired cleanup lease, candidate/queue drift, malformed
record, partial result or uncertain workspace ownership is
`recovery-required`. This slice deliberately performs no automatic takeover,
kill or deletion under uncertainty.

Capability remains unadvertised until a separately activated same-host
observation proves at least two real Goldfish workers overlap under the same
candidate, fixture set and resource envelope. Passing deterministic fixture
tests proves the functional local process/workspace adapter, not model
identity, selected-sandbox execution, OS isolation or B1 issue closure.

**Deferred live-provider/capability risk disposition (B1-I):** Accountable
owner: the Nova Product Owner. Expiry: **2026-08-09**. Until that owner renews
or replaces this disposition with a separately accepted observation, the Codex
provider adapter remains inactive, B1 capability remains unadvertised, and
Issue `#21` remains open. This disposition authorizes neither activation nor
implementation, credentials, network access, issue closure, push or release.

## B1-I goals

1. Freeze this authority and exact path manifest before production code.
2. Prove real independent Git clones and overlapping local child processes.
3. Fail closed on capacity, candidate, write-set, owner, lease and result drift.
4. Prove exact timeout/cancellation and exact-owner cleanup without broad
   process or filesystem actions.
5. Provide a production-capable Codex `exec` adapter while keeping live
   provider activation off in this implementation/test block.
6. Register the complete focused suites in Full Verify and preserve all
   ADR-0047 and B1-C regressions.
7. Keep B1 capability and Issue `#21` open until the separate live `N+1 >= 2`
   Goldfish observation is accepted.
8. Prove the structural-plus-semantic validation contract with positive,
   structural-negative and semantic-negative corpus cases; never weaken
   runtime admission to fit the expressive limits of JSON Schema.

## Exact implementation manifest

Only these 20 paths belong to the ADR-0048 B1-I slice:

| Path | Responsibility |
| --- | --- |
| `.claude/pipeline-state.json` | sanctioned design/implementation phase readback |
| `docs/adr/0048-local-goldfish-supervisor.md` | binding decision, PO exceptions, goals and exact manifest |
| `docs/adr/README.md` | ADR register entry |
| `docs/local-supervisor-state-threat-model.md` | extended worker/process/workspace threat model |
| `docs/product-capability-inventory.json` | registered verification surfaces |
| `docs/state.md` | operational handover and residual activation gate |
| `governance/observation-doc-governance.json` | ADR-0048 normative-document classification |
| `harness/scripts/verify.mjs` | focused-suite registration |
| `plugins/pipeline-core/lib/local-worker-supervisor.mjs` | closed contracts, capacity, identity, Git/process/state and cleanup core |
| `plugins/pipeline-core/lib/local-worker-supervisor.test.mjs` | contract, denial, recovery and adapter-unit corpus |
| `plugins/pipeline-core/scripts/local-worker-supervisor.mjs` | read-only plan/inspect and digest-bound activate/cancel/cleanup CLI |
| `plugins/pipeline-core/scripts/local-worker-supervisor.test.mjs` | real temporary Git clone/process/overlap/cancel/cleanup integration |
| `plugins/pipeline-core/scripts/local-worker-supervisor.schema.json` | closed request/record/result/cancel JSON Schemas |
| `plugins/pipeline-core/scripts/fixtures/local-worker-supervisor-worker.mjs` | deterministic real local test process; no provider |
| `specs/sprint-nova-epic/spec.md` | B1-I authority/path resolution |
| `specs/sprint-nova-epic/acceptance.md` | non-vacuous functional versus live-capability criteria |
| `specs/sprint-nova-epic/plans/nova-b.md` | PO exception, phase, ordered goals and stop conditions |
| `specs/sprint-nova-epic/prd_sprint-nova-epic.md` | PO-gate technical-Spec digest readback |
| `specs/sprint-nova-epic/result.md` | append-only design/fallback/implementation evidence |
| `specs/sprint-nova-epic/lifecycle.json` | refreshed artifact bindings |

ADR-0047 and B1-C source/schema files are imported authorities and are not
modified by this slice.

## Consequences

B1-I gains a real same-host supervisor path without granting remote execution,
credentials, a broker, automatic source integration or an isolation claim.
The deterministic test wave is executable now. A provider-backed Goldfish wave
is implemented but remains off until separately activated. B2-I and every
external host/credential/broker concern remain blocked behind their own ADR.

Rollback is one forward revert of this exact manifest after fresh Verify and
Security. Any machine-local residue is handled only by the exact-owner cleanup
action or a separately authorized recovery decision; rollback never broad
deletes a state root or signals a process.

## Discarded alternatives

- Extend ADR-0047 v3 or B1-C v1 in place: rejected; both accepted shapes remain
  stable and get a companion contract.
- Shared Git worktrees: rejected for this slice; they mutate the source Git
  common directory and weaken workspace separation.
- Arbitrary executable/argv or inherited full environment: rejected as a
  confused-deputy and credential-leak surface.
- PID-only, group, prefix or name-based cleanup: rejected because PID reuse and
  collisions can affect unrelated processes.
- Delete workspaces immediately on worker exit: rejected; control-plane result
  inspection and explicit cleanup must stay separate.
- Treat fixture overlap as live Goldfish capability: rejected; provider-backed
  `N+1 >= 2` observation remains a separate activation and acceptance gate.
