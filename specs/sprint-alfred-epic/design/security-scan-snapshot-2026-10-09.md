# Security-scan snapshot: design note (Ruling 107, toil T32)

Dispatch `TR-I-S-D2-20261009`, 2026-10-09, candidate `feat/sprint-alfred`. Source: the measured record
`evidence/dispatch-record-TR-I-S-D-20261009.json` (`measuredMap`, `proposedAnswers` s1-s7, `stopConditionVerdict`). All
file:line references are the record's; no code was re-read. Ruling 107: `specs/sprint-alfred-epic/plans/0.7-execution-order.md:1038-1045`.
Toil row T32: `toil-resolution-2026-10-08.md:140` (`git archive` ruled).

Purpose (pin header `security-scan-snapshot.test.mjs:7-10`): a security scan for the DoD of a slice, run on a dirty shared
tree, without producing push-grade evidence.

## 0. Decisions

1. **Mechanism: `git archive` of the pinned commit OID, as ruled.** The detached-worktree alternative (reuse
   `materializeCandidate` `security-scan.mjs:437-454` with the clean precondition `:438` relaxed) was rejected: it is the
   smaller diff and `observeCandidate` would verify for free, but every parallel DoD scan would register in the shared
   `.git/worktrees` and show up in `git worktree list`. CLAUDE.md treats that list as a load-bearing isolation signal, so
   snapshot scans would emit a false one. Archive also runs no post-checkout hooks and writes nothing into `.git`.
2. **Snapshot evidence never satisfies any gate.** It is written to separate files `evidence/security-snapshot-latest*.json`
   (not the `security-latest*` names at `security-scan.mjs:1059`, `:1075-1076`), and `candidate.status: "snapshot"` is a
   new value, never `clean` and never `dirty`. Gates whose contract admits snapshot evidence: none
   (`guardrails/security.md:47` SEC-06, `:49`). No gate code changes.
3. **PO-level alternative, NOT proposed:** push/Close admitting snapshot evidence. Touch points the record lists: SEC-06
   wording (`guardrails/security.md:47/:49`); `guard-push.mjs:2251/:2260`; the kernel file
   `release-promotion-envelope.mjs:66` (`lib/guard-maintenance-window.mjs:487`).

Stop-condition verdict from the record: not triggered. T32's purpose is the DoD scan (pin header `:7-8`), and snapshot
evidence stays out of every gate by path and by status.

Open for the Elephant (not a record contradiction): the record flags that the cheaper worktree option was rejected for
registry/isolation reasons the Elephant may weigh differently. The decision above follows the ruling and the record.

## 1. Mechanism

- Resolve the pinned commit OID `C` (never the name `HEAD`), extract `git archive C` into a fresh `mkdtemp` directory
  outside the repo (current temp creation: `security-scan.mjs:440`).
- Extract in-process with a Node tar reader that writes only paths present in the `ls-tree` inventory and rejects any
  typeflag other than regular file, directory or pax header, and any unsafe path segment.
- Scanner needs: license-check reads files from the scan root only (`security-scan-snapshot.test.mjs:30-32`); gitleaks runs
  `detect --no-git` (`security-adapters/gitleaks.mjs:415-419`), so it needs no `.git`; its coverage text at `:560` names
  `git-detached-worktree.v1` and must become method-neutral. osv (`osv-scanner.mjs:236`) and semgrep (`semgrep.mjs:172`)
  take the root as an argument; their target selection without `.git` is **UNMEASURED**.
- Hazard: a tmpdir inside another git repo (for example a dotfiles home) makes git discovery select the parent repo and
  collapses coverage. Requirement: the scanner environment sets `GIT_CEILING_DIRECTORIES` to the extract's parent, with the
  realpath resolved first (macOS `/private` symlink). **UNMEASURED** until slice T3.
- Hazard: committed, force-added or gitignored files must not be dropped by the extraction. **UNMEASURED** until T3.
- Cleanup removes the temp directory; failure sets `execution.snapshotCleanup = retained` (shape as `:456-461`, `:460`) and
  is a non-blocking diagnostic.

## 2. Identity binding

`observeCandidate` (`security-scan.mjs:358-383`) cannot bind an extract with no `.git`. Replacement proof:

- `C = rev-parse --verify HEAD^{commit}`, `T = C^{tree}`, inventory = `ls-tree -r -z --full-tree C` (the `:362` shape, by
  OID), with the same refusals as `inspectInventory` (`:337-351`: symlinks `:344`, submodules `:345`, NFKC/lowercase
  aliases `:333-348`).
- (a) **Set equality:** the extract's file set equals the inventory path set exactly (lstat walk; any symlink, extra or
  missing file is a mismatch).
- (b) **Re-hash:** every file hashes to its inventory blob id through ONE `git hash-object --stdin-paths` process with the
  work tree set to the extract. That applies git's clean conversion, so `eol=crlf` files (`.gitattributes:13-14`)
  round-trip; raw in-process hashing would fail on them. That archive output round-trips for this repo is **UNMEASURED**.
- (c) The proof runs **before** the scanners and **again after** them.
- (d) The repo's `HEAD` still resolves to `C`, and `C^{tree}` to `T`, after the scan.
- `inputSha256` = sha256 of the `C` inventory (the `:378` semantics); `repositorySha256` as in `:371-373`.

## 3. Evidence shape

Current shape: `candidate` and `verifiedBeforeAfter` at `security-scan.mjs:1020-1026`.

- `candidate.status = "snapshot"`. `clean` is rejected because `release-promotion-envelope.mjs:66` and
  `clean-candidate-run.mjs:130` check status, commit and tree without the method, so that label would let snapshot evidence
  through. `dirty` is rejected because it today means refused or uncertain (`:381`, pin 2).
- `candidate.workspace = {status: clean|dirty, reason}`, from `observeCandidate(rootDir)` before the scan. Dirty is
  recorded as the workspace's state, not the candidate's.
- `candidate.snapshot = {method: "git-archive.v1", verifiedBeforeAfter, contentProof: "git-hash-object-inventory.v1"}`.
- **Snapshot meaning of `verifiedBeforeAfter`:** proofs (b), (c) and (d) of section 2 held. It never means the workspace was
  clean.
- `candidateUncertain` in snapshot mode = `!verifiedBeforeAfter`. This replaces the shared-tree cleanliness requirement at
  `:1002-1007` (`:1003-1006`). Result: pin 1a exits 0; pin 1b exits 2 through the finding.
- Top-level `evidence.commit` must be `C`, not the late `resolveCommit(rootDir)` re-read at `:1037` (see section 6).

## 4. Admission

Writers: snapshot mode writes `evidence/security-snapshot-latest.json` plus `.v2.json` and `.v2.verdict.json`, and never the
default names (`:1056-1059`, `:1075-1076`). Reasons: no gate reads those names; parallel DoD scans cannot overwrite
push-grade evidence; the v2 envelope is a closed schema validated by the kernel evaluator
(`security-evidence-evaluator.mjs`, gmw `:306`), so it cannot carry a mode discriminator and is separable only by path.

Defence in depth if the v1 file is copied to the default name:

| Reader | Check that refuses it |
|---|---|
| `guard-push.mjs` | status must be clean `:2251`; method and `verifiedBeforeAfter` `:2260` |
| `release-promotion-envelope.mjs` | path equals the default `:59`; status `:66` |
| `clean-candidate-run.mjs` | status/commit/tree `:128-133`; `validateSecurityEvidence` method `:147/:151` |

**Residual risk (QG-06).** If someone copies the snapshot v2 files to the default names, `security-completeness-gate.mjs`
binds only `input.commit` and `input.tree` (`:217-222`, default paths `:85-86`) with no clean or method notion. A push still
fails on v1, because `guard-push` pairs v1 and v2 (`:2357`, `:2366`). But Close (`check-close-security-completeness.mjs:67`)
and `release-version-plan.mjs:563` read v2 only.
- Owner: Elephant (TR-I-S slices).
- Expiry: before the 0.7.0 candidate stamp.
- Mitigation slice: the v2 evidence carries the snapshot method, and both readers (`:67`, `:563`) refuse it. Neither reader is
  in `NEVER_LIFTABLE_KERNEL_PATHS` per the record's rg result; `security-completeness-gate.mjs` itself is (`:305`), so the
  refusal goes in the two callers, not in the gate. The kernel placement of the callers is **UNMEASURED** (the record did
  not check them).
- Accepted baseline: evidence files are agent-writable and only self-hashed, so deliberate forgery is no easier than today.

## 5. Failure modes and typed refusals

Each is a typed ERROR with classification `candidate_snapshot` (as `:915/:931`), giving exit 2 under a blocking gate.

| Code | Trigger |
|---|---|
| `snapshot-temp-unavailable` | temp dir cannot be created (exists, `:440`) |
| `snapshot-archive-failed` | archive exits non-zero or times out |
| `snapshot-extract-entry-rejected` | entry not in the inventory, non-regular typeflag, or unsafe path |
| `snapshot-content-mismatch` | path-set or blob-id mismatch before the scan; covers `export-ignore`/`export-subst` repos (this repo has none, `.gitattributes:2-16`) |
| `snapshot-mutated-during-scan` | the after-proof fails |
| `snapshot-head-moved` | `HEAD` or `HEAD^{tree}` differs afterwards |

Plus the existing inventory refusals (`:344-347`). Child EPERM is already typed (`:463-469`).

## 6. Slice plan

QG-04: each T slice is test-only and committed RED; its F slice never edits it. Table shape follows
`adr-0085-removal-2026-10-08.md` §5. Kernel column: per the record, `security-scan.mjs`, `guard-push.mjs`,
`clean-candidate-run.mjs` and the `security-adapters` are not in `NEVER_LIFTABLE_KERNEL_PATHS`
(`lib/guard-maintenance-window.mjs:124`..`:728`). TP per `templates/prompts/agent-obligations.md:91-103`.

| # | Slice | Module / file(s) | TP-1..13 | Kernel | Class |
|---|---|---|---|---|---|
| 1 | T1 binding + shape pins: export-subst mismatch fixture; HEAD moved via injected seam; scanner mutating the extract; status `snapshot`, workspace dirty, method, evidence path | new `scripts/security-scan-snapshot-binding.test.mjs` | none | no | high (S), goldfish-deep |
| 2 | T2 admission pin: snapshot evidence at the default path is refused by guard-push | new `hooks/guard-push-snapshot-admission.test.mjs` (not `guard-push.test.mjs`, which is TP-5) | none | no | high (S) |
| 3 | T3 scanner targeting: semgrep and osv without `.git`; tmpdir inside a git repo; force-added ignored file; LFS decision; env-gated on real binaries | new test | none | no | medium |
| 4 | F1 snapshot mode | `scripts/security-scan.mjs` | none | no | high (S) |
| 5 | F2 CLI `--scan-mode` (separate dispatch; `parseArgs` throws on unknown flags, `:1131-1147`) | `scripts/security-scan.mjs` | none | no | medium |
| 6 | F3 method-neutral coverage text; check pins `gitleaks.test.mjs:83-87` | `security-adapters/gitleaks.mjs:560` | none | no | medium |
| 7 | F4 `GIT_CEILING_DIRECTORIES` in the scanner env, per the T3 result | scanner env | none | no | medium |
| 8 | R register `security-scan-snapshot*.test.mjs` | `harness/scripts/verify.mjs` (TP-3) or `harness/verify-suites.json` (TP-13) | TP-3 or TP-13 | no | not a Goldfish slice; PO/author route together with the fix (Ruling 107) |
| 9 | D one sentence in SEC-06: snapshot evidence is DoD-grade only (plus plugin mirror) | `guardrails/security.md:47/:49` | none | no | low |
| 10 | M mitigation (section 4): v2 evidence carries the snapshot method; both readers refuse it | `check-close-security-completeness.mjs:67`, `release-version-plan.mjs:563`, v2 builder | to check per target | to check per target | medium; owner and expiry per section 4 |

Slice 10 is added to the record's list (the record states the residual risk but names no slice); its TP and kernel status
must be checked per target before dispatch. Test-first applies: a T pin for slice 10 precedes it.

**Code findings F1 must fix (both in the record):**
- `sourceCapabilityPlan(rootDir, ...)` (`security-scan.mjs:780`) reads `governance/security-controls/catalog.json` from the
  SHARED root (`:631`) and runs after cleanup (`:1032` before `:1071`). In snapshot mode it must read the catalog from the
  extract and run **before** cleanup. (`buildSecurityEvidenceV2` `:757-816`; `candidateUncertain` poisons every capability
  `:803-805`; `input.commit/tree/inputSha256` `:813`.)
- The top-level `evidence.commit` is `resolveCommit(rootDir)`, a late HEAD re-read (`:1037`). In snapshot mode it must record
  the scanned commit `C`.

## 7. Platform matrix

Axes: runner Claude / Codex / agy x OS Windows / WSL / macOS x repo own / user.

| Axis | Statement |
|---|---|
| Windows | `core.autocrlf` and `.gitattributes eol=crlf` (`:13-14`) shape archive output; the hash-object round-trip covers both (**UNMEASURED**). In-process Node writes avoid MAX_PATH via libuv long paths (**UNMEASURED**); a worktree would need `core.longpaths`. Reserved names and trailing-dot/space aliases are refused as unsafe paths, extending `:333-348`. |
| WSL | Extract goes in Linux tmp. `hash-object` speed on a repo under `/mnt/c` is **UNMEASURED**. The git that archives also hashes, so config is consistent. |
| macOS | APFS is case-insensitive, covered by `:333-348`. Tmpdir sits behind the `/private` symlink: resolve the realpath before setting ceiling dirs. |
| Claude | The scan's git calls run inside a node child, outside the Bash guard grammar. |
| Codex | Sandbox may make `.git` read-only (**UNMEASURED**). Archive only reads `.git`, which favours it. Child EPERM is already typed (`:463-469`). |
| agy | **UNMEASURED**; same Node and git contract assumed. |
| Own repos | This repo has no `export-ignore`/`export-subst` (`.gitattributes:2-16`). |
| User repos | `export-ignore`/`export-subst` gives a typed refusal (`snapshot-content-mismatch`), never a silent one. |
| git LFS | archive smudge and the `hash-object` clean filter writing into `.git/lfs` are **UNMEASURED**; T3 decides whether LFS repos are refused. |
| Submodules, symlinks | already refused (`:344-345`). |

Unmeasured, to be closed by slices: semgrep and osv without `.git`; Codex read-only `.git`; Windows long paths; git LFS;
archive/hash-object round-trip; agy; WSL `/mnt/c` speed.
