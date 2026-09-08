# ADR foundation and session vendor integration

The sanctioned generator's non-writing manifest found exactly these four stale
consumer destinations, and no others:

- `plugins/pipeline-core/docs/adr/0003-role-implementation-subagents.md`
- `plugins/pipeline-core/docs/adr/0005-quality-gates-dod.md`
- `plugins/pipeline-core/docs/adr/0008-permissions-worktree-policy.md`
- `plugins/pipeline-core/docs/adr/0010-session-bootstrap.md`

They are generated copies of accepted root-canon ADRs. The generator copied
their committed `Governs:` headers byte-for-byte; it did not alter ADR bodies
or source headers. The final generator capture at
`scratch/NVA-B-ADR-GOVERNS-VENDOR-7/generator-check.json` proves byte equality.

The consumer checker initially found exactly three inherited source-only
`harness/` header lines: ADR-0003, ADR-0005, and ADR-0010. ADR-0008 has no
source-only prefix in its header. The checker now allowlists only each entire,
unique inherited `Governs:` line using the established
`vendoredCanonAllowlistReason`. This is Class B metadata: an exact
byte-identical source-checkout responsibility declaration, not a command for a
consumer project. Each entry retains the existing file-plus-substring matching
contract and uses the complete header as that substring; no file-wide or regex
exception is added. The negative proof below covers a separate added instruction
line, not a new line-equality contract for the checker.

`scratch/NVA-B-ADR-GOVERNS-VENDOR-7/check.json` preserves the three
pre-allowance findings and proves that appending a new `harness/scripts/verify.mjs`
consumer instruction to each affected copy is still rejected. The direct
nine-test stale-entry suite passed in
`scratch/NVA-B-ADR-GOVERNS-VENDOR-7/consumer-test.json`; the final consumer
check and document-contract check passed in their separate machine captures.

The roots were supplied as FOUNDATION-7
`017603d50e5038127ce907b70d1d137242a98475` and SESSION-7
`9d2cbc3870e7bbd29dfa00c506d0c5ae3131d4d6`. No source ADR, runtime,
schema, authority, pin, or test was changed. Candidate-wide review remains
with the parent; no T0 Critic skip is asserted here.
