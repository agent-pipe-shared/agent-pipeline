---
schema: pipeline.backlog-item.v1
id: pipeline.push-init-names-the-wrong-verify-producer-mode
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P2
release: 0.7.1
sprint: alfred
source: "Consumer handover 2026-10-30 (finding N24, not retested on c23df26); PO 2026-10-30: minor, filed after 0.7.0"
done_when: manual
---

# `push-init` names the wrong Verify producer mode

## Evidence

`push-init` reported `verify-evidence-bound missing`. `verify-evidence-producer.mjs --mode push` refuses
`--critic-evidence-feature-id` (`VEP-CRITIC-CARRY-INPUT`); the working route was `--mode release …
--out evidence/verify-latest.json`, and the producer never overwrites, so the old file had to be moved first.
The hint text says none of this.

## Wanted

Either `--mode push` accepts the Critic carry input, or the `push-init` hint names the exact release-mode
command, including what to do with an existing output file.
