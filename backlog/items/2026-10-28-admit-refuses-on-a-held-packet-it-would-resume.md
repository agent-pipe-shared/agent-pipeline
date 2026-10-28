# Critic batch admit refuses with CGB-HELD on the half-finished packet an earlier failed attempt left behind, and no sanctioned command discards it (Toolbox D60, P0)

Relayed 2026-10-28 by the PO from the Toolbox session (its handover is
`scratch/uebergabe-pipeline-p0-p1-2026-10-27.md` in that repository, not readable here; the facts below are the
relayed summary). Build under test: `0.7.0+claude.20261028091024.692301f`.

## Observed

`admit` now ends with `SCF-PREFLIGHT` instead of `CGB-PHYSICAL`. The failed attempt of the day before left a
half-finished packet (phase `claimed`) in the Pipeline state. `admit` runs the preflight first; the preflight refuses
with `CGB-HELD` because of that packet. So `admit` never reaches the code that would pick an existing packet up cleanly.
Whether the Windows directory fsync fix (D58) works in the new build cannot be told until `admit` runs.

There is no sanctioned command to discard an incomplete packet. The session deleted nothing by hand in the private
Pipeline state (correct). A manual extra preflight run changed nothing but showed the `CGB-HELD` refusal. A new
candidate commit with a new task id bypasses the packet, but costs a new Verify run (about 7 minutes) and a new
registration, and the packet stays behind.

## Wanted

- `admit` looks for an existing packet of the same candidate first and resumes it, and only then runs the preflight.
- A sanctioned command discards or releases a claimed or incomplete packet with an audit trail (the reservation has no
  expiry and no release route today). This is the release command of PF-93 option B.
- Regression: a failed first attempt followed by a second `admit` completes without a manual deletion.
- Native qualification in the affected repository on its Windows runner.

Related: D58/D59 (`2026-10-28-windows-directory-fsync-eperm-blocks-critic-admit.md`), PF-93
(`2026-10-28-critic-packet-claimed-under-an-older-version-cannot-finalize.md`).
