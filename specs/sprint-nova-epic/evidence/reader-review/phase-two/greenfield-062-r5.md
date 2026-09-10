# Reader review phase two — greenfield-062-r5

Independent evidence check against the eleven public document blobs at
reviewed commit `7bdbf7d1c6bf2bb7a38512abb1c5fc7787f354cb`. The reviewer received
the phase-one findings, committed capability inventory, governance data, and
reader protocol, but no earlier rounds, diff, history, or conversation, and
made no file changes.

- **RR-R5-01 — confirmed.** In the English authority sentence, name the
  optional `.claude/pipeline.yaml` manifest separately and limit project
  calibration to `project/pipeline.json`, falling back to
  `.claude/pipeline.json`, matching SETUP and the German reader copy.
- **RR-R5-02 — confirmed.** Remove UI design from the post-Verify optional
  phase in both diagrams. The existing pre-implementation design branch owns
  UI design where applicable and the branch table already requires it to
  rejoin Spec/readiness.

Both remedies change public documentation, so this is not a closure round.
