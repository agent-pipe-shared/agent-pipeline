# Nova B4R Design — V4 Recovery Deadlock Correction (`#63`)

> Historical artifact, superseded for Nova authority on 2026-07-30. Issue
> `#63` is now owned by `hotfix:0.4.7`. This document is retained only as
> conflict-analysis input; it grants no current Nova implementation or
> delivery authority. Nova consumes the canonical fix solely by rebasing onto
> the Product-Owner-identified stable `main` 0.4.7 baseline.

## Decision

Issue `#63` is a Nova P0/M release blocker implemented directly on the current
Sprint branch after its rebase onto the delivered and closed `v0.4.6` base.
B4R executes before B5 candidate freeze. It changes no `v0.4.6` release claim
and carries no unfinished work from the `0.4.x` line.

The correction keeps the V4 readiness guard fail-closed. It adds only three
pre-ready command families:

1. the exact read-only `plan-source-recovery` planner;
2. the exact read-only `plan-manifest-repair` planner and its one
   digest-bound, explicitly confirmed `apply-manifest-repair`; and
3. the existing Pipeline-shipped read-only
   `v3-bootstrap-authority.mjs --root <exact-root>` validator.

No other command, path, source transition, or pre-ready write is authorized.

## Closed recovery states

| Observation | Planner category | Disposition |
| --- | --- | --- |
| invalid or unrecognized `pipeline.user.yaml` | `invalid-authority` | `unrepairable`; external source-owning repair only |
| recognized older V3 registry projection | `stale-generated-projection` | existing V3 inspect/plan/apply workflow |
| recognized legacy or non-Codex-selected source | `unsupported-source-transition` | existing V3 migration when supported; otherwise `unrepairable` |
| pending V3 transaction prevents current evidence | `unavailable-evidence` | existing preview-attested V3 recovery workflow |
| source is current and another component controls | `current-authority` | rerun V4 and follow that controlling action |

Every `source_invalid` V4 result exposes the exact read-only source planner.
The planner never writes source authority and ends either in one sanctioned
action or an explicit terminal disposition.

## Manifest repair contract

`pipeline.project-onboarding-manifest-repair-plan.v1` is closed over:

- the canonical physical root;
- `pipeline.user.yaml` path and SHA-256;
- the sole target `.claude/pipeline.yaml`;
- absent/present preimage status, digest and byte length;
- postimage digest and byte length;
- preservation mode `absent-target-only`; and
- its canonical `planSha256`.

The apply command carries the exact root and plan digest plus `--activate`,
declares `mutation:true` and `requiresConfirmation:true`, recomputes the plan,
rejects raw source or target preimage drift, writes only the generated manifest
through a pinned physical parent directory, and returns a fresh V4 inspection.
A missing manifest is reconstructable from the current V3 source and is
published with an atomic no-replace link, so a concurrently appearing target
cannot be overwritten. Existing manifest bytes are never replaced by this
recovery writer: they return `unrepairable` and remain byte-identical for
repair through their owning workflow. Source or parent drift detected at the
publication boundary quarantines the exact generated inode before readback.

There is no auto-apply, whole-file guess, arbitrary runtime write, source
rewrite, readiness shortcut, or success inferred from file presence.

## Guard boundary

The lifecycle guard parses one simple argv vector and requires:

- the loaded Pipeline script absolute path;
- the exact governed physical root;
- the exact command spelling and argument count;
- a lowercase 64-hex plan digest for manifest apply; and
- `--activate` for the sole new writer.

Wrong roots, missing/extra flags, aliases, chaining, redirection, command
substitution and arbitrary pre-ready writes remain denied. The outer Codex
adapter is covered so the permission does not exist only in an uncalled inner
helper.

## Verification

Required focused evidence covers:

- V4 unit recovery states, manifest digest/CAS/confirmation and readback;
- hostile lifecycle-guard argv and arbitrary-write denial;
- outer Codex hook routing;
- Pipeline-start instructions and contract checks; and
- a process-level fixture that starts `ready`, removes the generated manifest,
  repairs it through shipped CLIs, checks out a recognized governed V3 refresh,
  applies the existing V3 migration, and returns to `ready`.

Before Sprint close, Full Verify, blocking Security and fresh independent
Critic evidence bind the exact candidate commit/tree. Only after the delivery
merge commit exists may Issue `#63` receive a comment naming that merge commit
and the relevant exact-candidate verification results.

## Explicit exclusions

- no readiness-guard weakening;
- no arbitrary pre-ready writes;
- no source-authority synthesis;
- no repair of unpreservable unowned manifest bytes;
- no onboarding UX, documentation IA, installer redesign, or other broader
  Nightwing scope from `#61`; and
- no push, merge, release, Issue close, or success claim without its separate
  gate and actual external reference.
