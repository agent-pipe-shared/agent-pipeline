# Tranche 1 manifest - what the signed package contains and what is missing (TRANCHE1-PREP, 2026-10-08)

Inventory only (research, no design). Inputs: `README.md` and `ceremony-route.md` section 5 (this directory),
`../plans/0.7-execution-order.md` (route paragraph and ruling 12), `git status`/`git diff --cached --stat` at HEAD
`326e3a07a` plus the staged ENVDUMP-F entries. Route: ONE signed quality package, base = HEAD at build time.

## 1. Slices planned for tranche 1

### 1.1 ENVDUMP-F wiring
- Paths: `plugins/pipeline-core/lib/guard/env-dump-lane.mjs` (new), `plugins/pipeline-core/lib/guard/evaluate.mjs`.
- Content today: staged index entries (`git diff --cached --stat`: env-dump-lane.mjs +312, evaluate.mjs +6) AND the patch
  `envdump-f.patch` in this directory. Two copies; the build must start from one and check the other matches.
- Pinning test: `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`, cases `ENVDUMP: <agent|main> <tool> <command>`
  and `ENVDUMP: control ...` (ENVDUMP-T2, committed in `069813bf3`; 36/36 with the patch applied, `evidence/envdump-f.txt`).
- Status: ready (content exists, test committed). Build step must reconcile staged entries vs patch.

### 1.2 Verify suite registrations
- Paths: `harness/verify-suites.json` (TP-13), `harness/scripts/verify.mjs` (TP-3).
- Content today: not yet authored. `git grep` of the two files finds no registration for any of the suites below.
- Suites to register (test files all exist and are tracked, so each has a committed pinning test file):
  - `plugins/pipeline-core/lib/test-private-tmp.test.mjs`
  - `plugins/pipeline-core/lib/scratch-retention.test.mjs`
  - `plugins/pipeline-core/scripts/scratch-sweep.test.mjs`
  - `plugins/pipeline-core/lib/design-consistency-check.test.mjs`
  - `plugins/pipeline-core/lib/design-review-receipt.test.mjs`
  - `plugins/pipeline-core/lib/design-approval-binding.test.mjs`
  - README also lists "Q11/T33": the two Q11 suites (`hardened-private-directory-install-tests`,
    `gitleaks-repair-ignore-cli-tests`; execution order line 474: migrate to the case-completion protocol, expiry 2026-10-20).
    The execution order line 520 says they are registered "without the two Q11 suites until the PO decides Q11"; I did not
    find the PO decision or the migrated test files in what I read. T33 has no definition in the files read.
- Status: needs authoring (six suites); Q11/T33 part needs decision (is the Q11 migration done and in scope for tranche 1?).
  Also unknown: whether `verify.mjs` needs any edit beyond `verify-suites.json` (not determined).

### 1.3 R7-6-P (pipeline-state protected parts)
- Scope (README row, `plans/r7-6-multi-key-aa.md`, ruling 12): approve-push anchor checks (AA G2/G3); the local push scratch
  route reading the machine plane through `resolvePoKeyDirectory` with the pair check (closes Critic delta-1 F-1,
  `evidence/critic-2026-10-07/r7-6-delta1.md`); the `set-po-key-directory` catalogue entry.
- Content today: not yet authored.
- Pinning tests: the production side of `set-po-key-directory` is pinned by `R7-6k` cases in
  `plugins/pipeline-core/scripts/po-human-approval.test.mjs` (committed); `R7-6j` in `push-prepare.test.mjs` /
  `toolchain-preflight.test.mjs` (committed). Test-list item 10 of `plans/r7-6-multi-key-aa.md` (line 70: local push scratch
  route with a plane-only default accepts B) belongs in `harness/scripts/pipeline-state.test.mjs` (TP-5); I found NO test with
  an R7-6 label there by name (grep), so a committed pin for the scratch route/approve-push anchor is not confirmed.
  Execution order says R7-6-T15/T15b and delta 2 after R7-6-P and F8 - check these.
- Status: needs authoring; pin for this slice unconfirmed (author must confirm or request a test-only dispatch first).

### 1.4 Other slices named in the README (not named for tranche 1 in the execution order paragraph read)
R1 catalogue, R7-11e `hooks.json`, decision K/Q lanes, A-S3/C-S4 catalogue, ADR-0085 P0-P9 protected slices: all
"to author" per README. Whether they belong to tranche 1 is not stated in the sections read: needs decision. `hooks.json`
is untested as a package member (ceremony-route 5.1).

## 2. pipeline-state target (R7-6-P)
Decided from source: the package target is `plugins/pipeline-core/scripts/pipeline-state.mjs`.
`harness/scripts/pipeline-state.mjs` is a re-export shim (it only does `export * from ".../plugins/pipeline-core/scripts/pipeline-state.mjs"`
and `import { run }` from it); `repoScopedPushKeyAnchor` is defined at line 4513 of the plugin file and has no match in the
harness file. `set-po-key-directory` and `resolvePoKeyDirectory` have no match in either `pipeline-state.mjs` today. Note:
Critic delta 1 cites the harness path with the same line numbers, which is the shim path; and the ceremony-route.md row 18
note (PB-SANCTIONED-WRITER names the plugin path) agrees with the plugin target. Residual risk: that is a source-read
conclusion; the dispatcher should confirm before the author starts.

## 3. Readiness table

| Slice | Paths | Content location | Pinning test | Status |
|---|---|---|---|---|
| ENVDUMP-F | `lib/guard/env-dump-lane.mjs` (new), `lib/guard/evaluate.mjs` (under `plugins/pipeline-core/`) | staged index + `envdump-f.patch` | `guard-lifecycle-ready.test.mjs` `ENVDUMP:*` (committed `069813bf3`) | ready |
| Verify registrations (6 suites) | `harness/verify-suites.json`, `harness/scripts/verify.mjs` | not authored | the six `*.test.mjs` files above (committed) | needs authoring |
| Q11/T33 registrations | same two files | not authored | Q11 migrated tests: not located | needs decision |
| R7-6-P | `plugins/pipeline-core/scripts/pipeline-state.mjs` | not authored | R7-6k/R7-6j committed; scratch-route/approve-push pin in `harness/scripts/pipeline-state.test.mjs` not confirmed | needs authoring |
| R1, R7-11e, K/Q lanes, A-S3/C-S4, ADR-0085 | per README | not authored | unknown | needs decision (in tranche 1 or later) |

## 4. Preconditions before build (ceremony-route section 5.2/5.3)
1. Clean tree: `git status --porcelain` at `apply` must be empty, and the build script needs a clean tree.
2. HEAD = `baseCommit`; any later commit (including docs, and this manifest's own commit) forces a rebuild.
3. Index exactly the package paths with exact blob sha256 and mode at commit; nothing else staged.
4. Unprotected work lands as ordinary commits first; `project/critical-human-proof.json` must stay clean/unchanged.
5. Builder: no tracked builder; reuse `evidence/qp-d6d2a8b2/build-intent.mjs` retargeted (needs GNU `patch -p1`).
6. PO-run: `sign-intent`, materializer `apply`, `authorize-commit`; commit trailer `Dispatch: quality-package-<sha256> (integration)`.

Dirty at this inspection (`git status --porcelain`, once):
- ` M .claude/settings.json` - unrelated; must be committed or reverted by its owner before the build (config surface).
- `A  plugins/pipeline-core/lib/guard/env-dump-lane.mjs`, `M  plugins/pipeline-core/lib/guard/evaluate.mjs` - the ENVDUMP-F
  package paths themselves; these are the staged entries that the package will replace (they must be unstaged/reset to HEAD
  before `apply`, since `apply` needs an empty status and the patch re-creates them).
- ` M plugins/pipeline-core/lib/project-uninstall.test.mjs` - unrelated unstaged edit; commit or discard first.
- ` M specs/sprint-alfred-epic/plans/0.7-execution-order.md` - dispatcher's live edit; commit first.
- (This manifest, once committed by TRANCHE1-PREP, is a new commit and moves HEAD.)
