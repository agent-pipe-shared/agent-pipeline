---
schema: pipeline.backlog-item.v1
id: pipeline.commit-trailer-authoring-needs-a-typed-single-command-route
type: workflow-improvement
owner: pipeline
status: closed
closed_at: 2026-09-14
closure_repository: self
closure_commit: 0605b19f7e9db2fa84ca19a6f4078c8cedd50df7
closure_evidence: plugins/pipeline-core/lib/commit-message-policy.test.mjs
done_when: manual
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — newline-free shell grammar makes ordinary multi-paragraph git commit commands expensive; retain strict trailer validation while removing scratch-file choreography from the normal path."
source: "evidence/pipeline-analysis-agy-062-103.md §§42–55, 125–134; evidence/pipeline-retrospective-2026-09-13.md §§55–88."
---

# Validated commit trailers require an avoidable scratch-file detour

The command grammar correctly does not accept arbitrary multiline shell text.
In practice, a normal Conventional Commit body plus `AI-Assisted` and
`Dispatch` trailers then needs a temporary file and `git commit -F` for every
commit.  That is safe but adds an avoidable turn and a manual artifact to the
standard happy path.

## Direction

Provide a typed `pipeline-commit` plan/apply route that accepts structured
subject, body and trailers, validates the existing trailer rules, writes a
private temporary message safely, invokes Git with exact paths, and reports the
result.  It must not make arbitrary multiline shell grammar admissible.

## Acceptance criteria

- A valid structured message commits without a user-created scratch file.
- Invalid/missing required trailers remain refused before Git is invoked.
- The emitted command and error recovery are copy-safe on POSIX and Windows.

## Closure

Closed as superseded by `0605b19f7e9db2fa84ca19a6f4078c8cedd50df7`
(`fix(git): parse copy-safe multi-message trailers`). That fix reconstructs
Git's repeated-`-m` semantics for the pre-tool check and provides the
copy-safe `git commit --trailer` form for new guidance. The final `commit-msg`
hook remains the unchanged authoritative trailer validator; malformed, split,
or missing provenance trailers are still rejected there and in the earlier
guard.
