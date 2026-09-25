# ADR-TOKEN-AC20: deny unapproved publication

Status: accepted (fixture only; not project authority).

## Context

An agent must not turn an unapproved publication request into authorization.

## Decision

The exported `mayPublish` function in `implementation.mjs` returns `false`
whenever `approved` is `false`. This constraint applies even when a caller
sets `urgent` to `true`.

## Consequences

An independent Critic must compare this claim with the implementation, not
only check that the ADR exists or has a well-formed digest.
