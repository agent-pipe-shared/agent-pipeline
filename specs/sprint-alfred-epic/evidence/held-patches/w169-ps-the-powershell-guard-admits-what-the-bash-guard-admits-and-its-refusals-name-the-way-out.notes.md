# w169 — E7 PowerShell part, W4, W5: the PowerShell guard dialect gives the Bash verdict where both can express a command, and every refusal names an admitted alternative

Apply order: this patch is a delta on top of the held patch w166 (same guard files and the same two registration files). Apply w166 first, then this one. Against the real checkout alone it does not apply (expected).

Source binding: the closest existing accepted criterion is AC-108; this is a fresh bounded attempt under its unchanged Spec text. The PRD and the Spec are unchanged.

## What

Facts from the native Windows run (PowerShell 7.6): `$env:PIPELINE_PLUGIN_ROOT = "..."; node "$env:PIPELINE_PLUGIN_ROOT\scripts\pipeline-start-preflight.mjs"` was refused with `use one literal command`; `node <plugin>\scripts\pipeline-state.mjs continuity-authority-revision-plan --help`, `continuity-result-bootstrap-plan` and `dispatch-briefing.mjs binding ...` were refused; `git status --short` was refused with no alternative for a git observation; GUARD-READ-TARGET fired for a native Grep over the project's own `project` directory and its text spoke only of plugin files.

Change (`lib/guard/powershell-dialect.mjs`, `lib/guard/grammar-denials.mjs`, `lib/guard/read-scope.mjs`, `hooks/antigravity-pretool-guard.mjs`):

1. Read-only git observations: the dialect hands the parsed words of a literal `git` / `git.exe` command to `isReadOnlyDiagnosticCommand` (the Bash grammar's own table), so the read-only subcommand set is not a second list. Arguments carrying PowerShell syntax (comma, parentheses, braces) are refused first. Mutating git (commit, push, add, reset, checkout, fetch, ...) stays refused.
2. Env prefix: one literal `$env:PIPELINE_PLUGIN_ROOT = "<this plugin's root>"` assignment followed by `;` and ONE command is folded into that command (the variable replaced by the literal, then the ordinary dialect verdict). Any other variable name, a value that is not this plugin's physical root, a value with an expansion, a second assignment or a second command stays refused with the folded one-command spelling printed.
3. Sanctioned scripts in a READY session: `--help` / `-h` of any sanctioned script (every `*_SCRIPT` constant of the Bash grammar plus dispatch-briefing), and the read-only verbs `continuity-authority-revision-plan` and `continuity-result-bootstrap-plan` of pipeline-state and `binding` of dispatch-briefing. Readiness is observed with the same reader the dialect already used. A not-ready session keeps exactly what `isSanctionedLifecycleCommand` lists (pipeline-state `inspect` and `--help` included), the same as Bash.
4. Refusals: `POWERSHELL_ADMITTED_SHAPES` (grammar-denials.mjs) is the one table of admitted PowerShell forms. Every GUARD-POWERSHELL-GRAMMAR refusal prints its working example for the refused shape (git, node script, `$env:` assignment, or the existing read/write shapes) and the whole table, rendered with this guard's own plugin root. The native read refusal GUARD-READ-TARGET (Claude native lane, Antigravity native tools, PowerShell reads) now states which roots are protected, that a project directory that is not one of them is not what was refused, and the admitted spelling (Glob with a directory and `*` / `*.ext`, then Grep or Read the exact file; `rg -n <pattern> <dir>` where a Bash tool exists). A refused Glob additionally states the admitted pattern forms.

Tests: `plugins/pipeline-core/lib/powershell-bash-guard-parity.test.mjs` (6 cases, registered as `powershell-bash-guard-parity-tests` in `harness/verify-suites.json` and the inventory). It walks every shape of `ADMITTED_GRAMMAR_SHAPES` (a shape without a Bash-only row with its reason fails the case), walks the git subcommands against `isReadOnlyDiagnosticCommand`, and uses the exact commands of the Windows run as fixtures. RED was run against the original code before the first production edit (5 of 6 red; the shape walk was green by construction because the dialect refused every Bash-only shape already, it pins that they stay so).

## Not changed

- Native Grep over a directory is still refused (R2-1 and `guardrails/security.md` SEC-11: "native Grep requires an exact file"; `g23-cross-runner-passive-matrix` and `read-blocks-and-misleading-denial-texts-across-runners` pin it). Admitting it would change a guardrail, which is outside this change. The briefing asked that GUARD-READ-TARGET stop firing for such a directory; this patch delivers the text half (protected roots stated, the refusal says the directory itself is not the cause, the admitted spelling is named) and leaves the admission to a decision on SEC-11.
- No mutating command became admissible: the READY route is `--help` plus three named read-only verbs; `configure-verify`, `approve-push`, `approve-plan`, every `*-apply` verb and every other script argument stay refused.
- The Bash grammar and the READY lifecycle tail are untouched. In a READY session Bash admits any parseable single command at this guard (the mutation guards run separately); the dialect deliberately does not mirror that.
- Pipelines, `&&` chains, rg/cat/head/tail/wc singletons stay Bash-only (rows with reasons in the test).

## Not proven

- No real PowerShell session ran the new forms; the fixtures use the guard's input envelope on Linux with forward-slash paths. The Windows-only physical-path comparison (case-folded realpath) is exercised only by its posix branch.
- The Windows-reported Glob refusal was not reproduced: on Linux a Glob over the project's `project` directory is admitted, and only patterns without a literal extension (`**/*`, `project/**`) are refused. The text now says so; whether that was the Windows pattern is unknown.
- `continuity-result-bootstrap-plan` is admitted because the briefing names it as a plan verb; its read-only property is taken from the verb name and the "zero mutation" refusals of its sibling, not proven by running it.
