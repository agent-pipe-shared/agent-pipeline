# w30k18 — the admitted `Dispatch:` trailer forms are exported once from the commit-message policy and the obligations generator renders them (candidate 30k, stage 5 of the duplicated-state plan, finding K1-03)

Applies AFTER the integrated 30j tree (the 30i chain plus every 30j lane): the patch is the delta `fd69d44f3..HEAD` of a clone that starts there, and it edits files the 30j lanes also touch. It applies cleanly to that tree (`apply --check` exit 0); against the repository before 30j it is expected not to apply. Protected plugin source: the PO applies the chain (the plugin-source commit route). Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.

## What it changes

- `plugins/pipeline-core/lib/commit-message-policy.mjs`: new export `ADMITTED_DISPATCH_FORMS`, a frozen list of the eight bindings GIT-03 admits (`goldfish`, `stage-0`, `design`, `administrative`, `critic`, `elephant-generated`, `integration`, `elephant-exception`). Each entry holds the display `value` (`<TASK_ID> (goldfish)`, `stage-0 (elephant)`, ...) and its `matches` test, moved verbatim from the old inline chain (`SAFE_TASK_ID`, the `..` path check, the 64-hex digest, the `D<n>` pattern). `admittedDispatchValue` now reads the list; the two refusal texts that name forms (`GIT-03-DISPATCH-MISSING`, `GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED`) and the `administrative` comparison build the forms from it.
- `harness/scripts/generate-agent-obligations.mjs`: section 6 renders the form bullets and the "further bindings" list from `ADMITTED_DISPATCH_FORMS`; the prose per form stays hand-maintained in the generator (`DISPATCH_FORM_PROSE`, `DISPATCH_FORM_GLOSS`) and the generation fails if a prose id is no longer exported. The section marker says which part is derived.
- `templates/prompts/agent-obligations.md` and its vendored copy under the plugin: regenerated with the generator (the vendored copy by copy; AC-2b proves equality). Only the "further bindings" sentence changed shape (it is now a five-item list, because the old sentence could not be derived without re-wrapping prose); the three form bullets are byte-identical.
- Test cases (in `generate-agent-obligations.test.mjs`, four red first): the export exists and is frozen; section 6 lists exactly the exported forms and none the policy refuses (and each exported form is admitted, each refused sample is `GIT-03-DISPATCH-MALFORMED`); the marker names the export; the policy source keeps no inline copy. One green-before-and-after case pins the exact bytes of the three refusal texts.

## Why

K1-03: the forms were typed in the policy (three inline, two texts), the generator, the obligations file and the guardrail, and the hand-maintained sentence had already drifted twice. Only the closed list is derived; the prose is not (DO-NOT-DO 8).

## Checks (tests only; the Critic is suspended by the PO for candidates of this repository and no Full Verify ran)

- Red first: `generate-agent-obligations.test.mjs` 22 cases, 18 pass, 4 fail (the four new cases), before any production edit.
- Green: `generate-agent-obligations.test.mjs` 22 of 22, `commit-message-policy.test.mjs` 49 of 49 (unchanged cases, so every GIT-03 code and refusal text is unchanged), run alone in the clone.

## Open: one pin outside the write list turns red (needs one line, not applied here)

`plugins/pipeline-core/lib/pins/agy-driver-dispatch-and-design-routes-incomplete.test.mjs`, case F7 (line 182), extracts every single-line backticked `Dispatch:` example from the obligations and requires each to be admitted after substituting `<...>` with a task id, excluding the evidence-bound forms `administrative`, `(elephant-generated)` and `(integration)`. The `D<n> (elephant-exception)` form passed only because the old text wrapped it over two lines; now it is listed on one line and `DALF-C-P20-12E (elephant-exception)` is (correctly) malformed. The restatement (QG-04, the form is evidence-bound like its siblings: it needs a recorded numeric decision id) is to add `|\(elephant-exception\)$` to the exclusion regex of that case. The file is outside this slice's write list, so the patch does not carry it; apply that one-line restatement with the chain. A second pin, `installed-design-trailer-example-is-rejected-by-git-guard.test.mjs`, reads the generator SOURCE for the two Elephant forms; the generator keeps them named in its doc comment so that pin stays green, and it should be restated to read the rendered output instead.

## Not changed / not proven

- `commit-message-policy.test.mjs` is untouched: its ids are positional and registered in the case-completion registry (a new case would need a registry row outside this slice); the new cases sit in the unregistered obligations test.
- `dispatch-authorship-verify.mjs` is untouched: its `stage-0`/`design` ids are matched after its own parse and its texts must stay byte-identical; `guardrails/git.md` stays hand-maintained prose.
- The per-id `matches` functions and the display values are still two statements of one shape; the new cases admit one sample per form, which is the pin.
- No stored status, record shape, digest or gate was touched. Not run: Full Verify, the Critic.
