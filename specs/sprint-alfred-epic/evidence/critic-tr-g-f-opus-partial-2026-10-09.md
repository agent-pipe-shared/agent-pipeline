# Critic report: TR-G-F (`0dfe853cc`), Opus, PARTIAL

Persisted by the Elephant (the Critic has no Write tool). 2026-10-09 early morning.

- **Verdict: pass/fail withheld — partial review.** The 80 % hook checkpoint fired at counted call 22 of 24. Seven
  counted calls were guard refusals: one composite Bash, one Git-Bash absolute path, five directory-scoped Greps.
- **Requested route:** `claude-opus-5-5` at max (class G). **Effective identity:** `claude-opus-5-5` at max, from the
  runtime prompt. The route pre-check passed.
- **Assurance:** functional-equivalent-read-only; OS isolation not asserted. No mutating command ran; the scratch
  `mkdir` was refused before it executed (`GUARD-PARSE-UNSUPPORTED`).
- **Candidate:** `0dfe853cc01f6ad3478766f922168814fbebadc2`. The Critic diffed the post-image against the live guard
  at the same commit, blob to blob.
- **Persistence (CR-06-D):** unavailable; no Write/Edit tool.

## F1 (minor): on POSIX the producer-path comparison admits a different program

- `comparableScriptPath` maps `\` to `/` on every platform. On POSIX `\` is an ordinary filename character, so two
  distinct paths compare equal to `<pluginRoot>/scripts/goldfish-commit-command-flow.mjs`:
  - a quoted `"<pluginRoot>/scripts\goldfish-commit-command-flow.mjs"`, which loads a file of that literal name in
    `<pluginRoot>`;
  - a bare `<pluginRoot>/scripts\goldfish-commit-command-flow.mjs`, where Bash strips the backslash and loads
    `<pluginRoot>/scriptsgoldfish-commit-command-flow.mjs`.
- This contradicts the function's own contract ("a copy of the script elsewhere is a different program"). After the
  cap, the remaining counted closing slots could run another node program. The count stays bounded. The precondition is
  a planted file in the resolved plugin root.
- Evidence: post-image `:590` (unconditional `replaceAll("\\", "/")`), `:591` (lower-casing gated on win32 only),
  `:597-598` (doc claim), `:608` (equality test). `TR-G-F-MANIFEST.md:24-25` and `:109-110` (no case exercises the
  normalisation branch).
- Spec-ref: T49 (`design/toil-resolution-2026-10-08.md:157`), "and nothing else".

## F2 (minor): a known residual in the post-cap admission set is documented without owner or expiry

- The git closing-verb check tests only the start of the command, so after the cap `git add <x> && <any command>` is
  admitted by this guard. The manifest notes it as an "adjacent oddity" owned by the other guards of the union, with no
  owner, expiry or backlog anchor. The union claim is not evidenced in the review object.
- The T49 (b) "nothing else" pin does not cover the git-chained shape. Its refused list at test post-image `:1834-1840`
  covers another script, the producer chained with `&&` and `;`, `git push` and `git reset`.
- Evidence: `TR-G-F-MANIFEST.md:122-123`; post-image `:491-493`, `:623`.
- Spec-ref: QG-06, plus T49 "and nothing else". `guardrails/quality-gates.md` was not read.

## Examined and found in order

- **T37:** the second alternative is chosen (name the re-dispatch). The text fires only for `DBB-PENDING-BINDING-MISSING`
  (post-image `:274`, `:279`). Pins T37 (a) and (b) are green (`green.txt:96-97`).
- **T49:** the producer is admitted after the cap and counted, five calls pass and the sixth is refused, and the
  controls hold (`green.txt:93-95`). The shared-core call is unchanged (`:1100`).
- **Slice row 11:** the pins are green; the wrapped exit 1 is reported honestly.
- **Scope:** exactly two files, both under `tranche-2/`. The live guard was not written (sha `61e8fc35…`), and the diff is
  exactly the eight described edits.
- **Edge cases and security:** `PRODUCER_ARGS_CONTROL_PATTERN` (`:587`) covers separators, substitutions, redirects,
  here-docs and line breaks. Env prefixes and node options fail the anchor.
- **R7-11a:** red against the post-image, green against the live guard, with no causal anchor in the hunks. A residual
  uncertainty, not a finding.
- **20-cap case:** times out identically against the post-image and the live guard, which points to the environment.
- **Test integrity, dependencies, language:** in order. The test post-image sha `33411458…` matches.
- **T34** is outside the dispatched spec lines; not flagged. **T49 anchor label:** the spec names "TB-09 closing
  allowance", but `guardrails/token-budget.md:183` heads TB-09 differently. That is a spec-side label mismatch, disclosed.

## Trajectory

Consistent for every claim checked: the three sha256s, exit codes, failing-case lines, timeouts, the control capture,
and the stripped record against `git show --stat`. Authorship: `Dispatch: TR-G-F-20261009 (goldfish)` +
`AI-Assisted: true`, no forbidden metadata. Not verifiable: the WSL platform (captures record none),
`rerun-timing.txt`, the 92/87 summary lines, and the scratch build script.

## Not reached (bare enumeration, from the Critic)

- `templates/prompts/goldfish-task.md`
- `plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs`
- `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-dispatch-budget.mjs` lines 580-623
  (`resolveAgentPluginRoot`)
- `plugins/pipeline-core/lib/dispatch-budget-binding.mjs`
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
- `guardrails/global.md`, `guardrails/git.md`, `guardrails/quality-gates.md`
- `templates/prompts/agent-obligations.md` §2 and §6
- `evidence/TR-G-F-20261009/rerun-timing.txt`
- `evidence/TR-G-F-20261009/green.txt` lines 1-12 and the summary block
- `evidence/TR-G-T2-20261009/red.txt`
- Mechanics: exact-file Grep only; repo-relative Bash paths; one simple command per call; a base budget of at least 15
  for the remainder.
