# w30k23 — push-init says what the `--transport-reference` value is for each transport kind and shows an example (candidate 30k, queue item "push-init --transport-reference hint")

Applies AFTER the integrated 30j tree (the 30i chain plus every 30j lane and the 30k wave 1 lanes): the patch is the delta `525fab15d..HEAD` of a clone that starts there, and it edits files the earlier lanes may also touch. It applies cleanly to that tree (`apply --check` exit 0); against the repository before that tree it is expected not to apply. Protected plugin source: the PO applies the chain (the plugin-source commit route). Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.

## What it changes

- `plugins/pipeline-core/scripts/push-init.mjs`: the refusal `<kind> requires --transport-reference` keeps its text as the prefix and now continues with what the value is (ssh-key: the path of the private key file, never its content; credential-helper: the name of the configured Git credential helper) and one complete example command with a placeholder (`<path-to-private-key-file>`, `<helper-name>`). `configured-default` with a reference still says `configured-default takes no --transport-reference`. `usage()` gets a second line with the same one-line explanation per kind.
- `plugins/pipeline-core/scripts/push-init.test.mjs`: one new case (`C30K-K23`) for ssh-key, credential-helper, configured-default and the usage text; `usage` added to the import.

## Why

The refusal named the flag but not the value, so an operator had to guess what to pass. No secret is printed or accepted inline: the example uses placeholders only.

## Checks (tests only; the Critic is suspended by the PO for candidates of this repository and no Full Verify ran)

- Red first: `push-init.test.mjs` 48 cases, 47 pass, 1 fail (the new case), before any production edit.
- Green: `push-init.test.mjs` 48 of 48, run alone in the clone.

## Not changed / not proven

- What is recorded, every digest, the approval flow, and the closed refusal path (still a `usage-error` from `parseArgs`) are unchanged; no stored status, record shape or gate was touched.
- The existing case `C28-ONBOARDING-QUESTIONS` is unchanged and green (it only checks that an error exists).
- If the case-completion registry lists push-init case ids, the new case may need a registry row outside this slice's write list; not checked here.
- Not run: Full Verify, the Critic.
