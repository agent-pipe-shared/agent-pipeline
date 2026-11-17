fix(critic): the packet consumers honour a diagnostic produced behind evidence-only followers

The packet preflight installs the follower classifier explicitly and revalidates a follower diagnostic against the host repository, so the disposable checkout no longer refuses it.

AI-Assisted: true
Dispatch: C30F-G2C (goldfish)
