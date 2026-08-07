# Briefing — CYB-2I-1: wire the shared completeness gate into the PR call site (Wave 6)

> Dispatch briefing for one `goldfish-implementor` (effort medium) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-1 (Sprint Cyborg epic, Wave 6, `cyb-2i-1h-body-slicing.md`
  §1 row 2). Depends on CYB-2I-0 (shared `checkSecurityCompleteness` gate,
  CLOSED — `6f37153`, Critic-reviewed zero findings).
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (confirm via `git log
  -1 --format=%H` at dispatch time — expect `54491e6` or later). Working tree
  must be clean before you start; keep it clean; end with exactly one atomic
  commit.
- **Model / effort:** `goldfish-implementor` / medium — this is additive
  integration into an existing, clean `{ok, errors[]}` contract
  (`validatePrContributorGates`), not a rewrite and not guardrail-authoring;
  the harder design calls (evidence-path binding, schema-version decision) are
  already made below, not left to you.
- **Profile:** epic, execution phase.
- **Why this exists:** AC8 ("Push/PR/Close/Release consume the same
  completeness evaluator") — the PR call site. Confirmed (Wave 6
  investigation, `cyb-2-body-slicing.md` §3 item 1): the concrete PR
  enforcement script is `harness/scripts/check-pr-contributor-gates.mjs`,
  invoked by `.github/workflows/contributor-gates.yml` as
  `node trusted-gate/harness/scripts/check-pr-contributor-gates.mjs --root
  candidate --cla-root trusted-gate --event "$GITHUB_EVENT_PATH" --receipt
  ...` — `candidate` is the untrusted PR head worktree, `trusted-gate` is the
  base-ref worktree. Today this script only gates CLA acceptance + DCO
  sign-off; it does not consult security completeness at all.

## Field 1 — Goal

In `harness/scripts/check-pr-contributor-gates.mjs`, extend
`validatePrContributorGates({ root, claRoot, event })` to also invoke
CYB-2I-0's shared gate (`checkSecurityCompleteness` from
`../../plugins/pipeline-core/lib/security-completeness-gate.mjs` — note the
relative path: this file lives in `harness/scripts/`, the gate lives in
`plugins/pipeline-core/lib/`) against the PR's own head commit/tree, using
`root` (the untrusted PR candidate checkout) as `projectDir`:

1. Resolve the PR head tree yourself: `spawnSync("git", ["-C", root,
   "rev-parse", `${pr.head.sha}^{tree}`], { encoding: "utf8" })` — mirror the
   existing `git()` helper's own style in this file (same spawnSync pattern
   already used by `checkDcoRange`). `headSha` is already validated
   (`/^[a-f0-9]{40}$/`) earlier in the function — reuse that same validated
   value, do not re-derive or re-validate it.
2. Call `checkSecurityCompleteness({ projectDir: root, commit: headSha, tree:
   <resolved tree or null if resolution failed> })` — leave
   `envelopePath`/`verdictPath` at their defaults (this repo has one
   evidence-file convention; do not invent a PR-specific path).
3. Push one `error("SECURITY_COMPLETENESS_BLOCKING", failureReason)` per
   string the shared gate returns (mirror exactly how `errors.push(...dco.
   failures)` already works a few lines below — same additive pattern, own
   error code, one entry per failure line).
4. This call must only run when `headSha` was itself successfully validated —
   do not attempt tree resolution or the gate call against a null/invalid
   `headSha` (mirrors how `checkDcoRange` is already only called when both
   SHAs validated).

**Explicit scope boundary — do NOT attempt to fix this (out of scope, a
separate follow-up):** `contributor-gates.yml` does not currently run
`security-scan.mjs` anywhere in its steps, so `evidence/security-latest.v2.json`
will not exist inside the `candidate` checkout in real CI runs today — the
new check will therefore fail closed with a "missing evidence" reason on
every real PR until a separate task wires a security-scan step into that
workflow. **This is architecturally consistent with `guard-push.mjs`, which
has the exact same property** (it also never runs `security-scan.mjs`
itself, only ever consults evidence some earlier step produced) — it is not
a shortcut unique to this task. State this explicitly in your report; do not
attempt to add a `security-scan.mjs` step to the workflow YAML yourself (a
separate CI-wiring decision, not this sub-package's scope).

**Explicit design decision — do NOT bump `RECEIPT_SCHEMA` to v3:** the
receipt's `errors[]` array is already a free-form list of `{code, detail?}`
objects (see the `error()` helper) with no closed/enumerated set of valid
`code` values checked anywhere in this file or its test file — adding a new
possible `code` value is not a structural shape change to the receipt object
itself. Keep `RECEIPT_SCHEMA = "agent-pipeline.pr-contributor-gate.v2"`
unchanged. If you find a concrete reason this reasoning is wrong (e.g. some
downstream consumer DOES enumerate/validate `errors[].code`), STOP and report
it rather than silently bumping the version yourself.

## Field 2 — Context files (read first)

- `harness/scripts/check-pr-contributor-gates.mjs` — the whole file (small);
  study `validatePrContributorGates` (~line 114-148, the exact function to
  extend), the existing `git()` helper (~line 61-63), and `checkDcoRange`'s
  own SHA-validation-then-git-call pattern (~line 65-112) as your template.
- `harness/scripts/check-pr-contributor-gates.test.mjs` — the existing test
  file and its `fixture()` helper (builds a real temp git repo with CLA file
  + signed commits). Extend this file with new cases (below); do not remove
  or weaken any existing case.
- `plugins/pipeline-core/lib/security-completeness-gate.mjs` — READ ONLY. The
  shared gate's exact exported signature
  (`checkSecurityCompleteness({projectDir, commit, tree, envelopePath,
  verdictPath})`) and its own fixture patterns (its sibling `.test.mjs` shows
  exactly what envelope/verdict JSON shapes produce a pass vs. a fail-closed
  vs. a blocking result — use these same shapes for your own new PR-level
  fixtures, do not invent a different evidence shape).
- `.github/workflows/contributor-gates.yml` — READ ONLY, context only (how
  `--root`/`--cla-root` map to `candidate`/`trusted-gate`). Do not edit this
  file.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2i-1h-body-slicing.md` §1 row
  CYB-2I-1 — this task's own scope entry.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` — AC8.

## Field 3 — Definition of Done (checks)

1. `validatePrContributorGates` extended exactly per Field 1; `RECEIPT_SCHEMA`
   unchanged at v2.
2. New test cases added to `check-pr-contributor-gates.test.mjs` (extend
   `fixture()` or add a small local helper to also write
   `evidence/security-latest.v2.json`/`.verdict.json` into the fixture's
   `root`, bound to that fixture's own `headSha`/resolved tree), covering at
   minimum: (a) no v2 evidence present at all → `ok:false` with
   `SECURITY_COMPLETENESS_BLOCKING` entries, all OTHER existing checks (CLA,
   DCO) still independently evaluated and reported (additive, not
   short-circuiting); (b) fresh, bound, non-blocking evidence present →
   `ok:true` (assuming CLA/DCO also pass) with no
   `SECURITY_COMPLETENESS_BLOCKING` entries; (c) fresh, bound, BLOCKING
   evidence present → `ok:false` with the expected `SECURITY_COMPLETENESS_
   BLOCKING` entries, CLA/DCO checks unaffected.
3. All pre-existing test cases in this file continue to pass unmodified
   (report the exact before/after case count — this file currently has no
   fail-closed baseline gap to reproduce, unlike `guard-push.test.mjs`; a
   regression here means you broke something).
4. `node --check` on every file you touch or add.
5. `pr-contributor-gate-tests` is already registered in `verify.mjs`
   (`harness/scripts/check-pr-contributor-gates.test.mjs`) — no `verify.mjs`
   edit needed or permitted for this task.
6. Report includes: exact new/total test counts (before/after), confirmation
   `RECEIPT_SCHEMA` is unchanged, and an explicit restatement of the
   "contributor-gates.yml doesn't run security-scan.mjs yet" scope boundary
   from Field 1 so it isn't lost between dispatch and the Elephant's
   follow-up tracking.

## Field 4 — Prohibitions

- MUST NOT edit `.github/workflows/contributor-gates.yml` (out of scope, see
  Field 1's explicit boundary).
- MUST NOT edit `plugins/pipeline-core/lib/security-completeness-gate.mjs` or
  its test file (import only).
- MUST NOT bump `RECEIPT_SCHEMA` (see Field 1's explicit design decision)
  without stopping and reporting why first.
- MUST NOT edit `harness/scripts/verify.mjs` — this suite is already
  registered.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit.
- Do not weaken, skip, or platform-gate away a genuine test failure to make
  things green.

## Field 5 — Stop conditions

- You find `RECEIPT_SCHEMA`/`errors[].code` IS validated/enumerated somewhere
  this briefing didn't account for → STOP and report before deciding
  yourself whether to bump the version.
- Resolving the PR head tree via `git -C root rev-parse <sha>^{tree}` behaves
  unexpectedly against the existing test fixture's temp-repo shape (e.g. the
  fixture's shallow-ness or missing objects break tree resolution in a way
  unrelated to your new code) → STOP and report the exact failure rather than
  loosening validation to route around it.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-6.
