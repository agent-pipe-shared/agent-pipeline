fix(critic): CCA-MANIFEST-READ names --successor-of for a feature that replaces a discarded one

A Codex retest with the 30e distribution still stopped at CCA-MANIFEST-READ because the refusal text never mentioned the explicit predecessor flag. The repair now says when it is needed (the feature replaces a discarded one recorded in the State and the review must cover the inherited implementation) and where to add it.

AI-Assisted: true
Dispatch: stage-0 (elephant)
