---
schema: pipeline.backlog-item.v1
id: pipeline.read-scope-guard-admits-single-command-but-blocks-the-piped-form
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: 9639d91ee78f42ca0fbe6c3a424321a9d3c492d8
closure_evidence: plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
sprint: nova
done_when: contains plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs pipeline.read-scope-single-command-root-check
source: "Codex hardening test during the 2026-08-29 three-runner greenfield test, reported inline in chat by the PO (Codex could not persist its own report — see the separate F21/F23 findings)."
---

# A read-scope boundary is enforced for a piped command but not for the identical single command

## What happened

`rg --files <foreign-repo> | head -n 120` was blocked by
`GUARD-READ-SCOPE-OUTSIDE-ROOT`. The identical command WITHOUT the pipe —
`rg --files <foreign-repo>` alone — was allowed. Protection against reading
outside the project root depends on the shell shape of the command (piped vs.
not), not on the actual filesystem target being read.

## Where it is

Confirmed live in `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`, and
the asymmetry is structural, not a bug in one branch:

- **The piped path IS root-checked.** `isOutsideRootBoundedDiagnosticRead()`
  (~lines 2345–2352) evaluates the bounded `rg | head` (and `grep | head`,
  `cat | head`) pipeline shape against the invocation root plus every argv
  token resolved as a candidate extra root, and its caller —
  `evaluateAfterGrammarAdmission()`'s `NVA-BL-76` branch, ~lines 3915–3925 —
  is what actually prints `GUARD-READ-SCOPE-OUTSIDE-ROOT` for a bounded
  pipeline reading outside root. This is exactly the code path the Codex
  report's piped command hit.
- **The un-piped path is NOT root-checked at all.** `isReadOnlySimpleWords()`
  (~lines 2074–2076) handles a single, un-piped command whose executable is one
  of `ls`, `rg`, `grep`, `cat`, `head`, `tail`, `wc`, `stat`, `file`:
  ```
  if (["ls", "rg", "grep", "cat", "head", "tail", "wc", "stat", "file"].includes(executable)) {
    return !args.some((arg) => arg === "--files-with-matches" && executable === "grep");
  }
  ```
  This returns `true` (read-only, therefore admitted with `verdict(0)` at
  `evaluateAfterGrammarAdmission()` line ~3886, via
  `isReadOnlyDiagnosticCommand()`) for ANY argument list except the one
  `grep --files-with-matches` exclusion — there is no call anywhere in this
  branch that resolves a path argument against `root` the way the piped branch
  does. A bare `rg --files /some/other/repo` therefore reaches this branch and
  is admitted unconditionally.

So the guard does have the exact machinery needed to check scope
(`isOutsideRootBoundedDiagnosticRead` / `pathInside`) — it is applied on one
code path (the bounded-pipeline admission decided in
`evaluateAfterGrammarAdmission`'s grammar-error branch) and not on the sibling
code path (`isReadOnlyDiagnosticCommand` → `isReadOnlySimpleWords`, reached
earlier at line 3886 and returning before the pipe-specific logic is ever
evaluated).

## Proposal

Apply the same root-containment check `isOutsideRootBoundedDiagnosticRead()`
already performs for the piped shape to the single-command branch in
`isReadOnlySimpleWords()`, for the path-taking executables in that list (`rg`,
`grep`, `cat`, `head`, `tail`, `wc`, `stat`, `file`, `ls`; `find` has its own
separate branch and is out of scope here). Concretely: for each argv token
that is not a flag, resolve it against `root` (`commandPath`/`resolve`, the
same helper the piped path uses) and refuse admission if any resolved target
escapes the root the way `pathInside()` already tests. Reuse the existing
helper rather than writing a second copy of the containment logic — a second
copy is exactly the kind of drift this repository's own guardrails warn
against elsewhere.

## Acceptance

- A test demonstrates, for at least `rg`, `cat`, and `head`, that a single
  un-piped command naming a path outside the project root is refused with
  `GUARD-READ-SCOPE-OUTSIDE-ROOT` (or an equivalent code), not admitted.
- The identical piped form (already covered by existing tests per NVA-BL-76)
  continues to be refused — no regression.
- A single un-piped command naming only in-root paths continues to be admitted
  — proven by a test, since this is the read-only working pattern most of a
  session's diagnostic activity depends on.
- `BOUNDED_PIPELINE_ADDITIONAL_ROOTS` (the existing allowlist of roots a
  bounded pipeline may legitimately read beyond the project root) is honored
  identically by the single-command check, so a path currently legitimate for
  the piped form does not become newly refused for the un-piped form.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Verified directly against this repository's own source, not
  merely on the Codex report: `isReadOnlySimpleWords()` genuinely has no
  root-containment check while `isOutsideRootBoundedDiagnosticRead()` genuinely
  does, for the sibling shape. This is exactly the class of "protection depends
  on command shape, not on the action" the F01 item names as the underlying
  design flaw across this guard layer.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate per the triage's S
  group. Should land alongside or after F01, since both are gaps in the same
  read/write boundary the guard layer is meant to enforce.
- **Date:** 2026-08-29
