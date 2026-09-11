# Reader-review release workflow — correction pass

Date: 2026-09-11

Commit `0611d0ec` makes the existing reader workflow discoverable from both
copies of the release guide. The guide keeps the expensive review before
candidate freeze and says release preflight consumes only the committed
binding.

The registered push/release documentation contract now checks:

- the shipped capability inventory declares `reader-review` for Antigravity,
  Claude Code, Codex and the runner-neutral surface;
- the skill retains safe feature/candidate admission;
- phase one and phase two use distinct fresh read-only readers;
- changing a covered document restarts both phases;
- `record.json` is committed last and the final checker must report `passed`
  without findings;
- both release-guide copies name the workflow and retain the no-loop boundary.

Focused execution:

```text
node plugins/pipeline-core/scripts/push-release-flow-docs-contract.test.mjs
tests 10; pass 10; fail 0
```

The first independent review found that two broad phrase assertions did not
bind these guarantees. After the test was strengthened, the correction Critic
returned PASS with no findings. Existing reader-binding and release-preflight
tests were also reported green by the implementation worker (65/65 and 49/49).
No Full Verify was run for this isolated documentation slice.
