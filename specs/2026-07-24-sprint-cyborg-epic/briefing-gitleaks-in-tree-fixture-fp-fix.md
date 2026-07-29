# Briefing — gitleaks in-tree fixture false-positive fix

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** ad hoc fix, PO-directed 2026-07-29, closes a NEW real
  gitleaks blocker surfaced now that gitleaks + its `--no-git` fix
  (`c268983`) actually run on this host. Not part of the CYB-2 body-slicing
  plan; independent of CYB-2F. Do not confuse with the already-closed
  cross-branch scan-scope bug (`backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`,
  closed) — this is a DIFFERENT, genuinely in-tree finding set.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD `107bfda`. Working
  tree is clean; keep it clean (one atomic commit at the end). Do NOT touch
  `.claude/pipeline-state.json` or `pipeline.user.yaml`.
- **Model / effort:** `goldfish-deep` / opus / **xhigh** — justified: fixing
  this requires genuine trial-and-error against gitleaks' own opaque
  `generic-api-key` rule heuristics (no documented exact pattern), verified
  against a REAL gitleaks binary now trusted on this host, while keeping test
  semantics byte-identical. This is judgment/design latitude, not mechanical
  substitution.
- **Profile:** epic, execution phase.

## Field 1 — Goal

A real `node harness/scripts/security-scan.mjs` run on this host (post the
`--no-git` fix and post-trusting gitleaks/osv-scanner/semgrep binaries) now
reports gitleaks status `FINDINGS` with exactly 4 findings, ALL genuinely
reachable from this branch's own HEAD tree (unlike the already-fixed
cross-branch bug) — this makes the v1 exit code **BLOCKING (exit 2)** on this
branch, independent of and prior to any CYB-2F work:

```
plugins/pipeline-core/lib/continuity-state.test.mjs:720  rule=generic-api-key
plugins/pipeline-core/lib/continuity-state.test.mjs:782  rule=generic-api-key
plugins/pipeline-core/lib/continuity-state.test.mjs:807  rule=generic-api-key
plugins/pipeline-core/lib/review-economy.test.mjs:279    rule=generic-api-key
```

**Root cause, confirmed:**

1. `continuity-state.test.mjs:720/782/807` — these lines use the file's own
   fixture constants `B`, `C`, `D`, defined at lines 36-38 as:
   ```js
   const B = "b".repeat(64);
   const C = "c".repeat(64);
   const D = "d".repeat(64);
   ```
   used as stand-ins for SHA-256 hex digests in fixture objects (e.g.
   `briefSha256: B`, `intentSha256: C`, `receiptSha256: D` appearing together
   in the same object literal at those 3 specific lines — other uses of the
   SAME constants elsewhere in the file are NOT flagged, so the trigger is the
   surrounding multi-field context at those exact lines, not the constants in
   isolation). gitleaks' `generic-api-key` rule pattern-matches the uniform,
   high-"entropy-looking" repeated-character string next to secret-shaped
   field names. These are never real secrets — pure fixture placeholders.
2. `review-economy.test.mjs:279` — a DIFFERENT trigger shape, the literal
   string `idempotencyKey: "decision-key-01"` (line 279 exactly, confirmed via
   direct read — this is NOT one of that file's `A`/`B`/`C`/`D` constants).
   The dash-separated `word-word-digits` shape next to a `...Key`-named field
   resembles a common API-key/token format to the rule.

**The fix:** change the fixture *values* only — never the test assertions,
control flow, or what is being tested — so gitleaks' `generic-api-key` rule
no longer matches, while keeping the fixtures deterministic, distinct from
each other, and semantically equivalent placeholders. You must verify this
empirically against the REAL trusted gitleaks binary on this host
(`C:\Program Files\Gitleaks\gitleaks.exe`, confirmed trusted this session) —
there is no documented exact regex to satisfy analytically, so iterate:
change → re-run gitleaks (or the full `security-scan.mjs`) → confirm the
specific finding is gone → confirm no NEW finding appeared elsewhere in either
file.

**Constraints on the replacement values (both patterns):**
- For `continuity-state.test.mjs`'s `B`/`C`/`D` (lines 36-38 ONLY — do not
  touch the ~100+ other usages of these constants throughout the file, since
  they are plain variable references and changing the definition
  automatically propagates): pick 64-char fixture strings that are still
  clearly non-secret-shaped (e.g. break the uniform single-repeated-character
  pattern — mixed but still obviously-synthetic characters), still mutually
  distinct (tests may assert e.g. `!== `A`/`B` inequality — grep to confirm
  before changing), and still hex-safe if any consuming code validates
  hex-ness (grep `continuity-state.mjs`'s validators for a hex-pattern check
  on these fields — read-only, do not edit `continuity-state.mjs` itself).
- For `review-economy.test.mjs:279`'s `"decision-key-01"`: rename the literal
  to something equally readable as a fixture idempotency key but that does not
  resemble a common secret/token format (e.g. avoid the exact
  `word-word-digits` triad if that's what's triggering it — verify
  empirically). Grep the file for any OTHER place that compares against this
  exact literal (equality assertions) before renaming, and update all of them
  consistently within this one file.

## Field 2 — Context files (read first)

- `plugins/pipeline-core/lib/continuity-state.test.mjs` — lines 1-40 (fixture
  constant definitions), lines 700-815 (the 3 flagged usage sites and
  surrounding test cases). Full file grep for `\bB\b|\bC\b|\bD\b` usage count
  to confirm blast radius before touching the definitions.
- `plugins/pipeline-core/lib/review-economy.test.mjs` — lines 25-35 (its own
  `A`/`B`/`C`/`D`/`COMMIT`/`TREE` fixture block, for context/consistency
  only — NOT part of this fix, do not touch unless one of ITS constants is
  independently confirmed still-flagged after your change, which is not
  expected), lines 270-290 (the flagged `idempotencyKey` literal and its
  surrounding `intent` object).
- `harness/scripts/security-adapters/gitleaks.mjs` — READ ONLY, do not edit.
  For understanding the invocation only (already fixed this session,
  `--no-git` present).
- `harness/scripts/security-scan.mjs` — READ ONLY, do not edit. This is what
  you'll actually run to re-verify end-to-end (`node
  harness/scripts/security-scan.mjs`), or you may invoke gitleaks directly on
  the working tree for faster iteration (`--no-git --source .`) — implementer's
  choice for the iteration loop, but the DoD check (below) requires the full
  `security-scan.mjs` run as final proof.

## Field 3 — Definition of Done (checks)

1. Both files' relevant test semantics are UNCHANGED: same assertions, same
   number of test cases, same pass/fail behavior of the actual functions under
   test — only the fixture literal VALUES change (and any lines that
   reference the renamed `review-economy.test.mjs` literal for equality, kept
   internally consistent).
2. `node --test plugins/pipeline-core/lib/continuity-state.test.mjs` and
   `node --test plugins/pipeline-core/lib/review-economy.test.mjs` — full
   regression, same pass count as a `git stash`-verified pre-change baseline
   (confirm and report both counts; zero new failures).
3. A REAL run of gitleaks (via `security-scan.mjs` or a direct
   `gitleaks detect --no-git --source <this-repo-root> --report-format json`
   invocation against the working tree) confirms: none of the 4 specific
   findings above reproduce, AND no new finding appears anywhere else in
   either touched file (report the exact new finding count/paths for
   gitleaks specifically — 0 is the target, but if some other PRE-EXISTING
   unrelated finding surfaces elsewhere that you did not cause, report it
   honestly rather than silently "fixing" out-of-scope files).
4. Final proof: a full `node harness/scripts/security-scan.mjs` run on this
   machine reports gitleaks as `PASS`/`OK` (0 findings) — or if genuinely
   impossible to fully zero out, report the exact remaining finding(s) and why
   (this would itself be a stop-condition-worthy surprise, see Field 5).
5. Report includes: the exact before/after values chosen for each constant,
   the empirical gitleaks before/after finding lists, both regression-suite
   before/after counts, the full `security-scan.mjs` before/after gitleaks
   line, and any deliberately unfixed observation.

## Field 4 — Prohibitions

- MUST NOT edit any file other than `continuity-state.test.mjs` and
  `review-economy.test.mjs`. Specifically not `continuity-state.mjs`,
  `review-economy.mjs`, any security-adapter, `security-scan.mjs`,
  `guard-push.mjs`, or any evidence/schema/policy file.
- MUST NOT change what is being tested — no new assertions, no removed
  assertions, no changed control flow, no changed function-under-test
  behavior. Only fixture literal values (and consistent renames of one
  literal within `review-economy.test.mjs`) change.
- MUST NOT weaken, skip, or platform-gate away a genuine test failure to make
  things green.
- MUST NOT touch `continuity-state.test.mjs`'s or `review-economy.test.mjs`'s
  OWN unrelated `A` (and in review-economy, `COMMIT`/`TREE`) constants unless
  you empirically confirm one of them is ALSO independently flagged by
  gitleaks after your change (not expected — they weren't in the original 4
  findings).
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit.

## Field 5 — Stop conditions (return to Elephant, clean, no partial commit)

- No trusted/resolvable gitleaks binary is available when you attempt to
  verify (would mean this session's trust fix regressed) → STOP and report.
- After reasonable iteration, one or more of the 4 findings still reproduces
  no matter what non-secret-shaped replacement value you try → STOP and
  report the exact rule/value combinations attempted; do not ship an
  unverified guess.
- Changing the flagged values would require changing actual test assertions
  (i.e., the fixture value is load-bearing for what's being asserted, not just
  a placeholder) → STOP and report exactly which assertion and why (this would
  mean the fix needs a different design, e.g. a `.gitleaksignore` exception
  instead — a separate PO decision already declined as first choice this
  round).
- The existing test baseline cannot be reproduced (failures beyond a clean
  green) before you change anything → STOP (environment problem, not your
  diff).

## Field 6 — Evidence to return

Diff (or clean-stop reason) + a condensed report covering DoD 1-5: exact
before/after fixture values, both regression-suite before/after pass counts,
the empirical gitleaks before/after finding lists (direct tool output or
`security-scan.mjs` line), and any deliberately unfixed observation.
