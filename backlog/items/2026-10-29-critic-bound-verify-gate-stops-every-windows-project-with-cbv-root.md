---
schema: pipeline.backlog-item.v1
id: pipeline.critic-bound-verify-gate-stops-every-windows-project-with-cbv-root
type: defect
owner: pipeline
status: open
created: 2026-10-29
priority: P0
release: 0.7.0
sprint: alfred
source: "Windows consumer finding N11, relayed by the PO 2026-10-29"
done_when: manual
---

# The Critic-bound Verify gate stops the push of every Windows project with CBV-ROOT before it reads any Critic state (N11)

## Evidence

`check-critic-bound-verify.mjs` compared `git rev-parse --show-toplevel` (forward slashes on Windows) with `realpathSync(root)` (backslashes) as text. On Windows the push gate stopped with `CBV-ROOT` for every project, and the repair text (finish the Critic review) was wrong.

## Delivered

Commit 6c72f7408: pure `sameCheckoutRoot(gitTopLevel, physicalRoot, platform)` (separator, trailing separator and letter case ignored on win32 only); six cases in the new `check-critic-bound-verify.test.mjs`. Linux run with an injected platform only. Not stamped, not installed.

## Open

The Windows run of the gate; the consumer expects a second blocker behind it (its Critic course stands at round 1 FAIL, findings fixed, which is the real state). Other sites that compare a Git-reported root with a Node root are listed in the verify evidence document and belong to the native gate.
