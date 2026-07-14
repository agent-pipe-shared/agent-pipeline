# Synthetic three-scope fixtures

These repository-shaped fixtures contain no account, owner, repository, credential
or absolute-path data. Consumer setup has no overlay and must safe-stop. Maintainer
reconstruction combines a Public snapshot, an anonymous immutable lock and an ignored
machine-local mapping; setup never reads or projects the mapping.

## Consumer

`pipeline.user.yaml`

```yaml
setup:
  intent: consumer
language:
  human_facing: en
  agent_facing: en
```

No `private-overlay.yaml` is present: setup must fail before mutation.

## Maintainer

`private-overlay.yaml`

```yaml
shared:
  sha: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

`machine-local.yaml` (ignored, illustrative only)

```yaml
marketplace:
  local_alias: local-pipeline-source
```
