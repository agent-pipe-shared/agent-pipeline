# Human-terminal templates Slice 1 evidence

Date: 2026-09-12
Task: `NVA-B-HUMAN-TERMINAL-TEMPLATES-SLICE1-1`
Implementation candidate: `956a18a52f3529b49150100d5f69f1a6034cce21`
Implementation tree: `abeef47ca633713eb2ed2c83a6e50cdaa9be6bdb`

The SHA-256 values below bind the six implementation blobs contained in that
exact commit and tree. This evidence-only binding update is subsequent to the
implementation candidate and does not change those six blobs.

## Delivered boundary

This slice adds only the static catalog contract, closed builder registry and
coverage through the existing human-authorization inventory drift checker. It
does not add a launcher, child-process execution, a prepared request, or a
producer migration.

`docs/human-authorization-inventory.md` remains the single inventory. Its 18
current authorization rows now have an explicit `registered`,
`legacy-renderer`, `abstract-family`, or `excluded` disposition. The shipped
catalog mirrors those stable inventory ids, and
`check-auth-gate-inventory-drift.mjs` rejects a missing, duplicate, extra, or
drifted disposition.

Each catalog entry now carries the designed `revision`, `purpose`, `audience`,
`mutation`, `requiresPoApproval`, ordered `slots`, `expectedReadback`, `runners`
and `platforms` fields. Inactive dispositions carry explicit nulls for
execution-contract fields because they expose no executable template.

The only registered builder is `authorize-critical-push`, which delegates to
the existing `authorizeCriticalPushCommand()` source function. That source
returns rendering data without structured execution-boundary fields. The
registry preserves the absence as `boundary: null`; it does not infer an
execution contract. Producers which cannot be safely imported as pure builders
remain `legacy-renderer`.

## Fail-closed coverage

- Catalog and entry roots use closed fields; runtime semantic validation also
  enforces the schema id, stable ids, dispositions, producer references, and
  registered/inactive field combinations.
- Catalog ids, inventory ids, template ids and registered builder ids are
  unique. Unknown and unused builders fail validation.
- A boundary tuple, when one exists, uses the existing vocabulary and closed
  fields. Drift against the registry refuses validation.
- The registered push output is deep-equal to a direct call of the current
  source builder. Its absent boundary fields are asserted rather than filled.
- The existing drift checker still discovers 11 current authority surfaces and
  now derives 18 stable ids from the two canonical inventory tables and
  validates all 18 terminal dispositions against the catalog. A new table row
  without an id or catalog disposition fails closed.
- The schema's registered/inactive branches and runtime validator directly
  reject the same nullability and active-contract mismatches.

## Focused verification

All commands exited 0:

```text
node harness/scripts/check-auth-gate-inventory-drift.test.mjs
node harness/scripts/check-auth-gate-inventory-drift.mjs
node harness/scripts/check-verify-suite-registration.mjs
node harness/scripts/check-doc-contracts.mjs
python3 -c 'import json,jsonschema; s=json.load(open("plugins/pipeline-core/schemas/human-terminal-action-catalog.schema.json")); c=json.load(open("plugins/pipeline-core/templates/human-terminal-actions/catalog.json")); jsonschema.Draft202012Validator.check_schema(s); jsonschema.validate(c,s); print("human terminal action catalog schema valid")'
```

CLI readback:

```text
Auth-gate inventory drift check clean: 11 surface(s) discovered
(4 CLI command(s), 7 kind(s)); 18 canonical inventory row(s),
18 terminal disposition(s), all acknowledged.
Documentation contracts valid: 1585 Markdown file(s), 1370 link(s),
20 anchor check(s), 41 known vendored-copy link(s) excluded.
Verify suite registration is complete: 532 registered, 0 declared
exclusion(s), 0 unregistered.
human terminal action catalog schema valid
```

## File digests

```text
d2a5537beba18b20229557ed35eccf76f7a33914f3c70f19b6652d9ab6c3f15e  docs/human-authorization-inventory.md
f54d8993b570d3abc46fb6c24c2a23b76a14dd7f2b6a3e2f011be3fe7dbe6c33  harness/scripts/check-auth-gate-inventory-drift.mjs
e791f4296e0b3a1f80829e0f129e273a1183f974cda97d8ae8fb6458775b1bd2  harness/scripts/check-auth-gate-inventory-drift.test.mjs
6da0015abf7c0a53ecd15b894b68f7a0deec008bc111127a90ad64ab5a47d935  plugins/pipeline-core/templates/human-terminal-actions/catalog.json
25c0f5497fbe77c5edd08d0d1df151c972d851470c05b23d82e7ce1d7d9ec2b6  plugins/pipeline-core/schemas/human-terminal-action-catalog.schema.json
77a7103ba1ea696d90eb838ce5a55fb4823c0c306508814985c81d4a0e172db3  plugins/pipeline-core/lib/human-terminal-action-catalog.mjs
```

## Residual slices

- Slice 2: POSIX private prepared instances and machine-enforced run-boundary
  refusals.
- Slice 3: PO-key setup, installed-plugin attestation and selected safe producer
  migrations.
- Slice 4: native Windows private-state enforcement and runner reachability.

Native Codex Sandbox/App Server execution under WSL remains excluded.

## Final correction after the two review rounds

The correction at `956a18a52f3529b49150100d5f69f1a6034cce21`
makes slot `enum` presence conditional in the published JSON Schema exactly as
the runtime validator already required: enum slots require a non-empty unique
value list, while every other slot type rejects that property. Parent
self-verification after the two-review cap ran the normal 21-test file plus two
direct Draft-2020-12 negative probes; both schema-invalid shapes were rejected
and the shipped catalog remained valid. The documentation check readback at
this final candidate is 1,585 Markdown files, 1,370 links, 20 anchors and 41
excluded vendored-copy links.

The fresh refs-only second Critic returned `VERDICT: no` with the schema parity
finding above and one stale documentation-count minor. It explicitly cleared
the candidate/tree and six file-digest bindings, all 18 canonical rows and
dispositions, builder delegation and boundary fidelity, residual-slice
wording, and the exclusion of native WSL readiness. It observed no briefing
violation and used the literal assurance
`functional-equivalent-read-only; OS isolation not asserted`. The two-review
cap is exhausted; the corrections above use direct parent self-verification
and no third Critic result is claimed.
