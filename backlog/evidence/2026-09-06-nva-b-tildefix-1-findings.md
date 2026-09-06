# Neutral findings registry — NVA-B-TILDEFIX-1

Source: T1 Critic review (opus, max; functional-equivalent-read-only) of
commits `afc6af70a5e3c474e23409e2388ce2e354e3416c`,
`c88c4f1feec487eb9d70546d4b0f3ccea8fd61a5`, `aa389a1713a13f14455f0e37cf86fa150cf989b1`.
Full report: `scratch/dispatch/tildefix-critic-7f3a9c21/critic-notes.md`
(scratch, not durable — this registry is the durable record). This registry
lists what was found, not how or why — the fix-verification input contract
(`templates/prompts/critic-review.md`, "Input contract for
fix-verification/rework dispatches").

**Verdict: PASS.** All four findings are `minor`; none blocks. No correction
round required.

- **F1**: the cat-pipeline and git-pipeline lane regression tests assert
  `exitCode === 2` only, not the specific denial code, unlike their
  single-command/`rg`-pipe siblings, which do pin an exact code. Tracked:
  `2026-09-06-commandpath-and-two-lane-tests-still-carry-the-untreated-tilde-construction.md`.
- **F2**: the `rg`-to-`rg`/`rg`-to-`head` bounded pipeline lane refuses a
  leading-`~` argument via `GUARD-OPERATOR-UNAPPROVED` rather than a
  read-scope-accurate code, since its fix (`approvedReadPath`) returns
  `false` unconditionally rather than using the sentinel construction the
  other lanes use. Class-level covered by the pre-existing
  `2026-09-06-suppressed-and-chained-outside-root-reads-land-on-the-wrong-denial-code.md`
  (case-level coverage differs — that item names suppressed/chained reads,
  not the tilde case specifically).
- **F3**: `commandPath()`, a sibling helper in the same file, still builds
  `resolve(root, value)` with no leading-`~` reject — unproven exploitability,
  named call sites listed. Tracked in the same item as F1.
- **F4**: the backlog item's AC-4 follow-up ("whoever authors the ADR needs
  to cross-reference this item") had no named owner or target date (QG-06
  shape). Fixed directly in the backlog item's Resolution section following
  this Critic round.

**Also disclosed by this Critic round, not a Phase-A/B finding against this
diff but load-bearing:** a live reachability probe (synthetic marker path,
never a real credential) found this session's own enforcing guard —
resolved to the installed marketplace copy of `guard-lifecycle-ready.mjs`,
not this repository's own copy — does not yet have ANY of today's read-scope
fixes (`NVA-B-READCONTAIN-1` or `NVA-B-TILDEFIX-1`) live. Filed as its own
item: `2026-09-06-the-installed-plugin-copy-enforcing-this-session-predates-todays-guard-fixes.md`.
