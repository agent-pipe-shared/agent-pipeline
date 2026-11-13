fix(close): ask the acceptance in the project language and accept a closed list of clear yes forms

Codex greenfield run 3 (C8): the human answered "ja akzeptiert" to an
English question and was refused, because only the one fixed form
"ja, ich akzeptiere" counted. PO tile 2026-11-13: localized question plus
a closed list of clear yes forms of the project language.

- close-acceptance-record: ACCEPTANCE_YES_ANSWERS per language (en: yes,
  I accept / yes / yes, accepted / accepted / I accept; de: the German
  equivalents). Only the project language's list counts; case, commas,
  spaces and a closing . or ! are normalised. No keyword search: "yes,
  but ..." or "ja, aber ..." stays a decline.
- The question is asked in German for a German project and names the
  list; the stop texts of finish-feature name the list and ask for the
  human's literal answer.
- close-feature SKILL and happy-path reference state the new rule.
- Tests: bare "yes" and "ja akzeptiert" are accepted in their language,
  the other language's forms and qualified answers stay refused.

Checkpoint-Intent: candidate 29c, Codex run 3 C8
AI-Assisted: true
Dispatch: stage-0 (elephant)
