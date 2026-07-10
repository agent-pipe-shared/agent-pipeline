# Policy checklist (generic example, non-machine-checkable)

> **Enforcing.** This is a generic example of the policy items a company might require
> before the push gate — fixture content, not a real company's actual checklist. Unlike
> the machine-checkable policies (`license-allowlist.json`, `semgrep/*.yml`), none of the
> items below can be verified by a script; the **Critic ticks each item by hand, one by
> one, before the push gate**. Any item marked **NOT MET** is a BLOCKING
> finding — the push gate does not open until it is resolved or explicitly waived by the
> project's designated approver (never by the Critic itself).

1. **Data-privacy review done** — for any change touching personal data (PII) fields,
   flows, or storage, a data-privacy reviewer has signed off.
2. **Threat model updated** — for any change altering trust boundaries, authentication,
   or authorization, the project's threat model document reflects the new shape.
3. **License header present** — every new source file carries the project's required
   license header (or SPDX identifier) per the project's declared license.
4. **Rollback path documented** — the plan artifact names how this change can be rolled
   back in production (revert commit, feature flag, migration-down step).
5. **Third-party license compliance checked** — every new/changed dependency was checked
   against `license-allowlist.json` (this directory); any `deny`-listed license requires
   an explicit, named exception before it ships.
6. **Secrets handling reviewed** — no new secret/credential is hardcoded; any new secret
   need is routed through the project's designated secret store, never committed.
7. **Backward-compatibility impact assessed** — for public-API or schema changes, the
   plan states who/what consumes the old shape and how they are protected during
   rollout.
8. **Owner assigned for any deferred risk** — every known gap intentionally NOT fixed in
   this change has a named owner and an expiry date attached (mirrors AP7/QG-06: a risk
   "documented" without owner+date is itself a finding, not a mitigation).
