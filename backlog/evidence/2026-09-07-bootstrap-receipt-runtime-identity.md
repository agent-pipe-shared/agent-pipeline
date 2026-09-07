# Bootstrap receipt runtime-identity activation evidence

## Contained producer-before-gate proof

The added real-shape regression uses a parent-session transcript path together
with the measured runtime `agent_id` and `agent_type` keys. Before the change,
the first write was admitted because the legacy transcript-only resolver treated
that payload as an orchestrator. After the lifecycle-local resolver change, the
same-agent first Edit, Write, and NotebookEdit are denied until the exact
sanctioned preflight invocation is observed; that invocation creates the
same-agent receipt, the identical retry is admitted, and a sibling remains
denied. A payload with no runtime keys preserves the legacy orchestrator path.

The receipt is evidence that the hook observed the exact sanctioned preflight
invocation for that agent identity. It does not prove the process later
completed successfully or that the agent read its result.

## Evidence

- RED: `scratch/NVA-B-GL09-ACTIVATE-1/runtime-identity-red.txt` records the
  focused regression before production edits, exit 1.
- GREEN: `scratch/NVA-B-GL09-ACTIVATE-1/runtime-identity-green.txt` records
  the same regression after the lifecycle-local resolver change, exit 0.
- Edge RED/GREEN: `scratch/NVA-B-GL09-ACTIVATE-1/runtime-identity-edge-red.txt`
  and `scratch/NVA-B-GL09-ACTIVATE-1/runtime-identity-edge-green.txt` record
  relative-transcript-with-runtime-keys and partial/malformed/traversal runtime
  identities before and after the resolver correction (exit 1, then exit 0).
- Runtime trim: `scratch/NVA-B-GL09-ACTIVATE-1/runtime-trim-green.txt` records
  the real-runtime-keyed subagent’s independent first and second denial behavior,
  exit 0.
- Consumer-safe paths: `node harness/scripts/check-consumer-safe-paths.test.mjs`, exit 0.
- Final full lifecycle suite: `scratch/NVA-B-GL09-ACTIVATE-1/final-full-suite.json`
  (text capture despite its extension), exit 0, 244/244 tests passed with no skips.
  The dispatcher obtained this completion after the last runtime-trim regression.
- Post-refresh consumer-safe paths: `scratch/candidate-consumer-paths-20260907.txt`,
  exit 0, 9/9 tests passed.

## Limits and follow-up

The worker's own full-suite calls returned no completion artifact; the
dispatcher's final capture above resolves that verification gap. The worker
changed no installed plugin or live private receipt state. A later attended
plugin refresh installed the same guard bytes, confirmed by SHA-256 readback.
A post-install live subagent receipt test remains pending; this evidence proves
the new receipt route only in a contained fixture. Full candidate Verify and
independent review remain separate obligations.
