---
schema: pipeline.backlog-item.v1
id: pipeline.critic-review-has-no-defined-path-for-a-root-commit
type: defect
owner: pipeline
status: closed
created: 2026-08-09
closed_at: 2026-08-10
closure_repository: self
closure_commit: 700bb4eb75e7c5d37841cf5da2618a419ddb8337
closure_evidence: backlog/evidence/2026-08-10-critic-root-commit-example-closure.md
source: "Codex self-report from a live greenfield test session, 2026-08-09 (rollout files under /home/skar667/.codex/sessions/2026/08/09/), cross-checked by the Elephant directly against plugins/pipeline-core/skills/critic-review/SKILL.md."
due: 2026-08-23
---

# `critic-review`'s dispatch construction has no defined path when the reviewed work IS the root commit

## What happened

The Codex session's own end-of-session self-report claimed a formal Critic
review "could not be meaningfully set up as a normal `BASE..HEAD` review at
the root commit". No actual Critic dispatch was attempted in any of the
three session transcripts (confirmed by direct search — no
`critic`/`critic-dispatch` command anywhere), so this is an **untested
hypothesis from the agent, not an observed live failure**.

However, reading `plugins/pipeline-core/skills/critic-review/SKILL.md`
directly confirms the underlying structural gap is real: the skill's own
dispatch-construction instructions (line 57: `{{DIFF_RANGE}}` example
`main..HEAD`, `{{BASE_REF}}..{{HEAD_REF}}`; line 98:
`git diff --name-only {{DIFF_RANGE}}`; line 134: `git diff {{DIFF_RANGE}}`)
uniformly assume a two-ref range with a real prior commit as the base. A
fresh repository's first commit has no parent and no prior branch history to
diff against — there is no example anywhere in the skill of what
`{{DIFF_RANGE}}` should be when the reviewed work IS the root commit.

## Why it matters

Root-commit reviews are not a corner case for THIS product: the happy path
this session is explicitly hardening is a **greenfield** onboarding — the
very first commit of a brand-new project is exactly the point where a
Critic review of "everything so far" would be most natural to want (the
initial scaffold, first feature implementation, etc.), and it is exactly the
one point where the skill's own dispatch construction has no worked example.

## Direction

Add an explicit worked example to `critic-review/SKILL.md` for the
root-commit case: git's well-known empty-tree object hash
(`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) diffs cleanly against any
commit with no parent (`git diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904..HEAD`
is equivalent to `git show HEAD`'s content, and `git diff --name-only` against
it lists every file the root commit introduced). Document this as the
`{{DIFF_RANGE}}` to use whenever `git rev-parse HEAD^` fails (no parent
exists), alongside the existing `main..HEAD` example.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted and built directly (2026-08-10), rather than left
  in the backlog for a future decision — the PO pushed back on treating a
  well-known, low-risk, fully-specified fix as if it needed a policy
  decision.
- **Rationale:** No ambiguity or tradeoff existed: git's empty-tree hash is
  a fixed, universal constant with no project-specific judgment call.
- **Assignment:** GF-086 (goldfish-mechanic), self-verified by the Elephant
  (diff read directly; empty-tree hash independently confirmed via
  `git hash-object -t tree /dev/null`).
- **Date:** 2026-08-10
