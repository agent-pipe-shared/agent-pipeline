chore(security): re-line two moved synthetic fixture entries in the gitleaks ignore list

The Full Verify of candidate 30 reported two stale suppressions: the fake
GitHub token of the scanner diagnostics test moved from line 268 to 274 and
the PEM marker literal of the approval test from line 160 to 161. The live
values are the same synthetic fixtures the entries were reviewed for; the
two entries are replaced by the scanner's own recomputed ones. The repair
script's gate admits only domains and public keys, so this is the manual
re-line the script itself names for other values.

AI-Assisted: true
Dispatch: stage-0 (elephant)
