fix(onboarding): the onboarding driver spawns a published bare node action as its own interpreter

A Codex greenfield run failed its first inspect step with `spawnSync node EPERM` and needed an escalated retry: the sandboxed child resolved the bare `node` of the published action through PATH to a version-manager install it may not start, while the Driver itself already ran on a node that can. Every spawn and the route probe now map the bare name `node` to `process.execPath`; other executables run as published and the readback keeps the published name. The re-anchor pin that expected the bare name is restated.

AI-Assisted: true
Dispatch: stage-0 (elephant)
