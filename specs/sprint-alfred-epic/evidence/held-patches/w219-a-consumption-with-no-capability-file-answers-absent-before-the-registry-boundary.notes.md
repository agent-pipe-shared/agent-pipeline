# w219: a consumption with no capability file answers absent before the registry boundary

## Cause (measured)

Native Windows consumer, 19d marks, 2026-11-05: a refused Bash command (`GUARD-PARSE-UNSUPPORTED`, a composed shell command) took 122 s (non-overridable variant) and 253 s (eligible variant) in the lifecycle hook. 112 native PowerShell starts (112 s) happen BEFORE the first `hgo-start` mark, identically in two runs (counts identical, only times differ): registry lock create (`publish`), `stateRead` (`inspect`/`read`/`read-source` alternating), the domain-owner namespace reads (`ancestor`, `read`, `read-source`), lock remove. That is `consumeHumanGuardOverride` -> `hgoConsumptionBoundary` -> `withSessionAuthorityBoundary`, which `denial-route.mjs` runs first on every closed-grammar refusal ("harmless: it only ever succeeds against a genuinely armed capability") and which finds an empty `capabilities` directory.

## Change

`lib/human-guard-override.mjs`, `consumeHumanGuardOverrideCore`: before the boundary, a plain `readdirSync` of the store's `capabilities` directory (no creation). With no `*.json` entry, or the directory missing, the answer is `{ status: "absent" }`, which is exactly what the boundary's consumption returns for an empty list. Any other read error falls through to the unchanged boundary.

## Test

`human-guard-override.test.mjs`, "a consumption with no capability file answers absent without entering the registry boundary or creating anything": absent, no `session-authority` directory, no store created; again with an empty capabilities directory. Red without the change (the boundary created the registry), green with it.

## Protected file

`human-guard-override.mjs` is protected: the PO applies this script.

## Not covered

The eligible variant still pays the registry work of the request publish (`hgo-publish-wait` to `hgo-publish-held`, 93 starts, 104 s); w215 and w218 are expected to reduce it, nothing more was built for it. The dispatch hook's own 100 to 220 starts before `dispatch-checks-done` are a separate path.
