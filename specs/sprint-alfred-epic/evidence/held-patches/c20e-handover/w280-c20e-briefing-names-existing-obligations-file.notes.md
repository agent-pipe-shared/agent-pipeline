# w280: the Goldfish briefing names the obligations file that exists for the project (candidate 20e, G20-75, AC-108)

Built by the Elephant (PO exception: small items) in the slice clone `scratch/agent-out/c20e` on top of w279. One clone
commit, one patch. Closest criterion: AC-108; PRD and Spec unchanged.

## Why

Measured in the Claude greenfield TabletApp_claude_070_3 (2026-11-08, 10:31Z, Goldfish a24d586b): the generated briefing
opens with "Read `templates/prompts/agent-obligations.md` at the repository root first (a project that has no such file
reads the identical copy at `${PIPELINE_PLUGIN_ROOT}/...`)"; a consumer project never has that file, so every dispatched
Goldfish first spends one call on a read the guard refuses (GUARD-READ-TARGET-MISSING) before it reads the plugin copy.

## What the patch changes

1. `lib/dispatch-briefing-build.mjs`: `obligationsReadSentence(path)`; `renderGoldfishBriefing()` takes an optional fifth
   argument, the resolved obligations path. With a path the first line reads "Read `<path>` first (the obligations file
   that exists for this project) and follow it: ..."; without one the generic two-path sentence is unchanged.
2. `scripts/dispatch-briefing.mjs` (`build`): `obligationsPathFor(root)` returns the project's own copy repository-relative
   when it exists, else the plugin copy's absolute path below the plugin root the script runs from (forward slashes in
   the text), else null. Injectable as `deps.obligationsExists` for tests.

## Tests (QG-04)

`scripts/dispatch-briefing.test.mjs` PF-100 restated in place with a G20-75 comment: the fixture project (no own copy) is
told the plugin copy's absolute path; a project with its own copy is told the repository-relative path; with neither the
generic sentence still names the repository root and `${PIPELINE_PLUGIN_ROOT}`.

## Evidence (clone, one suite at a time, private TMPDIR)

`scripts/dispatch-briefing.test.mjs` 169/169, `hooks/guard-dispatch.test.mjs` 85/85,
`lib/native-goldfish-host-state.test.mjs` 81/81,
`lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs` 18/18.

## Not changed

The host parser of the briefing (it does not read this line), the obligations file, the read guard.

## Not proven

A live Goldfish reading the named path first (next greenfield). The briefing now carries an absolute plugin path in a
consumer project; it is a runtime file under `scratch/`, never committed.
