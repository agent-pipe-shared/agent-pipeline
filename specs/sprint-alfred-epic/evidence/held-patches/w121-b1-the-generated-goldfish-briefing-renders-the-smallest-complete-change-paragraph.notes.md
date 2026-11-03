# w121 — the generated Goldfish briefing renders the smallest-complete-change paragraph (candidate 19, B1)

Applies on the repository on its own (`git apply --check` exit 0). It is the short rendering of rule GF-10 (w120); apply both or neither (the paragraph cites GF-10).

## What it adds

- `lib/dispatch-briefing-build.mjs`: exported `smallestChangeParagraph(pkg)`, called right after `testFirstEvidenceParagraph(pkg)`. One fixed paragraph in our own words (about 115 words): reach list before the first edit, smallest complete change, nothing unrequested, defect fixed once at its cause, moved code keeps validation and error handling, validation at trust boundaries and security never shortened, left-out items and risks reported under "Deliberately not changed". Rendered for every package that carries a criterion except the `goldfish-mechanic` tier; a package without a criterion renders byte-identically to today.
- `scripts/dispatch-briefing.test.mjs`: two cases, RED against the original code (`smallestChangeParagraph is not a function`; paragraph count 1 instead of 2) and GREEN with the change: the function (none without a criterion, none for the mechanical tier, at most 130 words, names GF-10 and the report rubric) and a generated briefing carries it exactly once and states no test-first exception.

## Checks (slice clone)

`dispatch-briefing.test.mjs` 154 of 155 with the production change before the two new cases were added, and the two new cases 2 of 2 on their own (the one red is `public --help and -h work before setup ...` with `HELP-FORBIDDEN-IO`, the known environment effect of any checkout below the home directory, red at the base too), the two pins that render the briefing (`claude-background-goldfish-is-host-committed-at-subagent-stop`, `goldfish-test-briefs-lack-targeted-and-quick-command-routes`) 25 of 25.

## Not proven

- Not measured (see w120): every added word is paid on every dispatch; the paragraph must save more than it costs. Opt-in step in the apply script.
- Other byte pins of the generated briefing or the bootstrap payload were not searched beyond the tests above; the Full Verify decides.
