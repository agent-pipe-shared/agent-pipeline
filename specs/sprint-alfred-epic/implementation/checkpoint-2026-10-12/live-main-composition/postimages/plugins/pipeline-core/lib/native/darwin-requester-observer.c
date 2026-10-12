// SPDX-License-Identifier: SUL-1.0
// Fixed, read-only observer. No caller-provided identity or command execution.
#include <libproc.h>
#include <sys/proc_info.h>
#include <sys/sysctl.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define ARG_BOUND 262144
static void hex(const unsigned char *p, size_t n) {
  for (size_t i = 0; i < n; i++) printf("%02x", p[i]);
}
static int bsd(pid_t pid, struct proc_bsdinfo *b) {
  memset(b, 0, sizeof(*b));
  return proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, b, sizeof(*b)) == (int)sizeof(*b);
}
static int snapshot(pid_t pid, char *exe, struct proc_vnodepathinfo *v,
                    unsigned char *args, size_t *length) {
  int mib[3] = {CTL_KERN, KERN_PROCARGS2, pid};
  memset(v, 0, sizeof(*v));
  if (proc_pidpath(pid, exe, PROC_PIDPATHINFO_MAXSIZE) <= 0 ||
      proc_pidinfo(pid, PROC_PIDVNODEPATHINFO, 0, v, sizeof(*v)) != (int)sizeof(*v) ||
      sysctl(mib, 3, args, length, NULL, 0) != 0) return 0;
  if (strnlen(exe, PROC_PIDPATHINFO_MAXSIZE) == PROC_PIDPATHINFO_MAXSIZE ||
      strnlen(v->pvi_cdir.vip_path, MAXPATHLEN) == MAXPATHLEN || *length < sizeof(int)) return 0;
  int count; memcpy(&count, args, sizeof(count));
  if (count < 1 || count > 4096) return 0;
  size_t at = sizeof(int);
  while (at < *length && args[at]) at++;
  if (at == *length) return 0;
  while (at < *length && !args[at]) at++;
  for (int i = 0; i < count; i++) {
    while (at < *length && args[at]) at++;
    if (at == *length) return 0;
    at++;
  }
  *length = at; /* Never emit environment variables. */
  return 1;
}
int main(int argc, char **argv) {
  if (argc == 3 && strcmp(argv[1], "group") == 0) {
    char *end; errno = 0; long group = strtol(argv[2], &end, 10);
    if (errno || *end || group < 1 || group > INT_MAX) return 2;
    pid_t pids[16384];
    errno = 0;
    int size = proc_listpids(PROC_PGRP_ONLY, (uint32_t)group, pids, sizeof(pids));
    if (size < 0 || (size == 0 && errno != 0) || size >= (int)sizeof(pids) || size % (int)sizeof(pid_t)) return 2;
    printf("["); int comma = 0;
    for (int i = 0; i < size / (int)sizeof(pid_t); i++) {
      if (pids[i] <= 0) continue;
      printf("%s%d", comma ? "," : "", pids[i]); comma = 1;
    }
    puts("]"); return ferror(stdout) ? 2 : 0;
  }
  if (argc == 2 && strcmp(argv[1], "inherited-fd") == 0) {
    struct stat s; int type = 0; socklen_t n = sizeof(type);
    int flags = fcntl(4, F_GETFL);
    if (flags < 0 || !(flags & O_NONBLOCK) || fstat(4, &s) != 0 ||
        !S_ISSOCK(s.st_mode) || getsockopt(4, SOL_SOCKET, SO_TYPE, &type, &n) != 0 ||
        type != SOCK_STREAM) return 2;
    puts("{\"nonblockingStream\":true}"); return 0;
  }
  if (argc != 3 || strcmp(argv[1], "process") != 0) return 2;
  char *end; errno = 0; long value = strtol(argv[2], &end, 10);
  if (errno || *end || value < 1 || value > INT_MAX) return 2;
  pid_t pid = (pid_t)value;
  struct proc_bsdinfo before, after;
  if (!bsd(pid, &before)) return errno == ESRCH ? 3 : 2;
  if (before.pbi_uid != getuid() || before.pbi_status == 5 ||
      (before.pbi_flags & PROC_FLAG_INEXIT)) return 2;
  char boot[128] = {0}, boot2[128] = {0}; size_t bn = sizeof(boot), bn2 = sizeof(boot2);
  char exe[PROC_PIDPATHINFO_MAXSIZE] = {0}, exe2[PROC_PIDPATHINFO_MAXSIZE] = {0};
  struct proc_vnodepathinfo vnode, vnode2;
  unsigned char *args = calloc(1, ARG_BOUND), *args2 = calloc(1, ARG_BOUND);
  if (!args || !args2) return 2;
  size_t an = ARG_BOUND, an2 = ARG_BOUND;
  pid_t session = getsid(pid);
  if (session < 1 || sysctlbyname("kern.bootsessionuuid", boot, &bn, NULL, 0) != 0 ||
      !snapshot(pid, exe, &vnode, args, &an) || !snapshot(pid, exe2, &vnode2, args2, &an2) ||
      !bsd(pid, &after) || getsid(pid) != session ||
      sysctlbyname("kern.bootsessionuuid", boot2, &bn2, NULL, 0) != 0 ||
      bn != bn2 || memcmp(boot, boot2, bn) ||
      before.pbi_pid != after.pbi_pid || before.pbi_ppid != after.pbi_ppid ||
      before.pbi_start_tvsec != after.pbi_start_tvsec || before.pbi_start_tvusec != after.pbi_start_tvusec ||
      before.pbi_uid != after.pbi_uid || before.pbi_gid != after.pbi_gid ||
      before.pbi_ruid != after.pbi_ruid || before.pbi_rgid != after.pbi_rgid ||
      before.pbi_svuid != after.pbi_svuid || before.pbi_svgid != after.pbi_svgid ||
      before.pbi_pgid != after.pbi_pgid || after.pbi_status == 5 ||
      (after.pbi_flags & PROC_FLAG_INEXIT) || strcmp(exe, exe2) ||
      strcmp(vnode.pvi_cdir.vip_path, vnode2.pvi_cdir.vip_path) ||
      vnode.pvi_cdir.vip_vi.vi_stat.vst_ino != vnode2.pvi_cdir.vip_vi.vi_stat.vst_ino ||
      vnode.pvi_cdir.vip_vi.vi_stat.vst_dev != vnode2.pvi_cdir.vip_vi.vi_stat.vst_dev ||
      an != an2 || memcmp(args, args2, an)) return 2;
  if (bn < 2 || bn > sizeof(boot) || boot[bn-1] != 0) return 2;
  printf("{\"pid\":%u,\"parentPid\":%u,\"group\":%u,\"session\":%d,\"uid\":%u,\"gid\":%u,\"ruid\":%u,\"rgid\":%u,\"svuid\":%u,\"svgid\":%u,\"start\":\"%llu:%llu\",\"boot\":\"%s\",\"executableHex\":\"",
    after.pbi_pid, after.pbi_ppid, after.pbi_pgid, session, after.pbi_uid, after.pbi_gid,
    after.pbi_ruid, after.pbi_rgid, after.pbi_svuid, after.pbi_svgid,
    (unsigned long long)after.pbi_start_tvsec, (unsigned long long)after.pbi_start_tvusec, boot);
  hex((unsigned char *)exe, strlen(exe)); printf("\",\"cwdHex\":\"");
  hex((unsigned char *)vnode.pvi_cdir.vip_path, strlen(vnode.pvi_cdir.vip_path));
  printf("\",\"procargsHex\":\""); hex(args, an); puts("\"}");
  free(args); free(args2); return ferror(stdout) ? 2 : 0;
}
