# w127 — D5: the Antigravity pre-tool header names the real guard code of a refused native read

Found by the first Antigravity greenfield run (priority 5): every refused native read printed `code=native-read-credential-root` in the `[pipeline.agy-pretool.v1]` header, also for a plain missing project file whose refusal text says `GUARD-READ-TARGET-MISSING`, so the header read as a credential block.

Change (`hooks/antigravity-pretool-guard.mjs`): the header code is now the guard code the refusal text itself names (first `GUARD-...` token), with `native-read-refused` as the fallback when the text carries none. The agent-visible refusal text is unchanged.

Test: one new case D5 in `antigravity-native-read-credential-roots.test.mjs` (a missing file, absolute and relative, is `GUARD-READ-TARGET-MISSING`; a credential file is `GUARD-READ-CREDENTIAL-TARGET`). That suite 9/9, `antigravity-pretool-guard.test.mjs` green. The case was written with the change; RED against the old header was not run separately (the old code printed the fixed label for both).

Not proven: no real Antigravity session read the new header.
