# TR-B-F manifest: tranche-2 post-images admitting the five match-output read spellings (class G)

Dispatch: TR-B-F-20261009 (goldfish-deep, `claude-sonnet-5-5` / `xhigh`), the fix half of slice TR-B. It turns the 10 RED
pins of `TR-B-MANIFEST.md` GREEN without editing the test post-image. Requirement: toil row T74
(`specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md`): the read grammar admits `rg -o`, `rg --only-matching`,
`rg --max-columns N`, `grep -o` and `grep --only-matching` for in-project operands and still refuses every key or credential
operand of the corpus. Independent review: pending.

## Targets (two files; the admission does not live in a third)

Both live files are protected guard code, so the change is delivered as post-images at the mirrored paths and is never
written to the live path by an agent. No earlier tranche-2 post-image of either file existed (`find` over the signed-package
tree returned nothing), so each post-image is the live file plus the edits below.

| Install target | Post-image | Live pre-image sha256 (bytes, LF) | Post-image sha256 (bytes, LF) |
|---|---|---|---|
| `plugins/pipeline-core/hooks/guard-command-grammar.mjs` | `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-command-grammar.mjs` | `8602a79813cd393cb372d4dca82c859ce2966a5c98fd58cc613ee87b22a71945` (19599) | `7a5097c3e978558accdd299ba1e48efe433c9dcdfde9da0a7e4ff67b3261480d` (19974) |
| `plugins/pipeline-core/lib/guard/shell-grammar.mjs` | `specs/sprint-alfred-epic/signed-package/tranche-2/lib/guard/shell-grammar.mjs` | `4643599b1aa4f3c38a7895a00eef6614ef4de6382c3c5bab17257c2c99df2edf` (64989) | `e7b28b678c0c9b0aecde2a3ea592281f4550ac8e04e458e9d82b7d7b29c0f81e` (65092) |

The test post-image (`hooks/guard-lifecycle-ready.test.mjs`, sha256 `fd929e318f42a2c12f614afa48f9e89d49f19af627efd05356530f5376a05641`,
commit `2e8f28979`) is untouched; the build script asserts that sha256 before using it.

## The edits (five anchored insertions, each matched exactly once; nothing else differs from the pre-image)

Pre-image line numbers.

| # | File and place | Edit |
|---|---|---|
| 1 | `guard-command-grammar.mjs`, `SEARCH_BOOLEAN` (closing at 21) | adds `"-o"`, `"--only-matching"` with a one-line comment |
| 2 | same, `SEARCH_VALUE` (closing at 26) | adds `"--max-columns"` |
| 3 | same, `NUMERIC_VALUE` (closing at 35) | adds `"--max-columns"`, so the existing canonical bound `canonicalInteger(value, 500)` applies (1..500, no leading zeros) |
| 4 | same, `validateRg` after the `NUMERIC_VALUE` check (361) | `if (arg === "--max-columns" && value === "0") return false;`, because rg reads `--max-columns 0` as "no limit" and the briefing asks for a bounded positive integer |
| 5 | `shell-grammar.mjs`, `isSafeExactGrepArgs` `flags` set (713) | adds `"-o"`, `"--only-matching"` with a one-line comment |

Net growth: 375 bytes and 103 bytes. No other function, table or constant is touched.

## Verification command (WSL, foreground, exit 1 wrapped as expected)

```
wsl.exe -e bash -lc "cd <repo-root-under-/mnt>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-B-F-20261009/green.txt --label TR-B-F -- node --test scratch/dispatch-wip/TR-B-F/guard-lifecycle-ready.trb.test.mjs"
```

Artifact (machine-written by `capture-evidence.mjs`, not part of this commit): `evidence/TR-B-F-20261009/green.txt`.
Totals: 389 tests, 384 pass, 2 fail, 0 cancelled, 3 skipped, 0 todo, duration 533276 ms. Against `red.txt` of TR-B-T
(389 tests, 374 pass, 12 fail, 3 skipped): the 10 formerly red pins are now green; the passing count rose by exactly 10 and
nothing else changed state.

### How the post-images were exercised (a named method deviation)

The briefing asked to point the scratch test at a scratch guard copy by relocating imports only. A copy of one guard file
cannot do that here: `lib/guard/evaluate.mjs` and about twenty other modules import `shell-grammar.mjs` and
`guard-command-grammar.mjs` by their live URLs, so a single relocated copy would leave the live grammar in the call path.
Instead the DoD-named entry file `scratch/dispatch-wip/TR-B-F/guard-lifecycle-ready.trb.test.mjs` registers a scratch ESM load
hook (`redirect-hooks.mjs`) that serves the post-image bytes under the two live module URLs and then loads the test body. The
post-images therefore behave as if installed (same relative imports, one module instance each) and no live file is written.
The hook prints `TRBF-REDIRECT-FIRED <file>` once per redirect; both lines are in `green.txt` (lines 400-401), so the run is
not a run against the unmodified guard.

The test body `guard-lifecycle-ready.trb.body.mjs` is generated from the committed test post-image by the transformation
TR-B-T used (relative specifiers and `import.meta.url` rebased, nothing else); its sha256 is
`b13fb444db4af6ece1c1a7866914db821118be765a877f5389f20cfe2ec49f98` and it is byte-identical to TR-B-T's runnable copy. The
scratch entry, hook, probe and build script are git-ignored and not part of this commit; the entry and hook sha256 were not
recorded.

## Per-pin state against the post-images (21 new cases, all GREEN)

The key-refusal pins are the coupled refuse pins: each runs the three-step oracle of `TR-B-MANIFEST.md` (unmodified spelling
refuses the key operand; new spelling admits an ordinary operand; new spelling refuses the key operand) over five corpus keys
and up to five operand shapes.

| Pin | Before | Now |
|---|---|---|
| T74 `rg -o`: admitted | RED | GREEN |
| T74 `rg -o`: key operand refused | RED | GREEN |
| T74 `rg --only-matching`: admitted | RED | GREEN |
| T74 `rg --only-matching`: key operand refused | RED | GREEN |
| T74 `rg --max-columns 200`: admitted | RED | GREEN |
| T74 `rg --max-columns 200`: key operand refused | RED | GREEN |
| T74 `grep -o`: admitted | RED | GREEN |
| T74 `grep -o`: key operand refused | RED | GREEN |
| T74 `grep --only-matching`: admitted | RED | GREEN |
| T74 `grep --only-matching`: key operand refused | RED | GREEN |
| T74 `rg` quoted alternation: admitted / key operand refused (2 cases) | GREEN | GREEN |
| T74 `grep` quoted alternation: admitted / key operand refused (2 cases) | GREEN | GREEN |
| T77 `rg -g`: admitted / key operand refused (2 cases) | GREEN | GREEN |
| T77 `rg --glob`: admitted / key operand refused (2 cases) | GREEN | GREEN |
| T74/T77 control (already-admitted spellings refuse every key operand) | GREEN | GREEN |
| T77 `rg -g` lane characterisation (multi-dot, path, recursive, negated filters still refused) | GREEN | GREEN |
| T74 directory Grep stays refused with `GUARD-READ-TARGET` (SEC-11) | GREEN | GREEN |

The 11 pins that were GREEN before are still GREEN, including all key-refusal pins; none turned red.

### Pre-existing cases

Two cases fail, exactly as in `red.txt`: QP3-2b and QP3-2c, with `ERR_MODULE_NOT_FOUND` for `./guard-lifecycle-ready.mjs`
resolved beside the scratch body (an un-rebased dynamic import in the scratch copy only; installing the test post-image at its
own target path is not affected). Three cases stay skipped. Nothing else fails.

### Ad hoc probe (not a pinned test)

`scratch/dispatch-wip/TR-B-F/probe.mjs` ran 30 `isReadOnlyDiagnosticCommand` cases through the same load hook on the Windows
host, with zero mismatches against the expectations set before the run. Facts it established that the test post-image does
not pin: `--max-columns 0`, `501`, `007`, `--max-columns=200`, a repeated `--max-columns`, `--max-columns-preview` and `-M 200`
are refused; `rg -o -o` and combined `-on` (rg and grep) are refused; `rg --files -o` and `rg --files --max-columns 200` are
refused; `grep --max-columns 200` is refused; `rg -n -o` on `vault/id_rsa` and `~/.ssh/id_rsa`, `rg -n --max-columns 200` on
`~/.ssh/id_rsa`, `grep -n -o` on `~/.ssh/id_rsa` and `grep -n --only-matching` on `vault/id_rsa` are refused (the test
post-image's WSL corpus covers all five keys, both spellings and the operand shapes); the `rg -o ... | head -5` and `grep -o ... | head -5` pipeline sources are admitted; `grep ... | grep -o x`
(pipeline sink) is refused.

## Boundaries

- Exactly the five spellings. Short `-M`, `--max-columns=N`, `--max-columns-preview`, combined short flags and `--files`
  mode (`FILE_BOOLEAN`/`FILE_VALUE`) are unchanged and refused.
- Operand classification is unchanged and still authoritative. `validateRg` still sends every path and every `-f` value to
  `isAllowedPassiveReadTarget` through `approvedReadPath`; `isSafeExactGrepArgs` still sends every path to
  `isSafeExactPassiveFile`. `QP4_RG_LONG_VALUE` (a label-only table in `shell-grammar.mjs`) already lists `max-columns`, and
  `-o` takes no value, so no operand-label table needed a change.
- Shared validators widen their other callers by construction: `validateRg` also serves the `rg | rg`, `rg | head`,
  `rg | tail` and `rg | sort` lanes, and `isSafeExactGrepArgs` also serves the scoped grep-pipeline source. So `rg -o ... | head`
  and `grep -o ... | head` are admitted too (probe). The grep pipeline sink grammar (`isValidPipelineGrepArgs`) is deliberately not
  changed.
- `--max-columns` is bounded 1..500: the shared `canonicalInteger` bound plus an explicit refusal of `0`.
- Runner and platform coverage: the lifecycle guard test file ran under WSL on the Claude runner. `codex-pretool-guard.mjs`,
  `antigravity-pretool-guard.mjs` and `lib/codex-native-critic-tools.mjs` import the same grammar modules and will inherit the
  admission on install; they were not exercised. The 30-case probe ran on the Windows host; macOS was not run.
- Substitutions declared (T104): the host repository path in the command above is written `<repo-root-under-/mnt>`; no other
  placeholder, no e-mail literal.

## Not done here

- Installing the two post-images at their live paths: a signed-package step for the PO ceremony.
- The tranche `README.md` and every other manifest are not edited. The test post-image is not edited.
- No pin covers `--max-columns 0` or `501`, `-M`, `--max-columns=N`, or the `| head` pipeline admissions; they are probe-only
  facts. A follow-up test dispatch may pin them.
- Independent Critic review: pending.
