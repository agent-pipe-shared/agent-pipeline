# Semgrep pack fixtures (candidate 28e, ADR-0094)

Fixtures for `../semgrep-default-rules.test.mjs`. They are scanned by that test only, after it copies them into a temporary
directory; they are never built or run.

- `<lang>/hits.<ext>`: every `pipeline-<lang>-*` rule of `security/semgrep/pipeline.yml` must fire here at least once.
- `<lang>/quiet.<ext>`: the look-alike of every class (bound parameters, a fixed command, a safe parser setting, a sanitized
  path, a URL with a fixed host, a strong hash). No `pipeline-<lang>-*` rule may fire here.

The code is deliberately vulnerable in `hits.*`. Do not copy it anywhere else.
