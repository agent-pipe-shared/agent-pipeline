# Diagnosis: `.gitleaksignore` content-v1 suppression does not match nested paths on native Windows

Dispatch GLWIN-t (diagnosis + RED regression test; production untouched, QG-04 separation).
Backlog item: `pipeline.gitleaks-content-suppression-does-not-match-on-windows`.
Host of measurement: native Windows (`process.platform === "win32"`), Node, real gitleaks binary present on PATH.
Status: **reproduced**. Cause located. Fix NOT applied (next dispatch).

## 1. Verdict in one paragraph

The defect is a **path-separator** divergence, not a line-ending one. The adapter normalises an absolute
finding path to a repository-relative path with `path.relative()`, which returns **native `\` separators on
Windows**, and then rejects that result with its own validator, which refuses any path containing `\`. The
rejection makes `normalizeCandidateFindingPath` return the finding **unchanged** (still absolute), so the
authority key is built from the absolute path and can never equal a content-v1 key (those carry the
repo-relative `/` path). A finding in a file at the repository **root** has no separator, survives the
validator, and IS suppressed -- every finding in a **subdirectory** (depth >= 1) is silently retained. That is
exactly "entries that ARE suppressed in `.gitleaksignore` still reported".

## 2. Where the match happens (all anchors in `plugins/pipeline-core/scripts/security-adapters/gitleaks.mjs`)

| Step | Anchor | What it does |
|---|---|---|
| Entry written | `:181-185` `gitleaksContentAuthorityLine` | `content-v1:<sha256>:<path>:<rule>:<line>:<column>`; `<path>` is hashed too (`:177`) |
| Entry parsed | `:193-202` `parseContentAuthorityLine`, path gate at `:200` | an entry path must pass `safeAuthorityPath` -> must use `/` |
| Ignore file read | `:236-237` | `split(/\r?\n/u)` then `.trim()` -> CRLF-safe |
| Set key | `:242` | `digest\0path\0rule\0line\0column` |
| Finding key | `:263-268` `authorityKey` | same shape, built from `canonicalContentFingerprint(finding)` (`:159-179`) |
| **Normalisation (defect site)** | `:275-287` `normalizeCandidateFindingPath` | only when `isAbsolute(File)` (`:277`) |
| **Divergence 1** | `:281` | `relative(physicalRoot, physicalFile)` -> native separators (`\` on win32) |
| **Divergence 2 (the actual drop)** | `:282` calling `:187-191` `safeAuthorityPath` | `:188` `path.includes("\\")` -> `false` -> `:282` `return finding` (unchanged absolute path) |
| Match | `:475-480` | `normalize -> authorityKey -> entries.has(key)`; a miss falls into `retained` |

`gitleaks-repair-ignore.mjs:36,109` imports and calls the same `normalizeCandidateFindingPath`, so the repair
tool inherits the same normalisation (inferred from the import, not executed here).

## 3. What was measured vs. inferred

Probes were throwaway scripts in ignored `scratch/` (not durable); their results are reproduced here and the
durable evidence is the regression test next to this note.

**Measured (host: native Windows):**

1. Real gitleaks binary, synthetic temp fixture tree outside any git repository (3 files holding one fake
   `ghp_`-shaped token, depths 0/1/2, file bodies LF and CRLF): the report's `File` is a **drive-letter
   absolute path using forward slashes throughout** (`startsWithNativeRoot=false`,
   `startsWithForwardRoot=true`, `remainderHasBackslash=false`). So the real input to the normaliser is not
   even backslash-shaped; `relative()` still returns `\` because `realpathSync` re-nativises the path.
2. End-to-end through `run()` with the real binary, repo-relative `/` entries for all 3 findings: **1 of 3
   suppressed** -- the depth-0 file; both nested findings retained. Identical with an LF ignore file and a
   CRLF ignore file.
3. Line endings are **not** the cause: for a CRLF scanned file vs. an LF scanned file the real binary reported
   identical `StartLine=2`, `StartColumn=20`, and a `Secret` of length 40 (no stray `\r`), so the fingerprint
   input is unaffected. An ignore file with CRLF endings parses identically to LF (`:236-237`).
4. Hermetic matrix through `run()` with a spy `spawnFn` (ignore EOL {LF, CRLF} x finding path shape x depth
   {0,1,2}), entry always repo-relative `/`:

   | finding `File` shape | depth 0 | depth 1 | depth 2 |
   |---|---|---|---|
   | absolute, native `\` | suppressed | RETAINED | RETAINED |
   | absolute, forward `/` (what the real binary emits) | suppressed | RETAINED | RETAINED |
   | relative, forward `/` | suppressed | suppressed | suppressed |
   | relative, backslash `\` | suppressed | RETAINED | RETAINED |

   The pattern is byte-identical for LF and CRLF ignore files (24 of 24 cells agree across EOL).
5. `normalizeCandidateFindingPath` in isolation: depth-0 -> `top.txt` (repo-relative, OK); depth >= 1 absolute
   inputs come back **still absolute**; relative-backslash depth >= 1 comes back unchanged with `\`.

**Inferred (not executed):**

- That the 49 retained findings seen on 2026-10-05 are all nested-path findings in the same shape. Consistent
  with 1-3 above, but the original run was not reproduced (the real binary was deliberately NOT run against the
  repository tree or history).
- That three red tests of the EXISTING suite share this cause. Measured: on this host
  `gitleaks.test.mjs` is 23 tests, 19 pass, 4 fail. Three failures all use a `join()`-built absolute path one
  directory deep (`:277` `FINDINGS !== PASS`; `:312` near-miss diagnostic never appended because the
  fingerprint path stays absolute; `:369` repair tool reports "no live finding currently matches") -- the
  mechanism in section 2 explains each, but they were not re-run with the fix, so "same cause" is inferred.
  The fourth failure (`:468`, real binary, ledger-shaped content at a non-allowlisted path yields no finding)
  is a detection-side difference (the real binary reported `[]`) and is NOT diagnosed here.
- macOS / WSL / Linux behaviour: `relative()` returns `/` there, so no divergence is expected (holds by
  construction; not run on this dispatch).
- The rel-backslash shape was **never observed from the real binary** (measurement 1 shows forward slashes). It
  is covered defensively because the briefing names both separators; see section 5.

## 4. What is NOT the cause (ruled out by measurement)

- Ignore-file line endings (CRLF vs LF): identical outcomes, `:236-237`.
- Scanned-file line endings: identical line/column/secret, so the fingerprint is stable.
- The digest/secret/line/column inputs: the depth-0 control suppresses with the same inputs.

## 5. The seam the fix needs (next dispatch, production)

One production edit, at `gitleaks.mjs:281-283`: after `relative(...)`, convert the native separator to `/`
**by splitting on `path.sep`**, then keep running the unchanged validator, e.g.
`relative(physicalRoot, physicalFile).split(sep).join("/")`. `sep` is already imported (`:84`).

- Do NOT blanket-replace `\` with `/`: on POSIX a filename may legally contain a backslash.
- Leave `safeAuthorityPath` (`:187-191`) strict -- it also validates ignore-file entries (`:200`) and must keep
  rejecting `\`, absolute paths, `.`/`..` segments. After the conversion, an escape (`..`) or a cross-drive
  result (absolute) is still rejected by it.
- The defensive relative-backslash shape (only meaningful on win32) is NOT reached by `:277` (`isAbsolute`
  guard); handling it would be a separate, deliberate widening of the normaliser. The regression test keeps
  it as its own clearly labelled test so the fixing dispatch can decide, with the evidence that the real
  binary does not produce it.

## 6. Regression test

`plugins/pipeline-core/scripts/security-adapters/gitleaks.windows-suppression.test.mjs` -- hermetic (spy
`spawnFn`, no real binary), synthetic fixtures only, platform-correct (the Windows-only shape is skipped
elsewhere with a stated reason). Red on this host exactly for the nested absolute shapes and the defensive
relative-backslash shape; green for depth 0, the relative-forward shape, and the over-fix guards (external path
and a finding in a different tree not suppressed, backslash entry still malformed, different secret and different line not suppressed).
