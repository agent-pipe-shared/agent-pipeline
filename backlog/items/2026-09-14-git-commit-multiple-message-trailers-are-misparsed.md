---
schema: pipeline.backlog-item.v1
id: pipeline.git-commit-multiple-message-trailers-are-misparsed
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-14
closure_repository: self
closure_commit: 0605b19f7e9db2fa84ca19a6f4078c8cedd50df7
closure_evidence: plugins/pipeline-core/lib/commit-message-policy.test.mjs
created: 2026-09-14
due: 2026-09-30
sprint: nova-b
done_when: manual
source: "Observed while committing the cross-runner onboarding-recovery hotfix."
---

# Commit-message guard misparses a final multi-message trailer block

## Problem

The PreTool Git guard rejects a normal `git commit` invocation that supplies
the final contiguous `AI-Assisted: true` and `Dispatch:` trailer block through
one final `-m` argument. Git itself materializes the intended final message,
and the repository's commit-msg hook accepts that finished message, but the
earlier command parser reports both trailers as missing.

This forces an unnecessary temporary `git commit -F <message-file>` workflow
and makes normal, line-break-safe commit guidance unreliable.

## Done when

- The PreTool parser reconstructs Git's final message semantics for repeated
  `-m` arguments, including a final argument containing a contiguous trailer
  block.
- It accepts a valid `AI-Assisted: true` plus `Dispatch:` final block and
  continues to reject missing, split, malformed, duplicated, or provider
  correlation trailers.
- `-F` remains supported and produces the same GIT-03 decision for equivalent
  message bytes.
- Codex, Claude Code, and Antigravity guidance emits one copy-safe standard
  command without relying on line-continuation-sensitive prose.
- Focused parser and hook tests cover POSIX and Windows command spellings.

## Scope

This changes only the command-time message interpretation used for GIT-03. It
does not weaken the final Git commit-msg hook, alter provenance requirements,
or add a hook-bypass route.

## Resolution

Closed by the shared argv tokenizer's Bash ANSI-C quote handling and the
copy-safe `--trailer` commit form. Focused coverage verifies POSIX repeated
`-m`, Windows `git.exe` trailer switches, malformed final blocks, the existing
Git-guard suite, and the generated cross-runner obligations prompt.
