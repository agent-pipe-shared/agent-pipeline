---
name: conventional-commit
description: "Proposes a Conventional Commit message (type(scope): subject + body bullets) from the currently staged diff. Reads git diff --cached, git log and git status to infer type/scope/subject and to include the repo's trailer conventions (Dispatch:-trailer when run in a goldfish dispatch context). It only PROPOSES the message text; committing remains the caller's own act."
argument-hint: "[optional: scope override]"
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git status:*)
---

# conventional-commit — propose a commit message from the staged diff

Builds a Conventional Commit message (human-facing prose per ADR-0011 —
commit messages are human-facing) from whatever is CURRENTLY staged. This skill never commits by
itself; it hands the caller a ready-to-use message to review and commit with, exactly as they
would any other proposed text.

## 1. Read the staged diff yourself

- `git status` — confirm there IS a staged diff; empty staging area → report "nothing staged,
  nothing to propose" and stop, do not invent a message for an empty diff.
- `git diff --cached` — the actual staged changes; this is what the message must describe.
- `git diff --cached --name-only` — the file list, for scope inference.
- `git log --oneline -10` — recent commit style in this repo (type/scope conventions already in
  use), so the proposal matches the repo's own house style rather than a generic template.

## 2. Infer type and scope

- **Type** (Conventional Commits): `feat` (new capability), `fix` (bug/defect correction), `docs`
  (documentation-only), `refactor` (no behavior change), `test` (test-only), `chore` (tooling/
  maintenance), `style` (formatting-only). Infer from the diff's actual nature, not from the
  branch name or any prose the caller supplied — the diff is the evidence.
- **Scope**: the dominant touched area in parentheses, e.g. `(pipeline)`, `(docs)`, `(governance)`,
  `(close)` — mirror the granularity already visible in `git log --oneline` output. An explicit
  scope override may be passed as `$ARGUMENTS`; if given, use it instead of inferring one.
- **Subject**: one sentence, imperative/nominal style matching existing commits (e.g.
  "Fix…", "Add…", "Update…"), ≤ 72 characters where practical.

## 3. Body bullets (when the diff is non-trivial)

For anything beyond a one-line change, add a short body: 2–5 bullets naming WHAT changed
and, where it is not obvious from the diff alone, WHY — never restate the whole diff, never invent
rationale the diff does not support.

## 4. Trailer conventions (repo-standard, append verbatim — never invent new trailer keys)

- **Goldfish dispatch context:** if the current session is executing a goldfish briefing (a
  `Dispatch:`-style task ID is available from that context), append a trailing block line:
  `Dispatch: {{TASK_ID}} (goldfish)` — this is the deterministic authorship evidence the Critic and
  close-step 6b rely on; never fabricate a task ID if none was given.
- **Anonymous assistance marker:** for an agent-authored commit, append `AI-Assisted: true` after
  any grounded `Dispatch:` line. Do not add provider- or model-specific co-author trailers, session
  URLs/IDs, account identifiers, or other private correlation metadata.
- Do not add any trailer this skill cannot ground in the actual session/dispatch context.

## 5. Output — propose only, never commit

Present the full message as a single fenced block. For a normal commit, give the
caller the scratch-free form `git commit -m '<subject>' -m '<body paragraph>'
--trailer 'AI-Assisted: true' -- <paths>`, adding a grounded `Dispatch:` trailer
when the repository requires one. Name the same exact paths in `git add -- <paths>`
and in the commit. Keep each argument on one line; use repeated `-m` for separate
body paragraphs. Use `-F` only when the content cannot safely be represented as
single-line arguments. Render argument quoting for the actual shell (single
quotes in POSIX shells and PowerShell; double quotes in `cmd.exe`) and never
interpolate unreviewed shell syntax. State explicitly: "Proposed message — review and commit
yourself; this skill does not run `git commit`." Never invoke `git commit` —
`allowed-tools` intentionally excludes it.
