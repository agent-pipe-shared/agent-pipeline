# Native current-artifact technical review

> **Status after the scope decision, reaffirmed 2026-09-12:** The contract design below is
> retained as the platform-neutral specification. Native Codex sandbox/App-
> Server execution under WSL is superseded as an acceptance route and supplies
> no Nova-B readiness evidence. Exercising this design on the native route is
> deferred to the separate future native-Windows package; ordinary fresh-session
> Critic review remains the supported default.

The native Critic must support an explicit review of named current artifacts
against their requirements. This is the self-application review described in
the Critic role contract. It is distinct from a historical change-range review:
the receipt must identify the current files actually submitted for judgment.

## Admission and identity

- Keep the existing native exact-range input and the legacy transport intact.
  A current-artifact request is a separate closed alternative, with
  `reviewScope: { kind: "current-artifacts", paths: [...] }` instead of
  `reviewBase`. Reject mixed, unknown, empty, duplicate, unnormalized, or
  out-of-repository scope input. Require lexical unique paths.
- Keep `reviewMode: "full"`. Artifact scope names the complete current files;
  it is not delta mode, a path-filtered historical range, or a synthetic base.
  Spec and directly required contracts remain references, never embedded
  explanations or prior verdicts.
- Resolve every scoped artifact as a regular candidate Git blob. Bind its
  path, blob identity, byte digest and mode to the exact current candidate
  commit/tree. Require matching candidate source reference records for all
  scoped files. Reject absent files, symbolic links and unsupported modes.
- Derive packet governance from the actual submitted artifact paths. Preserve
  exact current-candidate evidence checks. A historical Verify cannot stand
  in for the current candidate's clean completed Verify.
- Cryptographically bind the artifact scope, full review mode, candidate and
  ordered reference-set digest through a canonical request digest. The host
  independently recomputes this digest before child creation. The existing
  range-mode request convention is unchanged.
- Recheck scoped physical files and their candidate Git identities before and
  after execution, as with existing native source references. Drift produces
  no successful execution receipt.

## Child and result

- The native child's closed request and prompt must distinguish current-file
  audit from exact-range review. For an artifact audit, require a full judgment
  of the named current artifacts against the spec and guardrails. Do not emit
  the conflicting correction-range-only instruction or invent an original
  implementation range.
- Preserve fresh context, refs-only briefing, selected route, genuine current
  native read-only/network-disabled proof, tool-surface reduction, bounded
  lifecycle, one schema-shaped verdict and all existing failure behavior.
- Include the verified artifact scope and exact source coverage in the
  execution receipt. It remains an execution receipt; only the separate
  actual verdict says whether the review passed. Never describe this as a
  historical commit review, whole-candidate clearance, effective-model proof,
  publication approval, or permission to reopen completed review cycles.

## Required checks

Exercise the public preflight and host/child integration with real Git fixture
files: an artifact can be unchanged since an older commit while current
candidate evidence binds a later unrelated correction. Its scope and full
source coverage must survive to the actual rendered prompt and receipt.
Reject mixed modes, scope/reference omissions, changed scope with an unchanged
request digest, stale evidence and physical source drift before or after the
child. Preserve legacy and native exact-range fixtures. Run the affected
existing suites and a fresh full Verify before the independent review of
this adapter change.
