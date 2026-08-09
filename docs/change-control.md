# Change control

The Change-Control core evaluates promotion from two independent sources:
Pipeline human authority and an authenticated external change receipt. Both
must bind exactly the same candidate, immutable artifact, environment, scope,
and schedule window. An ITSM approval never substitutes for Pipeline authority,
and a Pipeline approval never authenticates an external change system.

Mandatory profiles block promotion for a missing, draft, rejected, expired,
conflicting, unknown, unauthenticated, mismatched, or out-of-window external
receipt. `not-required` is an explicit non-mandatory profile; it leaves the
ordinary deploy adapter independently usable. Emergency profiles require a
separate explicit emergency authority and cannot be used as a generic bypass.

External state is observation data. Provider-specific fields and credentials
remain in adapter profiles and approved machine-local configuration; the core
stores only the provider-neutral binding and gate result.

Evaluate one promotion tuple explicitly:

```bash
node plugins/pipeline-core/scripts/change-control.mjs gate \
  --profile-file <profile.json> \
  --pipeline-authority-file <local-authority.json> \
  --external-receipt-file <receipt.json|none> \
  --now-ms <epoch-ms>
```

The command is read-only. Its output is a gate result, not a deployment action.

## Threat model

`evaluateChangeControlGate` (`plugins/pipeline-core/lib/change-control.mjs:
19-29`) is built as a sequence of early-return checks, each closing one
distinct attack surface:

- **Forged/mismatched Pipeline authority:** `matchesLocal` requires
  `pipelineAuthority.granted` plus an exact match of candidate, artifact,
  environment, and `scopeSha256` against the profile
  (`change-control.mjs:20-22`); a mismatch blocks with reason
  `"pipeline-authority"` before anything else is evaluated.
- **Class-shopping into an emergency bypass:** `changeClass === "emergency"`
  additionally requires the separate `pipelineAuthority.emergencyAuthorized`
  flag (`change-control.mjs:23`) — selecting the emergency class alone does
  not skip authority.
- **Forged/stale/mismatched external ITSM receipt:** `matchesExternal`
  requires an exact match of `profileId`, candidate, artifact, environment,
  `scopeSha256`, and `window`, plus `authenticated === true` and `state ===
  "approved"` (`change-control.mjs:26-27`); draft, rejected, expired,
  conflicting, unknown, and unauthenticated receipts are all rejected
  through this one check (reason `"external-authority"`).
- **Deploy-window bypass:** even a matching, authenticated, approved receipt
  is blocked outside `profile.window` (`change-control.mjs:28`, reason
  `"outside-window"`).
- **Provider-specific corruption of the core schema:**
  `validateChangeControlProfile`/`validateChangeControlReceipt` admit only
  exact closed key sets (`change-control.mjs:9-16`); no vendor-specific
  field can enter the provider-neutral core (C-AC-11).
- **Human-authority spoofing at the CLI boundary:**
  `scripts/change-control.mjs`'s `boundHumanAuthority`
  (`scripts/change-control.mjs:12-20`) independently re-checks that the
  human authority's scope binds the exact same candidate/environment/
  artifact and action `APPROVE_DEPLOY` *before* the gate itself is even
  called; a mismatch blocks with reason `"human-authority"`.

Honesty note: this core does not itself verify the external receipt's
cryptographic signature. `validateChangeControlReceipt` only checks the
receipt's already-declared `authenticated` boolean and `state`
(`change-control.mjs:14`); the composed gate can only be satisfied by a
receipt some upstream adapter already marked authenticated and approved —
verifying that mark's cryptographic backing is the adapter's responsibility,
not this file's.

## Policy precedence

`changeClass` is one of `standard` | `normal` | `emergency` | `not-required`
(`change-control.mjs:10`), and profile validation enforces `(changeClass ===
"not-required") !== !mandatory` (`change-control.mjs:10`) — `not-required`
and `mandatory` are always exact opposites, never chosen independently; this
is the code-level backing for C-AC-02 ("class selection … SHALL NOT permit
… avoid approval").

Evaluation inside `evaluateChangeControlGate` runs in this strict order,
each an unconditional early return (`change-control.mjs:19-29`):

1. Pipeline-authority binding match — checked first regardless of class.
2. Emergency-authority check — only when `changeClass === "emergency"`.
3. `not-required` short-circuit — a non-mandatory profile is allowed here,
   before any external receipt is consulted.
4. External-receipt presence, binding match, authentication, and approved
   state.
5. Schedule window.

An `emergency` profile differs from `standard`/`normal` only at step 2; it
still passes through the identical external-receipt and window checks
afterward — emergency status does not exempt a mandatory profile from
either (C-AC-07: "SHALL NOT act as a generic bypass").

## Migration

Honesty note: no migration tooling exists for change-control.
`plugins/pipeline-core/scripts/` has no change-control migration script, and
neither `change-control.mjs` (lib) nor `scripts/change-control.mjs` version
the profile/receipt/journal schemas beyond the single
`pipeline.change-control-profile.v1` / `pipeline.change-control-receipt.v1`
/ `pipeline.change-control-journal.v1` shapes (`change-control.mjs:10,14,
56`). `specs/sprint-phoenix-epic/design/closure-plan.md:197` records this
gap directly. An existing deployment that wants to adopt change control
today has to hand-author a profile matching the schema above and start
appending journal entries from `began`; there is no automated onboarding or
conversion path, and this document does not invent one.

## Operator runbook

Evaluate one promotion (the actual required flag set, per the CLI parser at
`scripts/change-control.mjs:10`):

```bash
node plugins/pipeline-core/scripts/change-control.mjs gate \
  --repo <checkout> \
  --profile-file <profile.json> \
  --pipeline-authority-file <local-authority.json> \
  --authority-request-file <authority-request.json> \
  --external-receipt-file <receipt.json|none> \
  --now-ms <epoch-ms>
```

The command is read-only and writes one JSON gate result to stdout, or an
error code/message to stderr with exit code 2 on failure
(`scripts/change-control.mjs:30`). The result's `status` is `"allowed"` or
`"blocked"` with a `reason` (`change-control.mjs:22-29`): an operator checks
`status === "allowed"` before proceeding, and reads `reason` — one of
`pipeline-authority`, `human-authority`, `emergency-authority`,
`external-unavailable`, `external-authority`, `outside-window`,
`not-required`, `composed-authority` — to see exactly which precedence layer
allowed or blocked the promotion.

## Failure/rollback/recovery procedures

Deployment lifecycle is journaled append-only via `createChangeControlJournal`
/ `appendChangeControlEntry` / `projectChangeControlState`
(`change-control.mjs:54-117`). Local transitions: `began` → `validated` |
`failed`; `validated` → `rolled-back`; `failed` → `rolled-back`;
`rolled-back` is terminal (`DEPLOYMENT_ORDER`, `change-control.mjs:45`).

- **C-AC-05** (publish only after the local event; preserve failed
  attempts): `appendChangeControlEntry` rejects an external entry whose
  `forEvent` has no matching prior local entry (`change-control.mjs:82`);
  every attempt, including a failed publish, stays in the journal —
  `projectChangeControlState` never removes an entry, only reads the latest
  attempt per event (`change-control.mjs:96-106`).
- **C-AC-06** (deployment succeeded but external update/readback failed →
  `reconciliation-required`, never silently `completed`):
  `projectChangeControlState`'s terminal branch returns `"completed"` /
  `"composed-change-control"` only if the latest attempt for `validated` has
  disposition `"published"`; otherwise it returns
  `"reconciliation-required"` / `"external-update-outstanding"` while still
  reporting `deploymentEvidenceRetained: true` (`change-control.mjs:107,
  114-116`).
- **Failure:** a `failed` local event without a published external update
  projects as `"reconciliation-required"` / `"external-update-outstanding"`;
  once the external system confirms with disposition `"published"` it
  projects as `"failed"` / `"deployment-failed"` (`change-control.mjs:110`).
- **Rollback:** `rolled-back` follows the identical publish-then-project
  pattern (`change-control.mjs:111`); it is reachable from either
  `validated` or `failed` (`DEPLOYMENT_ORDER`, `change-control.mjs:45`).
- **Recovery is re-derivation, not repair:** `projectChangeControlState` is
  a pure read over the append-only journal (`change-control.mjs:88-117`) —
  there is no separate "recovery" write path; an operator recovers current
  state by re-running the projection over the retained journal, and every
  failed attempt remains visible next to a later success
  (`change-control.mjs:38-40`).

Honesty note: there is no automated rollback *executor* in this module —
`projectChangeControlState` only reports that a rollback was journaled;
actually performing the rollback (invoking a deploy adapter in reverse) is
outside this file's scope, and this document does not claim otherwise.
