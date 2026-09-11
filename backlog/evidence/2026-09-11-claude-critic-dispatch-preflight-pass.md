# Claude Critic dispatch preflight — correction pass

Date: 2026-09-11

Scope: commits `dfa206f5`, `05899070`, and `5eca9537`; production and focused
test changes in `plugins/pipeline-core/scripts/critic-claude-host.mjs` and
`plugins/pipeline-core/scripts/critic-claude-host.test.mjs`.

The direct Claude Critic host now validates the shared role-dispatch packet
before export, claim, native probe, or review. It repeats that validation at
the final launch boundary. The correction rebuilds this late packet from the
durable authorized packet and current prompt rather than trusting the mutable
preparation view. Its regression mutates that old view, occupies the true
authorized result slot, and proves that only the bounded probe ran.

Focused execution on 2026-09-11:

```text
node plugins/pipeline-core/scripts/critic-claude-host.test.mjs
16/16 checks passed.
```

The independent diff-scoped correction Critic reviewed
`05899070..5eca9537` and returned no findings. It confirmed that the rebuilt
packet retains candidate, source-digest, role, and result-slot binding before
`runNativeBare`.

No Full Verify was run for this isolated slice. The next fresh Full Verify is
reserved for the Nova B integration candidate.
