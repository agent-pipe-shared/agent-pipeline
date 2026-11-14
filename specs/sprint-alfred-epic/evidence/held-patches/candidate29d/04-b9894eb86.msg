test(result-bootstrap): the fixture commits its Spec folder like a closing consumer

N29's anchor walks a close from checkpointed to the qualification gate
in a repository that never had a commit. Since candidate 28e the close
reads the candidate commit (Spec addenda, lapsed Critic findings, and in
29c maintenance deliveries), which an unborn HEAD fails as CLOSE-GIT; the
29c gate-definition walk then needs a commit touching specs/<feature>
(CLOSE-GATE-CHANGE-UNREADABLE). A consumer that closes always has both.
The fixture now commits specs/feature after writing it, and the anchor's
assertion prints the refusal it got. No product change.

AI-Assisted: true
Dispatch: stage-0 (elephant)
