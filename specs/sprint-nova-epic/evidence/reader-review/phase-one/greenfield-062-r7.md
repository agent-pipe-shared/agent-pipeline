# Reader review phase one — greenfield-062-r7

Fresh blind read of the eleven public entry documents at reviewed commit
`635de28c`. The reader received no earlier reports, dispositions, inventory,
governance, diff, history, or conversation and made no file changes.

- **RR-R7-01 — German authority ambiguity.** PIPELINE_FLOW's German copy omits
  the English statement that `.claude/pipeline.yaml` is optional and says an
  ambiguous “this source” wins on disagreement. Align it with the English
  authority rule.
- **RR-R7-02 — examples presented as active project rules.** README presents
  `governance/examples/` as the location of project-specific rules and implies
  automatic gate effect, while SETUP requires project-owned paths and manifest
  configuration. Separate shipped examples, activated project rules, and
  conditional enforcement in both languages.
