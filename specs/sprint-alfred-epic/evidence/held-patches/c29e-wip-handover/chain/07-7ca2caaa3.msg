feat(gmw): an elephant-direct window accepts the ADR-0101 caps, still no test files

The guard maintenance window's elephant-direct authorship qualified a
declared diff at most 2 files and 25 diff lines with no test-file
change. ADR-0101 raises the stage-0 fast path to 3 files and 60 changed
lines, so stage0Qualifies now accepts 3/60. It still refuses
touchesTestFile: true (ADR-0101 Decision 5): a window lifts the
protected-test-path guard and cannot tell an ordinary test from a test
that checks the Elephant's own change. The record shape is unchanged, and
stored records stay valid because the caps only loosen.

Tests: GMW16 refuses 4 files, 61 lines and a test file; GMW17 accepts a
declaration exactly at 3/60.

AI-Assisted: true
Dispatch: stage-0 (elephant)
