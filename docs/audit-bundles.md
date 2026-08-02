# Audit bundles

An Audit Bundle is a create-only, offline-verifiable copy of the validated
artifacts of one completed Feature Package. Its manifest binds the exact
candidate commit/tree, every copied byte digest, and the resolved organization
policy digest. It is evidence, not governance authority and not a release or
compliance claim.

Use the explicit local CLI to emit a reviewable plan, build from that plan, and
verify an existing bundle:

```bash
node plugins/pipeline-core/scripts/audit-bundle.mjs plan \
  --repo "$PWD" --manifest specs/<feature>/lifecycle.json \
  --bundle-id <bundle-id> --core-version <core-version> \
  --pack-file <policy-pack.json>
```

Persist the printed plan through an operator-controlled review boundary before
calling `build --repo … --plan-file … --output …`; use `verify --bundle …` for
the offline digest check. Signing remains a separate provider boundary.

The bundle service refuses an invalid package, a missing candidate binding, an
incompatible policy pack, changed source bytes, and an existing destination.
Verification rehashes each bundled artifact and returns `invalid` for a missing
or tampered byte. Signing and long-term retention are separate operations: a
signature can bind bytes but cannot prove legal identity, key custody, trusted
time, or external authorization.
