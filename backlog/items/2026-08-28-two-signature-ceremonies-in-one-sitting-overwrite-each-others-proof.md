---
schema: pipeline.backlog-item.v1
id: pipeline.two-signature-ceremonies-overwrite-each-others-proof
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nightwing
done_when: contains plugins/pipeline-core/scripts/po-human-approval.mjs manualArtifactsForIntent
source: "Hit live, 2026-08-28, running two HGO signature ceremonies (TP-3 verify.mjs and TP-5 guard-push.test.mjs) back to back in one session; then isolated in the code by reading both --proof readers."
---

# Two signature ceremonies signed in one sitting overwrite each other's proof, and the scratch mirror that would have saved the second one is inert

## What happened

The PO signed two HGO intents back to back, as asked:

```
sign-intent --request scratch/hgo-1-verify-request.json    -> intent 0e5f8247…
sign-intent --request scratch/hgo-2-guardpush-request.json -> intent f33e44b6…
```

Both reported `PO-HUMAN-SIGN-INTENT-READY`. Both wrote their durable external
proof to the **same fixed path**:

```
/…/agent-pipeline-key/proof-manual.json
```

So after the second signature that file held `f33e44b6…`, and the first
signature's proof existed nowhere the consuming command would accept. The PO had
to run a `cp` by hand — the exact friction
`pipeline.gmw-reconcile-still-needs-a-manual-copy-after-the-po-signs` was closed
to remove.

## The two defects, separated

### 1. The external artifact names are fixed, not per-intent

`po-human-approval.mjs` (sign-intent branch) builds its write targets as

```js
const manual = {
  intent:    artifactPath(directory, "intent-manual.txt"),
  signature: artifactPath(directory, "signature-manual.bin"),
  proof:     artifactPath(directory, "proof-manual.json"),
  signer:    artifactPath(directory, "signer-manual.json"),
};
```

Nothing in those names varies with the intent. Signing a second intent before the
first proof is consumed destroys the first, silently — `sign-intent` reports
success both times, and nothing warns that it just overwrote an unconsumed proof.

This is a real workflow: HGO windows are a 30-minute TTL, so batching two
ceremonies into one PO sitting is the *efficient* thing to do, not an abuse.

### 2. The `scratch/` mirror is written but no consumer accepts it

`--request` additionally mirrors the proof into the repository's own `scratch/`
(NVA-SWEEP-F2), documented in-code as being so that "the requesting agent session
finds the proof waiting in its OWN root on its next turn with no PO-run `cp` step
in between."

No consumer accepts a path inside the repository:

| consumer | line | reader |
| --- | --- | --- |
| `guard-human-override.mjs` `authorize-by-signature` | 302 | `externalJson()` — 78: `--proof must be supplied outside the repository` |
| `guard-maintenance-window.mjs` | 356 | `externalJson()` — 148: `authority and proof must be supplied outside the repository` |

Both readers resolve the path and refuse anything that does not escape the
repository root. So the mirror written for the agent is unreadable by the two
commands the agent would hand it to. Passing it produces exactly:

```
HGO-USAGE: --proof must be supplied outside the repository
```

The two halves of the same convenience feature contradict each other.

## Why this was not caught

`pipeline.gmw-reconcile-still-needs-a-manual-copy-after-the-po-signs` is marked
closed (2026-08-18, `b273a1a055bae1e29f7489d232d0c83dff05c7ed`) with
`closure_evidence: plugins/pipeline-core/scripts/po-human-approval.test.mjs`.
That test asserts the mirror is **written** and that its bytes equal the external
proof. It does not assert that any consumer **reads** it, and no such test exists
— the two readers are in different files and both predate the mirror.

Shape evidence, not result evidence: the artifact appears, so the feature looks
delivered. The closed item's own title names the HGO path explicitly, so the gap
is inside its stated scope rather than beyond it.

## Correction to a sharper first reading

My first reading of this was that the HGO ceremony cannot consume a `--request`
signature at all. That is wrong and worth stating so nobody re-derives it: the
durable external `proof-manual.json` is written on **every** `sign-intent`,
including the `--request` form. A **single** ceremony therefore works with no
copy step at all — point `--proof` at the external file. Only the second
concurrent ceremony loses, and only because the name is fixed.

## Proposal

Not designed here. The two halves want different answers:

1. **Name the external artifacts per intent.** The intent digest is already in
   hand at write time; `proof-<intentSha256>.json` (or a short prefix) would make
   two ceremonies independent and make an accidental overwrite impossible rather
   than merely unlikely. Whether to keep writing `proof-manual.json` as a stable
   "latest" alias is a compatibility call for whoever picks this up — several
   verifiers may read that name.
2. **Decide what the `scratch/` mirror is for.** Either a consumer learns to
   accept a proof from the repository's own `scratch/` (which needs its own
   argument about why that is safe, since the whole point of the external
   boundary is that the human's artifact is not agent-writable), or the mirror is
   removed and the feature stops implying a capability it does not have. Writing
   an artifact nothing can consume is worse than not writing it: it reads as a
   working path until someone tries it under time pressure.

## Acceptance

- Two `sign-intent` calls in one sitting produce two independently consumable
  proofs, with no manual copy and no silent overwrite.
- Whatever the `scratch/` mirror ends up being, a test exercises the **consuming**
  command against it, not only the writing one.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Hit live rather than reasoned about, and every claim here was
  then read out of the code: the fixed artifact names in the sign-intent branch,
  both `externalJson()` call sites, and the closed predecessor's own
  `closure_evidence` field. The one over-sharp claim in my first reading is
  corrected in the body rather than quietly dropped.
- **Assignment (if accepted):** `sprint: nightwing`. The dominant symptom is
  PO-facing ceremony friction — a human signed twice and one signature was
  destroyed without a word — which is Nightwing's subject (low-friction adoption),
  not Alfred's. Defect 2 is a correctness bug rather than an experience one, but
  it lives in the same code path and the same fix session; splitting it across
  two sprints would cost more than it clarifies. Alfred is in flight and closed to
  new scope (PO, 2026-08-28) in any case.
  **Condition for picking it up:** before any workflow that batches signatures is
  documented as supported. Until then the mitigation is one line: consume each
  proof before the next `sign-intent` runs.
- **Date:** 2026-08-28
