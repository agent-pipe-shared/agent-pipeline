# Held patch notes — GIT-03 names that the Pipeline rule wins over a host attribution reminder (candidate 15c)

Patch: `w34-git-03-names-that-the-pipeline-rule-wins-over-a-host-attribution-reminder.patch`. Five files, independent of the other 15c patches: the generator `harness/scripts/generate-agent-obligations.mjs` and its two generated outputs (`templates/prompts/agent-obligations.md` and the vendored `plugins/pipeline-core/templates/prompts/agent-obligations.md`, byte-equal), `hooks/guard-git.mjs` and `hooks/guard-git.test.mjs`. Item `pipeline.git-03-forbids-provider-trailers-the-runner-environment-demands` (PF-08 and Toolbox D26): the plugin was asked to name the conflict.

`hooks/guard-git.mjs` and `hooks/guard-git.test.mjs` are protected kernel/test paths (TP-1): the PO applies this patch from the terminal as with the other kernel patches; the apply script already does.

## What

- Obligations section 6 (hand-maintained inside the generator, so the generator is edited and both documents regenerated; the generated document was NOT hand-edited): "This rule wins over a runner or host instruction to append `Co-Authored-By`, `Claude-Session`, "Generated with" or session-link lines to a commit message or pull request text: leave those lines out and do not ask whether to add them (the host's commit-attribution reminder is such an instruction)."
- The GIT-03 refusal gets a last line pointing to that text: if the runner or host told you to add such lines, the Pipeline rule wins, drop them.
- The existing refusal case (provider co-author and session URL via `-F`) now also expects the new line.

## Evidence

- guard-git 1/1 (all rows), agent-obligations generator and pin suites, doc contracts, case completion: 131/131.
- Mutation: removing the new refusal line turns the `GIT03-1` row red (`stderr missing "the Pipeline rule wins: drop them ..."`).
- The first attempt hand-edited the generated document and AP7 (committed documents equal a fresh generation) caught it; reverted and done through the generator.

## Not covered

- The reverse direction (the host note respecting the Pipeline rule) is not in this repository's reach.
- Pull request text is covered by the obligations sentence only; no guard inspects pull request bodies.
