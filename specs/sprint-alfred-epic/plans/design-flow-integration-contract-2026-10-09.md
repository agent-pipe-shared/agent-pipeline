# Design-flow integration contract — 2026-10-09

Approved basis: ADR-0085 removal note C1–C10, PO decisions I/T–W/BM and
Ruling157 and the later empty-anchor setup decision in Ruling164. This is implementation integration of that accepted behavior,
not a new PRD/Spec revision or PO acceptance. Preserve all already included
changes and frozen legacy approval readers. Fixed package ready for signing
by17:00 Europe/Berlin, local test candidate by18:00.

The current source includes U1–U3, legacy reread, signature reread and the
initial v8 validator. Fresh unchanged end-to-end tests show the present and
approve route and retirement wiring are missing. Reuse those completed
modules and the committed independent RED pins; do not author them again.

The complete v8 envelope is the explicit shape already pinned by the
independent boundary and E2E tests: schema, approvedBy, approvedAt,
submissionSha256, profileSha256, poGateAuthority, priorInvalidationSha256,
designApprovalBinding and designApproval. Mini has both final fields null.
Feature/epic has a valid U3 binding and the existing closed design approval
record, with matching binding digest. Existing isolated validator fixtures
omit the binding field; reconcile those incomplete fixtures independently
before authoring the corresponding validator integration fix. Preserve all
legacy record branches, real proof and source-drift refusals; no hybrid v7/v8.

Present uses explicit review receipt paths, at most two, mechanical U1 plus
U3 binding/request, safe scratch publication and one ready sign command in
signature mode. Chat uses the existing configured attribution ceremony and
never carries a detached proof. Presentation must hold the exact request
binding without old workflow-package fields; any necessary new presentation
shape is closed and preserves old mini/legacy readers. Approve rechecks source,
receipt, candidate, mode and trust, then atomically writes the complete v8
record. No design dispatch or continuity-cas is required. In-flight v2 must
refuse with the typed replacement route. Existing implementation authority
must remain valid through frozen legacy reread.

Boundary validates stored binding, current source digests, configured mode
(signature may satisfy chat; chat cannot satisfy signature), attribution or
actual proof against a nonempty trust anchor. It reads no course store or
device-local readiness execution. Retirement is behavioral only and names
present-plan --review-receipt; on-demand Advisor consent/transport stays.

Ruling164 supersedes the earlier self-signed empty-anchor fixture assumption:
signature mode refuses an absent or empty trust policy with a typed setup
remedy. Independent positive proof fixtures must seed a real matching public
trust anchor; their signature and denial assertions remain intact.

Acceptance: independent immutable route/boundary/security pins, complete
source assembly, registration, one batched independent Critic and applicable
Verify before presenting the digest-bound package. A setup failure is never
PASS. All durable evidence must be tracked. Nothing is signed or installed yet.

Assembly mapping: tranche-1 is root-relative; tranche-2 lib/hooks/scripts/config/
agents members are beneath plugins/pipeline-core. The existing tranche-2
policies/model-policy.md maps to the actual root policies/model-policy.md.
The parked tranche-1/docs kernel threat model maps to its existing root doc.
Preserve patch inputs as inventory; full postimages subsuming their exact added
lines take precedence and must never receive the same patch twice.
