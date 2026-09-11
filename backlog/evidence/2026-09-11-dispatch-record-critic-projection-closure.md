# Dispatch-record Critic projection closure

- Implementation candidate: `85921a119f69a785dd2916b1986ae39cad200cba`
- Independent final review: **PASS**, no findings
- Registered cases: DRS01 through DRS11, required completion

The original defect made authorship evidence inseparable from the author's own
assessment: a raw dispatch record was needed to bind commits and changed paths,
but the same record carried `report.text`, `outcome` and other implementor
narrative that CR-02/EL-09 prohibit as Critic input.

The first independent review did not accept the initial stripper as sufficient.
It found that model and override fields, an unconstrained `rulesetSha`, and
permissive changed-file parsing, including the CLI's path projection, could
still transport free-form claims. Those findings produced a closed digest
grammar, a closed repository-relative path grammar, fail-closed handling of
unknown object keys and removal of all model selection metadata. The
correction review found the remaining `taskId` could itself carry narrative;
it too was removed. The final independent review by the record-strip Critic
inspected the reduced implementation and tests and returned PASS with no
findings. No versioned review receipt was produced, so this evidence does not
invent one.

The resulting projection contains only:

- a lower-case abbreviated/full Git digest or exact SHA-256 `rulesetSha`;
- at most 256 unique hexadecimal commit tokens;
- `report.changedFiles` as normalized literal repository-relative paths.

Everything else is dropped, including `report.text`, `outcome`, `taskId`,
`agentType`, `model`, `effort`, `modelOverride`, logs and future unknown fields.
The legacy `"path - rationale"` form is reduced at its first literal separator;
absolute paths, traversal, empty or doubled components, surrounding whitespace,
prose-bearing object paths and unknown object keys reject rather than silently
shorten the evidence.

The two canonical Critic templates now state the same dispatch-side contract.
The DRS01–DRS11 suite covers the exact allowlist, all removed narrative lanes,
digest and path rejection, malformed record shapes and non-mutation. Its normal
Verify registration uses the required case-completion protocol, so reaching the
process exit alone cannot hide an unexecuted later case. The registry's own
VCR01–VCR14 suite and the exact `e57f2a39..85921a11` candidate-bound check
confirm that migration, including VCR14's closed CLI argument contract.

This closure proves that the stripped dispatch artifact can bind the candidate
commits and changed paths without handing the Critic the implementor's
justification. It does not make a raw dispatch record valid Critic input.
