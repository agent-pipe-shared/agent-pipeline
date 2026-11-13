fix(architecture-fitness): resolve a module's own declared entry points and contracts in class 1

The Glossover brownfield run (K-23) could not enter implementation:
planning fitness class 1 reported every integration test and browser
spec that a module lists among its verificationEntryPoints but does
not cover with its ownedPaths (a module owning tests/unit/<m>/** that
also names tests/integration/<m>-routes.test.ts). The approved,
materialized map cannot be edited by hand, and those paths are exactly
the pending surfaces the greenfield allowance would admit for classes
2 and 6 once class 1 is clean.

evaluateModuleIdentityOwnership now resolves a candidate path that
exactly one module names among its own verificationEntryPoints or
publicContracts to that module when no ownedPaths pattern matches it.
A path no module declares, or one that several modules declare, stays
an unresolved-module-path finding.

Checkpoint-Intent: candidate 29, Glossover K-23 (planning fitness refuses declared entry points)
AI-Assisted: true
Dispatch: stage-0 (elephant)
