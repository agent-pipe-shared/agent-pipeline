# Published greenfield run observations (second run)

Public, sanitized, counted evidence for runner comparisons (AC-190, D209). A release note or retro
that says one runner's greenfield course is faster, cheaper or more reliable than another's cites a
comparison file from this folder by path and sha256, and nothing else.

Sources: only the committed, already sanitized material in
`specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/` (its README, finding ledger and
copied reports). No raw runner store, transcript or session was read. Values are therefore
reported-unverified numbers taken from those reports, not independent measurements.

## Files

| File | Content | sha256 |
|---|---|---|
| `observations-claude-second-run.json` | Claude pipeline run, plus the shared control | `66280e5370c8990440562c4613d86b0d4ef23a2f57ffb83635ee62e5d9c2797f` |
| `observations-codex-second-run.json` | Codex pipeline run, plus the shared control | `ecdd5eeaf72c01d6509332bdc4d0c5d52987bcbc8388b5895090e00f92ae603a` |
| `observations-antigravity-second-run.json` | Antigravity pipeline run, plus the shared control | `f6eacad0ce3ffbbf61e247c68464854bd0c365b3689930b172ff80b9779f8577` |
| `comparison-second-run.json` | Comparison generated from the Codex file by the real command | `80c1e8720f64e47a8ae67dd330737e0d00e7d97ed0a02358ac79d18811e69acf` |

Each observation file is a `pipeline.greenfield-public-observations.v1` input: canonical JSON, one
trailing newline, two cases. Pipeline versions named: `0.7.0+claude.20261025134513.977dad8` (Claude),
`0.7.0+codex.20261025134513.977dad8` (Codex), `0.7.0` (Antigravity; its report prints no build stamp).
The control case is a Codex run on 2026-10-24 with the Pipeline declined; it carries no Pipeline version.

Regenerate the comparison (the output file must not exist yet):

```
node plugins/pipeline-core/scripts/greenfield-public-comparison.mjs --input evidence/greenfield-public/observations-codex-second-run.json --input-sha256 ecdd5eeaf72c01d6509332bdc4d0c5d52987bcbc8388b5895090e00f92ae603a --output evidence/greenfield-public/comparison-second-run.json
```

## What is in a case

Runner, Pipeline version, window (UTC), main-agent turns and tool calls, token counters, active and
wait milliseconds, coverage and method, result as reported, the ordered phases reached, the typed
refusal codes with counts, and the sha256 of the original report and of its sanitized derivative.
A value the reports do not state, or state only rounded, is `null`; it is never estimated.

## Limits (read before citing)

- One input per comparison. The command takes exactly one `--input`, so every observation file carries
  its runner's pipeline case plus the same control case, and only the Codex file was compared. The
  published comparison is therefore Codex with the Pipeline against Codex without it. A comparison across
  Claude, Codex and Antigravity needs a multi-input command and is not published yet.
- The pair in the comparison is `unresolved`: the windows, the task briefs and the counting methods
  differ, and causal inference is `unsupported`. The numbers are descriptive only.
- Task identity: the task digest is the sha256 of the label below, declared by the publisher from the
  shared product description in the reports. The original briefs are not in the committed material, so
  equal digests assert the label, not byte-identical briefs.

Task identity label: `voxel-showcase-scene-single-file-greenfield-v1`

- Counts are main-agent only. Subagent and runtime-guardian usage is excluded; the turn and tool counting
  rules differ between the reports, which is why each case names its own method.
- Instants: Claude's report gives minutes and Antigravity's seconds; both are padded with zero
  milliseconds. The Antigravity report prints no date; 2026-10-25 is taken from the name of the
  committed evidence folder. The Claude and Codex dates match their build stamp.
- Claude `outputTokens` is the sum of the report's per-phase rows (595678); the report's prose total is
  rounded and differs, and is not used. Claude and Antigravity `waitMs` is `null` because their reported
  wait plus active time exceeds the reported wall interval; Codex `waitMs` is the wall interval minus
  active time (it matches the report's rounded wait).
- `rulesetSha256` is `null` everywhere: no ruleset digest is printed in the reports.
- Refusal codes are only those the reports name, counted as named in each report's event listing. This is
  not a refusal census; absent codes mean "not named", not "did not happen".
- Phases are the reports' analytic phases, not Pipeline state marks. `verify` means verification was
  attempted; none of the three Pipeline runs completed Verify, Critic or acceptance.
- Results are as the reports state them: `stopped-reported` where the report ends the run on purpose,
  otherwise `unknown`. Nothing here is a quality, cost or product-acceptance claim.

## Citing

Mark each runner comparison claim with an HTML comment that starts with the word `runner-comparison`
and carries `path=` and `sha256=` of a `comparison-*.json` file in this folder. The checker refuses a
claim that cites no file, a path outside this folder, a missing file or a digest that does not match:

```
node scripts/check-greenfield-comparison-citations.mjs docs/your-retro.md
```

Example claim, itself checked: Codex with the Pipeline needed 6080.7 s of active time and 252 outer tool
calls, Codex without it 888.9 s and 40, in runs whose windows and counting methods differ; no cause is
inferred. <!-- runner-comparison path=evidence/greenfield-public/comparison-second-run.json sha256=80c1e8720f64e47a8ae67dd330737e0d00e7d97ed0a02358ac79d18811e69acf -->
