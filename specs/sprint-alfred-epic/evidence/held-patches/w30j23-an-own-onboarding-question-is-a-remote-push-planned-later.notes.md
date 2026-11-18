# w30j23 — the first onboarding round asks its own question "is a remote push planned later?" (candidate 30j, slice C30J-J23)

Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.
Successor of slice C30J-J21 (recon only, stopped: a stored answer would need a new argv flag, a receipt field and a changed `answerSha256`). PO tile 2026-11-18: "Design B as an active own question in the ONE existing first round", no stored answer.

Order of application: this patch is a delta on the integrated 30i tree (the clone base9). It does NOT apply to the real checkout until that tree is applied first; `apply --check` against it passes (exit 0). An `apply --check` against the real HEAD alone is expected to fail and is not an error.

## What it adds

- `plugins/pipeline-core/lib/project-onboarding-v3.mjs`: two new exported constants, `REMOTE_PUSH_PLANNED_QUESTION` ("Is a push to a remote planned later? (yes / no / not sure)") and `REMOTE_PUSH_PLANNED_GUIDANCE`, which wraps the question with a one-line recommendation and reason and says what the agent does with each answer. The wording is defined ONCE. `collectInitialAnswersAction` renders the constant in the guidance of the one existing first-round ask (just before "Do not reconstruct git config ...").
- `plugins/pipeline-core/scripts/onboarding-init.mjs`: imports the same constant and renders it in the driver's rewritten guidance (`initialAnswersActionWithoutTrustAnchor`), at the same position. The rewrite is the text a fresh project actually receives (signature and chat route alike); the library text is what the driver passes through unchanged. Both sites therefore carry byte-identical wording from the one constant.
- What the ask tells the agent (the answer is NOT recorded and is never added to `applyAction.argv`):
  - yes and a remote already exists: run `node <plugin-root>/scripts/repository-mode-promote.mjs --root <project-root> --to remote-tracked` before the first feature, and commit the paths it prints as their own commit;
  - yes and no remote yet: run that same command once the PO has added the remote (it refuses with `RMP-NO-REMOTE` until one exists);
  - no or not sure: nothing now; the same command stays available later, as its own commit before the next feature;
  - a host-managed project needs none of it.
- `plugins/pipeline-core/scripts/onboarding-init.test.mjs`: four new cases (`C30J-J23: ...`) and one namespace import of the library, all written first.
  - the ask carries the question exactly once, with the recommendation, the reason and the three answer paths;
  - the argv flags (`--root --runner --git-author-name --git-author-email --pipeline-actor --human-approval --advisor-export-consent --language`), the input names and the `fieldsAtOnce` names are exactly what they were, for Claude and Codex, and no input, field, placeholder or flag names the question;
  - a rerun (reload in the middle) publishes the byte-identical ask, still with one question;
  - the wording is defined once (the question text exists in exactly one place across the two sources) and both sites render that constant, including a driver rewrite of a library-shaped ask.

## Test first

The cases were written before the first production edit and run RED against the unchanged code: 3 of the 4 failed (question count 0 instead of 1, library export undefined); the fourth (argv/inputs/fields unchanged) was green by design and stays green after the change. After the change the same four cases are GREEN (4 of 4).

## Deliberately not changed

- No argv flag, no input, no field, no receipt field, no `answerSha256` or journal digest, no calibration target, no guard sanctioned-args table; `repository-mode-promote.mjs` and `v3-bootstrap-authority.mjs` untouched.
- `plugins/pipeline-core/lib/onboarding-initial-answers-state.test.mjs` is on the write list but unchanged: it pins only the receipt paths and state resolution, not the ask text; nothing in it moved.
- No existing test was restated or weakened. The 240-case sharded partition of `project-onboarding-v3.test.mjs` is untouched.
- The briefing mentions that "the close text keeps its order hint". No such hint exists in the plugin code today (search for it found none; it is queue item C30-24, not built here), so the ask states the order itself ("as its own commit before the next feature") and nothing else was added.

## Not proven

- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only. Verify, an independent Critic review and PO acceptance remain open.
- The library site was checked by source structure (one constant, one interpolation) and by the shared constant, not by a rendered library-only ask: a fresh project always receives the driver's rewrite, and a library-only ask needs a machine state with a materialized trust anchor that the suite's fixtures do not build.
- Tests run (each alone, in the clone, private TMPDIR): `scripts/onboarding-init.test.mjs` 71 of 71 pass (includes the 4 new cases); `lib/onboarding-initial-answers-state.test.mjs` 6 of 6 pass; `lib/pins/unasked-advisor-export-consent-in-fresh-seed.test.mjs` 7 of 7 pass; the held-patch check file 2 of 2 pass. A search found no other test that pins the full first-round guidance wording. The e2e, guard and other registered suites were not run.
