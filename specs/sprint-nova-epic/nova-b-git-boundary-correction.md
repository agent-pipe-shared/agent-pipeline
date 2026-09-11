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
- By default, and when `commitTrailerPolicy` is `blocking`, an agent-authored commit
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

## Security model and rollback

The checked-in reference model is
`specs/sprint-nova-epic/implementation/git-boundary-threat-model.json`. For
each delivery candidate, review preparation creates a detached model snapshot
and approval request bound to that candidate's commit and tree. The request is
only review input; it does not grant approval. A protected push or release
still requires the matching external proof at that boundary.

The provenance policy can be rolled back per consuming project by setting
`commitTrailerPolicy` to `off` and then rerunning its focused guard tests. The
`GG-17` through `GG-20` correction has no runtime feature flag because such a
flag would recreate the bypass. Its production rollback is a forward revert
of the delivery commit followed by the focused guard-git suite; deploying that
revert requires the same trust-boundary review because it deliberately
reopens the ADR-0079 risk.

## Deliberate residual scope

This slice makes the blocking commit-trailer policy the runner-neutral default
for agent tool calls, including consuming repositories without a project-local
guard configuration. Existing projects may explicitly select `warn` for a
dated migration or `off` as an opt-out. The repository's two authority-tier
guard configurations also state `blocking` explicitly so their intended policy
is visible without relying on the default.
