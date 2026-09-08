# ADR delivery and authority vendor integration

The non-writing generator manifest found exactly three stale consumer copies:

- `plugins/pipeline-core/docs/adr/0033-release-promotion-phase.md`
- `plugins/pipeline-core/docs/adr/0055-critical-human-proof-waiver.md`
- `plugins/pipeline-core/docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md`

The sanctioned generator rewrote those destinations from their accepted
repository-root canon sources. The final generator check confirms that every
vendored canon file now byte-matches its source. The pre-generation assertion
and final generator result are preserved at
`scratch/NVA-B-ADR-GOVERNS-VENDOR-9/generator-pre.json` and
`scratch/NVA-B-ADR-GOVERNS-VENDOR-9/generator-check.json`.

The post-generation consumer scan found one actual inherited source-only
reference: ADR-0033's complete `Governs:` header contains `harness/` paths.
The consumer checker retains its exact file-plus-substring matching rule; the
single added Class B entry is that complete inherited header. ADR-0055 and
ADR-0064 produced no new consumer finding and received no new allowance.

`scratch/NVA-B-ADR-GOVERNS-VENDOR-9/consumer-pre-allowance.json` preserves
the original finding. `scratch/NVA-B-ADR-GOVERNS-VENDOR-9/check-final.json`
reconstructs it by removing only the new header entry, confirms the three
copies remain byte-identical to their accepted sources, and proves a separate
consumer instruction in ADR-0033 remains rejected. It records the current
hashes and the three historical hash deltas using the established status
classifier, restricted to normative content before `DE-REFERENCE-BELOW`.

The direct consumer-path suite, the consumer gate, and documentation-contract
gate passed in their machine captures under
`scratch/NVA-B-ADR-GOVERNS-VENDOR-9/`. No source ADR, policy, runtime,
authority, schema, or test changed. Candidate-wide verification and
independent review remain with the parent; no T0 Critic skip is asserted.

The terminal source commits were ROLES-9
`6289fb86d6d5f8bb112a57b55886dd8da11b5b6a`, DELIVERY-9
`8e058b3bd1581b1edd566ae82d2849afc8e6b75e`, and AUTHORITY-9
`bd588219c8e6a81fda1345cc05a515aae7958dd9`.
