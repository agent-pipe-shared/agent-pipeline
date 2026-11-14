feat(provenance): check the ADR-0101 stage-0 caps, with a production-line cap

check-dispatch-provenance.mjs recognised a "stage-0 fast path" commit at
most 2 files and 25 changed lines. ADR-0101 raises the path to 3 files
and 60 changed lines with at most 25 lines of production logic, so the
check now applies all three caps: STAGE0_MAX_FILES 3, STAGE0_MAX_LINES
60 and STAGE0_MAX_PRODUCTION_LINES 25. A production path is a code file
(.mjs, .cjs, .js, .ts, .sh, .bash, .ps1, .py) that is no test, pin or
fixture (isStage0ProductionPath). Without the third cap the raise would
have admitted 60 lines of production code. The caps-exceeded finding
names the production lines, and the success line lists the new
semantic criteria the check cannot see (one concern, no test of the
Elephant's own new logic).

Tests: the at-cap case (3 files, 60 lines, 25 production lines) passes,
4 files, 61 lines and 26 production lines each fail; a CLI case flags a
26-line code file by the production cap alone.

AI-Assisted: true
Dispatch: stage-0 (elephant)
