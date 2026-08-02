# Change control

The Change-Control core evaluates promotion from two independent sources:
Pipeline human authority and an authenticated external change receipt. Both
must bind exactly the same candidate, immutable artifact, environment, scope,
and schedule window. An ITSM approval never substitutes for Pipeline authority,
and a Pipeline approval never authenticates an external change system.

Mandatory profiles block promotion for a missing, draft, rejected, expired,
conflicting, unknown, unauthenticated, mismatched, or out-of-window external
receipt. `not-required` is an explicit non-mandatory profile; it leaves the
ordinary deploy adapter independently usable. Emergency profiles require a
separate explicit emergency authority and cannot be used as a generic bypass.

External state is observation data. Provider-specific fields and credentials
remain in adapter profiles and approved machine-local configuration; the core
stores only the provider-neutral binding and gate result.
