fix(push): the carry-forward evidence lists know the audit bundle's real location

The bundle writer, the close-commit split and the administration paths all use
the repository-root location audit-bundles/<feature>/<commit>/..., but
EVIDENCE_PATH_PATTERNS (evidence-carry-forward) and
AUTHORITY_CARRY_EXTENSION_PATTERNS (record-only-paths) only named
specs/<feature>/audit-bundles/, a place nothing writes. A commit that touched only
bundle files therefore counted as a product change on the full gate
(PRODUCT-PATH-CHANGED), which is what the first Antigravity greenfield run met on
its audit-proof follow-up push. The root pattern joins the old one; the
specs/<feature>/ form stays. Restated: ROP4 (three classes now), ECF1.

AI-Assisted: true
Dispatch: stage-0 (elephant)
