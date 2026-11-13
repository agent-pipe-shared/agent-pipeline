fix(finish-feature): take --one-shot and --stage from any argument position

Codex greenfield run 3 (T1): the one-shot close was only recognized when
`--one-shot` was the first argument (and `--stage` only as the last);
the same flags in another order ended in FINISH-USAGE. No flag value may
start with `--`, so neither word can be a value: each is taken from any
position, at most once, and the remaining words are parsed as the
flag/value pairs as before. A doubled --one-shot or --stage stays a
usage refusal.

Checkpoint-Intent: candidate 29, Codex run 3 T1
AI-Assisted: true
Dispatch: stage-0 (elephant)
