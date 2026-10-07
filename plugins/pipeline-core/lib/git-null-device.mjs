// SPDX-License-Identifier: SUL-1.0
//
// The one null-device value for every git child process the Pipeline spawns (Spec section 22.1, R7-1).
//
// GIT_NULL_DEVICE is the value for each git config, hook or askpass null value (GIT_CONFIG_GLOBAL,
// GIT_CONFIG_SYSTEM, GIT_ASKPASS, SSH_ASKPASS and `-c core.hooksPath=...`-style values) on every platform.
// Git for Windows maps /dev/null itself, in both its MSVCRT and UCRT builds.
//
// The spellings NUL and os.devNull are refused by Git for Windows 2.56.0.windows.1 (upstream regression
// git-for-windows/git#6449) and are never used for git. Never hand this constant to a Node file open: on
// Windows that would create a real file instead of opening the null device.
export const GIT_NULL_DEVICE = "/dev/null";
