# Change control

The Change-Control core evaluates promotion from two independent sources:
Pipeline human authority and an authenticated external change receipt. Both
must bind exactly the same candidate, immutable artifact, environment, scope,
and schedule window. An ITSM approval never substitutes for Pipeline authority,
and a Pipeline approval never authenticates an external change system.

Mandatory profiles block promotion for a missing, draft, rejected, expired,
conflicting, unknown, unavailable, unauthenticated, mismatched, or
out-of-window external
receipt — unless the profile's `reviewPolicy` is `advisory`, in which case an
unreachable external system is `allowed` with a distinct, operator-visible
`reconciliation-required` reason instead of a hard block (C-AC-12; see
Policy precedence). `not-required` is an explicit non-mandatory profile; it
leaves the ordinary deploy adapter independently usable. Emergency profiles
require a separate explicit emergency authority and cannot be used as a
generic bypass, and (C-AC-07) additionally require retrospective evidence
before their deployment reports completed change control (see
Failure/rollback/recovery procedures).

External state is observation data. Provider-specific fields and credentials
remain in adapter profiles and approved machine-local configuration; the core
stores only the provider-neutral binding and gate result.

Evaluate one promotion tuple explicitly:

```bash
node plugins/pipeline-core/scripts/change-control.mjs gate \
  --repo <checkout> \
  --profile-file <profile.json> \
  --pipeline-authority-file <local-authority.json> \
  --authority-request-file <authority-request.json> \
  --external-receipt-file <receipt.json|none> \
  --now-ms <epoch-ms>
```

The command is read-only. Its output is a gate result, not a deployment action.

## Threat model

`evaluateChangeControlGate` (`plugins/pipeline-core/lib/change-control.mjs:
52-84`) is built as a sequence of early-return checks, each closing one
distinct attack surface:

- **Forged/mismatched Pipeline authority:** `matchesLocal` requires
  `pipelineAuthority.granted` plus an exact match of candidate, artifact,
  environment, and `scopeSha256` against the profile
  (`change-control.mjs:54`); a mismatch blocks with reason
  `"pipeline-authority"` before anything else is evaluated
  (`change-control.mjs:55`).
- **Governance-decision divergence when a `decisionReference` is present
  (H-AC-12):** `pipelineAuthority` MAY carry an OPTIONAL 7th key,
  `decisionReference` — its absence leaves everything above byte-for-byte
  unchanged (`validPipelineAuthority`, `change-control.mjs:18-31`). When
  present, `dualEvaluateDecisionReference`
  (`plugins/pipeline-core/lib/decision-reference-dual-evaluation.mjs`) is
  given `legacyOk: pipelineAuthority.granted`, `reference:
  pipelineAuthority.decisionReference.reference`, and `ledgerOk:
  pipelineAuthority.decisionReference.resolved` — the caller's own
  already-resolved, ledger-backed second-reader verdict for that reference;
  this module performs no I/O and never resolves the reference itself
  (`change-control.mjs:61-68`). Because this block is only reached after
  `matchesLocal` already required `pipelineAuthority.granted` to be `true`,
  `legacyOk` is always `true` here — so the only reachable disagreement is
  the legacy authority granting while the ledger-backed verdict disagrees;
  that case blocks with the distinct reason
  `"decision-reference-disagreement"` rather than being silently folded
  into `"pipeline-authority"` (`change-control.mjs:67`). A malformed
  `decisionReference` shape
  (not the closed `{ reference, resolved }` object, or a `reference` not
  shaped like `pipeline.human-decision-reference.v1`) is rejected earlier,
  at the input boundary, with `CC-GATE` (`validPipelineAuthority`,
  `change-control.mjs:26-30`) — consistent with how every other malformed
  input here throws rather than silently reads as blocked.
- **Class-shopping into an emergency bypass:** `changeClass === "emergency"`
  additionally requires the separate `pipelineAuthority.emergencyAuthorized`
  flag (`change-control.mjs:69`) — selecting the emergency class alone does
  not skip authority. Structurally, `detectChangeClassShopping`
  (`change-control.mjs:151-167`) further flags a change represented under
  more than one classification when the lighter one was selected (C-AC-02;
  see Policy precedence).
- **Forged/stale/mismatched external ITSM receipt:** `matchesExternal`
  requires an exact match of `profileId`, candidate, artifact, environment,
  `scopeSha256`, and `window`, plus `authenticated === true` and `state ===
  "approved"` (`change-control.mjs:81-82`); draft, rejected, expired,
  conflicting, unknown, unavailable, and unauthenticated receipts are all
  rejected through this one check (reason `"external-authority"`).
- **Deploy-window bypass:** even a matching, authenticated, approved receipt
  is blocked outside `profile.window` (`change-control.mjs:83`, reason
  `"outside-window"`).
- **Provider-specific corruption of the core schema:**
  `validateChangeControlProfile`/`validateChangeControlReceipt` admit only
  exact closed key sets via the shared `exact()` helper
  (`change-control.mjs:5, 42-49`); no vendor-specific field can enter the
  provider-neutral core (C-AC-11).
- **Human-authority spoofing at the CLI boundary:**
  `scripts/change-control.mjs`'s `boundHumanAuthority`
  (`scripts/change-control.mjs:12-20`) independently re-checks that the
  human authority's scope binds the exact same candidate/environment/
  artifact and action `APPROVE_DEPLOY` *before* the gate itself is even
  called; a mismatch blocks with reason `"human-authority"`.

Honesty note: this core does not itself verify the external receipt's
cryptographic signature. `validateChangeControlReceipt` only checks the
receipt's already-declared `authenticated` boolean and `state`
(`change-control.mjs:47`); the composed gate can only be satisfied by a
receipt some upstream adapter already marked authenticated and approved —
verifying that mark's cryptographic backing is the adapter's responsibility,
not this file's.

## Policy precedence

`changeClass` is one of `standard` | `normal` | `emergency` | `not-required`
(`change-control.mjs:43`), and profile validation enforces `(changeClass ===
"not-required") !== !mandatory` (`change-control.mjs:43`) — `not-required`
and `mandatory` are always exact opposites, never chosen independently; this
is the code-level backing for C-AC-02 ("class selection … SHALL NOT permit
… avoid approval").

Evaluation inside `evaluateChangeControlGate` runs in this strict order,
each an unconditional early return (`change-control.mjs:52-84`):

1. Pipeline-authority binding match — checked first regardless of class
   (`change-control.mjs:54-55`).
2. Optional `decisionReference` dual-evaluation (H-AC-12) — only reached
   when `pipelineAuthority.decisionReference` is present; otherwise skipped
   entirely (`change-control.mjs:61-68`, see Threat model).
3. Emergency-authority check — only when `changeClass === "emergency"`
   (`change-control.mjs:69`).
4. `not-required` short-circuit — a non-mandatory profile is allowed here,
   before any external receipt is consulted (`change-control.mjs:70`).
5. External-receipt presence, binding match, authentication, and approved
   state — the presence branch is itself split by `reviewPolicy` (see
   below) (`change-control.mjs:71-82`).
6. Schedule window (`change-control.mjs:83`).

An `emergency` profile differs from `standard`/`normal` only at step 3; it
still passes through the identical external-receipt and window checks
afterward — emergency status does not exempt a mandatory profile from
either (C-AC-07: "SHALL NOT act as a generic bypass"), and (also C-AC-07)
still needs retrospective evidence before it may report completed change
control (see Failure/rollback/recovery procedures).

### `reviewPolicy`: advisory vs. mandatory ITSM reachability (C-AC-12)

`reviewPolicy` is orthogonal to `mandatory`/`changeClass`: it only decides
what happens when `externalReceipt === null` (the external ITSM system is
unreachable) for a profile that does consult it at all. It is present, and
drawn from the closed vocabulary `{mandatory, advisory}`, only when
`mandatory: true`; it is `null` otherwise — the same present/null-by-class
shape `standardTemplate` already uses (`change-control.mjs:43`).

- `reviewPolicy: "mandatory"` keeps the unconditional block: an unreachable
  external system blocks with reason `"external-unavailable"`
  (`change-control.mjs:79`).
- `reviewPolicy: "advisory"` still wants ITSM review when reachable — a
  present, available receipt is evaluated identically either way — but
  never hard-blocks on the external system's absence: it returns
  `status: "allowed"`, `reason: "reconciliation-required"`
  (`change-control.mjs:78`), mirroring `projectChangeControlState`'s own
  "allowed, but flagged for operator reconciliation" pattern (see
  Failure/rollback/recovery procedures). Advisory never bypasses the
  pipeline-authority or emergency-authority checks that already ran before
  step 5 — those still block first, unaffected by `reviewPolicy`.

### Resolving one effective profile per environment (C-AC-09)

`resolveChangeControlProfile(candidates)`
(`change-control.mjs:107-118`) decides *which* profile the gate above is
ever handed for one environment, before the gate is called. All candidates
must claim the same `environment`/`candidate`/`artifact`/`scopeSha256`
tuple, or resolution fails closed with `CC-RESOLVE-SCOPE`
(`change-control.mjs:112`). Among candidates sharing that tuple:

- Zero candidates, or a candidate set with no `mandatory` member, resolves
  to `{ status: "not-required", profile: null }`
  (`change-control.mjs:117`) — the same meaning `not-required` already
  carries elsewhere in this module (`change-control.mjs:70`); an
  environment nothing constrains is not an error.
- Exactly one `mandatory` candidate resolves to
  `{ status: "effective", profile: <that candidate> }`
  (`change-control.mjs:116`).
- More than one `mandatory` candidate for the same tuple always fails
  closed with `CC-RESOLVE-AMBIGUOUS` (`change-control.mjs:115`), with
  *no* tie-break. The function's own docstring
  (`change-control.mjs:87-106`) grounds why: the profile schema carries no
  priority/precedence field, so any changeClass-based ordering (e.g.
  emergency outranking standard/normal) would be an unconfigured, invisible
  rule the resolver invents on its own — indistinguishable, from an
  operator's perspective, from silently picking the wrong governance for a
  release. C-AC-09's own text pairs "ambiguous" and "multiple mandatory
  profiles" as one condition, not two where a tie-break could rescue one.

### Detecting change-class shopping (C-AC-02)

`detectChangeClassShopping(proposed, alternatives)`
(`change-control.mjs:151-167`) is the structural half of C-AC-02's "SHALL
NOT permit class selection solely to avoid approval": no single valid
profile, read in isolation, can say whether its class was picked to fit the
change or to dodge a truer class's approval (`validateChangeControlProfile`
already makes each profile internally consistent by construction). What
*is* visible is "class shopping" — the same underlying change (identical
candidate/artifact/environment/scopeSha256 tuple) represented under more
than one classification, with the lighter one selected. `alternatives`
need not already share `proposed`'s tuple — the function filters to the
same-tuple subset itself (`change-control.mjs:155`) — so callers may pass a
broader candidate pool (e.g. every profile considered in a review session).

Rather than reimplementing precedence, `detectChangeClassShopping` composes
with `resolveChangeControlProfile`: it resolves the fuller set (`proposed`
plus every same-tuple alternative) and checks whether that resolution would
*not* have landed on `proposed` (`change-control.mjs:159-165`). The output
shape is `{ flagged, reason, proposedChangeClass, alternativeChangeClasses
}`, with four possible `reason` values:

- `"no-alternative-classification"` (unflagged) — no same-tuple alternative
  exists at all (`change-control.mjs:157`).
- `"no-lighter-selection-detected"` (unflagged) — same-tuple alternatives
  exist, but resolving them together with `proposed` still lands on
  `proposed` (`change-control.mjs:166`).
- `"ambiguous-mandatory-alternatives"` (flagged) — the composed resolution
  itself hits `CC-RESOLVE-AMBIGUOUS` (more than one same-tuple alternative
  is independently mandatory) (`change-control.mjs:162`).
- `"lighter-than-resolved-classification"` (flagged) — the composed
  resolution lands on a *different* profile than `proposed`, i.e. a
  same-tuple alternative is mandatory while `proposed` is not
  (`change-control.mjs:165`).

## Migration

Honesty note: no migration tooling exists for change-control.
`plugins/pipeline-core/scripts/` has no change-control migration script, and
neither `change-control.mjs` (lib) nor `scripts/change-control.mjs` version
the profile/receipt/journal schemas beyond the single
`pipeline.change-control-profile.v1` / `pipeline.change-control-receipt.v1`
/ `pipeline.change-control-journal.v1` shapes (`change-control.mjs:43,47,
178`). An existing deployment that wants to adopt change control
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
`"blocked"` with a `reason` (`change-control.mjs:55-84`): an operator checks
`status === "allowed"` before proceeding, and reads `reason` — one of
`pipeline-authority`, `decision-reference-disagreement`, `human-authority`,
`emergency-authority`, `external-unavailable`, `external-authority`,
`outside-window`, `not-required`, `reconciliation-required`,
`composed-authority` — to see exactly which precedence layer allowed or
blocked the promotion. `decision-reference-disagreement` and
`reconciliation-required` are new: the former is a `blocked` outcome from
the optional H-AC-12 `decisionReference` dual-evaluation (see Threat
model); the latter is an `allowed` outcome from an advisory `reviewPolicy`
facing an unreachable external system (see Policy precedence) — it never
means `not-required` or `composed-authority`.

## Failure/rollback/recovery procedures

Deployment lifecycle is journaled append-only via `createChangeControlJournal`
/ `appendChangeControlEntry` / `projectChangeControlState`
(`change-control.mjs:194-283`). Local transitions: `began` → `validated` |
`failed`; `validated` → `rolled-back`; `failed` → `rolled-back`;
`rolled-back` is terminal (`DEPLOYMENT_ORDER`, `change-control.mjs:182`).

- **C-AC-05** (publish only after the local event; preserve failed
  attempts): `appendChangeControlEntry` rejects an external entry whose
  `forEvent` has no matching prior local entry (`change-control.mjs:
  231-232`); every attempt, including a failed publish, stays in the
  journal — `projectChangeControlState` never removes an entry, only reads
  the latest attempt per event via `published()` (`change-control.mjs:253,
  260-263`).
- **C-AC-06** (deployment succeeded but external update/readback failed →
  `reconciliation-required`, never silently `completed`):
  `projectChangeControlState`'s terminal branch returns `"completed"` /
  `"composed-change-control"` only if the latest attempt for `validated` has
  disposition `"published"`; otherwise it returns
  `"reconciliation-required"` / `"external-update-outstanding"` while still
  reporting `deploymentEvidenceRetained: true` (`change-control.mjs:269,
  276`).
- **C-AC-07** (emergency change requires retrospective evidence before it
  may report completed change control; not a substitute for C-AC-06's
  external-update bar, an ADDITIONAL one on top of it): a `retrospective`
  entry is its own journal entry class, not a field on the local event,
  precisely so it cannot exist at the moment the gate allowed the change
  (`change-control.mjs:209-218`). `appendChangeControlEntry` requires it to
  reference a `forEvent` that already happened locally, and to be strictly
  *later* in time than that local event — it cannot be backdated to, or
  onto, the event it reviews (`change-control.mjs:233-238`).
  `projectChangeControlState` applies this bar ONLY when
  `journal.changeClass === "emergency"`: once the external update for
  `validated` is published (C-AC-06's own bar) but no `retrospective` entry
  for `validated` exists yet, the projection is `"emergency-review-
  required"` / `"retrospective-evidence-outstanding"` — distinct from, and
  never conflated with, ordinary `"reconciliation-required"`
  (`change-control.mjs:277-281`). Every non-emergency class is unaffected —
  this branch is structurally unreachable for them
  (`change-control.mjs:280`).
- **Failure:** a `failed` local event without a published external update
  projects as `"reconciliation-required"` / `"external-update-outstanding"`;
  once the external system confirms with disposition `"published"` it
  projects as `"failed"` / `"deployment-failed"` (`change-control.mjs:272`).
- **Rollback:** `rolled-back` follows the identical publish-then-project
  pattern (`change-control.mjs:273`); it is reachable from either
  `validated` or `failed` (`DEPLOYMENT_ORDER`, `change-control.mjs:182`).
- **Recovery is re-derivation, not repair:** `projectChangeControlState` is
  a pure read over the append-only journal (`change-control.mjs:244-283`) —
  there is no separate "recovery" write path; an operator recovers current
  state by re-running the projection over the retained journal, and every
  failed attempt remains visible next to a later success
  (`change-control.mjs:251-252`).

Honesty note: there is no automated rollback *executor* in this module —
`projectChangeControlState` only reports that a rollback was journaled;
actually performing the rollback (invoking a deploy adapter in reverse) is
outside this file's scope, and this document does not claim otherwise.
