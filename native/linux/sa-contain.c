/*
 * sa-contain: Shadow Army's Linux containment helper (spec v2: PO-9, PO-10,
 * PO-12, PO-14 step 3, PO-17). Security code: review every change against
 * PO-17's lists.
 *
 * It uses only the system's C library. It opens no network connection,
 * creates and writes no file, never reads the CLI's arguments, environment
 * or standard streams, and starts no program but the one it is given.
 *
 * Operations (the first argument). Any other is refused and nothing is done.
 *
 *   sa-contain check
 *       Marks itself a child subreaper and reads the mark back (PO-14 step 3).
 *
 *   sa-contain guard <program> [<arg>...]
 *       The guardian (PO-9, PO-10). Marks itself a child subreaper, leads a
 *       session and process group of its own, reports `ready`, and waits for
 *       `start`. It then starts <program> (an absolute path; no PATH search)
 *       with these arguments and the environment, working directory, resource
 *       limits and standard streams it was itself started with. The CLI joins
 *       its session and process group, and it stays the CLI's parent.
 *
 * Fd 3 is the pipe to the post office: a connected Unix stream socket
 * (Node.js's `pipe` stdio entry is one). If fd 3 is anything else (a file, a
 * pipe, a network socket, an unconnected or listening socket) the helper
 * exits 2 at once and writes nothing (PO-17). A check whose report can't be
 * sent exits 1. It
 * writes one JSON line per result on it, never on fds 0-2, and as the
 * guardian reads one command per line from it:
 *
 *   start   start the CLI (once)
 *   term    send SIGTERM to the CLI, if it hasn't exited (PO-10, at 9.5 s)
 *   kill    the close command: kill the tree and reap it (PO-10)
 *
 * An unknown command is refused and changes nothing; a line too long for
 * any command is refused once and dropped up to its newline. If the pipe
 * reaches its end, or the guardian gets SIGTERM, SIGINT or SIGHUP, it kills
 * the tree at once (PO-10, "when the post office is gone"). It keeps
 * watching the pipe and signals while the CLI's exec is pending. It reports
 * `started` only once the program's exec is known to have committed: a child that dies by
 * a signal before exec is reported as step "exec-unconfirmed" (C8).
 *
 * Killing the tree: the guardian SIGKILLs each of its children, and each
 * process it adopts as their parents die, and reaps them, until wait()
 * reports ECHILD. Children are found by their parent pid in /proc/<pid>/stat
 * and signalled through that /proc/<pid> directory (pidfd_send_signal), so
 * the signal reaches the process that was read, never a pid number. Before
 * `ready` the guardian opens /proc, checks that it is procfs and that its
 * `self` is the guardian's own pid (the guardian's pid namespace), and keeps
 * that verified view; if it can't, it fails and starts nothing.
 *
 * Reports never block: lines queue in a fixed buffer and are sent without
 * waiting, so a stalled post office can't stop the kill. Lines that don't
 * fit are dropped whole and counted in `ended`'s "dropped". At exit the
 * helper waits at most a second for the queue to drain.
 *
 * Reports (one line each):
 *   {"op":"check","ok":true,"subreaper":1}
 *   {"op":"guard","event":"ready","pid":P}
 *   {"op":"guard","event":"started","pid":P}
 *   {"op":"guard","event":"exit","pid":P,"code":C}  or  ...,"signal":S}
 *   {"op":"guard","event":"reaped","pid":P}         (a process other than the CLI, while killing)
 *   {"op":"guard","event":"ended","reaped":N,"dropped":D}  (the tree is empty: ECHILD)
 *   {"op":"guard","event":"refused","reason":"unknown command"}
 *   {"op":"<op>","ok":false,"step":"<step>","errno":E}   (an error)
 *   {"ok":false,"reason":"unknown operation"}
 *
 * Exit status: 0 when the operation finished (a check passed, a tree ended),
 * 1 on an error, 2 when the operation was refused.
 */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/signalfd.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/statfs.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#ifndef SYS_pidfd_send_signal
#define SYS_pidfd_send_signal 424
#endif
#define PROC_MAGIC 0x9fa0 /* PROC_SUPER_MAGIC */

#define REPORT_FD 3
#define OUT_CAP 8192
#define OUT_RESERVE 256 /* kept free for the last line */

static int report_fd = REPORT_FD;
static char out_buf[OUT_CAP];
static size_t out_used = 0;
static unsigned dropped = 0;
static int out_gone = 0;

/* Sends what the socket takes now, never waiting. A post office that is
 * gone is seen as the end of the pipe. */
static void flush_out(void) {
  while (out_used > 0 && !out_gone) {
    ssize_t n = send(report_fd, out_buf, out_used, MSG_DONTWAIT | MSG_NOSIGNAL);
    if (n < 0) {
      if (errno == EINTR) continue;
      if (errno != EAGAIN && errno != EWOULDBLOCK) out_gone = 1;
      return;
    }
    out_used -= (size_t)n;
    memmove(out_buf, out_buf + n, out_used);
  }
}

/* Queues one whole line, or drops and counts it if it doesn't fit. */
static void queue_line(const char *line, int last) {
  size_t len = strlen(line);
  size_t cap = last ? OUT_CAP : OUT_CAP - OUT_RESERVE;
  if (out_gone) return;
  if (out_used + len > cap) {
    dropped++;
    return;
  }
  memcpy(out_buf + out_used, line, len);
  out_used += len;
  flush_out();
}

static void report(const char *line) { queue_line(line, 0); }

/* Waits at most `ms` for the queue to drain. */
static void drain_out(int ms) {
  struct timespec t0, t;
  clock_gettime(CLOCK_MONOTONIC, &t0);
  for (;;) {
    flush_out();
    if (out_used == 0 || out_gone) return;
    clock_gettime(CLOCK_MONOTONIC, &t);
    long left = ms - ((t.tv_sec - t0.tv_sec) * 1000 + (t.tv_nsec - t0.tv_nsec) / 1000000);
    if (left <= 0) return;
    struct pollfd p = {.fd = report_fd, .events = POLLOUT};
    poll(&p, 1, (int)left);
  }
}

static void vqueue(int last, const char *fmt, va_list ap) {
  char line[256];
  int n = vsnprintf(line, sizeof line - 1, fmt, ap);
  if (n < 0) return;
  if ((size_t)n > sizeof line - 2) n = (int)(sizeof line - 2);
  line[n] = '\n';
  line[n + 1] = '\0';
  queue_line(line, last);
}

static void reportf(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
static void reportf(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  vqueue(0, fmt, ap);
  va_end(ap);
}

static void report_lastf(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
static void report_lastf(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  vqueue(1, fmt, ap);
  va_end(ap);
}

static void fail(const char *op, const char *step, int err) {
  reportf("{\"op\":\"%s\",\"ok\":false,\"step\":\"%s\",\"errno\":%d}", op, step, err);
}

/* PR_SET_CHILD_SUBREAPER, then the read-back the check needs. */
static int set_subreaper(const char *op) {
  int mark = 0;
  if (prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0) {
    fail(op, "set-subreaper", errno);
    return -1;
  }
  if (prctl(PR_GET_CHILD_SUBREAPER, (unsigned long)&mark, 0, 0, 0) != 0) {
    fail(op, "get-subreaper", errno);
    return -1;
  }
  if (mark != 1) {
    fail(op, "get-subreaper", 0);
    return -1;
  }
  return 0;
}

static int op_check(void) {
  if (set_subreaper("check") != 0) return 1;
  report("{\"op\":\"check\",\"ok\":true,\"subreaper\":1}\n");
  return 0;
}

/* ---- the guardian ---- */

static pid_t cli_pid = -1;   /* -1 until started */
static int cli_reaped = 0;
static sigset_t original_mask;
static struct sigaction original_sigpipe;

static void report_status(pid_t pid, int status) {
  if (WIFEXITED(status))
    reportf("{\"op\":\"guard\",\"event\":\"exit\",\"pid\":%d,\"code\":%d}", (int)pid, WEXITSTATUS(status));
  else if (WIFSIGNALED(status))
    reportf("{\"op\":\"guard\",\"event\":\"exit\",\"pid\":%d,\"signal\":%d}", (int)pid, WTERMSIG(status));
}

static int exec_unsure;      /* defined with the start, below */
static int start_failed = 0; /* the start settled as not run while reaping */
static int settle_start(void);

/* Reaps every child that has ended, without waiting. Returns 1 once wait()
 * reports ECHILD, 0 otherwise. While killing, each reaped process other
 * than the CLI is reported. Each child is peeked at before it is reaped, so
 * a start still unresolved settles from the CLI's zombie before its status
 * is consumed, whenever the CLI became waitable (C10). */
static int reap_ready(int killing, int *reaped) {
  for (;;) {
    siginfo_t si;
    memset(&si, 0, sizeof si);
    if (waitid(P_ALL, 0, &si, WEXITED | WNOHANG | WNOWAIT) != 0) {
      if (errno == EINTR) continue;
      return errno == ECHILD ? 1 : 0;
    }
    pid_t pid = si.si_pid;
    if (pid == 0) return 0;
    if (pid == cli_pid && exec_unsure && settle_start() != 0) start_failed = 1;
    int status;
    pid_t got;
    do {
      got = waitpid(pid, &status, WNOHANG);
    } while (got < 0 && errno == EINTR);
    if (got != pid) return 0;
    if (pid == cli_pid) {
      cli_reaped = 1;
      report_status(pid, status);
    } else if (killing) {
      reportf("{\"op\":\"guard\",\"event\":\"reaped\",\"pid\":%d}", (int)pid);
    }
    if (killing && reaped) (*reaped)++;
  }
}

/* The verified /proc (PO-10, PO-17): procfs, in the guardian's own pid
 * namespace. Opened once before `ready`; every scan goes through it. */
static int proc_fd = -1;
static pid_t proc_self = -1;
static char own_comm[32]; /* the guardian's name; a child keeps it until exec */

static int read_stat(int dir, char comm[32], pid_t *ppid, unsigned *flags);

static int signal_dir(int dir, int sig) {
  return (int)syscall(SYS_pidfd_send_signal, dir, sig, NULL, 0);
}

static int open_proc_view(void) {
  char self[32], link[32];
  struct statfs fs;
  proc_fd = open("/proc", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (proc_fd < 0) {
    fail("guard", "proc-open", errno);
    return -1;
  }
  if (fstatfs(proc_fd, &fs) != 0) {
    fail("guard", "proc-type", errno);
    return -1;
  }
  if (fs.f_type != PROC_MAGIC) {
    fail("guard", "proc-type", 0);
    return -1;
  }
  snprintf(self, sizeof self, "%d", (int)getpid());
  ssize_t n = readlinkat(proc_fd, "self", link, sizeof link - 1);
  if (n <= 0) {
    fail("guard", "proc-self", n < 0 ? errno : 0);
    return -1;
  }
  link[n] = '\0';
  if (strcmp(link, self) != 0) {
    fail("guard", "proc-namespace", 0);
    return -1;
  }
  /* Signal 0 to our own directory: the kernel can signal through one. */
  int dir = openat(proc_fd, self, O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (dir < 0 || signal_dir(dir, 0) != 0) {
    fail("guard", "proc-signal", errno);
    if (dir >= 0) close(dir);
    return -1;
  }
  pid_t ppid;
  unsigned flags;
  if (read_stat(dir, own_comm, &ppid, &flags) != 0) {
    fail("guard", "proc-stat", errno);
    close(dir);
    return -1;
  }
  close(dir);
  proc_self = getpid();
  return 0;
}

/* Reads <dir>/stat: the command name (comm, may be NULL), the parent pid and
 * the kernel flags. The name is in parentheses and may hold any byte, so the
 * fields start after the last ')'. Returns 0, or -1 if it can't be read. */
static int read_stat(int dir, char comm[32], pid_t *ppid, unsigned *flags) {
  char buf[512];
  int fd = openat(dir, "stat", O_RDONLY | O_CLOEXEC);
  if (fd < 0) return -1;
  ssize_t n = read(fd, buf, sizeof buf - 1);
  close(fd);
  if (n <= 0) return -1;
  buf[n] = '\0';
  char *start = strchr(buf, '(');
  char *end = strrchr(buf, ')');
  if (!start || !end || end < start || end - start - 1 >= 32) return -1;
  char state;
  int parent, i;
  if (sscanf(end + 1, " %c %d %d %d %d %d %u", &state, &parent, &i, &i, &i, &i, flags) != 7) return -1;
  if (comm) {
    memcpy(comm, start + 1, (size_t)(end - start - 1));
    comm[end - start - 1] = '\0';
  }
  *ppid = (pid_t)parent;
  return 0;
}

static pid_t parent_of(int dir) {
  pid_t ppid;
  unsigned flags;
  return read_stat(dir, NULL, &ppid, &flags) == 0 ? ppid : -1;
}

/* SIGKILLs each process whose parent is the guardian in the verified view,
 * through its /proc directory: the signal reaches the process whose stat was
 * read, or none. Each is an unreaped child of ours. */
static void kill_children(void) {
  int scan = openat(proc_fd, ".", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (scan < 0) return;
  DIR *proc = fdopendir(scan);
  if (!proc) {
    close(scan);
    return;
  }
  struct dirent *entry;
  while ((entry = readdir(proc)) != NULL) {
    const char *name = entry->d_name;
    if (name[0] < '1' || name[0] > '9') continue;
    int dir = openat(proc_fd, name, O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (dir < 0) continue;
    if (parent_of(dir) == proc_self) signal_dir(dir, SIGKILL);
    close(dir);
  }
  closedir(proc);
}

/* PO-10: kill and reap until ECHILD. Waits between rounds on the SIGCHLD
 * descriptor, with a short and then longer timeout, so a process that can't
 * be signalled (another user's) is tried again without spinning. Reports
 * never wait (see the top). */
static int kill_tree(int sigfd) {
  int reaped = 0;
  int timeout = 10;
  for (;;) {
    if (cli_pid > 0 && !cli_reaped) kill(cli_pid, SIGKILL);
    kill_children();
    if (reap_ready(1, &reaped)) break;
    flush_out();
    struct pollfd p = {.fd = sigfd, .events = POLLIN};
    if (poll(&p, 1, timeout) > 0) {
      struct signalfd_siginfo info;
      while (read(sigfd, &info, sizeof info) == (ssize_t)sizeof info) {
      }
    }
    if (timeout < 200) timeout *= 2;
  }
  report_lastf("{\"op\":\"guard\",\"event\":\"ended\",\"reaped\":%d,\"dropped\":%u}", reaped, dropped);
  return start_failed;
}

static int exec_fd = -1; /* the exec-status pipe while the start is pending */

/* Forks the CLI and returns at once; the event loop watches exec_fd. */
static int start_cli(char **argv) {
  int status_pipe[2];
  if (pipe2(status_pipe, O_CLOEXEC) != 0) {
    fail("guard", "pipe", errno);
    return -1;
  }
  pid_t pid = fork();
  if (pid < 0) {
    int err = errno;
    close(status_pipe[0]);
    close(status_pipe[1]);
    fail("guard", "fork", err);
    return -1;
  }
  if (pid == 0) {
    /* The child: undo the guardian's own signal setup, then become the CLI.
     * Fd 3 and the status pipe are close-on-exec. */
    sigaction(SIGPIPE, &original_sigpipe, NULL);
    sigprocmask(SIG_SETMASK, &original_mask, NULL);
    execv(argv[0], argv);
    int err = errno;
    ssize_t ignored = write(status_pipe[1], &err, sizeof err);
    (void)ignored;
    _exit(127);
  }
  close(status_pipe[1]);
  cli_pid = pid; /* tracked from fork: a kill now reaches it */
  exec_fd = status_pipe[0];
  return 0;
}

static int exec_unsure = 0; /* the pipe ended; whether exec ran is not known yet */

#define PF_EXITING_FLAG 0x4 /* the kernel's PF_EXITING: do_exit has begun */

/* C10's test builds with -DSA_CONTAIN_TEST_STALE: the looks at the pipe's
 * end and before reaping are then skipped, as when each is taken just before
 * the CLI exits, so only the reaping settles the start. The shipped helper
 * is never built with it. */
#ifdef SA_CONTAIN_TEST_STALE
#define STALE_LOOKS 1
#else
#define STALE_LOOKS 0
#endif

/* The status pipe also reaches its end when the child dies before exec
 * (C8), so the end alone confirms nothing. The child ran the program if it
 * now has another name than the guardian's (exec renames it), exited with a
 * code (before exec it only exits after writing an errno), or is alive and
 * not exiting (the pipe closes before death only at exec). It did not, as
 * far as can be known, if it died by a signal under the guardian's name.
 * Returns 1 ran, 0 not confirmed, -1 dying: ask again at SIGCHLD. */
static int exec_outcome(void) {
  siginfo_t si;
  memset(&si, 0, sizeof si);
  int dead = waitid(P_PID, (id_t)cli_pid, &si, WEXITED | WNOHANG | WNOWAIT) == 0 && si.si_pid == cli_pid;
  if (dead && si.si_code == CLD_EXITED) return 1;
  if (cli_reaped) return 0; /* nothing is left to look at: never wait forever */
  char name[16], comm[32];
  pid_t ppid;
  unsigned flags = 0;
  snprintf(name, sizeof name, "%d", (int)cli_pid);
  int dir = openat(proc_fd, name, O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  int known = dir >= 0 && read_stat(dir, comm, &ppid, &flags) == 0;
  if (dir >= 0) close(dir);
  if (known && strcmp(comm, own_comm) != 0) return 1;
  if (dead) return 0;
  if (!known || (flags & PF_EXITING_FLAG)) return -1;
  return 1;
}

/* Reports the start once its outcome is known. */
static int settle_start(void) {
  int ran = exec_outcome();
  if (ran < 0) return 0;
  exec_unsure = 0;
  if (!ran) {
    fail("guard", "exec-unconfirmed", 0);
    return -1;
  }
  reportf("{\"op\":\"guard\",\"event\":\"started\",\"pid\":%d}", (int)cli_pid);
  return 0;
}

/* exec_fd is readable: an errno means exec failed; the end is settled above. */
static int finish_start(void) {
  int err = 0;
  ssize_t n;
  do {
    n = read(exec_fd, &err, sizeof err);
  } while (n < 0 && errno == EINTR);
  close(exec_fd);
  exec_fd = -1;
  if (n != 0) {
    fail("guard", "exec", n == (ssize_t)sizeof err ? err : n < 0 ? errno : 0);
    return -1;
  }
  exec_unsure = 1;
  return STALE_LOOKS ? 0 : settle_start();
}

enum command { CMD_NONE, CMD_START, CMD_TERM, CMD_KILL, CMD_UNKNOWN };

static enum command parse_command(const char *line, size_t len) {
  if (len == 5 && memcmp(line, "start", 5) == 0) return CMD_START;
  if (len == 4 && memcmp(line, "term", 4) == 0) return CMD_TERM;
  if (len == 4 && memcmp(line, "kill", 4) == 0) return CMD_KILL;
  return CMD_UNKNOWN;
}

static int op_guard(int argc, char **argv) {
  if (argc < 3 || argv[2][0] != '/') {
    fail("guard", "usage", 0);
    return 2;
  }
  char **cli_argv = argv + 2;

  if (set_subreaper("guard") != 0) return 1;
  /* Lead a session and process group of our own. A process that already
   * leads one (setsid fails with EPERM) keeps it. */
  if (setsid() < 0 && getsid(0) != getpid()) {
    fail("guard", "setsid", errno);
    return 1;
  }

  sigset_t handled;
  sigemptyset(&handled);
  sigaddset(&handled, SIGCHLD);
  sigaddset(&handled, SIGTERM);
  sigaddset(&handled, SIGINT);
  sigaddset(&handled, SIGHUP);
  if (sigprocmask(SIG_BLOCK, &handled, &original_mask) != 0) {
    fail("guard", "sigprocmask", errno);
    return 1;
  }
  struct sigaction ignore = {.sa_handler = SIG_IGN};
  sigemptyset(&ignore.sa_mask);
  sigaction(SIGPIPE, &ignore, &original_sigpipe);
  int sigfd = signalfd(-1, &handled, SFD_CLOEXEC | SFD_NONBLOCK);
  if (sigfd < 0) {
    fail("guard", "signalfd", errno);
    return 1;
  }

  if (open_proc_view() != 0) return 1;

  reportf("{\"op\":\"guard\",\"event\":\"ready\",\"pid\":%d}", (int)getpid());

  char buf[256];
  size_t used = 0;
  int started = 0;
  int discarding = 0; /* inside a line too long for any command */
  for (;;) {
    struct pollfd fds[3] = {
        {.fd = sigfd, .events = POLLIN},
        {.fd = report_fd, .events = POLLIN | (out_used ? POLLOUT : 0)},
        {.fd = exec_fd, .events = POLLIN}, /* ignored while -1 */
    };
    if (poll(fds, 3, -1) < 0) {
      if (errno == EINTR) continue;
      fail("guard", "poll", errno);
      { kill_tree(sigfd); return 1; }
    }
    /* First, so a failed exec is reported as one before its exit. */
    if (exec_fd >= 0 && (fds[2].revents & (POLLIN | POLLHUP | POLLERR))) {
      if (finish_start() != 0) { kill_tree(sigfd); return 1; }
    }
    if (fds[1].revents & POLLOUT) flush_out();
    if (fds[0].revents & POLLIN) {
      struct signalfd_siginfo info;
      int end = 0;
      while (read(sigfd, &info, sizeof info) == (ssize_t)sizeof info) {
        if (info.ssi_signo != SIGCHLD) end = 1;
      }
      /* Before reaping: a dying child is settled while it is still a zombie. */
      if (!STALE_LOOKS && exec_unsure && settle_start() != 0) { kill_tree(sigfd); return 1; }
      reap_ready(0, NULL);
      if (start_failed) { kill_tree(sigfd); return 1; }
      if (end) return kill_tree(sigfd);
    }
    if (fds[1].revents & (POLLIN | POLLHUP | POLLERR)) {
      ssize_t n = read(report_fd, buf + used, sizeof buf - used);
      if (n < 0 && errno == EINTR) continue;
      if (n <= 0) return kill_tree(sigfd); /* the post office is gone */
      used += (size_t)n;
      if (discarding) {
        char *end = memchr(buf, '\n', used);
        size_t skip = end ? (size_t)(end - buf) + 1 : used;
        used -= skip;
        memmove(buf, buf + skip, used);
        if (end) discarding = 0;
      }
      char *nl;
      while ((nl = memchr(buf, '\n', used)) != NULL) {
        size_t len = (size_t)(nl - buf);
        switch (parse_command(buf, len)) {
          case CMD_START:
            if (!started) {
              started = 1;
              if (start_cli(cli_argv) != 0) { kill_tree(sigfd); return 1; }
            } else {
              report("{\"op\":\"guard\",\"event\":\"refused\",\"reason\":\"already started\"}\n");
            }
            break;
          case CMD_TERM:
            if (cli_pid > 0 && !cli_reaped) kill(cli_pid, SIGTERM);
            break;
          case CMD_KILL:
            return kill_tree(sigfd);
          default:
            report("{\"op\":\"guard\",\"event\":\"refused\",\"reason\":\"unknown command\"}\n");
            break;
        }
        used -= len + 1;
        memmove(buf, nl + 1, used);
      }
      if (used == sizeof buf) {
        /* A line longer than any command: refuse it once, and drop the
         * rest of it up to its newline, so none of it runs (C4). */
        report("{\"op\":\"guard\",\"event\":\"refused\",\"reason\":\"unknown command\"}\n");
        used = 0;
        discarding = 1;
      }
    }
  }
}

/* PO-17: fd 3 must be a Unix stream socket (Node.js's `pipe`): never a
 * file, a pipe or a network socket. Checked before anything is written. */
static int transport_ok(void) {
  struct stat st;
  int type = 0, domain = 0;
  socklen_t len = sizeof type;
  if (fstat(report_fd, &st) != 0 || !S_ISSOCK(st.st_mode)) return 0;
  if (getsockopt(report_fd, SOL_SOCKET, SO_TYPE, &type, &len) != 0 || type != SOCK_STREAM) return 0;
  len = sizeof domain;
  if (getsockopt(report_fd, SOL_SOCKET, SO_DOMAIN, &domain, &len) != 0 || domain != AF_UNIX) return 0;
  /* Connected to a peer (C9): a listening or unconnected socket has none. */
  struct sockaddr_storage peer;
  len = sizeof peer;
  if (getpeername(report_fd, (struct sockaddr *)&peer, &len) != 0) return 0;
  return 1;
}

int main(int argc, char **argv) {
  if (!transport_ok()) return 2;
  if (fcntl(report_fd, F_SETFD, FD_CLOEXEC) != 0) return 2;
  int rc;
  if (argc == 2 && strcmp(argv[1], "check") == 0) {
    rc = op_check();
    drain_out(1000);
    /* A check passes only if its report reached the post office (C9). */
    if (rc == 0 && (out_used > 0 || out_gone || dropped > 0)) rc = 1;
  } else if (argc >= 2 && strcmp(argv[1], "guard") == 0) {
    rc = op_guard(argc, argv);
  } else {
    report("{\"ok\":false,\"reason\":\"unknown operation\"}\n");
    rc = 2;
  }
  drain_out(1000);
  return rc;
}
