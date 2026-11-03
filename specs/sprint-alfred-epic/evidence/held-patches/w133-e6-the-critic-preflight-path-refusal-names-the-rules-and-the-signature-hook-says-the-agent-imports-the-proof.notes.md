# w133 — the Critic preflight path refusal names the rules and the signature hook says the agent imports the proof (candidate 19, Q10/E6, Windows greenfield)

Applies on top of the applied chain at 01952cbe7. Elephant-built small item (PO exception for small items), built in a clone.

## What it changes

- `lib/critic-required-guardrails.mjs` and `scripts/critic-dispatch-preflight.mjs`: the `CDP-PATH` refusal now states the rules of a normalized repository-relative path (relative to the repository root, no leading `./` or `/`, no trailing `/`, no backslash, no `..` segment) with an example, instead of only saying "normalized".
- `scripts/guard-human-override.mjs`: the operator block of `prepare-for-signature` now says that the agent runs the `authorizeBySignatureCommand` of the JSON output itself, so the PO does not look for a second command. The block stays within the 72-column bound (two short lines).

## Checks

- `critic-dispatch-preflight.test.mjs` run alone in the clone: 91 of 91 pass.
- `guard-human-override.test.mjs` run alone in the clone: 39 of 39 pass. A first, longer wording failed two column-bound cases; the text was shortened, no test was changed.
- `w133-...check.test.mjs`: the patch exists, applies to the real HEAD and touches only the three named files.

## Not changed / not proven

- No full Verify run; no independent Critic review of this patch (suspended by the PO until a working local candidate exists).
- The wording is not shown to a native Windows operator.
