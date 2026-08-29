---
schema: pipeline.backlog-item.v1
id: pipeline.stale-checkout-runs-outdated-human-approval-ceremony-against-current-trust-policy
type: defect
owner: pipeline
status: open
created: 2026-08-12
sprint: alfred
done_when: contains plugins/pipeline-core/scripts/po-human-approval.mjs may be older than the plugin installed
source: "Cross-repo observation from a sibling Phoenix session, relayed by the PO into this Nova session for filing."
due: 2026-09-12
expires: 2026-09-12
---

# A checkout that lags the installed plugin runs the wrong human-approval
# ceremony shape and fails with a misleading trust-policy error

## Description

A sibling repository (`agent-pipeline-shared_phoenix`) attempted the push
human-approval ceremony using its own checked-out
`plugins/pipeline-core/scripts/po-human-approval.mjs` copy, invoking the
two-step `prepare-critical`/`approve-critical` shape:

```
node plugins/pipeline-core/scripts/po-human-approval.mjs approve-critical \
  --repo-root <repo-or-worktree> --directory /home/skar667/agent-pipeline-po \
  --kind push
```

This failed:

```
PO-HUMAN-APPROVAL-FAILED: external trust policy does not match the local public key
```

Root cause, diagnosed by the Phoenix session itself (not independently
re-verified from this Nova session, which has no read access to the Phoenix
checkout): the Phoenix branch predates [ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md),
which collapsed the ceremony into a single `authorize-critical` command and
changed the external directory's trust-policy record shape (adds a required
`humanName` field). ADR-0061 is already merged to `origin/main` and shipped
in the installed plugin (`0.5.4`), but the Phoenix session's own branch
checkout had not yet merged/rebased past it — so its local, stale
`po-human-approval.mjs` copy read the SAME external `~/agent-pipeline-po`
directory (now upgraded to the new shape by a different, up-to-date session)
and its shape-consistency check failed. The failure is not a real trust/key
compromise — it is a **version-skew symptom**, surfaced through a
crypto-sounding error that gives no hint of its actual cause. Switching to
the installed plugin's own copy of the script
(`~/.claude/plugins/cache/agent-pipeline/pipeline-core/0.5.4/scripts/po-human-approval.mjs`)
and the single `authorize-critical` command resolved it immediately.

## Why this matters beyond Phoenix's own branch

Phoenix's specific instance self-resolves once that branch merges past
ADR-0061. The structural gap does not: **any** checkout (this repo's own
branches included, if one is ever left running an older
`po-human-approval.mjs` while the shared external `--directory` has been
upgraded to a newer authority-record shape by a more current session) will
hit the identical misleading error and cost the same diagnostic detour this
one did. The external `--directory` is deliberately shared across sibling
projects/branches (same human, one key) — so cross-branch/cross-repo version
skew against it is a realistic, recurring shape, not a one-off.

## Proposal

Not yet designed in detail -- candidate directions, for the next session with
capacity:

1. Detect the specific shape mismatch this failure is actually caused by
   (an authority/trust-policy record missing a field a newer ceremony
   version requires, e.g. `humanName`) and fail with a message that names
   it as a probable version-skew symptom against the installed plugin,
   rather than the generic "external trust policy does not match the local
   public key" — pointing at "your checkout's `po-human-approval.mjs` may be
   older than the plugin installed for this session; compare versions /
   re-run via the installed plugin's own copy" as the first thing to check.
2. Alternatively/additionally, a lighter check at ceremony start: compare
   this script's own declared schema/version against a version marker
   already present in the external directory's authority record (if the
   newer shape writes one), and refuse early with an explicit
   version-mismatch code before ever reaching the cryptographic check.
3. Out of scope for either direction: auto-upgrading a stale checkout's
   `po-human-approval.mjs` itself, or restricting which repos may share one
   external directory (a distinct, already-filed concern — see
   `backlog/items/2026-08-11-shared-external-po-signing-directory-lets-an-unrelated-project-overwrite-a-proof.md`).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Nightwing ("Product experience:
  onboarding, configuration, documentation and low-friction adoption" —
  ADR-0043's 2026-08-17 amendment). This is an error-message/diagnosability
  improvement for a self-resolving version-skew condition, not an
  architecture or security gap.
- **Rationale:** the triggering Phoenix instance self-resolves once that
  branch merges past ADR-0061; the structural gap (any stale checkout
  against an upgraded shared `--directory`) is real but low-frequency and
  not currently blocking any active work in this repository.
- **Assignment (if accepted):** next available Nightwing slot, unassigned.
- **Date:** 2026-08-17
