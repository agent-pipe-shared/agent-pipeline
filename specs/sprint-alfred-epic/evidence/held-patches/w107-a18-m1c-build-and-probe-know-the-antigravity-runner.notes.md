# w107 — build and probe know the Antigravity runner (candidate 18, A18-M1c)

Built by the Elephant directly under the PO exception of 2026-11-02 (small items of the candidate 18 build). Criterion binding: AC-108 (the generator and its runner routes), as for w99; the PRD and the Spec are unchanged.

## Order

A delta on the chain w85, w94, w99 and w102 (it edits `dispatch-briefing.mjs`, which w99 changed, and the host return parser, which w102 changed). It does not apply to a checkout without them. Applying w94 after w102 and w99 after w94 needs a context merge (two hunks each), described in the apply script.

## What it changes

- `lib/native-goldfish-host-return.mjs`: `parseNativeGoldfishBriefing(prompt, { runners })` takes an optional list of admitted runners. The default stays `["claude", "codex"]`, so every existing caller (the dispatch guard, the Claude and Codex host paths, the queue and record tools) refuses an Antigravity binding exactly as before.
- `scripts/dispatch-briefing.mjs`: the self-check of the generated skeleton opts in to the generator's runner list instead of rewriting `"runner":"antigravity"` to `claude` before parsing and putting the runner back afterwards. The same parser now reads every field of an Antigravity skeleton, including the runner itself.

## Tests

`dispatch-briefing.test.mjs` gets one case, written first and observed RED (first on the unknown `--runner` flag of `build`, which exposed that the package carries the runner in its `runner` key, then on the opt-in parse), then GREEN: `build` of an Antigravity package renders a briefing that names the runner and verifies; the opt-in parser reads it; the default parser still refuses it with `NGHR-BRIEFING-SHAPE`; `probe` of that package reports the same findings as the same package for Claude (the fixture has no plan approval, so both report state findings) and none from the runner, the binding or the self-check. Briefing suite 154 of 155 in the slice clone (the one failure is the environment case `public --help ... HELP-FORBIDDEN-IO` below the home directory, with or without this change); the host return suite is 11 of 11.

## Not changed / not proven

- `generatedBriefingAdmission` in `lib/dispatch-briefing-build.mjs` still parses with the default runners. It is called only by the dispatch guard for the Claude and Codex Agent path (`requireGenerated: true`); an Antigravity briefing goes through the prepare route and the Antigravity hook, which this patch does not touch. Not exercised in a real Antigravity run.
- The full Verify was not run.
