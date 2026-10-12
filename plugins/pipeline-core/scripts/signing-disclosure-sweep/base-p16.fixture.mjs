// Mechanical extraction of the only base export used by the signing controls.
import {readFileSync} from 'node:fs';
import {statePath} from '../pipeline-state.mjs';
export const rawState=f=>readFileSync(statePath(f.dir));
