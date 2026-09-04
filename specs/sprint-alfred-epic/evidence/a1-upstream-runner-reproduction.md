# A1 upstream runner reproduction (preparation)

Status: preparation only. This is a privacy-safe draft for a possible
upstream issue; it has not been published and none of the live runner probes
below is claimed to have run.

## Reported question

Does the enforcement layer execute in the process that performs dispatched
work, and does it observe commands staged indirectly? The answer must be
measured per runner and candidate, not inferred from hook documentation,
configuration, or an agent's report.

## Four deliberately separate observations

1. **Orchestrator command submission** — submit a canonical refused compound
   shell shape in the main session. Expected: the orchestrator guard refuses
   it. Capture the raw tool/guard result, exit code, refusal marker, runner
   version, plugin version, candidate commit/tree, and artifact digest.
2. **Subagent command submission** — dispatch a minimal probe that submits the
   same canonical shapes. Expected: an independently observed hook marker
   determines `fires` or `fires-not`; a subagent's prose, self-report, or
   model attestation is never hook proof. Capture the raw report separately
   from the marker/readback classification; missing markers are `unknown`.
3. **Payload indirection** — write the refused shape to a disposable,
   synthetic scratch script and execute that file. Expected: parameter-text
   guards may not see the payload; record the actual catching layer or the
   typed residual gap. Never execute a payload from a repository control file.
4. **Git hook** — in a disposable local repository with a local pre-push
   hook, attempt a refused push shape without contacting a remote. Expected:
   the Git process itself supplies the observation for every invoking agent;
   record `--no-verify` as the accepted residual gap, not as a pass.

For each record, raw observation/classification remains distinct from the
deterministic evaluator outcome. Only deterministic execution (or a bound
human acceptance record) may produce `pass`; model/self-attestation can never
produce `pass`.

## Expected versus observed fields

Every observation is candidate-bound and records: runner name/version,
plugin version, layer, literal probe surface, command/fixture digest, raw
allow/refuse result, exit code, marker digest or null, hook observation
(`fires | fires-not | unknown`), evaluator outcome, measurement statuses,
staleness state, and sanitized provenance. Expected values are hypotheses
(`refused` for canonical guard shapes; `fires` for a measured marker), never
substitutes for the observed values. A missing or contradictory readback is
`unknown`, `unavailable`, or a typed finding according to the closed record
contract.

## Synthetic local reproduction outline

The following is pseudocode/fixture guidance, not a command run in this
dispatch:

```text
fixture = createDisposableLocalRepository()
fixture.installOnlySyntheticGuardMarker()
for surface in [orchestrator, subagent, payload-indirection, git-hook]:
  raw = submitCanonicalRefusedShape(surface, fixture)
  marker = readBackMarker(surface, fixture)
  emitCandidateBoundObservation(raw, marker, runnerVersion, pluginVersion)
assert no remote destination, credential, private path, or real repository file was read
```

The fixture must use placeholders such as `example-runner` and
`example-project`; reports redact credentials, tokens, transcript text,
absolute user paths, repository paths, and organization coordinates before
publication. A reproduction report names the runner and plugin versions that
were actually measured and does not generalize one runner's result to another.

## Intended upstream issue shape

Title: `Measure enforcement reach across orchestrator, subagent, payload, and Git-hook paths`

Body: use the question, four observation lanes, raw-versus-classification
fields, and synthetic fixture outline above. Attach only sanitized,
candidate-bound records and command output. Keep status **preparation** until
the runner probes and readbacks are actually executed and reviewed.
