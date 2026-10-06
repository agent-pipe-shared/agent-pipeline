# GLREP-t2 runs (machine-captured, copied verbatim from ignored scratch)

Captured by `plugins/pipeline-core/scripts/capture-evidence.mjs` during dispatch GLREP-t2 (commit `b4675f967`); copied
here unchanged so the evidence survives a scratch cleanup and a device switch. The bite run executed the committed test
against a scratch copy of `gitleaks-repair-ignore.mjs` whose refusal prefix was mutated to `valuebinding-mismatch:`;
the mutated copy itself is not preserved.

## after.log (committed test against the unchanged implementation)

```text
command: node --test plugins/pipeline-core/scripts/gitleaks-repair-ignore.value-binding.test.mjs
label: after
exitCode: 0
--- stdout ---
✔ (a) control: the live finding carries the SAME value at the new line -> repair succeeds and re-binds exactly one line to the new line (10.6517ms)
✔ (b1) defect: the live finding carries a DIFFERENT value at the new line -> repair refuses with a reason (7.3568ms)
✔ (b2) defect: after the refusal the ignore file is byte-identical to before (7.7259ms)
✔ (b3) defect: after the refusal the different value is still reported by the scan (never suppressed) (9.3946ms)
✔ (c) no partial write: the refused repair leaves no temp or backup file next to the ignore file (7.2659ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 98.6586

--- stderr ---
```

## bite.log (committed test against the prefix-mutated scratch copy)

```text
command: node --test scratch/GLREP-t2/bite/gitleaks-repair-ignore.value-binding.test.mjs
label: bite
exitCode: 1
--- stdout ---
✔ (a) control: the live finding carries the SAME value at the new line -> repair succeeds and re-binds exactly one line to the new line (12.1846ms)
✖ (b1) defect: the live finding carries a DIFFERENT value at the new line -> repair refuses with a reason (9.2483ms)
✔ (b2) defect: after the refusal the ignore file is byte-identical to before (9.5776ms)
✔ (b3) defect: after the refusal the different value is still reported by the scan (never suppressed) (11.4249ms)
✔ (c) no partial write: the refused repair leaves no temp or backup file next to the ignore file (9.8934ms)
ℹ tests 5
ℹ suites 0
ℹ pass 4
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 110.1256

✖ failing tests:

test at scratch\GLREP-t2\bite\gitleaks-repair-ignore.value-binding.test.mjs:129:1
✖ (b1) defect: the live finding carries a DIFFERENT value at the new line -> repair refuses with a reason (9.2483ms)
  AssertionError [ERR_ASSERTION]: the refusal reason must start with the typed prefix "value-binding-mismatch:", got: valuebinding-mismatch: the live finding at backlog/fixture-value-binding.txt:fixture-rule column 7 does not carry the value the entry at line 3 was recorded for -- refusing to re-bind an entry to a value nobody reviewed; review the live finding and replace the entry by hand if it is acceptable
      at TestContext.<anonymous> (file:///<repo-root>/scratch/GLREP-t2/bite/gitleaks-repair-ignore.value-binding.test.mjs:138:12)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

--- stderr ---
```
