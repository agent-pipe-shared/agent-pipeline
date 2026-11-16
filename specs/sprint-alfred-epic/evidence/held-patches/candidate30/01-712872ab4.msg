feat(onboarding): make the consent question scannable (C30-1)

- The relayed question is a short opening, one dash bullet per covered step
  (the tool check as a lead line with one sub-bullet per tool and a closing
  one), the Advisor export as its own paragraph and the exclusions as a
  closing bullet list; plain text only, so the relay keeps it intact.
- The scope is unchanged (steps, tool list with the Trivy and OpenSSL
  conditions, Advisor export, four exclusions); recorded consents store step
  ids, so earlier records stay valid.
- Tests restated for the new shape (QG-04); a new case pins the structure,
  the line width and the plain-text rule in English and German.

AI-Assisted: true
Dispatch: stage-0 (elephant)
