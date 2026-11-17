fix(resume-hint): hyphen-joined words and short numbers are not an opaque token

`1-2-Spieler-Minispiel` mixes lower case, upper case and a digit and so matched the
credential rule of opaqueToken(), which refused a plain German compound in the first
Antigravity greenfield run (RH-SCHEMA). A token whose every hyphen-separated segment
is a word (lower case or one leading capital, three letters or more), a short
all-capital abbreviation or a one- or two-digit number no longer counts under that one
rule. The other rules (all-caps and digits, 24 characters with a digit or a hyphen)
stand, and random mixed-case or digit-heavy tokens are still refused. The detector is
local to the resume hint.

AI-Assisted: true
Dispatch: stage-0 (elephant)
