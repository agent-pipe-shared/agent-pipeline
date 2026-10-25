# Windows host ACL scope — next-candidate fix

Status: explicit PO-requested fix direction, 2026-10-25. PRD and Spec unchanged.

The PO requests a relaxation for the next candidate after the Claude Windows
Greenfield start blocked on inherited Authenticated Users Modify permissions
from a data drive. A weaker Windows enforcement guarantee may be documented.
The existing October17 decisions already exclude human-controlled ancestors
from the threat model and reject changing drive-root ACLs.

## Required outcome

- W1: Ordinary Windows host, project and installed-plugin owner/write ACLs do
  not categorically block onboarding or implementation. Correct the actual
  requester/source consumers as well as readiness; a successful preflight
  followed by the same refusal deeper in the path is insufficient.
- W2: Retain protection of Pipeline-owned private authority and genuine
  signatures, source digests, candidate bindings, CAS, physical containment,
  reparse and alias checks. Do not turn an observation failure into security
  evidence or authorize agent changes to real Windows ACLs.
- W3: Document the reduced Windows guarantee against other local OS accounts.
  Explain the additional owner/mode checks actually enforced on Linux/macOS
  without claiming that either OS is universally safer or that same-user ACLs
  separate the agent from its human operator.
- W4: Bind changed policy assertions to this explicit direction; retain
  strict private-state and path-alias negative controls and meaningful behavior
  checks. Preserve native Windows qualification as pending when not executed.
- W5: Provide focused captures, exact Source/patch hashes and compatibility
  limits for integration into a later candidate. No stamp, installation,
  release or PO acceptance is implied by this fix request.

The production owner receives the complete coherent code/test/documentation
outcome in an isolated Scratch clone. Existing D143 method-only delivery and
active-hook integration apply. The current installed Greenfield build remains
separate. The operative late single Critic and final Verify sequence remains.
