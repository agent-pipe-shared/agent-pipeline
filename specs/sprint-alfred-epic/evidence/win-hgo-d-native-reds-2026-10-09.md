# WIN-HGO-D: native human-guard-override reds, classification (diagnosis only)

Dispatch: WIN-HGO-D-20261009. Candidate: f06975126. No source or test file was edited.

## Evidence basis and limits

- Primary basis: `evidence/T90-T2-20261009/native.txt` (25 failures across `plugins/pipeline-core/lib/human-guard-override.test.mjs` and `plugins/pipeline-core/scripts/guard-human-override.test.mjs`; run head 8c5c4cd5).
- The requested fresh run `evidence/WIN-HGO-D-20261009/native.txt` was NOT produced: the whole-file native run (`capture-evidence.mjs ... node --test plugins/pipeline-core/lib/human-guard-override.test.mjs`) passed the 10-minute stop condition (single passing cases take 15-60 s each) and was moved to the background without output. Stop condition 1 of the briefing fired; classification below rests on the T90 capture plus reading the test and product lines named.
- Consequence: whether the 4 intended T90 pins are green after T90 landed is NOT verified here.
- The 21 "pre-existing" reds split as 20 in the lib test file and 1 in the script test file (line 786 of the capture).

## Classification

Class T = test fault (win32 or POSIX assumption in the test). Class P = product fault. Class U = undetermined.

### A. Symlink creation needs privilege (4 cases, class T)

Evidence: `Error: EPERM: operation not permitted, symlink` at `symlinkSync` (capture lines 216, 234, 252, 659). Sibling cases already skip with "symlink (type=dir) unavailable (EPERM)" (capture lines 33-34), so a shared typed probe exists (NVA-BL-20).

| Case | file:line |
|---|---|
| security and authority boundaries return typed recovery without an ambient bypass | human-guard-override.test.mjs:1825 (symlink at 1829) |
| NVA-W4-01B: HGO-EXTERNAL-PROJECT-BOUNDARY discloses a bounded copy-safe rendering | :1909 (symlink at 1922) |
| pipeline author repair binds one exact source root and action | :2102 (symlink at 2111) |
| NOVA-HGOELIG-4: an in-root symlink or hardlink attack is never reclassified | :4655 |

Slice S1 (test-only): gate these four on the existing shared symlink-capability probe.

### B. SIGKILL / killed-writer helper (11 cases)

Class T for 10 (capture lines 269-559 region): the helper `killedAuditWriter` (test.mjs:2268-2285) spawns a bare `node --input-type=module -e` child that calls `acquireAuditLock` and then `process.kill(pid,"SIGKILL")`. In the capture the child dies earlier with `HumanGuardOverrideError: override file DACL is not owner-private` (`safePrivateFile`, human-guard-override.mjs:744, via `publishAuditLock`:2469), so `result.signal` is `null`, not `SIGKILL` (assertion at test.mjs:2283, `null !== 'SIGKILL'`). The parent process uses the injected native-Windows private-state assurance (passing case "native Windows private-state assurance is injected", capture line 94); the child has no such injection. Two stacked test assumptions: no injected assurance in the child, and a POSIX signal being observable on win32 (Node reports a self-kill on win32 as exit without a signal).

| Case | file:line (assertion reached via helper) |
|---|---|
| an authenticated killed genesis writer can finish the first audit entry | test.mjs:2287 (call 2296) |
| SIGKILL during ordinary lock publication ... | :2333 |
| SIGKILL after create-only publication finalizes the authenticated ordinary lock | :2347-region (call 2357) |
| SIGKILL during recovery-guard publication ... | :2366-region (call 2373) |
| SIGKILL after recovery-guard publication finalizes its authenticated twin | :2390-region (call 2396) |
| a real killed audit writer is reclaimed by the next ordinary append | :2430-region (call 2440) |
| repair-audit uses the same killed-owner reclamation | :2455-region (call 2463) |
| a writer recovers when the prior dead-owner reclaimer was itself killed | :2475-region (call 2486) |
| legacy, malformed, unauthenticated and cross-host audit locks remain typed fail-closed | :2500-region (call 2512) |
| a recovery guard excludes a second reclaimer and a raced replacement is never unlinked | :2540-region (call 2548) |

The region-style line numbers are the start of each test as reported by the capture's call sites; exact `test(` lines were not individually read (budget).

Class U leaning P for 1: "a failed repair or ordinary append never removes the active repair writer's lock", test.mjs:2814 (failing assert at 2829). Evidence (capture 559-589): the competing `repairHumanGuardOverrideAudit` inside `afterLedgerWriteFn` threw `audit lock owner state is ambiguous` (`ambiguousAuditLockRefusal`, human-guard-override.mjs:2446, from `acquireAuditLock`:2540) where the test expects code `HGO-AUDIT-LOCKED`. No child process is involved, so the cause is the owner-liveness/ownership proof for a lock held by the live same process on win32. This may be a genuine win32 product gap (liveness not provable, so a held lock is reported as ambiguous instead of locked). Needs a read of `acquireAuditLock` lines 2500-2545 before a verdict.

Slice S2 (test-only, depends on S1-style probe): make `killedAuditWriter` inject the win32 private-state assurance in the child and, on win32, assert termination without a signal instead of `SIGKILL`; or skip with a typed reason. Slice P1 (production, only if S3 below confirms): the held-lock-by-live-owner path on win32.

### C. POSIX path/platform assumptions (5 cases, class T unless noted)

| Case | file:line | Evidence | Class |
|---|---|---|---|
| NVA-HGOFIX-2: separatorNormalized() and safePath() platform seam | test.mjs:4762 (assert 4763) | `'a/b' !== 'a\\b'`: the assertion calls `separatorNormalized("a\\b")` without `platform`, and the comment says "default platform (POSIX on this host)"; on win32 the default is the host platform and normalizes | T |
| NVA-HGOFIX-2: crossBoundaryTarget() :792 check | :4784 (assert 4790) | `actual: null` where the test passes no `platform`; same host-default assumption | T |
| NVA-HGOFIX-2: safePath in-root name with a backslash | :4762 body (assert 4775) | `null` instead of an in-root result; same cause (also a directory named `..\hgofix-seam` is not creatable as one component on NTFS) | T |
| NVA-CROSSREPOGUIDANCE-1a | :5811 (assert ~5813) | actual `<host-path>` vs expected `C:<host-path>`; the capture's sanitiser hid the literal; likely drive-letter/path-spelling comparison | U leaning T |
| NVA-CROSSREPOGUIDANCE-1b | :5963 (assert 5975) | same shape as 1a | U leaning T |

Note: the NVA-HGOFIX-2 tests are written to be run against an explicit `platform` and to assert the default equals the POSIX host; their two default-platform assertions are host-conditional. Slice S3 (test-only): pass `{ platform: "linux" }` for the POSIX arm, or skip the default-platform arm on win32. The CROSSREPOGUIDANCE pair needs the raw (unsanitised) failure text to classify definitively.

### D. Script test file (1 case)

`plugins/pipeline-core/scripts/guard-human-override.test.mjs:623` (assert 635): "NVA-HGOFIX-2: the external-path check does not misread a POSIX in-repository file whose name merely contains a backslash as external". Actual `HGO-USAGE: ENOENT ... open`; the fixture file whose name contains a backslash cannot exist on NTFS. Class T (POSIX-only fixture). Out of scope for the lib file; belongs to the same S3 slice.

### E. The 4 intended T90 RED pins (not pre-existing)

Lib file: `test.mjs:4318` (v) well-formed recovery, the host-default case, and the hostile-command case (`actual: 2, expected: 3` lines; `assertOneRecoveryLine`, test.mjs:4305-4316). Script file: `guard-human-override.test.mjs:934` (repair-audit stderr recovery). T90 has since landed per the briefing; green status not re-verified here (see limits).

## Proposed slices

1. S1 test-only: symlink-capability gate for four cases (A).
2. S2 test-only: win32 adaptation of `killedAuditWriter` (inject assurance, no-signal termination) for ten cases (B).
3. S3 test-only: explicit-platform POSIX arms for NVA-HGOFIX-2 (three cases), the script-file case (D), and the CROSSREPOGUIDANCE pair after reading raw text.
4. S4 diagnosis-then-decide: read `acquireAuditLock` (2500-2545) and the held-lock-by-live-owner path on win32; if confirmed, a production slice P1 with its own test slice first (QG-04).
5. S0 re-run: obtain `evidence/WIN-HGO-D-20261009/native.txt` by running the file in chunks with `--test-name-pattern`, to confirm the T90 pins and the 20 lib reds.
