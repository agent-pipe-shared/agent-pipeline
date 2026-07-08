# Production live-deploy lock (generic example, non-machine-checkable)

> **Enforcing.** This is a generic example of a live-deploy lock a company MIGHT set for a
> project whose production environment acts on the physical world — fixture content, not a
> real company's actual policy. Like the policy `checklist.md`, none of it can be verified
> by a script: the project's designated approver holds the activation switch, and the
> Critic ticks the human-gate item before the push gate. Any activation without the
> required approval is a BLOCKING violation — the gate does not open until it is resolved
> or explicitly waived by the designated approver (never by the Critic itself). `<PROJECT_B>`
> below is a neutral placeholder for such a high-stakes hosted project (real devices, alarm,
> locks, climate — a living house).

1. **No unapproved live activation** — MUST NOT apply any change that takes effect on the
   live `<PROJECT_B>` environment (real devices, alarm, locks, climate, automations on the
   running instance — including restarts/reloads that activate config) without explicit,
   per-instance approval from the project's designated approver. Consent never carries
   across contexts: a prior approval does not authorize the next activation.
2. **Night/autonomous mode is build-yes, go-live-no** — an autonomous run may prepare,
   validate, and stage changes, but activation always waits for the human gate; the run
   builds, it does not go live.
3. **Writing workflows need extra sign-off** — starting a file-writing workflow against
   this environment requires explicit approver sign-off, on top of the standard workflow
   preconditions (isolated worktree, tight command allowlist, guard hook installed as a
   PreToolUse hook).

**Why:** A change here acts on a real house — a wrong change is not a bug, it is an
unlocked door or a dead alarm. Live verification exists only on the real devices, so a
human must hold the activation switch.

**Verification:**

- The project's committed agent settings default to a plan / non-writing mode for this
  environment (activation is never the default posture).
- The human-gate step is documented in the change's report/commit with an explicit
  verification status ("live verified").
- The project's calibration marks this environment as high-stakes and names the
  live-deploy gate as a required human gate.
