---
schema: pipeline.backlog-item.v1
id: pipeline.release-preflight-has-a-builder-but-no-cli
type: defect
owner: pipeline
status: closed
created: 2026-08-06
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "f57375ff77263a2df70bbb3201feb361912f07f6"
closure_evidence: "plugins/pipeline-core/scripts/release-preflight-cli.mjs"
source: "sprint_phoenix handover finding 1, 2026-08-06. The gate-evidence half was closed by publication-gate-evidence.mjs; the release-preflight half was not, and is recorded separately so the remainder is not lost inside a partly-fixed finding."
due: 2026-09-06
---

# `release-preflight` has a builder and a validator but no CLI, so the publication executor's fifth gate still has no producer

## Description

The publication executor's v2 path binds five gate evidences. Four are now
producible:

| Gate | Producer |
| --- | --- |
| identity | `publication-gate-evidence.mjs --gate identity`, derived from `toolchain-preflight.mjs` |
| verify | `publication-gate-evidence.mjs --gate verify`, derived from `evidence/verify-latest.json` |
| security | `publication-gate-evidence.mjs --gate security`, derived from `evidence/security-latest.json` |
| critic | already accepted directly — `requireSuccessfulGate` has a branch for a critic record whose schema carries a passing verdict with zero findings |
| **release preflight** | **none** |

`release-preflight.mjs` exports `createReleasePreflight(input)` and
`validateReleasePreflight(record)` but has no CLI entry point — it is a library in
`scripts/`. The executor calls `validateReleasePreflight(release)` and then requires
`release.status === "ready"` plus a capability requirement whose `sha256` matches the
prepared `capabilityPreflight.recordSha256`.

So the publication path is no longer a closed loop, but it is not yet walkable either:
one gate of five still has nothing that writes it.

## Why this was split out rather than finished

`createReleasePreflight` takes a large, closed input: `base`, `candidate`, `consent`,
`documentation`, `extensions`, `gates`, `lifecycle`, `preflightId`, `repository`,
`retention`, `version` — each with its own validator. A CLI has to gather all of it
honestly, and several parts are genuinely external:

- `consent.status` must be `approved`, which is a PO input and must not be
  self-supplied by the tool that then publishes;
- `version` must agree across five surfaces (see the release-time step in
  `docs/release-0.5.2-readiness.md`);
- `gates.gg03` carries a candidate binding that has to come from a real gate run.

Writing a CLI that fabricates any of those would recreate exactly the
self-attestation problem that `publication-gate-evidence.mjs` was careful to avoid.
The derivable parts should be derived, and the external ones must remain inputs the
CLI refuses to invent.

## Resolved 2026-08-06

`plugins/pipeline-core/scripts/release-preflight-cli.mjs` is the producer. It is a
separate file rather than a CLI inside `release-preflight.mjs`, because that module is
imported by the executor and should stay the pure builder+validator it already is.

It derives everything observable — candidate and base, working-tree cleanliness, the
five version surfaces, the durable documents and their digests — and refuses to invent
the external parts. `consent.status` passes through verbatim; the tool never writes
"approved" on the PO's behalf, and RPC02 asserts exactly that. A GG-03 binding is
either supplied or recorded as not required, never as satisfied (RPC06).

It cannot manufacture a ready verdict: `createReleasePreflight` derives status from its
own reasons and this producer passes observations through unchanged. Run against this
repository it reported `blocked` with `repository-not-clean` and
`version-decision-mismatch` — the second independently reproducing the version-surface
step recorded in `docs/release-0.5.2-readiness.md`.

All five publication gates now have producers.

## Original proposed fix

1. A `release-preflight.mjs prepare` CLI that derives what it can from the repository
   (candidate, base, repository cleanliness, version surfaces, documentation and
   retention state) and takes the genuinely external parts — consent above all — as
   explicit inputs it refuses to default.
2. Refuse to emit `status: "ready"` when any derived reason is present, mirroring
   `publication-gate-evidence.mjs`'s "cannot manufacture a pass" property.
3. A test asserting that an unapproved consent, a dirty repository, or a version
   surface mismatch each produce `blocked` rather than `ready`.

## Related

- `plugins/pipeline-core/scripts/publication-gate-evidence.mjs` — the same problem for the other four gates, solved.
- `docs/release-0.5.2-readiness.md` — carries the version-surface step this preflight would check.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, closed. The item's own "Resolved 2026-08-06" section
  already documents `release-preflight-cli.mjs` landing and closing the gap —
  confirmed present at HEAD during a systematic 0.6.0-release backlog sweep,
  2026-08-18. Status was left `in_progress` rather than moved to `closed`.
- **Rationale:** the fix was already built, tested (RPC02/RPC06 mentioned
  inline) and self-documented as resolving the gap; only the status field
  itself was stale.
- **Assignment:** closed, no further work.
- **Date:** 2026-08-18

## Triage — closed 2026-08-19

**Merge note (2026-08-26, moved from frontmatter):** Two branches independently transitioned this item to closed for the same reason (release-preflight-cli.mjs already resolves the gap), one commit apart in history and one day apart in Triage date. The origin/sprint_phoenix side recorded closed_at 2026-08-19, closure_commit 5e20b854afc1f499d1376c43558565389e375c59, same closure_evidence file. Kept here as this note rather than a second closure field; both Triage entries below are preserved.

- **Decision:** closed — stale `in_progress` record, resolution already documented in this item's own "Resolved 2026-08-06" section but never transitioned.
- **Rationale:** Found during a PO-requested audit of in_progress backlog items for completed-but-untracked entries. `release-preflight-cli.mjs` exists and is wired into the publication executor exactly as this item's own resolution note describes; no further work needed.
- **Date:** 2026-08-19
