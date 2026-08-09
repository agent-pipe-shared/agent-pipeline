<!--
GENERATED FILE — do not edit by hand.
Produced by: harness/scripts/generate-agent-obligations.mjs
Pinned by:   harness/scripts/generate-agent-obligations.test.mjs (byte equality)

Every rule below is read from the component that enforces it. Editing this
file instead of its source makes the suite red, which is the point: a
hand-written second copy of a rule a guard owns is what drifts.
-->

# Obligations every dispatched agent is measured against

Include this file's contents in every Goldfish and Critic briefing, or point
the agent at this path. These rules are enforced at runtime by the guard
union. Until this file existed they were stated nowhere an agent reads, and
agents learned them by being refused — which costs a retry, and every retry
spends a tool use from the budget that is also the stop condition.

## 1. One simple command per Bash call (the closed shell grammar)

<!-- hand-maintained: no component exports the grammar as data, so this rule
     is stated rather than derived. Source of truth:
     plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs. The two tables
     below ARE measured. -->

`guard-lifecycle-ready` admits exactly **one simple command per tool call**.
No `&&`, no `;`, no redirects (`>`, `2>&1`, `| tee`), no line continuations.
Bounded `rg`-to-`rg` and `rg`-to-`head` diagnostic pipelines are the only
admitted composition.

The two workarounds that cost the most time before they were written down:

- **A multi-line commit message.** A `-m` value containing a newline is
  refused. Write the message to a file and use
  `git commit -F <msgfile> -- <paths>`. A finished dispatch once lost its own
  commit to this, with its files staged and its suites green.
- **Capturing output to a file.** `>`, `2>&1` and `| tee` are all refused.
  Write the file from Node instead.

One more, not enforced by a guard and therefore easy to miss: `rg -r` is
*replace*, so `rg -rn 'x'` silently means `rg -r n 'x'` and prints nonsense.
Use `rg -n`.

### 1a. What a NON-READY session may still run

Measured at generation time via `isReadOnlyDiagnosticCommand()`. This is the
narrow read-only lane that survives when readiness is lost — the state you are
in precisely when you most need to look around. It is **not** the full set a
ready session may run, which is wider.

- `git status --short`
- `git rev-parse HEAD`
- `rg -n 'needle' file.txt`
- `rg -n 'a' x | rg -n 'b'`

### 1b. Which refusals carry a typed retry action

Measured via `retryActionsForDeniedCommand()`. A refusal with actions names a
narrower command you may run instead; one with none does not, and hunting for
a route it never offered is wasted budget.

| Command | Typed retry actions |
|---|---|
| `rg -n 'needle' file.txt | head -20` | 0 |
| `git commit -F msg.txt -- a.md` | 0 |
| `git commit -m 'one line'` | 0 |
| `git commit -m 'line one\n\nline two'` | 0 |
| `git status && git log` | 0 |
| `git status ; git log` | 2 |
| `echo hi > out.txt` | 0 |
| `cat a.txt 2>&1` | 0 |
| `ls | tee out.txt` | 0 |

## 2. Protected test paths — and there is no in-session override

Derived from `project/guard-config.json` (10 entries). `guard-testpath`
refuses every Edit/Write against these. For Pipeline plugin source in a source
checkout the override does not help either, and the reason is specific rather
than general: `recordHumanGuardDenial()` takes the `eligible.authorCandidate`
branch (`plugins/pipeline-core/lib/human-guard-override.mjs`) and returns
`status: "author-repair-required"` instead of `"planned"`. Author repair needs
an explicit author source root, which a guard will not select on a human's
behalf. **Needing one of these is a stop condition — report it, do not hunt for
a route.**

| Id | Pattern (verbatim) |
|---|---|
| `TP-1` | `plugins/pipeline-core/hooks/guard-git\.test\.mjs$` |
| `TP-2` | `plugins/pipeline-core/hooks/guard-testpath\.test\.mjs$` |
| `TP-3` | `harness/scripts/verify\.mjs$` |
| `TP-4` | `plugins/pipeline-core/hooks/hooks\.json$` |
| `TP-5` | `(?:plugins/pipeline-core/hooks/guard-push(?:-v2)?|harness/scripts/pipeline-state)\.test\.mjs$` |
| `TP-6` | `plugins/pipeline-core/hooks/guard-gate-strength\.test\.mjs$` |
| `TP-7` | `plugins/pipeline-core/hooks/guard-testpath-override\.test\.mjs$` |
| `TP-8` | `plugins/pipeline-core/lib/entrypoint\.test\.mjs$` |
| `TP-9` | `plugins/pipeline-core/lib/critical-human-proof-policy\.test\.mjs$` |
| `TP-10` | `plugins/pipeline-core/hooks/notebook-write-coverage\.test\.mjs$` |

This is not a blanket rule about `plugins/pipeline-core/**`: files under that
tree that match no pattern above are ordinarily editable.

## 3. Where a draft-phase write is allowed

`guard-devplan` blocks implementation writes before plan approval, and exempts
these prefixes (derived from its exported `DEFAULT_EXEMPT_PREFIXES`):

- `docs/`
- `specs/`
- `.claude/`
- `backlog/`
- `scratch/`

`scratch/` is the right place for a probe or a throwaway fixture. Note what it
is **not**: onboarding does not add it to a project's `.gitignore`, and in the
Pipeline's own repository it *is* ignored — so anything durable left there is
lost. Move it to a tracked path before you finish.

## 4. Read-only scripts exempt from the gate-strength shell lane

Derived from `guard-lifecycle-ready`'s exported table. A command naming one of
these is not treated as a write to a gate-strength path:

- `scripts/critic-dispatch-preflight.mjs`

## 5. Which refusals can be lifted, and by whom

Do not guess, and do not read a table — **ask**:

```
node <plugin-root>/scripts/repair-map.mjs
```

`<plugin-root>` is the absolute path the bootstrap printed as `plugin root`;
substitute it yourself. The guard admits that exact path and nothing else — a
copy of the same script inside the project tree is a different program and stays
refused — which is why no repository-relative form of this command works.

It queries the real override planner at runtime and separates three answers
that all look like "refused" from the outside: never liftable by construction,
never liftable by policy, and author-repair-required — which is not "no route"
but "a route this session cannot select on a human's behalf". This file
deliberately carries no static copy of that; a second copy is the drift.

## 6. Commit discipline

<!-- hand-maintained: these are role/policy rules (GIT-03, the shared-index
     race), not values any guard exports, so no generator can derive them. -->

- `git add -- <exact paths>` then `git commit -F <msgfile> -- <same paths>`, as
  two consecutive calls. Never `git add -A`, never `git add .`, never a bare
  `git commit` — in a shared working tree a wildcard add lets another agent's
  files ride along on your commit.
- Commit messages carry **no** provider or model co-author trailers, **no**
  session URLs, **no** correlation identifiers (GIT-03; there is no override).
  Only `Dispatch: <TASK_ID> (goldfish)` and `AI-Assisted: true`.
- Commit as soon as a piece is green, not at the very end. A commit that exists
  survives a truncated run; a commit that is only planned does not.

