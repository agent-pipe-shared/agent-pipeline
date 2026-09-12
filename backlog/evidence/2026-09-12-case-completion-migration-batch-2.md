# Case-completion migration batch 2

Date: 2026-09-12  
Scope: Nova B, runner-neutral Verify evidence

Commit `53fc71d3` migrated three additional suites to the bounded completion
protocol:

| Verify suite | Case policy | Focused result |
|---|---:|---|
| `async-execution-tests` | `AEX01`–`AEX05` | 5/5 pass |
| `bootstrap-payload-budget-tests` | `BPB01`–`BPB10` | 10/10 pass |
| `control-catalog-schema-tests` | `CCS01`–`CCS33` | 33/33 pass |

Every suite declares its complete corpus before executing callbacks and has an
injected case-02 child probe that requires the final case and all declared
cases to receive terminal dispositions. The 181-entry registry now contains 24
required and 157 legacy-process-only suites.

The first independent Critic found that the async suite's Verify registration
did not contain its five-case policy. It also required a rollback specific to
this batch. Commit `35b9dee2` added the missing policy and the complete grouped
rollback/recovery procedure. This exposed a useful checker limitation: the
registry checker validated the suite-side protocol and registry disposition,
but did not catch the absent Verify-side policy.

The correction review returned PASS with no findings. It independently ran the
case-completion checker against `53fc71d3..35b9dee2` and confirmed the AEX01–05
binding and rollback closure. Verify suite registration and `git diff --check`
also pass. The aggregate backlog item remains open for the remaining 157 staged
suites.
