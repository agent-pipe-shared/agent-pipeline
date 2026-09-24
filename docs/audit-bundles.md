# Audit bundles

An Audit Bundle is a create-only, offline-verifiable copy of the validated
artifacts of one completed Feature Package. Its manifest binds the exact
candidate commit/tree, every copied byte digest, and the resolved organization
policy digest. It is evidence, not governance authority and not a release or
compliance claim.

Before planning, obtain the repository or organization's approved policy-pack
JSON and confirm its compatibility with the selected Core version using the
[policy-pack inspection procedure](organization-policy-packs.md). The pack is
an explicit governance input, not a file the Audit Bundle command creates or
an authority substitute. If there is no approved pack, stop rather than
inventing one. Then use the local CLI to emit a reviewable plan, build from
that plan, and verify an existing bundle:

```bash
node <plugin-root>/scripts/audit-bundle.mjs plan \
  --repo "$PWD" --manifest specs/<feature>/lifecycle.json \
  --bundle-id <bundle-id> --core-version <core-version> \
  --pack-file <policy-pack.json>
```

The `plan` command writes one JSON object to standard output. Save that exact
output as a pending JSON file in an operator-controlled location, review the
file, and pass the same file path as `--plan-file` to `build`. Do not pipe an
unreviewed plan directly into a build. Use `verify --bundle …` for the offline
digest check. Signing remains a separate provider boundary.

Choose the output path explicitly. The normal repository-relative convention
is `audit-bundles/<bundle-id>`; it is not an implicit `dist/` directory, and a
caller may select another safe repository-relative destination when its
retention policy requires it. For example:

```bash
node <plugin-root>/scripts/audit-bundle.mjs build \
  --repo "$PWD" --plan-file /absolute/path/to/reviewed-plan.json \
  --output "audit-bundles/<bundle-id>"

node <plugin-root>/scripts/audit-bundle.mjs verify \
  --bundle "./audit-bundles/<bundle-id>"
```

Each newly built bundle contains `README.md` beside `manifest.json`. It names
the candidate and copied artifacts, gives the portable offline verification
command and prerequisites, and states the assurance limits. The manifest
binds that README's digest, so verification rejects a missing or modified
guide. The guide does not claim that the bundle is self-contained, a signed
approval, a deployment record, or release authorization.

The bundle service refuses an invalid package, a missing candidate binding, an
incompatible policy pack, changed source bytes, and an existing destination.
Verification rehashes each bundled artifact and returns `invalid` for a missing
or tampered byte. Signing and long-term retention are separate operations: a
signature can bind bytes but cannot prove legal identity, key custody, trusted
time, or external authorization.

## What a successful check means

`verify` confirms that the bundle's present files still match its manifest.
It does not prove who created or approved them, who controlled a signing key,
when they were produced, or how an exported bundle was stored or transported.
Keep the bundle under your own access and retention policy. For the exact
threats, code-level checks and policy derivation, see the
[maintainer's Audit Bundle reference](audit-bundles-technical.md).
