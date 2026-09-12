# Human-terminal templates Slice 1 evidence

Date: 2026-09-12
Task: `NVA-B-HUMAN-TERMINAL-TEMPLATES-SLICE1-1`
Implementation candidate: `36c38b6c0e01a65b000622d6b6ac1fab64b378ae`
Implementation tree: `e1062b153a2719cce51e7e8bdd62f243dd80a447`

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
Documentation contracts valid: 1584 Markdown file(s), 1370 link(s),
20 anchor check(s), 41 known vendored-copy link(s) excluded.
Verify suite registration is complete: 532 registered, 0 declared
exclusion(s), 0 unregistered.
human terminal action catalog schema valid
```

## File digests

```text
d2a5537beba18b20229557ed35eccf76f7a33914f3c70f19b6652d9ab6c3f15e  docs/human-authorization-inventory.md
f54d8993b570d3abc46fb6c24c2a23b76a14dd7f2b6a3e2f011be3fe7dbe6c33  harness/scripts/check-auth-gate-inventory-drift.mjs
b45288af00124ea02d26f1ac6e45c9776114f7ef3e86ec338976bc6121e7d5f3  harness/scripts/check-auth-gate-inventory-drift.test.mjs
6da0015abf7c0a53ecd15b894b68f7a0deec008bc111127a90ad64ab5a47d935  plugins/pipeline-core/templates/human-terminal-actions/catalog.json
02d9d3987f3fa8362af07b0558616260a25fe54b04ea97148625c119f3659f26  plugins/pipeline-core/schemas/human-terminal-action-catalog.schema.json
77a7103ba1ea696d90eb838ce5a55fb4823c0c306508814985c81d4a0e172db3  plugins/pipeline-core/lib/human-terminal-action-catalog.mjs
```

## Residual slices

- Slice 2: POSIX private prepared instances and machine-enforced run-boundary
  refusals.
- Slice 3: PO-key setup, installed-plugin attestation and selected safe producer
  migrations.
- Slice 4: native Windows private-state enforcement and runner reachability.

Native Codex Sandbox/App Server execution under WSL remains excluded.
