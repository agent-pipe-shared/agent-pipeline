# G35 — Codex nested push-guard budget cuts off valid signed checkpoints

Confirmed during actual signed checkpoint delivery ofbc7dccb43. Human authorization was imported successfully; two byte-identical agentpush attempts were stopped BEFORE Git execution by loadedguard-push ETIMEDOUT. At the subsequent remote readback the branch remained57aa08996ea2b8dc3f16cebf26c9ce6f8a1405d1.

The loaded355dba9 adapter and current Source both allocate42000ms overall, but guard-push falls through to the generic8000ms nested cap. Direct evaluation of that exact installed guard for the already authorized command returnsALLOW/exit0 after14090ms, with empty stdout/stderr and no Gitpush executed. [Diagnostic](installed-guard-diagnostic.json) and [custody](custody.json) preserve the actual observation. Guard evaluation may append its normal local attempt audit; it is not network delivery. This is an adapter budgeting failure, not missing signature proof.

The PO explicitly rejected leaving this as a manual-terminal workaround: the fix, regression and knowledge must be in Source and the next-session handover. Repair G35 through a bounded push-specific budget within the unchanged overall limit, preserving reserve, otherguard defaults, actual verification and failclosed timeout/error behavior. A candidate test must demonstrate actualALLOW, not merely absence ofETIMEDOUT or exit0 (the adapter also exits0 for JSONdenials). Preserve original examiners and unrelated failures honestly. No installedcache patch, bypass, unsigned push or fabricated approval.

A worker owns Source/test changes in an isolatedclone. Status at intake:Sourceconfirmed,repairandqualificationpending. Existing bc7 signature remains tied only tobc7; the corrected candidate needs its own finalstamp/signature. Do not discard the local approval/consumption audit to manufacture a clean tree.

## Updated PO direction

We remain on THIS machine. PCtransfer/interruption is cancelled. After the fix:durablematrix/handover → newcandidate stamp → LOCAL marketplace installation → reloadthissession with observednewruntime → parallel realGreenfield tests. Backup featurepush may proceed through its configuredproof route; it is not a reason to stop Sourcework. The earlier runtime-transfer checkpoint is historical; activeFeature remains inimplementation and mustnotadvance to featureclose from that abandoned transfer intent. Nightwing enterprisepolicy remains outside0.7.0. The full release/review plan is unchanged.
