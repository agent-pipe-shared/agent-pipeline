# Briefing — gitleaks cross-branch scan-scope fix

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** ad hoc fix, PO-directed 2026-07-29, root-causes and closes
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`
  (type `observation`, status `open`). Not part of the CYB-2 body-slicing
  plan; independent of CYB-2F.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD `cd0e9cb`. Working
  tree is clean; keep it clean (one atomic commit at the end). Do NOT touch
  `.claude/pipeline-state.json` or `pipeline.user.yaml`.
- **Model / effort:** `goldfish-deep` / opus / **xhigh** — justified: fix to a
  security-critical scanner adapter whose correctness the whole security gate
  depends on; requires genuine verification (not just trusting a flag exists)
  that the actual bug class is closed.
- **Profile:** epic, execution phase.

## Field 1 — Goal

`harness/scripts/security-adapters/gitleaks.mjs`'s `run()` invokes `gitleaks
detect --source <rootDir> ...` with no `--no-git`/`--log-opts` flag. gitleaks'
`detect` subcommand defaults to scanning **git history**, not just the
working tree's file content. The `rootDir` it receives is a real `git
worktree add --detach <snapshotRoot> <candidate.commit>` (see
`security-scan.mjs`'s `materializeCandidate()`, NOT part of your edit scope,
read-only context) — and a git worktree **shares the `.git` common
directory's objects and refs with the main clone it was created from**. This
means gitleaks' internal git traversal inside that worktree can reach *every*
locally fetched branch's history, not just the candidate commit's own
ancestry.

**Confirmed on this machine (2026-07-29), root cause traced end-to-end:**
after fixing an unrelated tool-trust issue that had been silently skipping
gitleaks on this host, a real run surfaced 46 findings across 14 file paths.
Every single path was independently confirmed (via `git cat-file -e HEAD:` +
`git log --all -- <path>`) to be **absent from this branch's HEAD**, tracing
instead to commits reachable only from unrelated local branches
(`sprint-nova-codex`, `sprint-phoenix-epic`). Content inspection (`git show
<sibling-commit>:<path>`) confirmed every flagged string is a self-referential
content-addressed SHA256 hash or test lock-token from those branches' own
fixtures — never a real secret. This exactly matches hypothesis 1 already
recorded in the backlog item.

**The fix:** add `--no-git` to the `gitleaks detect` invocation in
`harness/scripts/security-adapters/gitleaks.mjs`. Per `gitleaks detect
--help`: `--no-git` makes gitleaks "treat git repo as a regular directory and
scan those files" — a pure filesystem content scan of `rootDir`, with zero git
object/ref traversal. This is not a workaround; it is the architecturally
correct scope for this pipeline's security model: the candidate the scanner
receives is already an **immutable, identity-verified snapshot of one exact
commit's tree** (`candidate.snapshot.method: "git-detached-worktree.v1"`,
`verifiedBeforeAfter: true` — see `guard-push.mjs`'s
`checkSecurityEvidenceBinding()`, read-only context, do not edit). The
pipeline's own security-evidence schema already documents scan `coverage` as
`subject: "candidate-tree"` — a file-content scan is the literal, honest
implementation of that claim. Nothing in the current evidence schema, ACs, or
guardrails claims or requires historical/deleted-secret mining across a
commit's ancestry; `--no-git` does not remove a designed capability, it removes
an undocumented, accidental one that happened to also leak across branches.

## Field 2 — Context files (read first)

- `harness/scripts/security-adapters/gitleaks.mjs` — the ONLY production file
  you edit. Study the header comment's "INVOCATION" section (~line 19-27),
  `run()`'s `args` array (~line 127-138), and the `CAPABILITY_CONTRACT_V2`
  export's `coverageLimitations` field (~line 230-234, currently says "No
  `--log-opts` or other git-history-range flag is passed... scan scope is
  whatever the installed binary's own default resolves to, unmodified by this
  adapter" — this sentence becomes stale and must be corrected to describe the
  new `--no-git` behavior).
- `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md` —
  the original observation this fix closes. Read in full; your report must
  reference it and your commit should update its `status` field (see DoD 6).
- `harness/scripts/security-scan.test.mjs` — existing regression suite,
  contains the FAKE-binary fixture pattern for `gitleaksAdapter.run()`
  (`gitleaksClean`/`gitleaksFindings`/etc., ~line 161-220; assertions ~line
  445-490). Reuse this pattern for a hermetic args-assertion test. Read-only
  context for the pattern; you may add new test cases here or in
  `harness/scripts/security-adapters/gitleaks.test.mjs` — implementer's
  choice, briefly justify.
- `harness/scripts/security-adapters/gitleaks.test.mjs` — existing
  `CAPABILITY_CONTRACT_V2` field tests. The `coverageLimitations` test (~line
  45-53) currently only asserts non-empty array of strings — update if your
  new coverageLimitations text needs a stronger assertion, but do not weaken
  it.
- `harness/scripts/security-scan.mjs`'s `materializeCandidate()` (~line
  300-317) — READ ONLY, do not edit. Confirms the worktree-sharing mechanism
  described above.

## Field 3 — Definition of Done (checks)

1. `gitleaks.mjs`'s `run()` passes `--no-git` in the `args` array to
   `gitleaks detect`. Existing flags (`--source`, `--report-format json`,
   `--report-path`, `--no-banner`, `--exit-code 0`) are unchanged; only add
   the new flag.
2. Header comment "INVOCATION" section and `CAPABILITY_CONTRACT_V2`'s
   `coverageLimitations` array both updated to accurately describe the new
   `--no-git` file-content-only scan scope, and to state the rationale
   (candidate is an immutable single-commit-tree snapshot; historical/
   cross-ref mining was never a documented capability and was the source of
   the cross-branch false-positive bug). Do not invent new
   `CAPABILITY_CONTRACT_V2` fields; edit existing string content only.
3. **Hermetic unit test** (new): a spy `spawnFn` capturing its invocation
   arguments proves `--no-git` is present in every `gitleaks detect` call
   `run()` makes, regardless of environment (no real gitleaks binary needed).
   Follow the existing `writeFixtureBinary`/`fixtureSpawnFn` pattern in
   `security-scan.test.mjs`, or a lighter spy if simpler — implementer's
   choice.
4. **Environment-gated reproduction test** (new): using a REAL gitleaks
   binary when one is trustedly resolvable on the host (reuse
   `resolveTrustedSystemExecutable`/`isInstalled`-style capability probing,
   mirroring this repo's established capability-probe-gating convention —
   e.g. `plugins/pipeline-core/lib/private-overlay-activation.mjs`'s pattern,
   read-only reference, do not import from it directly unless it's already an
   exported, general-purpose helper), construct a temporary real git
   repository fixture with two branches: branch A committed with a
   file containing an obvious gitleaks-detectable secret-shaped string
   (e.g. a fake AWS-key-shaped literal, clearly fixture-only), and branch B
   (the "candidate") with no such file. Add a real `git worktree add --detach`
   for branch B's commit (mirroring `materializeCandidate`'s exact mechanism).
   Assert: running the OLD invocation (no `--no-git`) against that worktree
   surfaces branch A's secret as a finding (proves the bug reproduces); running
   the NEW invocation (with `--no-git`) against the same worktree does NOT
   (proves the fix closes it). This test must **skip cleanly with a clear
   message** (not fail, not error) when no trusted/resolvable gitleaks binary
   is available on the host running the suite — this exact host has one now
   (`C:\Program Files\Gitleaks\gitleaks.exe`, confirmed trusted this session),
   so it will actually execute and provide real evidence here; other
   environments (CI without the binary) must still pass cleanly via the skip
   path. Clean up the temporary repo/worktree unconditionally (including on
   assertion failure).
5. `node --test harness/scripts/security-scan.test.mjs` (and/or
   `gitleaks.test.mjs`, wherever you placed the new tests) — full regression,
   zero new failures versus the pre-existing baseline (confirm via
   `git stash`/before-after or a documented baseline count; note the 2
   pre-existing `git`-not-on-`%PATH%` CLI-smoke failures already documented
   this epic, if still present, are unrelated and untouched).
6. Update `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`:
   change `status: open` to `status: closed` in the frontmatter, and add a
   short closure note (new final section or appended to "Suggested next
   step") citing this fix's commit, confirming hypothesis 1, and citing the
   reproduction-test evidence. Do not delete or rewrite the existing
   investigation content — append/append-and-mark-resolved only.
7. A REAL run of `node harness/scripts/security-scan.mjs` on this exact
   machine, post-fix: gitleaks status is no longer polluted by the 14 known
   cross-branch paths (report the exact new finding count/paths, or `PASS`/
   `0 findings` if genuinely clean — either is an acceptable, honest DoD pass
   as long as no cross-branch path from the documented 14 reappears).
8. Report includes: the confirmed root-cause trace (already given above —
   restate briefly, don't re-derive), the hermetic + reproduction test
   results, the real on-machine `security-scan.mjs` re-run output, the
   regression-suite before/after counts, and any deliberately unfixed
   observation.

## Field 4 — Prohibitions

- MUST NOT edit `security-scan.mjs`, `guard-push.mjs`, any other scanner
  adapter (`osv-scanner.mjs`/`semgrep.mjs`/`license-check.mjs`),
  `security-evidence-evaluator.mjs`, `security-capability-plan-builder.mjs`,
  `security-policy-resolver.mjs`, `guardrails/security.md`, or
  `governance/security-controls/catalog.json`.
- MUST NOT change `gitleaks.mjs`'s other existing flags, its
  `isInstalled()`/`resolveBinary()` logic, its findings-normalization shape,
  or its exported `name`. Only the `args` array gains one flag, plus the two
  documentation edits (DoD 2) and new tests.
- MUST NOT weaken, skip, or platform-gate away a genuine failure to make
  tests green; the environment-gated test (DoD 4) is the one sanctioned skip
  path, and it must skip only on genuine binary-unavailability, never
  silently on a real assertion failure.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit (may include the backlog-item status edit in the same
  commit, or a second small doc-only commit — implementer's choice, note
  which in the report).

## Field 5 — Stop conditions (return to Elephant, clean, no partial commit)

- `--no-git` does not exist on the resolved gitleaks version, or behaves
  differently than documented above → STOP and report the actual behavior
  (this would mean the fix needs re-design).
- The existing `security-scan.test.mjs` gitleaks-related baseline cannot be
  reproduced (failures beyond the known pre-existing ones) before you change
  anything → STOP (environment problem, not your diff).
- Constructing the real-git-repo reproduction fixture proves genuinely
  unsafe/flaky (e.g., cannot reliably isolate it from the host's actual
  repository or leaves stray state on failure) → STOP and report; do not ship
  a flaky or unsafe test.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + a condensed report covering DoD 1–8: the exact
new `args` array, the doc-edit text, both new tests' pass output (hermetic +
reproduction), the real on-machine `security-scan.mjs` before/after gitleaks
output, the regression-suite before/after counts, and the backlog-item
closure edit.
