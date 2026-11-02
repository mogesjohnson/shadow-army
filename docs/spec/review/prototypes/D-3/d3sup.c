/* d3sup: a tiny subreaper supervisor for experiment D-3. Written from scratch.
 *
 *   d3sup run -- <command...>   become a child subreaper and start the command. When the command exits, or on SIGTERM
 *                               or SIGINT, SIGKILL every descendant found by walking /proc (processes whose parent
 *                               chain leads back here), repeating until none is left.
 *   d3sup check                 set PR_SET_CHILD_SUBREAPER, read it back, print it as JSON
 *
 * Because it is a subreaper, every orphaned descendant (including setsid() daemons) is re-parented to it instead of
 * to init, so the parent chain never leaves the tree. "None left" is decided by waitpid(-1) returning ECHILD, which is
 * exact: a descendant that is alive is always a child of this process or of another descendant.
 *
 * Deliberately no _GNU_SOURCE: with glibc >= 2.38 it redirects strtol/sscanf to __isoc23_* symbols, which would raise
 * the dynamic binary's minimum glibc from 2.34 to 2.38 (binfacts.sh shows this).
 */
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

struct proc { int pid, ppid; char state; signed char mark; /* 1 = descendant, -1 = not, 0 = unknown */ };
struct stats { int passes, first_total, first_direct; long killed; };

static long now_ms(void) {
  struct timespec t;
  clock_gettime(CLOCK_MONOTONIC, &t);
  return t.tv_sec * 1000L + t.tv_nsec / 1000000L;
}

static int by_pid(const void *a, const void *b) {
  return ((const struct proc *)a)->pid - ((const struct proc *)b)->pid;
}

/* Reads /proc/<pid>/stat for every pid; the result is sorted by pid. */
static int scan(struct proc **out) {
  DIR *d = opendir("/proc");
  if (!d) return -1;
  size_t cap = 1024, n = 0;
  struct proc *v = malloc(cap * sizeof *v);
  struct dirent *de;
  while (v && (de = readdir(d))) {
    char *end;
    long pid = strtol(de->d_name, &end, 10);
    if (*end || pid <= 0) continue;
    char path[64], buf[1024];
    snprintf(path, sizeof path, "/proc/%ld/stat", pid);
    int fd = open(path, O_RDONLY | O_CLOEXEC);
    if (fd < 0) continue; /* gone already */
    ssize_t len = read(fd, buf, sizeof buf - 1);
    close(fd);
    if (len <= 0) continue;
    buf[len] = 0;
    char *paren = strrchr(buf, ')'); /* the command name may contain spaces and parentheses */
    char state;
    int ppid;
    if (!paren || sscanf(paren + 1, " %c %d", &state, &ppid) != 2) continue;
    if (n == cap) {
      cap *= 2;
      struct proc *bigger = realloc(v, cap * sizeof *v);
      if (!bigger) { free(v); v = NULL; break; }
      v = bigger;
    }
    v[n++] = (struct proc){ (int)pid, ppid, state, 0 };
  }
  closedir(d);
  if (!v) return -1;
  qsort(v, n, sizeof *v, by_pid);
  *out = v;
  return (int)n;
}

static struct proc *find(struct proc *v, int n, int pid) {
  int lo = 0, hi = n - 1;
  while (lo <= hi) {
    int mid = (lo + hi) / 2;
    if (v[mid].pid == pid) return &v[mid];
    if (v[mid].pid < pid) lo = mid + 1; else hi = mid - 1;
  }
  return NULL;
}

/* Does the parent chain of p lead to root? A vanished parent ends the chain (the next pass sees the new parent). */
static int descends(struct proc *v, int n, struct proc *p, int root) {
  struct proc *path[512];
  int depth = 0, result = 0;
  for (struct proc *cur = p; cur;) {
    if (cur->mark) { result = cur->mark > 0; break; }
    if (cur->pid == root) { result = 1; break; }
    if (cur->ppid <= 1 || depth == 512) break;
    path[depth++] = cur;
    cur = find(v, n, cur->ppid);
  }
  for (int i = 0; i < depth; i++) path[i]->mark = result ? 1 : -1;
  return result;
}

static int sweep(pid_t self, struct stats *s) {
  long deadline = now_ms() + 10000;
  for (;;) {
    s->passes++;
    while (waitpid(-1, NULL, WNOHANG) > 0) {}
    struct proc *v = NULL;
    int n = scan(&v);
    if (n < 0) return -1;
    int live = 0, total = 0, direct = 0;
    for (int i = 0; i < n; i++) {
      if (v[i].pid == self || !descends(v, n, &v[i], (int)self)) continue;
      total++;
      if (v[i].ppid == self) direct++;
      if (v[i].state == 'Z' || v[i].state == 'X') continue; /* already dead, only waiting to be reaped */
      kill(v[i].pid, SIGKILL);
      live++;
      s->killed++;
    }
    free(v);
    if (s->passes == 1) { s->first_total = total; s->first_direct = direct; }
    while (waitpid(-1, NULL, WNOHANG) > 0) {}
    if (live == 0) {
      errno = 0;
      if (waitpid(-1, NULL, WNOHANG) < 0 && errno == ECHILD) return 0; /* no child of any kind is left */
    }
    if (now_ms() > deadline) return -1;
    struct timespec nap = { 0, 1000000L };
    nanosleep(&nap, NULL);
  }
}

int main(int argc, char **argv) {
  if (argc == 2 && !strcmp(argv[1], "check")) {
    int flag = 0;
    if (prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) < 0 || prctl(PR_GET_CHILD_SUBREAPER, &flag, 0, 0, 0) < 0) {
      perror("d3sup: subreaper");
      return 1;
    }
    printf("{\"subreaper\":%s,\"pid\":%d}\n", flag ? "true" : "false", (int)getpid());
    return 0;
  }
  if (argc < 4 || strcmp(argv[1], "run") || strcmp(argv[2], "--")) {
    fprintf(stderr, "usage: d3sup run -- <command...> | d3sup check\n");
    return 2;
  }
  if (prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) < 0) { perror("d3sup: PR_SET_CHILD_SUBREAPER"); return 1; }
  signal(SIGCHLD, SIG_DFL);
  sigset_t set, old;
  sigemptyset(&set);
  sigaddset(&set, SIGTERM);
  sigaddset(&set, SIGINT);
  sigaddset(&set, SIGCHLD);
  sigprocmask(SIG_BLOCK, &set, &old);
  pid_t cli = fork();
  if (cli < 0) { perror("d3sup: fork"); return 1; }
  if (cli == 0) {
    sigprocmask(SIG_SETMASK, &old, NULL);
    execvp(argv[3], &argv[3]);
    perror("d3sup: exec");
    _exit(127);
  }
  fprintf(stderr, "d3sup: cli pid %d\n", (int)cli);
  const char *why = NULL;
  while (!why) {
    struct timespec wait = { 0, 100000000L };
    int sig = sigtimedwait(&set, NULL, &wait);
    if (sig == SIGTERM || sig == SIGINT) { why = "signal"; break; }
    pid_t w;
    while ((w = waitpid(-1, NULL, WNOHANG)) > 0) if (w == cli) why = "cli-exit";
  }
  struct stats s = {0};
  int rc = sweep(getpid(), &s);
  fprintf(stderr, "d3sup: closed by %s: %s passes=%d killed=%ld first_pass_descendants=%d direct_children=%d\n",
          why, rc == 0 ? "none left" : "TIMEOUT", s.passes, s.killed, s.first_total, s.first_direct);
  return rc == 0 ? 0 : 3;
}
