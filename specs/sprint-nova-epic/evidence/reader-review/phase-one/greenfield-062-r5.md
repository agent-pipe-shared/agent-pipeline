# Reader review phase one — greenfield-062-r5

Fresh blind read of the eleven public entry documents at reviewed commit
`7bdbf7d1c6bf2bb7a38512abb1c5fc7787f354cb`. The reader received no earlier
reports, inventory, governance, diff, history, or conversation and made no file
changes.

- **RR-R5-01 — contradictory authority paths.** PIPELINE_FLOW's English
  authority list classifies `project/pipeline.yaml` and
  `.claude/pipeline.yaml` as project calibration, while SETUP and the German
  flow identify JSON as the calibration and YAML as the optional manifest.
- **RR-R5-02 — UI branch at two lifecycle positions.** PIPELINE_FLOW's main
  diagram sends UI design after implementation and Verify, while its branch
  table requires UI work to rejoin Spec/readiness before implementation. Make
  the diagram and table show one lifecycle position in both languages.
