/* Shadow Army's small OS bridge. No model, prompt, credential, or tool policy lives here. */
#ifdef __APPLE__
#define _DARWIN_C_SOURCE 1
#else
#define _POSIX_C_SOURCE 200809L
#endif
#include <errno.h>
#include <inttypes.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#ifdef __linux__
#include <sys/prctl.h>
#endif

#ifdef __APPLE__
#include <dlfcn.h>
#include <libproc.h>
#include <mach/message.h>
#include <sys/proc_info.h>
#include <sys/wait.h>

/* These versioned structures are documented in Apple's proc_info_private.h. */
struct shadow_unique {
  uint8_t uuid[16]; uint64_t unique, parent; int32_t version, original_parent_version;
  uint64_t reserved[2];
};
struct shadow_coalition { uint64_t ids[2], reserved[3]; };
_Static_assert(sizeof(struct shadow_unique) == 56, "unexpected process identity ABI");
_Static_assert(sizeof(struct shadow_coalition) == 40, "unexpected coalition ABI");
typedef int (*extended_info_fn)(int32_t,int32_t,uint32_t,uint32_t,uint64_t,uint64_t,uint64_t,int32_t);
typedef int (*audit_signal_fn)(audit_token_t *, int);
static extended_info_fn extended_info;
static audit_signal_fn audit_signal;
struct member { pid_t pid; struct shadow_unique identity; uint64_t coalition; uint32_t status; };

static int capability(void) {
  extended_info = (extended_info_fn)dlsym(RTLD_DEFAULT, "__proc_info_extended_id");
  audit_signal = (audit_signal_fn)dlsym(RTLD_DEFAULT, "proc_signal_with_audittoken");
  if (!extended_info || !audit_signal) { errno = ENOTSUP; return -1; }
  return 0;
}
static int query(pid_t pid, struct member *out) {
  struct shadow_unique initial = {0}; struct shadow_coalition coalition = {0};
  struct proc_bsdshortinfo status = {0}; memset(out, 0, sizeof(*out));
  errno = 0;
  if (proc_pidinfo(pid, 17, 0, &initial, sizeof(initial)) != (int)sizeof(initial)) {
    if (!errno) errno = ESRCH; return -1;
  }
  /* Every subsequent read is bound to the same kernel lifetime, including after reparent. */
  if (extended_info(2,pid,20,2,initial.unique,0,(uint64_t)(uintptr_t)&coalition,sizeof(coalition)) != (int)sizeof(coalition) ||
      extended_info(2,pid,PROC_PIDT_SHORTBSDINFO,2,initial.unique,0,(uint64_t)(uintptr_t)&status,sizeof(status)) != (int)sizeof(status) ||
      extended_info(2,pid,17,2,initial.unique,0,(uint64_t)(uintptr_t)&out->identity,sizeof(out->identity)) != (int)sizeof(out->identity)) {
    if (!errno) errno = ESRCH; return -1;
  }
  out->pid = pid; out->coalition = coalition.ids[0]; out->status = status.pbsi_status;
  return 0;
}
static void print_member(const struct member *m) {
  printf("{\"pid\":%d,\"unique\":\"%" PRIu64 "\",\"version\":%d,\"coalition\":\"%" PRIu64 "\",\"status\":%u}",
    m->pid,m->identity.unique,m->identity.version,m->coalition,m->status);
}
static int members(uint64_t coalition, struct member **result, int *length) {
  int capacity = proc_listallpids(NULL,0);
  if (capacity <= 0) { if (!errno) errno = EIO; return -1; }
  capacity += 256;
  pid_t *pids = NULL; int count = 0;
  for (;;) {
    pid_t *next = realloc(pids,(size_t)capacity * sizeof(*pids));
    if (!next) { free(pids); errno = ENOMEM; return -1; } pids = next;
    errno = 0; count = proc_listallpids(pids,capacity * (int)sizeof(*pids));
    if (count <= 0) { free(pids); if (!errno) errno = EIO; return -1; }
    if (count < capacity) break;
    if (capacity > 1000000) { free(pids); errno = EOVERFLOW; return -1; }
    capacity *= 2;
  }
  struct member *found = calloc((size_t)count,sizeof(*found));
  if (!found) { free(pids); errno = ENOMEM; return -1; }
  int used = 0;
  for (int n = 0; n < count; n++) {
    if (pids[n] <= 0) continue;
    struct member m;
    if (query(pids[n],&m) < 0) {
      if (errno == ESRCH || errno == ENOENT) continue;
      free(found); free(pids); return -1; /* An unreadable list is never evidence of emptiness. */
    }
    if (m.coalition == coalition && m.status != 5) found[used++] = m; /* Zombies cannot write. */
  }
  free(pids); *result = found; *length = used; return 0;
}
static int signal_member(const struct member *m, int sig) {
  audit_token_t token = {{0}};
  token.val[5] = (uint32_t)m->pid; token.val[7] = (uint32_t)m->identity.version;
  /* The kernel revalidates pidversion while acquiring the process reference. Never plain kill(pid). */
  int error = audit_signal(&token,sig);
  if (!error) return 0;
  int failure = error < 0 ? errno : error;
  if (failure == ESRCH) return 0;
  errno = failure > 0 ? failure : EIO;
  return -1;
}
static double monotonic(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec + t.tv_nsec / 1e9; }
static int contain(uint64_t coalition, int own, const char *label) {
  struct member self;
  if (query(getpid(),&self) < 0) return -1;
  if (coalition <= 1 || (own ? self.coalition != coalition : self.coalition == coalition)) { errno = EINVAL; return -1; }
  double deadline = monotonic() + 10.0;
  while (monotonic() < deadline) {
    struct member *list = NULL; int count = 0;
    if (members(coalition,&list,&count) < 0) return -1;
    int live = 0, stopped = 1;
    for (int n = 0; n < count; n++) {
      if (own && list[n].pid == getpid()) continue;
      live++;
      if (list[n].status != 4) { stopped = 0; if (signal_member(&list[n],SIGSTOP) < 0) { free(list); return -1; } }
    }
    if (!live) {
      free(list);
      /* Only owner-loss cleanup runs in the target coalition. Its final executable is launchctl;
         removing this exact nonce label happens after every native writer has already ended. */
      if (own && label) { execl("/bin/launchctl","launchctl","remove",label,(char *)NULL); return -1; }
      return 0;
    }
    if (stopped) {
      for (int n = 0; n < count; n++) {
        if (own && list[n].pid == getpid()) continue;
        if (signal_member(&list[n],SIGKILL) < 0) { free(list); return -1; }
      }
    }
    free(list); struct timespec delay = {0,10000000}; nanosleep(&delay,NULL);
  }
  errno = ETIMEDOUT; return -1;
}
static uint64_t number(const char *text) {
  char *end = NULL; errno = 0; uint64_t result = strtoull(text,&end,10);
  if (errno || !end || *end || end == text || *text == '-') { fprintf(stderr,"invalid native identity\n"); exit(2); }
  return result;
}
#endif

int main(int argc, char **argv) {
#ifdef __linux__
  if (argc >= 3 && strcmp(argv[1],"launch") == 0) {
    int enabled = 0;
    if (prctl(PR_SET_CHILD_SUBREAPER,1,0,0,0) < 0 || prctl(PR_GET_CHILD_SUBREAPER,&enabled,0,0,0) < 0 || !enabled) {
      perror("Linux session subreaper unavailable"); return 1;
    }
    execvp(argv[2],&argv[2]); perror("native guardian exec"); return 1;
  }
  if (argc == 2 && strcmp(argv[1],"check") == 0) {
    if (prctl(PR_SET_CHILD_SUBREAPER,1,0,0,0) < 0) { perror("Linux session subreaper unavailable"); return 1; }
    puts("{\"platform\":\"linux\",\"subreaper\":true}"); return 0;
  }
#elif defined(__APPLE__)
  if (capability() < 0) { perror("macOS coalition identity or audit-token signals unavailable"); return 1; }
  if (argc == 2 && strcmp(argv[1],"check") == 0) {
    struct member self;
    if (query(getpid(),&self) < 0 || signal_member(&self,SIGCONT) < 0) { perror("macOS process capability probe"); return 1; }
    puts("{\"platform\":\"darwin\",\"coalition\":true,\"auditSignals\":true}"); return 0;
  }
  if (argc == 3 && strcmp(argv[1],"query") == 0) {
    struct member m;
    if (query((pid_t)number(argv[2]),&m) < 0) { perror("macOS process identity"); return 1; }
    print_member(&m); putchar('\n'); return 0;
  }
  if (argc == 3 && strcmp(argv[1],"members") == 0) {
    struct member *list = NULL; int count = 0;
    if (members(number(argv[2]),&list,&count) < 0) { perror("macOS coalition membership"); return 1; }
    putchar('['); for (int n = 0; n < count; n++) { if (n) putchar(','); print_member(&list[n]); } puts("]"); free(list); return 0;
  }
  if ((argc == 3 && strcmp(argv[1],"close") == 0) || (argc == 4 && strcmp(argv[1],"close-own") == 0)) {
    if (contain(number(argv[2]),argc == 4,argc == 4 ? argv[3] : NULL) < 0) { perror("macOS coalition did not empty"); return 1; }
    puts("{\"closed\":true}"); return 0;
  }
#endif
  fprintf(stderr,"unsupported process-supervisor operation\n"); return 2;
}
