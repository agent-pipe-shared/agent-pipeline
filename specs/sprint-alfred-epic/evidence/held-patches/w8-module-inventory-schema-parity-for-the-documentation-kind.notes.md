# w8-module-inventory-schema-parity-for-the-documentation-kind (held patch, not applied)

Cause of the red `architecture-adoption` schema-parity case ("ships all validation schemas with canonical source parity"): commit 4ea7a86b7 (D31 schema half) added
`kind` (`enum: ["documentation"]`) to `plugins/pipeline-core/schemas/pipeline.module-inventory.v1.json` only; the canonical `schemas/pipeline.module-inventory.v1.json`
never received it, and the parity test compares the parsed JSON of both.

Change: the canonical schema gains the same `kind` property between `profileSource` and `provisional`. No other schema field moves.

Evidence (clean clone at the base of the stack): `architecture-adoption.test.mjs` 55/55 green, including the parity case. Applies to the repository HEAD.
