# Briefing — CYB-2I-2: wire the shared completeness gate into the Close call site (Wave 6)

> Dispatch briefing for one `goldfish-implementor` (effort medium) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-2 (Sprint Cyborg epic, Wave 6, `cyb-2i-1h-body-slicing.md`
  §1 row 3). Depends on CYB-2I-0 (shared `checkSecurityCompleteness` gate,
  CLOSED — `6f37153`, Critic-reviewed zero findings).
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (confirm via `git log
  -1 --format=%H` at dispatch time — expect `54491e6` or later). Working tree
  must be clean before you start; keep it clean; end with exactly one atomic
  commit.
- **Model / effort:** `goldfish-implementor` / medium — the extension
  mechanism (`close.pre`) is already live and documented; this task registers
  a new entry into an existing list using an existing two-script pattern, it
  does not invent a new mechanism (lower design latitude than CYB-2I-1 or
  CYB-2I-3).
- **Profile:** epic, execution phase.
- **Why this exists:** AC8 ("Push/PR/Close/Release consume the same
  completeness evaluator") — the Close call site. Confirmed
  (`cyb-2-body-slicing.md` §3 item 1): Close has no standalone gating script;
  enforcement is procedural, via the `close-block` skill's `close.pre`/
  `close.post` extension points, and this repo's own `.claude/pipeline.json`
  already registers two `close.pre` scripts.

## Field 1 — Goal

1. Create a new file `plugins/pipeline-core/scripts/check-close-security-completeness.mjs`,
   matching the existing two `close.pre` scripts' shape exactly — no CLI args,
   plain exit-code contract (0 = pass/skip, non-zero = fail), a project-root
   resolution of `process.env.CLAUDE_PROJECT_DIR || process.cwd()` (mirror
   `harness/scripts/check-claude-md-lines.mjs`'s exact convention, not
   `check-spec-retention.mjs`'s `DEFAULT_ROOT` file-relative convention — this
   new script has no reason to assume it always runs from a fixed location
   relative to itself, and `close.pre` entries always run from the project
   root per `close-block/SKILL.md`'s own contract).
2. The script must:
   a. Load the manifest via `loadManifest(root)` and `gateConfig(manifest,
      "security")` (both from `plugins/pipeline-core/lib/manifest.mjs`) —
      **exactly mirroring `guard-push.mjs`'s own gate-activation check**
      (`plugins/pipeline-core/hooks/guard-push.mjs` ~line 1090-1106,
      1292-1294): if the manifest is absent, OR the security gate is absent,
      OR its `mode === "off"`, **exit 0 immediately** (skip silently — same
      "opt-in feature, nothing configured" semantics as the push gate, not a
      new independent policy for Close).
   b. Otherwise, resolve the CURRENT HEAD commit and tree via `git -C <root>
      rev-parse HEAD` and `git -C <root> rev-parse HEAD^{tree}`
      (`spawnSync`, matching the style already used elsewhere in this repo,
      e.g. `guard-push.mjs`'s own `resolveSourceTree()`/`checkPrContributor
      Gates.mjs`'s `git()` helper) — this is "what Close is about to commit
      as HEAD," not the pushed/candidate source of a push-time check.
   c. Call `checkSecurityCompleteness({ projectDir: root, commit: <resolved
      HEAD sha>, tree: <resolved HEAD tree> })` from
      `../lib/security-completeness-gate.mjs` (relative to this new script's
      own location in `plugins/pipeline-core/scripts/`).
   d. On any failure reasons returned: print each to stderr prefixed
      `CLOSE SECURITY COMPLETENESS FAILED: `, then `process.exit(2)` (mirror
      `check-spec-retention.mjs`'s own `exit(2)` convention for its CLI
      entry).
   e. On zero failure reasons: print one evidence line to stdout (e.g.
      `CLOSE SECURITY COMPLETENESS GREEN: HEAD <sha> is bound and complete.`)
      and `process.exit(0)`.
3. Register the new script as a THIRD entry in this repo's own
   `.claude/pipeline.json`'s `ritualExtensions.close.pre` array (after the
   two existing entries — register-append discipline, append at the array
   end, do not reorder the existing two): add
   `"node plugins/pipeline-core/scripts/check-close-security-completeness.mjs"`.

**Explicit scope boundary:** if HEAD's own `evidence/security-latest.v2.json`/
`.verdict.json` don't exist in the working tree at close time (e.g. no
`security-scan.mjs` run happened yet this session), the new check fails
closed with a missing-evidence reason and blocks Close — this is the
INTENDED behavior (Close should not succeed silently without completeness
evidence when the security gate is active), not a bug to route around.

## Field 2 — Context files (read first)

- `plugins/pipeline-core/scripts/check-claude-md-lines.mjs` — root-resolution
  convention template (`CLAUDE_PROJECT_DIR || process.cwd()`) — note this
  file actually lives under `harness/scripts/` in this repo's own checkout;
  read it for the convention, your new file goes under
  `plugins/pipeline-core/scripts/` alongside `check-spec-retention.mjs`.
- `plugins/pipeline-core/scripts/check-spec-retention.mjs` — the sibling
  `close.pre` script already living in the target directory; mirror its
  `#!/usr/bin/env node` header, SPDX line, CLI-entry-guard-at-bottom shape.
- `plugins/pipeline-core/hooks/guard-push.mjs` — study ~line 1088-1107 (the
  `loadManifest`/`gateConfig`/"opt-in feature" pattern to mirror exactly) and
  ~line 1237-1250 (`resolveSourceTree()`, for the tree-resolution style,
  though yours resolves `HEAD`, not a pushed ref).
- `plugins/pipeline-core/lib/manifest.mjs` — READ ONLY. Confirms
  `loadManifest`/`gateConfig`'s exact exported signatures and return shapes
  (`{status, manifest}`; `gateConfig(manifest, name)` returns the gate config
  object or `null`).
- `plugins/pipeline-core/lib/security-completeness-gate.mjs` — READ ONLY. The
  shared gate's exact signature and its own test fixtures (use the same
  envelope/verdict JSON shapes for your new test fixtures).
- `plugins/pipeline-core/skills/close-block/SKILL.md` — lines ~30-42 (the
  `close.pre` extension-point contract: runs at step 1, sees HEAD/working
  tree exactly as the session left them, before any ritual writes).
- `.claude/pipeline.json` — the exact current `ritualExtensions.close.pre`
  array shape you are appending to.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2i-1h-body-slicing.md` §1 row
  CYB-2I-2; `cyb-2-feature-spec.md` AC8.

## Field 3 — Definition of Done (checks)

1. New file `plugins/pipeline-core/scripts/check-close-security-completeness.mjs`
   per Field 1, exporting its core check function (e.g.
   `checkCloseSecurityCompleteness(root)`) for testability, with a CLI-entry
   guard at the bottom calling it against `process.env.CLAUDE_PROJECT_DIR ||
   process.cwd()` (same pattern as `check-spec-retention.mjs`'s own bottom
   guard).
2. New test file `plugins/pipeline-core/scripts/check-close-security-completeness.test.mjs`
   (mirror `check-spec-retention.mjs`'s sibling test file's structure/style if
   one exists, otherwise a plain `node:test`/assert file matching this repo's
   other script tests) covering: (a) manifest absent / security gate absent /
   `mode: "off"` → exit 0, gate never consulted; (b) gate active, HEAD's v2
   evidence absent → exit 2 with a clear failure reason; (c) gate active,
   HEAD's v2 evidence fresh/bound/non-blocking → exit 0; (d) gate active,
   HEAD's v2 evidence fresh/bound/BLOCKING → exit 2.
3. `.claude/pipeline.json`'s `ritualExtensions.close.pre` array has exactly
   three entries after your change, in order: the two existing scripts
   unchanged, then your new one appended last. `node --check` the JSON is
   still valid (or use a JSON parse in your own verification, since
   `node --check` doesn't apply to `.json`).
4. Register your new test file in `harness/scripts/verify.mjs`'s
   `TEST_SUITES` array (a plain new entry, same pattern as the neighboring
   `spec-retention-tests`/`spec-retention-check` pair at ~line 264-265) — this
   DOES require touching `verify.mjs` (TP-3-protected). **You are granted a
   scoped test-path lift for this ONE addition only**, under the same
   discipline CYB-2F's dispatch used: make the minimal single-entry addition,
   run the full `verify.mjs` yourself to confirm your new suite registers and
   passes, then restore is NOT needed here (unlike CYB-2F, this is a
   permanent new registration, not a temporary edit) — but do confirm via
   `git diff -- harness/scripts/verify.mjs` that your change is EXACTLY the
   one new array entry, nothing else in the file touched.
5. `node --check` on every `.mjs` file you touch or add.
6. Report includes: final function/file names, the exact new
   `.claude/pipeline.json` diff, the exact `verify.mjs` diff (must be a
   single-entry addition), new test count/results, and confirmation the
   manifest/gate-skip path (case a) was actually exercised and passes.

## Field 4 — Prohibitions

- MUST NOT edit `check-claude-md-lines.mjs`, `check-spec-retention.mjs`, or
  either of their test files.
- MUST NOT edit `plugins/pipeline-core/lib/security-completeness-gate.mjs`,
  `manifest.mjs`, or `guard-push.mjs` (import/read only).
- MUST NOT reorder or remove the two existing `ritualExtensions.close.pre`
  entries.
- `verify.mjs` edit is scoped to exactly one new `TEST_SUITES` entry pair (or
  single entry, matching this repo's convention for a combined
  test+check-script pair vs. a single test-only entry — follow whichever
  shape the neighboring `spec-retention-tests` pair actually uses) — no other
  line in `verify.mjs` may change.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit.
- Do not weaken, skip, or platform-gate away a genuine test failure to make
  things green.

## Field 5 — Stop conditions

- The neighboring `spec-retention-tests`/`spec-retention-check` `verify.mjs`
  registration pattern doesn't cleanly generalize to your new script (e.g. it
  assumes something your script doesn't have) → STOP and report the exact
  gap rather than inventing a divergent registration shape.
- `close-block/SKILL.md`'s stated `close.pre` repo-state contract ("HEAD and
  the working tree are exactly the state the block/session was in") turns out
  not to hold for how `close.pre` entries are actually invoked (e.g. a
  different CWD than the project root) → STOP and report; do not silently
  add path-resolution workarounds.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-6.
