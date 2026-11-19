fix(guard): a copy out of the control-plane directory is a read, not a write

The Codex greenfield report (candidate 31 run): `cp <private split record> scratch/<file>` was refused as GUARD-CONTROLPLANE-WRITE, because cp is not in the read-only list and any segment that names the control-plane directory is refused unless its command only reads. The run fell back to a copy it could not make. The command writes nothing there.

A cp segment now counts as a read when its destination (the last operand, also after `--`) does not name the control-plane directory, by the same literal and real-path test as before. Options that can write there or aim a later write at it keep the refusal: a target directory (-t, --target-directory), a backup suffix (-S, --suffix), and hard or symbolic links (-l, -s, --link, --symbolic-link; a link in scratch/ would let a later write change the control-plane file itself). A cp with a single operand, a redirect in the segment, a destination in the control plane (also through a symlink) and every mv, rm, touch, mkdir, sed -i and find -delete stay refused. Cases pin the admitted copies and the refused ones.

AI-Assisted: true
Dispatch: stage-0 (elephant)
