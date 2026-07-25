---
schema: pipeline.backlog-item.v1
id: pipeline.security-scan-cross-branch-gitleaks-findings
type: observation
owner: pipeline
status: open
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
