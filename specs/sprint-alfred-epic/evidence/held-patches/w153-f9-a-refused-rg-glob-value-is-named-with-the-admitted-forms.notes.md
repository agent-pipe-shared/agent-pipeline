# w153 — a refused rg glob value is named with the admitted forms (candidate 19, F9 rest)

Applies on top of the chain through w152 (it needs the w131 state of `lib/guard/evaluate.mjs`). Elephant-built, in a clone that carries the whole chain.

## Why

Reproduced live in this session: `rg --files <dir> -g 'w130*'` was refused with `GUARD-READ-COMMAND-UNSUPPORTED` and no `Rejected element:` line. The existing diagnosis names a single flag whose removal admits the command; a bad glob value is not a flag fault, so it stayed silent, and the agent could not tell which spelling is admitted. The grammar admits a filename filter only as `*.ext`, `*.test.ext`, `**/*.ext` or a multi-dot extension.

## What it changes

- `lib/read-command-diagnosis.mjs`: `firstUnadmittedGlobValue(command, root)` (the glob value of `-g`/`--glob` that, replaced by an admitted form, makes the one rg command admitted; null for anything else, pipelines and redirects included) and the `GLOB_FORM_HINT` sentence. The grammar stays the only authority; the helper asks it.
- `lib/guard/evaluate.mjs`: the unsupported-read refusal prints `Rejected element: the glob value "<value>" (<hint>)` when the glob is the reason, else the flag as before.
- `lib/read-command-diagnosis.test.mjs`: RCD10 (helper) and RCD11 (the printed refusal, still refused).

## Checks

- Clone with the whole chain: `read-command-diagnosis.test.mjs` 11/11.
- `guard-lifecycle-ready.test.mjs` in the same clone: 430 tests, 427 pass, 0 fail, 3 skipped (the skips are existing).
- `git apply --check` of the patch against the rehearsal clone that carries the chain (the base of the work clone): exit 0.

## Not changed / not proven

- No grammar change: nothing new is admitted; only the refusal text is richer. The coordinated rewording of the pinned intended-read refusal texts (Q2) is not part of this.
- No Full Verify; no independent Critic review (suspended by the PO).
