fix(push): the audit-proof follow-up admits every push proof the store holds for the approved commit

First Antigravity greenfield run: the PO had to sign a push twice for one
commit because the first branch name was taken on the remote. The audit
proof writer carries every push proof the private store holds for the
approved commit, so the follow-up commit held two proofs (002 and 003), and
the guard's follow-up admission accepted only the proof of the approval for
the branch being pushed. It refused with AUDIT-FOLLOWUP-CONTENT, the
follow-up fell through to the full push gate, and that gate refused the
audit-bundle paths as changed product (PRODUCT-PATH-CHANGED): a third
signature was demanded for a commit that adds only public proofs.

A push proof is now admitted when it is the proof of a recorded, consumed
push approval of this very commit to this remote, whatever its branch. A
proof under any other key, or of another commit, is still refused: the
digest comes from the store, never from the file.

Two cases in the follow-up admission suite: the second proof is carried and
admitted; the same intent signed by a key the store never saw is refused.

AI-Assisted: true
Dispatch: stage-0 (elephant)
