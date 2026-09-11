# Local worker supervisor complete-corpus regression

Date: 2026-09-11

Commits `d3ed2e6f`, `de5d32b3`, and `0ce818eb` convert the measured supervisor
suite to 15 separately registered `node:test` cases and add a self-probe for
the original early-failure class.

The final probe launches the same suite with an intentional LWS07 failure and
an inherited descriptor dedicated to execution markers. Every case writes its
ID from inside its callback before LWS07 throws. The parent requires the exact
ordered sequence LWS01 through LWS15 and a nonzero child status. The normal
registered invocation passed:

```text
node --test plugins/pipeline-core/lib/local-worker-supervisor.test.mjs
tests 1; pass 1; fail 0
```

Node reports the file as one outer test when invoked with `--test`; the nested
probe is the direct evidence that all 15 internal cases execute after the
intentional failure.

The independent correction Critic reviewed `de5d32b3..0ce818eb`, recreated
both the normal and injected executions, and returned PASS with no findings.
No Full Verify was run for this isolated test-structure slice.
