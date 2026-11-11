feat(critic): build the filled Critic briefing in prepare-dispatch

- New lib/critic-briefing-build.mjs renders the critic-review template body
  from the preflight result: enumerated commits, the derived bindings path,
  review ordinal and re-critic range, batch scope with the part's own paths
  and scope marker, model and effort left as named placeholders.
- On Antigravity it renders the template's paths-only envelope with absolute
  paths instead of the "Repository root" prose line (PO decision).
- prepare-dispatch critic derives the correction-input bindings to a file
  when the preflight held them only in memory, refuses on a digest mismatch
  (PREP-BINDINGS-DIGEST), writes one briefing file per round or split part
  and returns them in next.briefings.
- critic-dispatch-preflight drops criticRunnerPromptLines and points at the
  generated briefings instead.
- Cause: a WSL greenfield run hand-wrote a delta Critic resume without the
  bindings; the Critic withheld its verdict and a fresh Critic was needed.

AI-Assisted: true
Dispatch: stage-0 (elephant)
