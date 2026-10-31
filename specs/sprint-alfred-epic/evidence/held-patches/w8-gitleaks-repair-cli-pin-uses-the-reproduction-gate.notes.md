# w8-gitleaks-repair-cli-pin-uses-the-reproduction-gate (held patch, not applied)

Cause of the red `pins/gitleaks-repair-ignore-cli-is-a-no-op-on-windows` cases 2, 3 and 6 (AC-184): the public `gitleaks-repair-ignore` CLI now has a two-phase contract. A repair
needs `--reviewed-value-file` and `--gate-file`, a prior `--prepare-gate` that reproduces the finding with a manually reviewed plain-domain value, and a gate check on the repair run.
The pin still called the one-step form, so the CLI correctly exited 1 with `missing required flag(s)`.

Change (test-side, no product change): the pin's fixture value is a plain domain, the fixture writes the reviewed value under `root/scratch`, and each test that expects the CLI to
act first runs `--prepare-gate` against the same fake scanner and then repairs with the gate flags. The pin's purpose is unchanged: the CLI run as a real child process ACTS (never
a silent exit 0), including the relative, symlink and drive-letter spellings. The value-mismatch case accepts the gate's wording (`finding or exact reviewed value mismatch`)
or the repair core's own `value-binding-mismatch`, since the gate refuses first on the public route; it still requires exit 1 and an untouched ignore file.

Evidence (clean clone): the pin 9/9 (6 of 9 before). The reproduction gate's own CLI suite is unchanged and covers the gate semantics. Applies to the repository HEAD.
