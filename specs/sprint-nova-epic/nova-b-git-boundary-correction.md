# Nova B Git boundary correction

This correction slice implements two existing Nova B requirements recorded in
ADR-0079 and the canonical backlog. It does not redefine the approved epic.

## Scope

- `GG-17` through `GG-20` remain blocking even when an otherwise valid
  agent-side guard override is armed for the matching rule.
- Guard output for those rules does not offer or claim an agent-side override
  route.
- Commit-message policy parses the final contiguous Git trailer block rather
  than searching arbitrary body text.
- When `commitTrailerPolicy` is `warn` or `blocking`, an agent-authored commit
  message must contain exactly one `AI-Assisted: true` trailer and exactly one
  grounded `Dispatch:` trailer in that final block.
- `warn` reports provenance convention findings without blocking; `blocking`
  rejects them. Privacy and correlation violations remain blocking in either
  mode.
- Project bootstrap guidance and the example guard configuration make the
  available blocking policy discoverable to consuming repositories.

## Acceptance evidence

- Unit coverage includes all four non-overridable hook-bypass rules with valid
  override arming and proves that the override is ignored.
- Unit coverage includes valid, missing, duplicated, malformed, and misplaced
  provenance trailers, including repeated `git commit -m` paragraphs.
- Documentation and consumer-safe-path contract checks pass.

## Deliberate residual scope

This slice provides and recommends the blocking commit-trailer policy. It does
not migrate existing project-local guard configurations automatically. The
backlog item about missing stage-0 provenance remains open until activation and
migration behavior is separately completed and verified.
