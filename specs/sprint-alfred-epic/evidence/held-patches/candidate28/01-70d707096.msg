fix(verify): bring the case-completion policies of 18 suites up to their declared cases

The candidate 27 Full Verify refused 18 suites with
VERIFY-CASE-COMPLETION-DECLARATION although every case passed: their tests had
grown past the registered lists. Extend the policies through the augmentation
file, digest-bound where a registered policy already exists, so neither
harness/verify-suites.json nor the verify.mjs rows are rewritten. Only additions,
measured from each suite's own declaration. The registry test restates six
outgrown sites counts (QG-04, extension only).

AI-Assisted: true
Dispatch: stage-0 (elephant)
