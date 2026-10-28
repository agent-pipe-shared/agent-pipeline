# PF-97 slice F2: JSON schema path patterns (held patch, stacked on F1 + F1-c2)

Patch: w7-critic-path-charset-f2.patch (diff against the baseline = candidate 9b41d34b3 + scratch/agent-out/compose/bundle.patch). Backslash patterns are described in words here (evidence guard).

## Cause
Four schema path definitions restricted a path to letters, digits, dot, underscore, slash, hyphen (re-verified: lineage schema line 445, review-attempt 124, course-decision 14, release scope 55).

## Change (only the path pattern line in each schema)
- Character class replaced by the any-character class (whitespace-or-non-whitespace pair) in the body and in every lookahead (a dot would not cross a line break).
- Added to all four: a negative lookahead for U+0000-U+001F, U+007F-U+009F and the backslash character, written with four-digit unicode escapes (JSON text carries a doubled backslash before the u). It replaces the old backslash-only lookahead.
- Kept per schema: review-attempt/course-decision keep leading-slash, double-slash, dot-segment lookaheads and the 1..240 bound; lineage keeps leading-slash, dot-before-slash, double-slash and the open plus sign (maxLength 512 stays in the schema); release keeps leading-slash and 1..512.

## Tests
- review-economy.test.mjs: RE71a-RE71e (import of safePath added). RED before: RE71b and RE71e failed (127/129); RE71a, c, d passed trivially because the old patterns already refused those samples. GREEN after: review-economy exit 0.
- critic-review-lineage.test.mjs: new case CRL02 (lineage and release patterns vs safePath) and its end count pin changed 16 to 17 (the only number touched). No separate RED run was made for CRL02 (budget). VCR01 has no pin for these two files (search found none).
- Samples: accept list from the briefing (including trailing space, colon, leading dash); refuse list: newline mid and trailing, NUL, U+0085, U+007F, backslash, leading slash, double slash, dot and dot-dot segments (last three only for patterns that have those lookaheads; lineage dot rule needs a following slash, so the sample has one).

## Results (clone = patched, clone2 = baseline), exit codes
review-economy 0/0, critic-review-lineage 0 (after pin fix; first run exit 1 on the 16 pin)/0, critic-generic-batch 0/0, critic-course-admission 0/0, check-verify-case-completion 0/0, check-product-capability-inventory 0/0, generate-architecture-overview --check 0/0. Baseline and patched failing-name sets: both empty. Result lines were read from the printed logs only for economy and lineage (others by exit code; counts not read: budget).

## Runtime use of the schemas
Not searched (budget). Not verified whether any code validates against these schemas at runtime or only tests read them.

## NOT done
Hint quoting and real route walk (F3); colon relaxation in course-admission and diagnostic-evidence; the optional rg search of the plugin for old class text; independent Critic review stays a parent-owned batch gate.

## Operator flow
apply the diff, git add -u with a path limit, --no-verify commit, stamp, install. Protected-path classification: none of the changed files matched a protected test path pattern in the clone edits (edits were accepted).
Proposed commit message: fix(critic): accept every legitimate file name character in the path patterns of the Critic route schemas
