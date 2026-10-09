# TR-B manifest: read-grammar pins for guard-lifecycle-ready (tranche-2 post-image, test-only)

Dispatch: TR-B-T4-20261009 (continuation of TR-B-T-20261009, TR-B-T2-20261009 and TR-B-T3-20261009). Test-only. No
production file is touched. This dispatch started no test run: it read the capture that TR-B-T3 had started and that
landed after TR-B-T3 handed back.

## Target

- Install target: `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (a protected test path; the post-image is
  delivered here as a signed-package artifact and is never written by an agent to the live path).
- Post-image: `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-lifecycle-ready.test.mjs`
- Post-image sha256: `fd929e318f42a2c12f614afa48f9e89d49f19af627efd05356530f5376a05641` (702208 bytes, LF), confirmed with
  `sha256sum` and `wc -c` at the start of this dispatch.
- Live file it extends: sha256 `35a73612f1c275e786577ebe96404fe2fa79903060072724a6a5df70351d2e40`.

The post-image is the live file plus one appended block (153 appended lines per the TR-B-T2 record: a comment header,
helper constants and 21 new `test(...)` cases). It is produced by a build script (`scratch/dispatch-wip/TR-B-T/build.mjs`,
git-ignored, not part of this commit). The relative imports are those of the live file, so the post-image works only when
installed at the target path above.

## Verification command (WSL, foreground)

The run used a scratch copy of the post-image, `scratch/dispatch-wip/TR-B-T/guard-lifecycle-ready.trb.test.mjs`
(git-ignored). The scratch copy sha256 was not recorded by any of the four dispatches.

```
wsl.exe -e bash -lc "cd <repo-root-under-/mnt>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-B-T-20261009/red.txt --label TR-B-T-red -- node --test scratch/dispatch-wip/TR-B-T/guard-lifecycle-ready.trb.test.mjs"
```

Wrapped exit code 1 (expected: red pins by design plus the two relocation-noise cases). Artifact:
`evidence/TR-B-T-20261009/red.txt` (machine-written by `capture-evidence.mjs`).

Totals of the rebuilt post-image: 389 tests, 374 pass, 12 fail, 3 skipped, 0 cancelled, duration 717349 ms.
No baseline capture of the unmodified live file exists for TR-B (TR-G had one); none is invented here.

## Oracle (admit-then-refuse)

Each shape of the key-operand corpus is judged in three steps, so that a spelling the guard refuses for its own sake can
never pass vacuously as "refuses key operands":

1. The unmodified spelling (the one already admitted today, `rg`/`grep` without the new switch) refuses the key operand.
2. The spelling under test is ADMITTED for an ordinary in-project operand (`<spelling> apply scratch/notes.md`).
3. The spelling under test refuses the key operand.

The first oracle (equality of the first `GUARD-` code) was wrong: an admitted spelling given an in-root key operand reports
`GUARD-READ-COMMAND-UNSUPPORTED` first, so it skipped every shape. It was replaced once, in TR-B-T2, by the three steps
above.

## Per-pin state against the unchanged guard (21 new cases)

The failure of every RED case is an `ERR_ASSERTION` raised inside `qp4Admit` at oracle step 2, with predicate
`<spelling> apply scratch/notes.md` and `false !== true`. The operand is an ordinary in-project file, not a key path, so
the reason is the title's own claim: the guard does not admit that spelling today. No failure carries a `qp4Refuse` frame.

| Pin | State | Reason / role |
|---|---|---|
| T74 `rg -o`: admitted for an ordinary in-project operand | RED | Right reason: `rg -n -o apply scratch/notes.md` is not admitted. |
| T74 `rg -o`: a key or credential operand is refused by the operand check, never by the spelling | RED | Right reason: red at step 2 (same predicate); coupled to the admit pin by design. Step 3 never ran. |
| T74 `rg --only-matching`: admitted | RED | Right reason: `rg -n --only-matching apply scratch/notes.md` is not admitted. |
| T74 `rg --only-matching`: key operand refused by the operand check | RED | Right reason: red at step 2 (same predicate). |
| T74 `rg --max-columns 200`: admitted | RED | Right reason: `rg -n --max-columns 200 apply scratch/notes.md` is not admitted. |
| T74 `rg --max-columns 200`: key operand refused by the operand check | RED | Right reason: red at step 2 (same predicate). |
| T74 `grep -o`: admitted | RED | Right reason: `grep -n -o apply scratch/notes.md` is not admitted (it was predicted green in an earlier plan and is not). |
| T74 `grep -o`: key operand refused by the operand check | RED | Right reason: red at step 2 (same predicate). |
| T74 `grep --only-matching`: admitted | RED | Right reason: `grep -n --only-matching apply scratch/notes.md` is not admitted. |
| T74 `grep --only-matching`: key operand refused by the operand check | RED | Right reason: red at step 2 (same predicate). |
| T74 `rg` quoted alternation: admitted | GREEN | Admitted today; pins the behaviour. |
| T74 `rg` quoted alternation: key operand refused | GREEN | All three steps hold; the key corpus is refused by the operand check. |
| T74 `grep` quoted alternation: admitted | GREEN | Admitted today. |
| T74 `grep` quoted alternation: key operand refused | GREEN | All three steps hold. |
| T77 `rg -g`: admitted | GREEN | Admitted today (one bounded basename-extension filter). |
| T77 `rg -g`: key operand refused | GREEN | All three steps hold. |
| T77 `rg --glob`: admitted | GREEN | Admitted today. |
| T77 `rg --glob`: key operand refused | GREEN | All three steps hold. |
| T74/T77 control: the already-admitted `rg` and `grep` spellings admit an ordinary operand and refuse every key operand | GREEN | Control: the key corpus is refused under every unmodified spelling, so step 1 holds for every shape. |
| T77 `rg -g` lane: one bounded basename-extension filter is admitted; multi-dot, path, recursive and negated filters are refused with `GUARD-READ-COMMAND-UNSUPPORTED` | GREEN | Characterisation, green by design; flip deliberately if TR-B admits one. |
| T74 directory Grep: the Grep tool on a directory stays refused with `GUARD-READ-TARGET` (SEC-11) | GREEN | Also pinned by QP4-4, repeated under the row. |

Tally: 10 RED (the five unadmitted spellings, an admit pin and a refuse pin each), 11 GREEN. The four admitted spellings
and the control are green at all three steps, so there is no key-read hole in any tested shape under the unmodified
spelling. For the five red refuse pins, step 3 (the new spelling refuses the key corpus) is unverified until the spelling
is admitted; the pin goes GREEN only when the spelling is admitted AND still refuses every key operand.

## Pre-existing cases

- Failing list of the capture: 12 = QP3-2b, QP3-2c and the 10 TR-B reds above. Nothing else fails.
- First run (TR-B-T2, before the one oracle fix): 389 tests, 369 pass, 17 fail (QP3-2b, QP3-2c and 15 TR-B), 3 skipped.
  Between the two runs no pre-existing case changed state: the 5 cases that moved from fail to pass are the control and
  four strict refuse pins, all new TR-B cases.

### Relocation noise: QP3-2b and QP3-2c

QP3-2b (G8, a backslash path word beside any forbidden metacharacter is refused on every platform) and QP3-2c (F-B, the
sanctioned script is matched by physical identity) fail with `ERR_MODULE_NOT_FOUND` for `./guard-lifecycle-ready.mjs` in
the scratch copy only: the build script does not rebase that specifier, so it resolves beside the scratch copy. They are
red in both runs. In the live file's own directory the specifier resolves to the live sibling, so installing the
post-image at its target path is not affected. They were deliberately not repaired.

### Two tests fewer than expected (unexplained)

389 tests ran against 391 expected (live-file tests plus 21 new cases). The two missing are unexplained. The TR-B-T2
hypothesis, unverified, is that subtests of QP3-2b and QP3-2c never register once their module import fails.

## Not done here

- The tranche `README.md` is not edited by this dispatch.
- Installing the post-image at the target path is a signed-package step for the PO ceremony, not part of this commit.
- No production file changes; the five red admit pins and their coupled refuse pins describe the work TR-B's production
  change must do.
- Independent Critic review: pending.
