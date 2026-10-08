import nodeFs from "node:fs";

const WIN32_UNSUPPORTED = new Set(["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"]);

/**
 * Durably flush a directory entry. On win32 opening/fsyncing a directory is
 * unsupported (EPERM and friends); those codes are a no-op there only.
 */
export function fsyncDirectoryDurable(directoryPath, { fs = nodeFs, platform = process.platform } = {}) {
  const tolerated = (error) => platform === "win32" && WIN32_UNSUPPORTED.has(error?.code);
  let fd;
  try {
    fd = fs.openSync(directoryPath, "r");
  } catch (error) {
    if (tolerated(error)) return "unsupported";
    throw error;
  }
  try {
    fs.fsyncSync(fd);
  } catch (error) {
    if (tolerated(error)) return "unsupported";
    throw error;
  } finally {
    fs.closeSync(fd);
  }
  return "confirmed";
}
