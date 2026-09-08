# Current V3 usage binding remains incomplete

The approved project model selection validates through the V3 source reader,
but the usage adapter still rejects current Astra and Luna requests. This is
separate from the repaired historical Sol receipt compatibility.

The complete synthetic Sol fixture in
`scratch/NVA-B-USAGE-V3-CONTRACT-2/probe.mjs` produces a bound result. Route
mutations with recomputed receipt, result and native-event digests produce
`binding-mismatch`. Source inspection identifies the first rejection:
`requestedShapeValid()` excludes Astra/Luna before the frozen V2 cell lookup.
That later lookup is a separate obstacle; the observed rejection does not
prove it was reached. The Luna mutation uses the historical Critic cell to
isolate requested shape, while the actual project selects Luna for implement.

`pipeline.user.yaml` is the authority. The existing candidate-bound Critic
reader supports model-ID duties; it does not yet cover Claude alias duties
or profile-phase cells. A complete usage integration must validate the
candidate's V3 source and exact cell while retaining all existing receipt,
dispatch, candidate, native-event and trusted-evidence bindings. Historical
receipt support must remain distinct. No production repair is claimed here.

Final isolated capture: `scratch/NVA-B-USAGE-V3-CONTRACT-2/probe-capture-final.json`
(capture text despite the extension), exit 0. The corrected driver removes
its Scratch fixtures on exit; earlier diagnostic captures remain historical.

The fixtures supply synthetic effective evidence and prove no live host
metering or billed cost. Antigravity unavailable-cell findings are registry
inspection only. Current routing registration is not observed execution.
