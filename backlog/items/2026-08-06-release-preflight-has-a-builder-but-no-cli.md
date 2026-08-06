---
schema: pipeline.backlog-item.v1
id: pipeline.release-preflight-has-a-builder-but-no-cli
type: defect
owner: pipeline
status: open
created: 2026-08-06
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

## Proposed fix

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
