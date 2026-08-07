# Security incident response and recovery

1. Intake is acknowledged through the private reporting channel and assigned
   to a named security owner.
2. Triage and remediation evidence are recorded against the canonical finding.
3. An emergency fix uses only a declared release or deployment capability.
4. Rollback uses the declared `rollback-release` capability and preserves the
   evidence needed to replay the original trigger.
5. Closure requires the fixed candidate, replay, security regression, and
   independent confirmation. Public disclosure is prepared separately and
   redacted.

This runbook does not grant agents authority to publish, accept risk, close an
incident, or authorize a production change.
