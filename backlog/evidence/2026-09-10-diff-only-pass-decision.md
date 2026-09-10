# Diff-only PASS completion — PO decision, 10 September 2026

The PO instructed: “Zum pass entscheiden: okay dann Regel anpassen aber es
darf dann immer nur der diff danach weiter geprüft werden”. This authorizes
the rule amendment and correction-only follow-ups; it does not authorize
repeating whole-artifact reviews or widening private-content export scope.

QG-13 now retains the ordinary two-round economy and allows further bounded
correction reviews when an accepted delivery contract explicitly requires an
actual independent PASS. Every follow-up starts at the immediately previous
reviewed commit. Unchanged cleared areas remain closed. Existing execution,
cost and course limits continue to apply. A retained actual diff PASS and
verified continuous source/receipt lineage can fulfill that PASS criterion;
neither a failed receipt nor coordinator self-verification becomes PASS.

The change is synchronized in the canonical and shipped rules, Operating
Model and Critic template, and in the two current inventory/audit contracts.
The native transport already supports exact ranges through `reviewBase`;
its `reviewMode: "full"` examines that range and does not expand its scope.

## Separation and validation

The rule author changed nine documented/specification paths and did not
modify the protected-preimage control. A different mechanical actor verified
and transcribed only the `harness/review-protocol.md` hash required by that
authorized change. The recorded mapping is:

- Before: `c7ead6fdf94f9c0461ae5ebc17a376b0f5989a21016f0f41b06f7ea77d6621ac`
- After: `f5264d9ecd337a3fa375e1884baba31abaff8184d1302642e9820cfc2ffef7e9`

The control inventory changed from
`aafc9bfcb5650324c5b29c522f791d7decfe622c43d5f385db929f16232d43d5`
to `647a72df85bb0f0a6275ad2a25edac49b4dfd5dda3fe05369d7fd4747f941338`.
All eight other protected hashes matched unchanged entries. The user authorized
the substantive rule action; these generated hash values were not presented
as a separate independently signed human decision. No guard refusal occurred
during this exact mechanical transcription.

Focused validation passed: 65 documentation tests, eight vendoring tests,
Critic contract checks, template parity and whitespace checks. The protected
preimage check first detected the sole expected protocol mismatch and then
passed all four tests after the independent transcription. Artifacts are in
`scratch/NVA-DIFF-ONLY-PASS-RULE-1/` in the repair checkout.

## Consent implementation correction

The [initial Consent review](2026-09-10-consent-initial-critic.json) completed
on `70dc18eeee69e5a76a8fa2ad8f52969055024db2` after 658 seconds: FAIL,
three findings and no briefing violations. Its canonical receipt digest is
`88e630652fd8754c298a65bc247fc52ab1930e2e3bc69e8a7b3c9947dfb599e5`.
All five scoped source bindings and the completed native process were checked.

A fresh implementation dispatch corrected nested-project Git blob selection,
read-only state resolution and quoted/Unicode filenames. Seven regression
failures were reproduced before repair; afterward all 21 tests passed. Existing
consent storage identity is preserved and no live consent was rewritten.
Captures: `scratch/NVA-CONSENT-CLI-CORRECTION-1-red.json` and
`scratch/NVA-CONSENT-CLI-CORRECTION-1-green.json` in the repair checkout.
The next Consent review must use this reviewed commit as its exact range base.
The next inventory correction review must use its last reviewed commit
`5387843b8ce7718c1d1aa9ae4baebf4b91273871`; these package lineages are distinct.
Independent PASS, inventory activation, reader binding and final local delivery
remain pending until their actual current evidence exists.
