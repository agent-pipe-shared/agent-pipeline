# Survey: printed hints that could interpolate a repository path from the Critic range into a shell command (2026-10-29, HEAD 694d8898a)

Question (PF-97 follow-up): does any operator-facing text on the Critic registration and admission route print a command with a path that came from the reviewed range and could be copy-pasted unquoted, so that a name with a space, parenthesis, dollar sign or similar breaks it?

Method: read-only search of the non-test sources of the route for printed commands and path interpolation: `critic-course-admission.mjs` (remedy table), `feature-package-registration.mjs` (refusals, `next`, the delta request preflight argument list), `register-feature-package.mjs` (help and the step list), `critic-dispatch-preflight.mjs`, `critic-diagnostic-evidence.mjs`, `session-critic-finalizer.mjs`, `push-prepare.mjs`.

## Result: no defect found

- Every printed command text uses a placeholder for a path (`<root>`, `<path>`, `<input.json>`, `<envelopePath>`, `<manifestPath>`, `<packetId>`), never a value from the range. Sites: `critic-course-admission.mjs` remedy table, `feature-package-registration.mjs` refusals for the lineage and delta routes, `register-feature-package.mjs` help and the two `git add` step lines, `critic-diagnostic-evidence.mjs` help.
- The registration result carries paths as DATA, not as a shell string: `commitPaths`, `manifestPath`, `deltaRequestPath` and the preflight `arguments` list are JSON values (an argv array), so quoting is the consumer's concern and no copy-paste string is built from them.
- The one place that renders an argv into a shell-looking string is `push-prepare.mjs` (`resolveVerifyRemedy`): it wraps each value in JSON double quotes. Its values are the project root, a fixed evidence output path and a base commit, not range file names. A project root containing a dollar sign or a backtick would still expand inside double quotes in bash; that is a minor residual of the root path, not of the range, and is left unchanged.
- `${PIPELINE_PLUGIN_ROOT}` in the printed text is a literal environment variable reference meant for the shell, by design.

## What this does not cover

Hint texts in skills and reference documents (markdown) were not read line by line; they use the same placeholder style in the places checked by the D2 slice. A live consumer run with a file name containing a space remains part of the consumer retest gate.
