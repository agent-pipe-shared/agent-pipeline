# WIN-GES-D2: diagnosis of the native reds left after the win32 lock fix (2026-10-09)

Status: **PARTIAL, diagnosis by source reading plus the WIN-GES-F2 captures. No new probe was run.** The dispatch
reached its 80 % tool checkpoint (hook-counted call 36 of 45) before the one-call probe described in section 5 could
be written, so the dispatcher's checkpoint rule applied: stop, commit what is green, hand back. Every claim below
carries an evidence tier:

- **M** = measured, quoted from the WIN-GES-F2 captures `evidence/WIN-GES-F2-20261009/native-store-after.txt` (cited as
  `store:<line>`) and `native-ceremony-after.txt` (cited as `ceremony:<line>`).
- **R** = read from source, `file:line`.
- **I** = inferred (an argument from R and M, not yet observed). Each I item has its discriminating probe in section 5.

Host facts are described, not quoted: no host drive letters or user paths appear in this tracked file.

## 1. Classification at a glance

| # | Red | Fault | Real win32 user bitten? | Proposed slice |
|---|-----|-------|------------------------|----------------|
| 1 | `signing-ceremony.test.mjs:328` (assertion :349) | **Product** (guard fails open) | **Yes**, whenever the plugin and the repository sit on different drive volumes | S1, production, GUARDRAIL class |
| 2a | `governance-event-store.test.mjs:1100` | **Test** (fixture never builds a private directory) | No (designed fail-closed refusal) | S5, test-only |
| 2b | `:1307`, `:1332` | **Product** (POSIX mode predicate on win32) | **Yes**, every existing-v2 observation refuses | S2, production |
| 3a | `:1247` | **Test/host** (POSIX mode simulated on a win32 host) | No | S4, test-only typed probe skip |
| 3b | `:530`, `:814`, `:897`, `:1012`, `:1320` | **Host** (symlink privilege), test lacks the probe | No | S3, test-only typed probe skip |

## 2. Item 1: the ceremony drift case admits an unrelated commit on win32

Observed (M): the case fails with `Missing expected rejection` at the assertion on `signing-ceremony.test.mjs:349`
(ceremony:76-87); the other four ceremony tests pass (ceremony:60-64). `GMW-CANDIDATE-COMMIT-MISMATCH` is raised only
when `intervenedCommitsStayWithinScope` returns false (`plugins/pipeline-core/lib/guard-maintenance-window.mjs:1504-1511`),
so on win32 it returned **true** for a commit adding only `unrelated.txt` under a `--scope GS-6` window (R:
`signing-ceremony.test.mjs:342-344,355`).

**Elimination (I, strong): every candidate the briefing named can only move this function toward `false`.** Reading
`guard-maintenance-window.mjs:1379-1428` end to end, each step either returns `false` on any irregularity or is reached
by a value that cannot make a wrong commit look in-scope:

- CRLF in git output: lines are split on `\n` and `trim()`med (:1389, :1414), which removes a trailing `\r`; the diff
  row must split on tab into exactly 2 fields with status `A`/`M`/`D` (:1418-1419), else `false`. CRLF therefore fails
  closed, never open. `core.autocrlf` is demonstrably active on the test host (M: the `LF will be replaced by CRLF`
  warnings for `README.md`, `plan.md`, `spec.md`, `unrelated.txt` and the governance JSON files, ceremony:8-10, 40-48)
  and the case still reached an admission, so it is not what flips the result.
- Git binary or path separators in git output: `--name-status` prints repo-relative paths with `/`; `resolve(root, rel)`
  (:1422) normalises them. Any parse oddity returns `false` (:1427 catch).
- The frozen-pattern check (:1401-1403) and the merge/root-commit check (:1410) also only return `false`.

So admission requires `pathWithinScope(...)` (:1423) to return true for `unrelated.txt`. With a GS-6-only scope the only
true branch is `scopeRuleIds.includes("GS-6") && normalizeRepoRelativePath(livePluginRoot, absolutePath) !== null`
(:1352), after `isNeverLiftableKernelPath` (:1351, :752-761) returned false.

**Root cause (I, high confidence): `normalizeRepoRelativePath` (`guard-maintenance-window.mjs:736-744`) treats a path on
a different drive volume as inside the anchor.** It computes `rel = relative(root, absolute)` and rejects only
`rel === ""`, `rel === ".."` or a `rel` starting with `..` plus the separator (:742). Node's `path.win32.relative(from, to)`
returns `to` unchanged (an absolute path, with no leading `..`) when the two paths have different roots. That value passes
the :742 test, is returned lower-cased (:743) as non-null, and :1352 reads it as "under the live plugin root". The exact
line is **:742**; the observed value I expect is the absolute, volume-qualified path of `unrelated.txt` in place of
`null`. `livePluginRoot` here is the CLI's own module location (R: `plugins/pipeline-core/scripts/guard-maintenance-window.mjs:109-111`,
`livePluginRoots()[0]`), i.e. the checkout, while the fixture repository is created under `os.tmpdir()`
(R: `signing-ceremony.test.mjs:157-158`), which on this host is on a different volume from the checkout (host fact from
the dispatch environment). Under WSL both live under one root, `relative()` yields `..`-prefixed output, and the case
passes (F2 record, WSL 93/93).

Fault class: **product**. The tolerance path is documented as "a POSITIVE, narrow proof" that "fails closed on ANY
uncertainty" (:1361-1378); a cross-volume path is exactly an input it must refuse. Real-user impact: **yes.** Any win32
install where the plugin tree (for example under the user profile) and the governed repository are on different drives
makes `intervenedCommitsStayWithinScope` accept a commit that touches files **outside** the window's signed scope, so
the drift binding between `prepare` and `install` silently widens. The fixed `isNeverLiftableKernelPath` list stays
effective for in-project paths (project-relative check), so this is a fail-open of the scope proof, not an arbitrary
write grant.

Proposed slice **S1** (production, GUARDRAIL class, so MP-07 design-tier route at `max`; QG-04 forces a test-only
dispatch first):
- File: `plugins/pipeline-core/lib/guard-maintenance-window.mjs:736-744`; add `isAbsolute(rel)` to the rejection
  condition (after `relative`), so a result that is still absolute (different root) returns `null`.
- RED pin must be **deterministic and host-independent**; the existing `signing-ceremony.test.mjs:328` is NOT such a pin
  because it is red only when the temp directory and the checkout sit on different volumes. Pin instead through a
  `pathApi = path` parameter (default `node:path`) on `normalizeRepoRelativePath` plus an exported test hook, called
  with `path.win32` and two synthetic paths whose roots differ (a plugin directory under one volume root, a file under
  another): expected `null`, currently the lower-cased absolute path. Add the same pair through
  `isNeverLiftableKernelPath` and a `pathWithinScope` GS-6 case.
- Follow-up sweep (not done here): other containment checks built on `relative()` without an `isAbsolute` guard.

## 3. Item 2: the store's remaining reds

### 2a. `:1100` GES-RESTRICTED-WINDOWS-ASSURANCE (test fault)

M: `Restricted storage Windows DACL assurance is insecure.` (store:136), thrown at `governance-event-store.mjs:232`
through `assertRestrictedRoot` called from `planRestrictedGovernanceOperation` (store:137-140). R: the helper's own
contract (`governance-event-store.mjs:207-217`): a freshly created root is **hardened**, a pre-existing one is only
**assessed**. The test creates its restricted root with a bare `mkdtemp` under `os.tmpdir()`
(`governance-event-store.test.mjs:1102`) and never hardens it, then passes it as an existing root (the plan call at
:1119 reaches `assess`, :231). A fresh subdirectory of the user temp directory inherits the profile ACL, which the
owner-private evaluator reports `insecure` (the status string is M; the specific offending ACE was not inspected, I).
Production behaves as designed (refuse a pre-existing non-private root). Real win32 users are not bitten when the root is
provisioned through the `create: true` route; a pre-existing inherited-ACL directory is refused, correctly.

Slice **S5** (test-only, `governance-event-store.test.mjs:1102`): build the restricted fixture through the existing
private-directory helper (`plugins/pipeline-core/lib/test-private-tmp.mjs`, which already imports
`hardenWindowsPrivateDirectory`) or call `hardenWindowsPrivateDirectory(restrictedRoot)` on win32 right after the
`mkdtemp`. RED pin: the test itself (red natively now, for this reason). Condition: confirm by probe that `harden`
returns `secure` on that directory (section 5); if it does not, use a typed probe skip instead.

### 2b. `:1307` and `:1332` GES-EXISTING-REPOSITORY-BINDING (product fault)

M: both end at `unavailable()` (store:157-167, 187-197), reached from the catch-all at
`governance-event-store.mjs:930`. That catch-all is why the cause read as "unknown": it swallows which predicate
failed. R: the success path needs `validFile` to hold (:900-902), and that predicate includes
`(value.mode & 0o022n) === 0n` (:901). On native win32 Node synthesises regular-file mode as `0o666`/`0o444` (there are
no POSIX bits), so `mode & 0o022` is non-zero for every file and `validFile(before)` is false at :905, hence
`unavailable()` for **every** existing-v2 binding. The test fixture seeds `mode: 0o600` (test:1294), a POSIX request
win32 ignores. (I, high confidence by R; the remaining predicates `nlink === 1n`, size, `realpath`, the `same(...)`
lstat-versus-fstat comparison at :903-908 are unprobed and could in principle also bite, so the probe in section 5
prints each predicate separately.)

**Corollary (I): four passing native tests pass vacuously.** The refusal cases at `:1298`, `:1302`, `:1312`, `:1328`
assert only `error.code === 'GES-EXISTING-REPOSITORY-BINDING'` (test:1297), which a binding that can never validate
satisfies for the wrong reason on win32. A green native count there is not evidence the refusal logic works.

Fault class: **product**. Real-user impact: **yes** (on native win32 the read-only admission accessor
`readExistingLocalRepositoryFingerprint` can never return a fingerprint). Proposed slice **S2** (production, QG-04
test-first): `governance-event-store.mjs:900-902`, skip the POSIX mode and uid terms on win32 exactly as :225-227 already
does for the restricted root, and replace them with the DACL assessor (`assessWindowsPrivatePath`, as :228-232) so
the group/other-writable refusal is not simply dropped on win32 (a tamper vector). RED pin: `:1307` and `:1332`
natively, which are deterministic on win32, after the probe confirms `:901` is the **sole** failing predicate;
otherwise the pin goes red for another reason. Add a positive-observation assertion to the vacuous refusal cases so
they cannot pass for the wrong reason.

## 4. Item 3: `:1247` and the five symlink cases

### `:1247` (POSIX mode check on win32): test/host fault, confirmed class

M: `GES-RESTRICTED-PERMISSIONS` at `governance-event-store.mjs:226` (store:146-155), triggered from the test call at
`governance-event-store.test.mjs:1252`. R: the test injects `platform: "linux"` (:1253) so the store applies the POSIX
check (:225), but `metadata.mode` still comes from the real `stat` of a real win32 directory (:223), which reports
non-zero group/other bits. The seam simulates the platform, not the file system. Production is unaffected (the
`io.platform` seam is test-only; a real win32 host takes the DACL branch, :228). Slice **S4** (test-only): a **probe
skip**, not a platform check: after `chmod(restrictedRoot, 0o700)`, stat the directory, and skip with a typed reason
(for example `POSIX-MODE-UNREPRESENTABLE: ...`) only when `(mode & 0o077) !== 0` still holds. RED pin: the test itself
(red natively now).

### Five symlink EPERM cases: host fault, confirmed class

M: `EPERM: operation not permitted, symlink ...`, `errno: -4048`, `syscall: 'symlink'` at store:80-86, 94-100,
108-114, 122-128 and 171-181 (the four earlier cases and `:1320`); the test line numbers are those of Ruling 138
(`:530`, `:814`, `:897`, `:1012`, `:1320`), whose `test at` headers were not re-read here. Windows withholds symlink
creation without the privilege; this is setup in the test, not product behaviour. Real win32 users are not bitten.
Coverage gap to state honestly: with the privilege withheld, the product's symlink-refusal code (for example
`assertNoSymlinkAncestry`, `governance-event-store.mjs:196-205`) is never exercised natively.

Typed-skip form used elsewhere (R): `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs:58-77`. The attempt
is the probe and there is no platform check: `SYMLINK_EPERM_SKIP_REASON = "SYMLINK-EPERM: symlinkSync was refused with
EPERM on this host; the assertions that need the symlink were not run"`, and
`symlinkOrSkip(t, target, linkPath, type)` calls `symlinkSync`, on `error?.code === "EPERM"` calls
`t.skip(SYMLINK_EPERM_SKIP_REASON)` and returns `false`, rethrows any other error, returns `true` on success.
`rg -n "SYMLINK-EPERM" plugins/pipeline-core/scripts plugins/pipeline-core/lib` finds it in that one file only, so
**S3** (test-only, `governance-event-store.test.mjs`) copies the helper into the store test file. Two cautions for the
fix slice: `t.skip()` does not stop the running body, so the caller must `return` on `false`; and `:1320` interleaves a
symlink with hard-link and writable-mode assertions, so split it so the non-symlink assertions still run.
Unknown: each of the four earlier cases may hide further win32 reds behind the EPERM that setup never reaches, which
is why S3 should land together with a re-run, not be taken as a proof the file is then clean.

## 5. What this dispatch did NOT verify, and the one-call probe that closes it

Not run: any native probe. Open, all tier I:
1. `path.win32.relative` cross-volume value and `normalizeRepoRelativePath` result (item 1).
2. Which `validFile` predicate fails on win32 (2b), including the lstat-versus-fstat `same(...)` comparison.
3. `harden` result on a fresh temp subdirectory (2a), and the specific ACE behind `insecure`.

A single scratch script under `scratch/` (never a tracked file), run once through
`node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/WIN-GES-D2-20261009/probe.txt --label probe -- node scratch/<probe>.mjs`,
answers all three: (a) a verbatim copy of `normalizeRepoRelativePath` called with the live plugin root and a path
under the temp directory; (b) stepwise `lstat`/`open`/`fstat` predicate printout against a seeded binding file;
(c) `assessWindowsPrivatePath` before and `hardenWindowsPrivateDirectory` after on a fresh `mkdtemp` directory.
Two further native runs belong in the same follow-up: the ceremony drift case once with the temp environment variables
pointing at the checkout's own volume (a discriminating run: the case should then reject as expected, which proves the
cross-volume cause), and the targeted `--test-name-pattern` runs for the four non-symlink store cases.

## 6. Suggested dispatch order

1. Probe (above), diagnosis only, about 6 tool uses.
2. S3, S4, S5 (test-only, one file, `governance-event-store.test.mjs`) as one WIN-SKIPS-class slice.
3. S1 and S2 each as a RED-pin dispatch first, then the fix dispatch (QG-04). S1 is GUARDRAIL class: design-tier route.
