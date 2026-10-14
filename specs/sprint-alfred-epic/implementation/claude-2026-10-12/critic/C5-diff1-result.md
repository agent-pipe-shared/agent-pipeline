# Critic C5 diff round 1, part 1: result (persisted by the Elephant)

The Critic could not persist its own notes (`DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE: critic-notes-partial-held`),
so the Elephant records the returned report here. Route: requested `claude-sonnet-5-5 at high`; the Critic
observed `claude-sonnet-5-5` in its own runtime prompt. Lane: functional-equivalent-read-only. Review object:
`012333a88`, `7fb29f0ab` ([briefing](C5-diff1.md)). An earlier dispatch of this round stopped before any review
with a briefing violation (the briefing named a prior-round result as evidence); that reference was removed.

**Status: PARTIAL review, pass/fail withheld.** The budget hook stopped the review at call 32 of 40.

## Examined

- 7fb29f0ab: `ALF-C-P1-10B.patch` and its check test in full, compared hunk by hunk with `ALF-C-P1-10.patch`;
  HEAD targets `hooks/guard-command-grammar.mjs` (full), `lib/guard/shell-grammar.mjs` (parts),
  `lib/guard/path-containment.mjs`, `lib/passive-read-policy.mjs` (lines 1-250); callers of
  `isBoundedReadOnlyPipeline` (`shell-grammar.mjs:1109`, `read-scope.mjs:225-334`, `po-commands.mjs:115-165`).
  Both patch bases match the HEAD blobs.
- 012333a88: patch text and check test only.
- Categories 3, 5, 6, 8, 10, 11 for P1-10B; 2, 4, 9 partly; 1 and 7 not.

## Findings that passed the evidence gate

**F1 (minor): stat-lane declaration overclaims closure; the claimed closure is unpinned.**
The declaration says every `-c...`/`--format...` argument is routed into the closed lane "so no other spelling
of a format option is admitted through the generic flag treatment". The routing regex
`/^--format(?:=|$)|^-c/u` matches only arguments starting with `--format` or `-c`; by reading,
`stat --printf=%a <file>` and clustered `stat -Lc%a <file>` stay admitted by the pre-existing generic treatment
(`shell-grammar.mjs:978-987`, `:688-689`; `path-containment.mjs:176-177`). Not a new widening, and stat
directives are display-only, but the declared contract is inaccurate and AP13/AP14 pin only the separate
`--printf`/`-f` and attached `--format=`/`-c<fmt>` forms. Spec-ref: C5-F1 (declare and pin both lanes).

## Delta status for the examined part (not a verdict)

- No widening: executable lines of P1-10B are identical to ALF-C-P1-10.patch; differences are declaration
  comments, the git-show function moved above the JSDoc, and the pin added as a third target.
- Declared: both lanes carry a `// LANE (declared under backlog item ...)` block above their predicates.
- Pinned on paper (AP10-AP14). Not confirmed: whether the pin fixture contains `vault/id_rsa` and
  `plugins/pipeline-core/lib/a.mjs`; if `vault/id_rsa` is missing, the credential cases are confounded by
  non-existence (`passive-read-policy.mjs:226-229`).

## Deliberately not flagged

Git-show lane bounds (ref shape, path parts, metacharacters, realpath containment plus passive-read policy,
head-only sink 1..500; narrower than the existing un-piped `git show`); callers (`additionalRoots` ignored,
`po-commands.mjs:140`); stat lane bounds (first-position separate token, two fixed formats, operands non-dash,
existing, in root, realpath equal, file or dir, `.every`); imports; test integrity (additive, AP numbering,
6 cases per check test); no third-party dependency; English; commit hygiene (trailers, no co-author/session).

## Trajectory: not verifiable

No mechanical DoD artifact for mirror RED/GREEN, patch-check, `git apply --check` or the guard-suite
comparison; counts are internally consistent. Authorship rests on trailers only; both commits carry
`Commit-Act: orchestrator` and add only `specs/` patch artifacts. The `Dispatch:` trailer of 7fb29f0ab names
`ALF-C-P1-10C` while the artifact is named `ALF-C-P1-10B` (continuation dispatch of the same slice).

## Not reached

Spec rows AC-128 (`spec.md:3051`) and AC-164 (`:3087`); audit mapping row P1; PO decisions K3/K12; backlog items
`2026-10-03-claude-windows-guard-refuses-every-in-repo-read.md` and
`2026-10-05-dispatch-record-ownership-binds-an-attempted-creation.md`; guardrails `quality-gates.md`,
`security.md`, `roles/goldfish.md`, `project/pipeline.json`; the working-tree pins
`lib/pins/claude-windows-guard-refuses-every-in-repo-read.test.mjs` and
`lib/pins/dispatch-record-ownership-binds-an-attempted-creation.test.mjs`; `lib/guard/dispatch-record-lane.mjs`,
`lib/windows-private-state.mjs`; `hooks/guard-lifecycle-ready.test.mjs`. Estimated remaining scope: about 25
tool uses.
