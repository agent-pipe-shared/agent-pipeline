# Windows authority boundaries

Windows onboarding and implementation readiness do not treat ordinary drive,
project, source, installed-plugin, or observed process-image ownership and
write ACLs as a Pipeline custody gate. The native observer still requires a
canonical physical path, valid security-descriptor structure, a stable file
identity, and no reparse or alias substitution. It binds the observed
descriptor into native facts so a change remains detectable. It does not
remove or repair host ACLs.

Pipeline-owned private authority remains distinct. Its native checks still
require the current user as owner, a protected DACL, and entries limited to
that user. Signatures, source digests, candidate bindings, compare-and-swap
checks, containment, and physical identity checks are unchanged. An invalid or
missing observation still fails closed; an ordinary ACL observation is not
converted into evidence of private custody.

This leaves a weaker Windows guarantee against other local OS accounts for
ordinary host and source paths: their ACL grants are recorded, but are not
used to reject onboarding or source reads. It is not a sandbox boundary
between agents and the human logged into the same Windows account. Processes
running as that same user share the user's access rights.

On Linux and macOS, the relevant POSIX readers enforce additional ownership
and mode conditions. Private authority readers check the current UID and
reject group or other access; source-module context checks reject group or
other write bits and require a single link. These are specific checks in those
readers, not a claim that either operating system is universally safer or that
same-user processes are isolated from one another.

Native Windows execution remains required to qualify DACL behavior. Linux or
WSL tests can exercise the injected readiness policy and structural controls,
but they do not count as native Windows qualification.
