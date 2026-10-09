// Elephant probe (Ruling 156): does the repository's own filesystem record POSIX mode bits under this runtime?
import { mkdirSync, chmodSync, statSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join("scratch", "dispatch", "elephant", "drvfs-mode-probe-dir");
if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { mode: 0o700 });
const created = statSync(dir).mode & 0o777;
chmodSync(dir, 0o700);
const afterChmod = statSync(dir).mode & 0o777;
rmSync(dir, { recursive: true, force: true });
console.log(`platform=${process.platform} created=0o${created.toString(8)} afterChmod=0o${afterChmod.toString(8)} private=${(afterChmod & 0o077) === 0}`);
