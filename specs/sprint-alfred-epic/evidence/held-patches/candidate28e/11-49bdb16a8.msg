docs(adr): accept ADR-0093, a Semgrep finding blocks only when new

PO tile 2026-11-12, register D242.

- ADR-0093: the second --baseline-commit pass, the baseline read from the
  candidate, the one verdict function, the fail-closed cases, and the
  measured Semgrep behaviour behind them (in-place checkout of the base,
  changed-files-only passes, path-derived rule ids, exit 2 on a missing
  base, no offline fingerprint); known limits named
- docs/state.md: the D242 register line now points at ADR-0093
- ADR index row and doc-governance classification

AI-Assisted: true
Dispatch: stage-0 (elephant)
