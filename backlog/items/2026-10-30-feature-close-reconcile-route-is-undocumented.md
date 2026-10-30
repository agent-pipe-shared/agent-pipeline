---
schema: pipeline.backlog-item.v1
id: pipeline.feature-close-reconcile-route-is-undocumented
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P2
release: 0.7.0
sprint: alfred
source: "Consumer report N30-N32 after the N29 retest on 0.7.0+claude.20261030170444.85c269e"
done_when: manual
---

# The feature-close reconcile route has no command builder and no documented order

A consumer closed a finished feature on the candidate 11 build. N29 is fixed there:
`continuity-result-bootstrap-plan` returned an apply action, and bootstrap-apply and close-apply ran through. Three
frictions remained on the same route:

1. **N30: no command builder for the reconcile signature.** For a push, `push-init` produces the subject digest the
   PO signs. For the close reconcile no command does; the consumer computed the digest from the pipeline library with
   a self-written scratch script.
2. **N31: the order is written nowhere.** Result bootstrap, continuity close-apply, the close-request file, the
   reconcile signature and `feature-close-prepared` are not described in any skill (`close-feature` included); the
   consumer derived the order from refusal texts and code.
3. **N32: `closeEvidence` is undocumented.** No help, skill or refusal says which file the close evidence must be;
   the consumer chose its combined Verify/Critic receipt.

## Wanted

- One command that prints the exact reconcile signing command with its subject digest, like `push-init` does for a
  push.
- The close-feature skill and the refusal texts name the full order and the accepted `closeEvidence` forms.
