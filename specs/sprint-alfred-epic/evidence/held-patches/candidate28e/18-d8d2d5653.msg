fix(security): record a shipped Semgrep rule by its own id, not the install path

Codex test run 2026-11-13: Semgrep prefixes the ids of a local rule file
with that file's directory, dotted, so every finding of a shipped
`pipeline-default-*` rule carried the local home directory and the
plugin install path in the close evidence, and the id changed with every
install (a baseline keyed on it would never match again).

- security-adapters/semgrep.mjs: `shippedRuleId` strips the dotted prefix
  in front of a `pipeline-default-*` id; any other rule id is recorded as
  Semgrep reports it

Tests: semgrep.test.mjs (a prefixed shipped id, a bare shipped id, a
registry id, an id with a segment after the shipped name, a missing id),
29 pass, 2 skipped (tool not installed).

AI-Assisted: true
Dispatch: stage-0 (elephant)
