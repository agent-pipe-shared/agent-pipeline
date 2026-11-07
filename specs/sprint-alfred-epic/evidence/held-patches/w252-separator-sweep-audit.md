# Separator sweep audit (candidate 20, PO 2026-11-07)

PO request: "Wir brauchen einen Check über den gesamten Code, der nach Stellen sucht, die nur Backslash-Vergleiche machen, sonst kommen
noch Folgefehler." A read-only search (fresh subagent, Explore) over `plugins/pipeline-core/{hooks,lib,scripts}` of clone w252, test files
skipped, looked for exact-spelling comparisons of agent-supplied paths and interpreter words. Coverage: all of `lib/guard` and the
path-bearing hook entry points were read; `guard-push`, `guard-dispatch*`, `guard-slicing` and `scripts/` were only searched.

Equivalent spellings that must be treated the same on native Windows: forward slash and backslash, drive-letter case, MSYS `/d/...`,
trailing separator; for the interpreter: `node`, `node.exe`, `process.execPath`, another absolute Node outside the project root.

## Systemic causes

- S1: `canonicalRootSpelling` rewrites only a value equal to the root (or `<root>/plugins/pipeline-core`); an absolute path BELOW the root
  keeps its typed spelling (`--request`, `--card-file`, ...).
- S2: `canonicalSanctionedScript` knows only the `*_SCRIPT` exports of `lib/guard/constants.mjs`; locally defined script constants
  (`HOST_COMMIT_RECOVER_SCRIPT`, `ROUTINE_REPAIR_SCRIPT`, the comparison script) get no normalisation.
- S3: MSYS `/d/...` is understood only by those two helpers; every resolve/relative containment check reads it as outside the root.
- S4: `resolve()` turns `/` into `\` but keeps the drive-letter case.
- S5: the guard canonicalises its own copy of the argv, but the shell runs the raw text; several scripts then require the exact native
  `--root` spelling themselves (`dispatch-recovery`, `doc-reader-course`, `continuity-owner-route`, `governance-scope-diagnose`).

## Refusals on agent input (most visible first)

1. `command-catalogue.mjs` observed-action lanes: `sameNodeInterpreter` accepts only bare `node` when the executable is absolute
   (`node.exe` refused); the argv is compared byte-exact (a retyped `--root` or script path refused); three lanes (installed-plugin
   attestation, runner-permissions repair and planner) compare `words[0] === "node"` without `sameNodeInterpreter`.
2. `write-scope.mjs` resume-hint capture/inspect bypasses `resolveSanctionedScriptInvocation` (no interpreter, script or root normalisation).
3. `command-catalogue.mjs` resume-hint `--card-file` compared with `join(root, ...)` (S1).
4. `gate-strength-lane.mjs` interpreter lists without the foreign-Node rule; the signed quality package requires the exact backslash
   spelling of every path word.
5. `po-commands.mjs` `poApprovalArgs` compares `--repo-root` raw and bypasses the canonical resolver.
6. `sanctioned-args-scripts.mjs` doc-reader `--request` (`startsWith(root+sep)`), `git -C <target> rebase --abort` recovery (S4).
7. `command-catalogue.mjs` local script constants (S2), ADR `--validate` absolute forward-slash value, audit-pack request root field.
8. `guard-git.mjs`: `-F <message file>` containment (drive case/MSYS), override ledger `-C` root set, GG-22 pathspec split on `/` only.
9. `read-scope.mjs` task-output exact-file read (`resolve(path) !== path`).
10. `clean-candidate-run.mjs` interpreter list and `--root` comparison.
11. Relative-path grammars that accept only `scratch/...` with forward slashes (many sites; open policy question whether forward-slash-only
    relative arguments are an intended contract).
12. tool_input.file_path lanes that differ only on drive-letter case (write-scope resume-hint/machine.json/incident, onboarding staging,
    bootstrap skill read fast path).

Under-protection rather than refusal (a spelling mismatch skips a protection): protected State writer check (`evaluate.mjs`), PRD/Spec
authority protection (`denial-route.mjs`), handover size cap, `lifecycle-gate.mjs` launch-script substring, `po-commands.mjs` human signing
detection, control-plane script scan.

Open question that decides several entries: whether Node on the Windows host returns the on-disk drive-letter case from `realpathSync` and
`path.win32.resolve`, or the typed case. Not measurable on this Linux host.

## Status in clone w252 (2026-11-07)

Shared helper `plugins/pipeline-core/lib/path-spelling.mjs` (+ tests). Exact on Linux everywhere (`sameNativePath`); win32 and darwin
get the equivalence. Wired:

- S1: `canonicalRootSpelling` rewrites the root and every absolute path BELOW it, rebuilt with the same `join` the matchers use
  (entries 3, 6 doc-reader `--request`, 7 ADR `--validate`).
- S2: `ROUTINE_REPAIR_SCRIPT`, `HOST_COMMIT_RECOVER_SCRIPT` moved into `lib/guard/constants.mjs`, so the canonical script resolver
  knows them.
- S3/S4: MSYS and drive-letter case through the helper in: rebase recovery `git -C`, guard-git `-F` containment and `-C` root set.
- S5: `normalizeRootArgument` maps an equivalent spelling of the working directory to its own spelling (MSYS, case, darwin NFC);
  now also used by `doc-reader-course` (root and `--request`) and `governance-scope-diagnose`.
- Interpreter: one predicate `isNodeInterpreterWord` (bare node, node.exe on win32, any spelling of the trusted Node, a real Node
  outside the root) in the sanctioned-script resolver, the catalogue (`sameNodeInterpreter`, now also the three lanes that compared
  `words[0] === "node"`), the resume-hint lanes, gate-strength and clean-candidate-run.
- Entry 1 argv: absolute expected paths match in any native spelling (`sameObservedArgvWord`); flags, digests and relative values
  stay byte-exact.
- Entry 8 GG-22: a backslash pathspec is split like `/` on win32 (protection side).
- Entry 5 po-commands: script word and `--repo-root` through the helper (also widens the human-signing detection).

Intentionally left exact (decision recorded here): `read-scope.mjs` task-output read (the harness supplies the path verbatim);
`guard-dispatch-budget.mjs` request parser (refuses quotes and backslashes by grammar, bare node only); the signed quality package
on win32 (physical identity by design). Entry 11 (relative arguments forward-slash only) stays as a documented contract; entry 12
(drive-letter case of `tool_input.file_path`) and the under-protection list remain open for the second pass after the Windows
retest shows which spelling Node really returns for `realpathSync` on the PO's host.

## Direction

One shared, tested equivalence helper (separator, drive-letter case, MSYS, trailing separator, path under the root) and one shared
interpreter predicate (the G20-1 rule), used by every lane above, instead of per-site patches; `canonicalRootSpelling` extended to paths
below the root; under-protection sites compare through the same helper so a spelling can never skip a protection.
