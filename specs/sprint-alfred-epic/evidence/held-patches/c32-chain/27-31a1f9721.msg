fix(cli): usage-ledger, critic-split-merge, finish-feature and audit-bundle answer --help with their usage and exit zero

The Codex greenfield report (candidate 31 run): several `--help` attempts on the scripts of the close were usage errors, each costing a turn and a refusal, and the report lists usage-ledger, critic-split-merge, finish-feature and audit-bundle. The close scripts that already had a help (verify-evidence-producer, handover-rotate, session-critic-finalizer, close-coordinator) follow one contract: a lone --help prints "Usage: <name>.mjs ..." on stdout, stays under 4 KiB, exits 0 with an empty stderr, and --help next to any other argument keeps the strict grammar.

The four scripts now follow the same contract and also take -h. The usage-ledger and finish-feature texts name every form the script accepts (the one-shot close and the close with every input at hand), the critic-split-merge text names both ways to merge, and the audit-bundle text names plan, build and verify. cli-help.test.mjs lists the four scripts; its -h case runs for exactly these four.

AI-Assisted: true
Dispatch: stage-0 (elephant)
