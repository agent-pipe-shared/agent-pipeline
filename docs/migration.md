# Migration

For a complete, current onboarding path for an existing application repository,
see [“Bring an existing repository under the pipeline” in `SETUP.md`](../SETUP.md#c-bring-an-existing-repository-under-the-pipeline).

If the checkout itself owns `pipeline.user.yaml`, use the explicit V3
inspect → plan → `apply --activate` sequence in
[“Activate or upgrade the V3 authority”](../SETUP.md#activate-or-upgrade-the-v3-authority).
That authority migration is not an application-repository setup command.

The normative lifecycle after adoption is
[`../PIPELINE_FLOW.md`](../PIPELINE_FLOW.md); runtime-specific enforcement
limits are documented in [`runtime-boundary.md`](runtime-boundary.md).
