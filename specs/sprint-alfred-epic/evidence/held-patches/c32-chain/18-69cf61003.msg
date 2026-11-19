fix(plan): a comparison operator in an acceptance criterion is no unfilled placeholder

A second Antigravity greenfield report: submit-plan refused AC-7 twice with PLR-HANDOFF-NO-JOURNEY although its Journeys and Asserts clauses were complete. The placeholder test of the journey coverage check was /<[^>]*>/, which read "< 1800000 ms ... >= 1800000 ms" as one unfilled "<...>" placeholder. The correction of the Spec then changed its digest, voided the design review receipt already collected and cost a second review round.

A skeleton placeholder is now "<" directly followed by a letter or underscore, not glued to the word before it, with no further "<" inside; "{{" and REPLACE are unchanged. The generated skeleton's long placeholder and a placeholder after prose are still found; a comparison with a space or a digit after "<" and an operator glued to a word ("a<b") are not. Cases pin all four.

AI-Assisted: true
Dispatch: stage-0 (elephant)
