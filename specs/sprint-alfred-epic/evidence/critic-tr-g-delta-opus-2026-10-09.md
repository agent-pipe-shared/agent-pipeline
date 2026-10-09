# Critic report: TR-G delta (`669705780`, `c7aa93102`, scoped remainder of `0dfe853cc`), Opus, 2026-10-09

Persisted by the Elephant from the Critic's returned report (the Critic has no Write tool). Substance kept; disclosures
shortened.

- Requested route `claude-opus-5-5` at max; effective identity `claude-opus-5-5`, effort max, from the runtime prompt.
  Route pre-check passed. Lane: functional-equivalent-read-only; OS isolation not asserted.
- Working-tree reads of the five scoped files are bound to `c7aa93102` (`git diff --stat` empty).
- **Prior F1: FIXED** (pins T49 (d), (e) red in `evidence/TR-G-T3-20261009/red.txt:96-97`, green in
  `evidence/TR-G-F3-20261009/green.txt:96-97`; `comparableScriptPath` maps `\` only on win32).
- **Prior F2: FIXED** (pins (f)–(h) red `red.txt:98-100`, green `green.txt:98-100`; controls (i), (j) green;
  `isSingleGitClosingCommand` refuses ``;&|<>`$()``, CR and LF).
- **Round: FAIL** on Finding 1 (major, in the scoped remainder).

## Finding 1 (major): the briefed producer spelling is never admitted after the cap

After the cap the guard admits the producer only if the raw script token string-equals
`join(pluginRoot, "scripts", "goldfish-commit-command-flow.mjs")`, with `pluginRoot` the absolute, module-relative
`GUARD_PLUGIN_ROOT` (post-image `:432-434`, `:447-451`, `:618`, call site `:646`). The token is never resolved against
the working directory. The Goldfish template tells the agent to run the producer "from the repository root" as
`node plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs …` (`templates/prompts/goldfish-task.md:508-516`),
which can never equal that path; in a consumer repository that relative path does not exist at all (post-image
`:442-445`). The refusal text names the producer but not the admitted path. Every pinned spelling uses an injected
`${FAKE_ROOT}` root; the briefed relative spelling has no pin. Named but not admitted.
Facet: the producer's own commit step is `git commit -m … --trailer "Dispatch: <ID> (goldfish)" …`
(`plugins/pipeline-core/lib/goldfish-commit-command-flow.mjs:47-50`), whose parenthesis guard-push already refuses
(obligations §1, lines 38–40) and which `c7aa93102` now refuses after the cap. Fails closed; no safety breach.
Spec-ref: T49 (`toil-resolution-2026-10-08.md:157`), slice row 11 (`:414`), `agent-obligations.md` §6 (157–160).

## Finding 2 (minor): on win32 the bare spelling still equates two distinct paths

On a win32 Claude Code host the Bash tool is Git Bash, which strips an unquoted backslash. A bare
`<root>/scripts\goldfish-commit-command-flow.mjs` is admitted (win32 maps `\` to `/`) while bash runs
`<root>/scriptsgoldfish-commit-command-flow.mjs`. The quoted spelling is fine. Pin (e)'s skip reason asserts the opposite
premise. Evidence: `comparableScriptPath` win32 branch; `PRODUCER_COMMAND_PATTERN` bare alternative (post-image
`:586`). Spec-ref: T49 "and nothing else".

## Finding 3 (minor): the git verb pattern admits more than `add` and `commit`

`GIT_CLOSING_VERB_PATTERN = /^git\s+(add|commit)\b/u` (post-image `:234`) matches before `-`, so `git commit-graph
write`, `git commit-tree`, and hyphenated aliases pass `isSingleGitClosingCommand`. Pre-existing in the live guard; the
new function's doc contract ("ONE simple `git add` / `git commit`") does not hold. Spec-ref: T49.

## Deliberately not flagged

T37 reached on both paths (resolve miss and consume race) with no counter left; `guard-lifecycle-ready.mjs` is the Codex
lane; `resolveAgentPluginRoot` fails closed; the producer CLI is read-only; `git commit -m "type(scope): …"` refused after
the cap is a disclosed safe narrowing; one character class covers the unpinned control shapes; test integrity and the
QG-04 split hold; the three runner timeouts predate the delta; authorship trailers in order; records match `--stat`;
scope confined to the post-image and the manifest; no new dependency; English.

## Trajectory: consistent (with limits)

T3 `red.txt` 99/91/8; F3 `green.txt` 99/96/3; TR-G-F `green.txt` 92/87/5; T2 `red.txt` 92/86/6, all matching the
manifests. `rerun-timing.txt` shows the two load-sensitive cases failing in the TR-G-F round and passing in T3/F3
(disclosed timing variation). Scratch-copy and post-image sha256 values were not recomputed.

## Briefing notes

`resolveAgentPluginRoot` sits at `:447-451`, not inside the briefed `:580-623`; both were reviewed. Spec row T49
anchors on "TB-09 closing allowance", but `guardrails/token-budget.md` TB-09 has a different heading.
