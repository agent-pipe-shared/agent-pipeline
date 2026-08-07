# ADR-0047 — Local supervisor state authority and repair

**Status:** accepted · **Date:** 2026-07-25

## Context

Nova B B1-I needs a feature-branch-only local supervisor without creating a
portable state store, persisting credentials, or treating PID presence as
ownership. The PO-approved D1 decision requires a lawful machine-local root,
exact ownership, bounded recovery, and onboarding/pipeline-start repair that
cannot recurse or deadlock.

## Decision

Portable repository authority remains in the existing Pipeline state and
evidence artifacts. Mutable supervisor state is machine-local only, under the
following versioned per-repository root:

| Platform | Root template | Absent or unusable root |
| --- | --- | --- |
| Linux | `${XDG_STATE_HOME}/agent-pipeline/v1/<repository-fingerprint>` | `unavailable` |
| macOS | `${HOME}/Library/Application Support/agent-pipeline/v1/<repository-fingerprint>` | `unavailable` |
| Windows | `%LOCALAPPDATA%\\Agent-Pipeline\\v1\\<repository-fingerprint>` | `unavailable` |

These are declared operating-system application-state roots, not generic home,
shared-cache, repository, `.git`, or temporary-directory fallbacks. The root
is created only by the bounded setup command. The platform base must be
absolute; setup verifies every component from the filesystem root through the
per-repository directory as a regular, non-symlink directory before reading or
writing a direct child.

Each supervisor record is closed, versioned, size-bounded, and binds the
repository fingerprint, candidate, subject, owner nonce, PID, process-start
token, privacy-safe boot digest, lease heartbeat/expiry and schema digest. PID
alone never establishes ownership. Cleanup admits only an exact manifest member
whose complete ownership tuple matches, whose lease digest and expiry remain
valid at the supplied monotonic time, and whose record digest is listed by the
caller-provided exact manifest; it never uses a
glob, prefix deletion, broad process signal, repository cleanup, or a fallback
root. Credentials and secret bytes are never stored in this root.

Every direct state, journal and lock file is limited to 65,536 bytes before
synchronous parsing; a larger or non-regular file returns typed non-adoption.

The initial persisted shape is `pipeline.local-supervisor-state.v3`. An
encountered `v1`, `v2` or otherwise non-v3 record is never reinterpreted or migrated
implicitly: it returns the typed `recovery-required` result and preserves its
bytes for a separately authorized operator decision. Future shape changes must
use a new record version with an explicit compatibility or migration decision.

Setup and `pipeline-start` use the same idempotent repair protocol:

```text
absent -> prepare -> readback -> ready
interrupted prepare -> recover-owned -> readback -> ready
live foreign owner -> busy
unknown/stale ownership -> recovery-required
```

The normal setup CLI and `pipeline-start` integration run the same read-only
preflight first; only the explicit `--apply` form performs the bounded repair.
The repair protocol takes one bounded lock attempt, publishes a typed plan
before changing state, and returns `busy` rather than waiting, retrying
recursively, or taking over an unproven owner. A successful readback makes a
repeated start a no-op. No process launch, worker admission, external runner,
credential lease or OS-isolation claim is included by this ADR.

Each journal/state replacement fsyncs the new file and its containing directory;
the final journal removal fsyncs the state directory before reporting ready.
An unavailable durability primitive returns typed `unavailable` rather than a
successful transition.

Any local I/O denial or write/readback failure returns typed `unavailable`
evidence (`LSS-IO`) after the bounded cleanup attempt; it never exposes an
unstructured exception as continuation success.

The exact implementation manifest for the first feature-branch-only slice is:

| Path | Responsibility |
| --- | --- |
| `docs/adr/0047-local-supervisor-state-authority.md` | D1 authority, exact manifest and rollback boundary |
| `docs/local-supervisor-state-threat-model.md` | D1 threat model and bounded deferred-risk ownership |
| `docs/product-capability-inventory.json` | registered D1 verification surface |
| `governance/observation-doc-governance.json` | classification for the D1 threat-model artifact |
| `harness/scripts/verify.mjs` | D1 suite registration in Full Verify |
| `plugins/pipeline-core/lib/local-supervisor-state.mjs` | pure state, ownership, repair and cleanup admission validators |
| `plugins/pipeline-core/lib/local-supervisor-state.test.mjs` | deterministic repair, contention, stale-owner and cleanup-denial corpus |
| `plugins/pipeline-core/scripts/local-supervisor-setup.mjs` | read-only setup/preflight plus explicit bounded `--apply`; no worker launch |
| `plugins/pipeline-core/scripts/local-supervisor-setup.test.mjs` | isolated filesystem setup/recovery/readback tests |
| `plugins/pipeline-core/scripts/local-supervisor-state.schema.json` | closed persisted record schema |
| `plugins/pipeline-core/skills/pipeline-start/SKILL.md` | accepted-plan D1 read-only startup preflight |
| `plugins/pipeline-core/skills/pipeline-start/pipeline-start-v3.test.mjs` | startup-preflight contract regression |

Required tests are interrupted-repair resume, concurrent-repair busy,
stale-owner recovery, repair readback, repeated-start idempotence, v1/version,
candidate/subject mismatch, root-and-child symlink and non-regular-path denial,
wrong-owner cleanup denial, and no-root typed
unavailability. Existing B1-C/B2-C reducers remain unchanged; B1-I process
launch and B2-I remote execution require separately accepted follow-up
authority.

## Consequences

The next implementation can create and repair only a local, secret-free state
root and prove the authority boundary before supervising any worker. A missing
or uncertain platform condition stops safely with typed evidence, preserving
the serial Pipeline baseline. Rollback is one forward revert of the complete
listed twelve-path slice after a fresh Verify, Security and Critic run; no
broad cleanup is part of rollback.

## Discarded alternatives

- Repository, `.git`, shared cache, generic home or temporary state: rejected;
  they blur portable and machine-local authority or introduce fallback drift.
- PID-only ownership or broad orphan cleanup: rejected; PID reuse and prefix
  collisions can affect unrelated processes/files.
- Automatic lock retry or recursive start repair: rejected; it can deadlock or
  hide foreign ownership.
- Worker launch before repair evidence: rejected; it turns a setup fault into
  an unbounded supervisor failure.
