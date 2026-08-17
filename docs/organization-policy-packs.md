# Organization policy packs

Organization policy packs impose governance floors and document-publication
rules without creating a second authority system. Multiple packs resolve only
when their shared document classes have the same mode; conflicting modes fail
rather than following last-write-wins. Approval requirements combine
conservatively, so an additional pack can only require more review.

Inspect packs or create a named activation plan:

```bash
node plugins/pipeline-core/scripts/organization-policy.mjs inspect \
  --core-version <core-version> --pack-file <pack.json>
```

`plan` additionally needs `--repo` and `--activation-id`. Applying such a plan
uses the separate transaction service and must receive a matching human
authority readback; a policy file, plan, local record, or Git commit is never
human proof.

## Threat model

**Assets:** the resolved effective policy (governance floors, document-class
modes/approval requirements) and the single active-policy record at
`governance/organization-policy-active.json`
(`organization-policy-activation.mjs:9`).

**Threats considered and their mitigation:**
- A pack silently weakening governance floors — `requireHumanDecisionLedger`
  and `allowExternalAuthority` are hard-pinned constants, not pack-supplied
  values (`requireHumanDecisionLedger !== true || allowExternalAuthority !==
  false` fails validation), and `resolveEffectiveOrganizationPolicy` always
  emits the same fixed floors regardless of pack input
  (`organization-policy.mjs:13,40`).
- Two packs disagreeing on a document class's publication mode being
  silently resolved by last-write-wins — explicitly rejected:
  `if (existing && existing.mode !== entry.mode) fail("OPP-RESOLVE-CONFLICT")`
  (`organization-policy.mjs:33`).
- An activation applying against a stale or concurrently-modified active
  record — `activateOrganizationPolicy` compares the current file's SHA-256
  digest to the plan's `expectedActiveSha256` twice (once before writing,
  once again immediately before the atomic rename) and fails `OPA-PREIMAGE`
  on any mismatch (`organization-policy-activation.mjs:43,47`).
- A local record, plan file, or Git commit being read as human authorization
  — `activateOrganizationPolicy` requires a caller-supplied `authorize`
  function to return a `granted: true` decision bound to the exact
  `activationId`/`effectivePolicySha256`, and the code comment is explicit
  that this "never treats this local record or a Git commit as human proof"
  (`organization-policy-activation.mjs:23-28,44`).
- Symlink/path substitution on the active-policy file — `readActive` rejects
  a non-regular or symlinked target (`organization-policy-activation.mjs:17`).

**Out of scope:** the identity/authenticity of whoever calls `authorize` is
the Cyborg human-attestation integration seam referenced in the code comment
(`organization-policy-activation.mjs:25-27`) and is not implemented by this
module; today `authorize` is an injected caller function, and this module
cannot itself distinguish a genuine human decision from a caller that fakes
one.

## Pack, schema, and activation policy

A pack is validated against a closed shape —
`schema, packId, revision, compatibility, governanceFloors, documentClasses`
exactly, no extra keys (`organization-policy.mjs:9-10`). `packId` is a
lowercase identifier and `revision` is a SHA-256 content digest, not a
semantic version (`organization-policy.mjs:3`). Multiple packs are resolved
by `resolveEffectiveOrganizationPolicy`: each is independently re-validated
against `coreVersion`, duplicate `packId`s or duplicate `revision`s across
the input set are rejected (`OPP-RESOLVE-DUPLICATE`,
`organization-policy.mjs:29`), each document class's `mode` must agree across
every pack that declares it, and `approvalRequired` combines as a logical OR
so an additional pack can only add review, never remove it
(`organization-policy.mjs:18-23,34`).

That closed shape has since grown optional keys at both levels, and this section
was stale on both counts before 2026-08-16. A pack may additionally carry
`provenance`, `dependencies` and `signaturePolicy`; a `documentClasses` entry may
additionally carry `targetBinding`, `ownedSections`, `lifecycleEvents`,
`previewRequired`, `retention` and `conflictPolicy`. Every one of them is optional
in the strict sense: an entry declaring none of them validates and resolves exactly
as it did before they existed, and the closed-key check simply grows by the keys the
entry itself declares.

Each optional entry key carries its own merge rule, and two of them can fail
resolution outright — which matters operationally, because an operator combining two
packs meets the failure at activation, where a wrong diagnosis is expensive:

| key | merge rule across packs declaring the same class |
|---|---|
| `targetBinding` | never merged — a mismatch, **including declared against undeclared**, fails `OPP-RESOLVE-CONFLICT` |
| `retention` | exact match only — a mismatch, **including declared against undeclared**, fails `OPP-RESOLVE-CONFLICT` |
| `ownedSections` | set intersection; an undeclared side is neutral and yields the declared list |
| `lifecycleEvents` | set intersection; an undeclared side is neutral |
| `previewRequired` | logical OR — a later pack can add a required preview, never remove one |
| `conflictPolicy` | ranked maximum toward the stricter `reject` |

Intersection never widens permission and OR never downgrades it, so no combination of
packs can resolve to something more permissive than its strictest contributor.

**Four of these six are declared but not yet consumed by any decision path.** Only
`mode`, `approvalRequired`, `targetBinding` and `ownedSections` currently scope a real
permission decision; `lifecycleEvents`, `previewRequired`, `retention` and
`conflictPolicy` validate and merge but change no behaviour anywhere. `previewRequired`,
`retention` and `conflictPolicy`'s gap is tracked, with its per-dimension reasons, in
`backlog/items/2026-08-16-p-ac-11-four-dimensions-declared-but-inert.md`; `lifecycleEvents`'
own gap (that item explicitly disclaims covering it) is tracked separately in
`backlog/items/2026-08-17-p-ac-11-lifecycleevents-still-has-no-owner-or-expiry.md` —
declaring one of the four today is not an error, but it is also not enforcement.

Activation is a separate, transactional step from resolution
(`organization-policy-activation.mjs`). `planOrganizationPolicyActivation`
is a pure, non-mutating function: it resolves the effective policy, reads the
current active record's digest (or `null` if none exists) to serve as the
plan's `expectedActiveSha256`, and returns a preview plan bound to a fresh
`activationId`
(`organization-policy-activation.mjs:31-35`). Nothing is written or
authorized at this step — the CLI's `plan` mode
(`node plugins/pipeline-core/scripts/organization-policy.mjs plan --repo
<repo> --core-version <core-version> --activation-id <id> --pack-file
<pack.json>`) only ever produces this preview. `activateOrganizationPolicy`
is the sole function that writes `governance/organization-policy-active.json`,
and it requires: the plan to match its own recomputed digest (`assertPlan`,
`organization-policy-activation.mjs:20-22`), a granted authority decision
bound to that exact plan (`assertAuthority`,
`organization-policy-activation.mjs:23-24`), a preimage match against the
current file (twice, guarding the write race), and a post-write readback
that confirms the persisted record matches the plan before returning
`status: "activated"` (`organization-policy-activation.mjs:41-50`).

## Compatibility, migration, and versioning policy

Compatibility is expressed as a Pipeline **core-version range** per pack,
not a pack-schema version: `compatibility.minimumCoreVersion` /
`maximumCoreVersion` are semantic-version strings, checked both at
individual pack validation (`compare(coreVersion,
pack.compatibility.minimumCoreVersion) < 0` /
`> pack.compatibility.maximumCoreVersion` fails `OPP-CORE-VERSION`,
`organization-policy.mjs:12`) and are re-checked for every pack again inside
`resolveEffectiveOrganizationPolicy` (`organization-policy.mjs:28`). Only one
pack schema is currently accepted — `pack.schema !==
"pipeline.organization-policy-pack.v1"` fails `OPP-SHAPE`
(`organization-policy.mjs:10`) — there is no code path in this module that
recognizes, migrates, or transforms an older or newer pack schema version;
a `v2` schema, if introduced later, would need its own validator and an
explicit migration decision, neither of which exists today.

There is likewise no incremental/partial migration between two revisions of
the same `packId`: `revision` is a content-addressed SHA-256 digest of the
pack's own bytes, not an ordered version number, so there is no "upgrade
path" the code computes between an old and a new revision. Changing a pack's
content is an entirely new pack input (a new `revision`) supplied to a fresh
`planOrganizationPolicyActivation`/`activateOrganizationPolicy` call; the
CAS-guarded preimage check is what prevents that new activation from
silently clobbering a concurrently-changed active record, but it does not
diff, reconcile, or migrate the two revisions' content on the module's
behalf — that comparison, if needed, is an operator/reviewer responsibility
before authorizing the new activation.
