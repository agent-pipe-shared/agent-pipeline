# Resumed intake provenance

## Classification

The onboarding checkpoint remains the append-only, content-addressed authority
for original material chunks. The SessionStart hook reads those chunks
separately from answered onboarding values and surfaces the chunks in capture
order. This package changes no schema, capture authority, consent boundary, or
plan-approval path.

The reported settings-only material recapture is an agent capture error when
checkpoint-origin original chunks are accessible: settings are answered
onboarding values, not product requirements. There is no evidence that the
pipeline discarded original chunks. A distilled resume-hint card is a recovered
summary, not a verbatim material source. If it is the only available context,
drafting must label it as a recovered summary with its available source pointer
and collect the specific unresolved confirmation rather than manufacture a
`materialInput` chunk.

## Prevention at runtime entry

The Codex SessionStart notice now states both distinctions in the context it
actually emits: recovered summary versus verbatim material, and retained
checkpoint-origin bytes versus separate settings. It also says not to recapture
an existing chunk merely to satisfy a ritual.

The runner-neutral bootstrap instruction requires use of the current returned
onboarding `nextAction`. It does not introduce `pipeline-state inspect` or an
Operating Model hash as an intake prerequisite; state and authority orientation
follows ready binding.

## Verification and limits

On 2026-09-07, this host-authorized WSL command exited 0 and wrote machine
evidence at `evidence/NVA-B-RESUME-PROVENANCE-1-verify.json`:

```text
node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/NVA-B-RESUME-PROVENANCE-1-verify.json --label NVA-B-RESUME-PROVENANCE-1 -- node --test plugins/pipeline-core/hooks/codex-session-start-hint.test.mjs plugins/pipeline-core/skills/pipeline-start/pipeline-start-v3.test.mjs
```

The SessionStart test exercises emitted context against a real temporary Git
root, two multi-line/unicode original chunks, separately answered values, and
the malformed-checkpoint fallback. Its existing byte-identity assertions remain.

The consumer-safe check also exited 0 and wrote
`evidence/NVA-B-RESUME-PROVENANCE-1-consumer-safe-paths.json`:

```text
node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/NVA-B-RESUME-PROVENANCE-1-consumer-safe-paths.json --label NVA-B-RESUME-PROVENANCE-1-consumer-safe-paths -- node --test harness/scripts/check-consumer-safe-paths.test.mjs
```

These are local tests only. No provider call, installed-plugin edit, full
Verify, independent Critic review, commit, or publication occurred.
