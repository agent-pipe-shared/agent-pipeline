# Codex Critic V3 route verification

Tasks: `NVA-B-CRITIC-ROUTING-1`, completed by `NVA-B-CRITIC-ROUTING-2`.

The selected route resolves `critic_high_risk` from validated V3 project authority and binds its source SHA-256 to the candidate `pipeline.user.yaml` blob. It keeps the generic selected-duty request and execution receipt closed on `runner` plus `model`; the selected Critic bridge freezes the matching effort and supplies it only to the native app-server payload. The bridge re-resolves the candidate authority immediately before launch and rejects source drift before a model request.

`scratch/NVA-B-CRITIC-ROUTING-2/selected-host-tests.json` records the selected package’s green 18-check regression, including generic receipt shape, configured model-and-effort forwarding, source drift rejection, identity mismatch rejection, and preservation of a completed terminal on binding failure. `scratch/NVA-B-CRITIC-ROUTING-2/consumer-safe-paths.json` records the green consumer-safe-paths suite.

`scratch/NVA-B-CRITIC-ROUTING-2/full-host-tests.json` records the only remaining full-suite failure: the separately assigned legacy normal-Critic route still hardcodes `gpt-5.6-sol/xhigh`. This task does not change that compatibility source or weaken its assertions.
