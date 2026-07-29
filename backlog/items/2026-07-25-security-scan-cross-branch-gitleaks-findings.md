---
schema: pipeline.backlog-item.v1
id: pipeline.security-scan-cross-branch-gitleaks-findings
type: observation
owner: pipeline
status: closed
created: 2026-07-25
source: Observed during Sprint Cyborg WIN-PGA-2 post-rebase baseline verify (feat/sprint-cyborg-claude rebased onto v0.4.4), 2026-07-25.
---

# pipeline.security-scan-cross-branch-gitleaks-findings

## Description

`node harness/scripts/security-scan.mjs` returned `Verdict: BLOCKING -> exit 2`
(14 `gitleaks`/`generic-api-key` findings, severity `high`) for the first time
this epic, immediately after `git fetch origin --tags` pulled updates for
multiple remote branches (including `origin/feat/sprint-nova-codex`) ahead of
rebasing `feat/sprint-cyborg-claude` onto `origin/main` (tag `v0.4.4`). Prior
runs this session (same repo, before that fetch) were `CLEAN`, exit 0.

## Evidence gathered

- All 14 flagged paths (e.g.
  `backlog/receipts/d311a66737ff088e2ae324df5f3525b08cefd4c9f58787d09870d3bd26961363.json`,
  `specs/sprint-nova-epic/evidence/backlog/event-39-amendment-intent.json`)
  do **not exist** in `HEAD` (`c775a3d`, `feat/sprint-cyborg-claude`) or in
  `origin/main` (`84d10c0`). `git log --all --oneline -- <path>` traces them
  to commit `7cd0ece` ("feat(nova): implement A1-A4 contract foundations"),
  reachable only from `remotes/origin/feat/sprint-nova-codex`
  (`git merge-base --is-ancestor 7cd0ece HEAD/origin-main` → both false).
- Content inspected directly (`git show 7cd0ece:<path>`): every flagged
  string is a field like `receiptId`/`idempotencyKey`/`intentSha256`/
  `itemFileSha256` inside a documented `pipeline.backlog-reconciliation-receipt.v1`
  / `pipeline.backlog-evidence-amendment-intent.v1` JSON receipt — i.e. this
  repo's own content-addressed SHA256 hashes, not credentials. `gitleaks`'
  `generic-api-key` rule is a well-known false-positive pattern on long
  hex/base64 strings; no actual secret material was found in any flagged
  file.
- **Discriminating check:** ran `security-scan.mjs --root <path>` against a
  throwaway detached worktree of `origin/main` (`84d10c0`, no Cyborg-branch
  changes at all) — the identical 14 findings reproduced byte-for-byte. This
  rules out the Cyborg branch/rebase as the cause: the behavior is
  branch-independent, present against `origin/main` alone.

## Open question (NOT pre-resolved here — EL-04)

The mechanism is not yet root-caused. Two live hypotheses, either or both
plausible:
1. `security-scan.mjs`'s `candidate`/"git-detached-worktree.v1" snapshot
   scans across a broader ref/object set than intended (e.g. `gitleaks`
   invoked in a mode that reaches other local branches' history via the
   shared `.git` object database), so content only ever pushed to a sibling
   branch (`sprint-nova-codex`) can pollute a scan nominally scoped to a
   different branch/commit.
2. This may be intended/default `gitleaks` behavior for this invocation
   shape, not a Pipeline-side scoping defect at all.

Either way: local `git fetch` breadth (fetching all remote branches, not
just the one in use) appears to be what exposes the finding, since earlier
same-session scans (before that fetch) were clean.

## Impact

- Not a real secret leak (content confirmed to be self-referential SHA256
  hashes, not credentials).
- Does currently make `guard-push.mjs`'s evidence gate fail for ANY branch
  scanned in an environment that has fetched `sprint-nova-codex` locally,
  regardless of that branch's own diff — same class of "pre-existing/
  unrelated evidence red" the epic's `po-guarded-push.mjs` escape hatch
  already exists to handle, but worth fixing at the source given it is a
  false positive rather than a genuine baseline defect.

## Suggested next step

Someone (not this session — EL-04, no silent foundational decision) should:
read `security-scan.mjs`'s gitleaks invocation to confirm/refute hypothesis
1 above, and if confirmed, scope the scan strictly to the candidate
commit/tree's own reachable history (or add a documented allowlist for this
repo's own hash-shaped receipt fields) rather than the ambient local object
database.

## Resolution — closed 2026-07-29

Root-caused and fixed. **Hypothesis 1 is confirmed**; hypothesis 2 is
refuted — the defect was Pipeline-side, in the gitleaks adapter's invocation
shape, not intended gitleaks behaviour for a correctly-scoped scan.

`harness/scripts/security-adapters/gitleaks.mjs`'s `run()` invoked `gitleaks
detect` with no scope flag. `detect` defaults to scanning git HISTORY, and the
candidate the scanner receives is a `git worktree add --detach` snapshot
(`materializeCandidate`, `git-detached-worktree.v1`) that shares the main
clone's `.git` object database — so gitleaks' history traversal reached every
locally fetched branch's commits, not just the candidate commit's own
ancestry. That is exactly how content only ever committed to sibling branches
(`sprint-nova-codex`, `sprint-phoenix-epic`) polluted a scan nominally scoped
to a different branch.

**Fix:** commit `c268983` adds `--no-git` to the `detect` invocation, so
gitleaks performs a pure filesystem content scan of the candidate tree with
zero git object/ref/history traversal — the literal implementation of the
security-evidence schema's `candidate-tree` coverage claim. No historical /
cross-ref mining capability was ever documented or is removed; only the
accidental default is.

**Evidence:**

- Before/after on the reporting host: a real `node
  harness/scripts/security-scan.mjs` went from 46 gitleaks findings across 14
  paths (Verdict BLOCKING, exit 2) to 0 gitleaks findings on the identical
  clean candidate. Of the 14 before-paths, 12 exist on no branch reachable
  from HEAD; the 2 that share a path with a HEAD file were flagged on line
  numbers beyond the current file's length (i.e. sourced from historical
  versions, not the candidate tree). None is a real secret and none reappears
  after the fix.
- New regression in `harness/scripts/security-adapters/gitleaks.test.mjs`: a
  hermetic spy asserts `--no-git` is always passed to `detect`, and an
  environment-gated reproduction builds a real two-branch repo plus a detached
  worktree and proves the OLD invocation surfaces the sibling branch's secret
  while the NEW (`--no-git`) invocation does not. It skips cleanly on hosts
  with no trusted gitleaks binary.

No `po-guarded-push.mjs` escape hatch or per-repo hash allowlist is needed for
this false-positive class going forward.

## Correction — 2026-07-29 (independent Critic review of this closure)

An independent Critic review of commits `c268983`/`bab3425` (self-application
discipline, CLAUDE.md) found that the "Evidence" section above is **factually
wrong on one point**: the claim of "0 gitleaks findings on the identical
clean candidate" at the time `bab3425` was written was false. A real
`node harness/scripts/security-scan.mjs` run on `bab3425` itself (independently
reproduced by the Critic in an isolated worktree, and separately re-confirmed
here) reported `FINDINGS (4 findings)` / `Verdict: BLOCKING -> exit 2` — not
0/clean.

The cross-branch fix (`c268983`, `--no-git`) is NOT wrong; it fully closes
the bug this item documents (the 12 genuinely cross-branch paths and 2
stale-line-number paths from the original 14 do not reappear, confirmed by
the Critic). The false "0 findings" claim was caused by a **second, separate**
false-positive class discovered later the same session: 4 findings genuinely
reachable from this branch's own `HEAD` tree (`continuity-state.test.mjs:720/782/807`,
`review-economy.test.mjs:279`), all `generic-api-key` matches on fixture
`idempotencyKey` literals shaped like `word-word-##` (e.g. `"decision-txn-01"`).
This second class is unrelated to the worktree/`.git`-sharing mechanism `c268983`
fixes — it is a plain in-tree fixture-data false positive, since fixed
separately by commit `12c7943` (briefing:
`specs/2026-07-24-sprint-cyborg-epic/briefing-gitleaks-in-tree-fixture-fp-fix.md`),
which renamed the triggering literals (no assertions/behavior changed).
Independently verified post-`12c7943`: a direct `gitleaks detect --no-git`
run and a full `security-scan.mjs` run both report zero findings in these
two files (the only residual "finding" during verification was a stray
untracked scratch file quoting the old literal value in prose — irrelevant to
any committed candidate tree).

**Net effect:** the security gate genuinely is clean on this branch as of
`12c7943`, but was NOT yet clean at `bab3425`'s time despite that commit's
claim — the "0 findings" evidence in the Resolution above should be read as
describing the state after `12c7943`, not after `bab3425`. `bab3425` itself
should have disclosed the residual 4 findings as a known, separate, then-open
issue rather than reporting a clean gate.

**Housekeeping note (not yet acted on):** `.gitleaksignore`'s "Equivalent
exact fingerprints for the current worktree scanner mode" block (entries for
`review-economy.test.mjs:278` and `continuity-state.test.mjs:628/690/715`)
is stale — those line numbers no longer correspond to anything gitleaks
flags on this branch (superseded by `12c7943`'s fixture rename, which fixed
the finding at the source rather than via ignore-fingerprint suppression).
These entries are now inert dead weight, not a live suppression relied upon by
anything verified in this item. Left untouched here (out of scope for this
correction); a future cleanup pass may remove them.
