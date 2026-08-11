---
schema: pipeline.backlog-item.v1
id: pipeline.guard-string-match-makes-a-file-uncommittable
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: b68b611417f8ab0b1adf7b9604fc391ec4e961cf
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-22
source: "SCRATCH-1 dispatch, 2026-08-08: it edited templates/pipeline.yaml.example, its tests went green, and it could not commit the file. It reported the block and attempted no workaround, which is correct behaviour."
---

# A guard that matches on a filename makes that file uncommittable by any agent

## What happens

`guard-gate-strength.mjs` refuses any Bash command whose text contains the
gate-strength manifest filename, with `GUARD-GATE-STRENGTH-SHELL` and no
in-session override. The rule is sound in intent: gate strength must not be
altered through a shell command.

The match is on the *string*, not on the operation. So every one of these is
refused, regardless of what it does:

```
git add -- templates/pipeline.yaml.example
git commit -- templates/pipeline.yaml.example
git diff templates/pipeline.yaml.example
```

The consequence is that a file whose name contains the protected string cannot be
staged, committed, or diffed by name. An agent that legitimately edits such a file
— with Edit/Write, which the guard permits — then cannot land the change it was
just allowed to make.

## The instance

`templates/pipeline.yaml.example` is an **example** manifest. It carries a
commented-out cleanup-allowlist entry, and activating that entry was in the
SCRATCH-1 dispatch's briefed scope. The edit was made and its suites were green.
The commit was refused. The dispatch reported the block honestly and attempted no
workaround.

The orchestrator committed it with a directory pathspec (`git commit -- templates/`)
after confirming via `git status` that exactly one file under that directory was
modified. That is a legitimate narrower act, not an override — but it is a
workaround that depends on the accident that no sibling file was dirty at the same
moment. With two dirty files under `templates/`, it would not have been available.

## Why this is worth fixing rather than working around

1. **It scales with the protected name.** Any file whose path contains the
   protected substring inherits the block: examples, fixtures, documentation,
   tests. The set is not enumerable in advance.
2. **The workaround is the wrong shape.** A broader pathspec is less precise than
   the one the guard refused. A rule intended to increase safety pushed the actor
   toward a wider command — the opposite of what it wants.
3. **It is silent about the real distinction.** Reading a diff, staging a file and
   rewriting gate strength are three very different operations that the string
   match cannot tell apart.

## Direction, not a design

1. **Match the operation, not the substring.** The guard already parses commands
   elsewhere in this codebase; a refusal keyed to what the command *does* to the
   file — write, redirect, in-place edit — rather than to the file's name appearing
   anywhere in the text, would refuse the same attacks and permit `git add`,
   `git commit` and `git diff`.
2. **If the string match stays, admit the read-only and VCS-staging verbs
   explicitly.** Narrower than option 1 and much cheaper; it closes the observed
   trap without re-deciding the rule.
3. **Whichever is chosen, test the trap.** A test in which an agent edits a file
   whose name contains the protected string and then commits it. The absence of
   such a test is why a rule this old only surfaced now.

## Related

- `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md` —
  same class of finding: a rule that is correct about its target and wrong about
  its reach.
- `2026-08-08-the-guard-refuses-the-bounded-diagnostic-its-own-skill-permits.md` —
  the other open instance of a guard refusing an operation its own contract
  contemplates.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
