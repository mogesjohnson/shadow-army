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
 * Fd 3 is the pipe to the post office: a stream socket (Node.js's `pipe`
 * stdio entry is one). The helper writes one JSON line per result on it,
 * never on fds 0-2, and as the guardian reads one command per line from it:
 *
 *   start   start the CLI (once)
 *   term    send SIGTERM to the CLI, if it hasn't exited (PO-10, at 9.5 s)
 *   kill    the close command: kill the tree and reap it (PO-10)
 *
 * An unknown command is refused and changes nothing. If the pipe reaches its
 * end, or the guardian gets SIGTERM, SIGINT or SIGHUP, it kills the tree at
 * once (PO-10, "when the post office is gone").
 *
 * Killing the tree: the guardian SIGKILLs each of its children (found in
 * /proc/<pid>/stat by their parent pid), and each process it adopts as their
 * parents die, and reaps them, until wait() reports ECHILD. It signals only
 * its own unreaped children, whose pids the kernel can't reuse.
 *
 * Reports (one line each):
 *   {"op":"check","ok":true,"subreaper":1}
 *   {"op":"guard","event":"ready","pid":P}
 *   {"op":"guard","event":"started","pid":P}
 *   {"op":"guard","event":"exit","pid":P,"code":C}  or  ...,"signal":S}
 *   {"op":"guard","event":"reaped","pid":P}         (a process other than the CLI, while killing)
 *   {"op":"guard","event":"ended","reaped":N}       (the tree is empty: ECHILD)
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
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define REPORT_FD 3

static int report_fd = REPORT_FD;

/* Writes one whole line to the post office. A failed write is ignored: a
 * post office that is gone is seen as the end of the pipe. */
static void report(const char *line) {
  size_t len = strlen(line);
  size_t done = 0;
  while (done < len) {
    ssize_t n = write(report_fd, line + done, len - done);
    if (n < 0) {
      if (errno == EINTR) continue;
      return;
    }
    done += (size_t)n;
  }
}

static void reportf(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
static void reportf(const char *fmt, ...) {
  char line[256];
  va_list ap;
  va_start(ap, fmt);
  int n = vsnprintf(line, sizeof line - 1, fmt, ap);
  va_end(ap);
  if (n < 0) return;
  if ((size_t)n > sizeof line - 2) n = (int)(sizeof line - 2);
  line[n] = '\n';
  line[n + 1] = '\0';
  report(line);
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

/* Reaps every child that has ended, without waiting. Returns 1 once wait()
 * reports ECHILD, 0 otherwise. While killing, each reaped process other
 * than the CLI is reported. */
static int reap_ready(int killing, int *reaped) {
  for (;;) {
    int status;
    pid_t pid = waitpid(-1, &status, WNOHANG);
    if (pid > 0) {
      if (pid == cli_pid) {
        cli_reaped = 1;
        report_status(pid, status);
      } else if (killing) {
        reportf("{\"op\":\"guard\",\"event\":\"reaped\",\"pid\":%d}", (int)pid);
      }
      if (killing && reaped) (*reaped)++;
      continue;
    }
    if (pid == 0) return 0;
    if (errno == EINTR) continue;
    return errno == ECHILD ? 1 : 0;
  }
}

/* Reads the parent pid from /proc/<pid>/stat. The command name is in
 * parentheses and may hold any byte, so the fields start after the last ')'. */
static pid_t parent_of(const char *pid_name) {
  char path[64];
  char buf[512];
  if (snprintf(path, sizeof path, "/proc/%s/stat", pid_name) >= (int)sizeof path) return -1;
  int fd = open(path, O_RDONLY | O_CLOEXEC);
  if (fd < 0) return -1;
  ssize_t n = read(fd, buf, sizeof buf - 1);
  close(fd);
  if (n <= 0) return -1;
  buf[n] = '\0';
  char *end = strrchr(buf, ')');
  if (!end) return -1;
  char state;
  int ppid;
  if (sscanf(end + 1, " %c %d", &state, &ppid) != 2) return -1;
  return (pid_t)ppid;
}

/* SIGKILLs each process whose parent is the guardian. Each is an unreaped
 * child, so its pid can't have been reused. */
static void kill_children(pid_t self) {
  DIR *proc = opendir("/proc");
  if (!proc) return;
  struct dirent *entry;
  while ((entry = readdir(proc)) != NULL) {
    const char *name = entry->d_name;
    if (name[0] < '1' || name[0] > '9') continue;
    if (parent_of(name) != self) continue;
    pid_t pid = (pid_t)strtol(name, NULL, 10);
    if (pid > 0 && pid != self) kill(pid, SIGKILL);
  }
  closedir(proc);
}

/* PO-10: kill and reap until ECHILD. Waits between rounds on the SIGCHLD
 * descriptor, with a short and then longer timeout, so a process that can't
 * be signalled (another user's) is tried again without spinning. */
static int kill_tree(int sigfd) {
  pid_t self = getpid();
  int reaped = 0;
  int timeout = 10;
  for (;;) {
    if (cli_pid > 0 && !cli_reaped) kill(cli_pid, SIGKILL);
    kill_children(self);
    if (reap_ready(1, &reaped)) break;
    struct pollfd p = {.fd = sigfd, .events = POLLIN};
    if (poll(&p, 1, timeout) > 0) {
      struct signalfd_siginfo info;
      while (read(sigfd, &info, sizeof info) == (ssize_t)sizeof info) {
      }
    }
    if (timeout < 200) timeout *= 2;
  }
  reportf("{\"op\":\"guard\",\"event\":\"ended\",\"reaped\":%d}", reaped);
  return 0;
}

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
  int err = 0;
  ssize_t n;
  do {
    n = read(status_pipe[0], &err, sizeof err);
  } while (n < 0 && errno == EINTR);
  close(status_pipe[0]);
  cli_pid = pid;
  if (n == (ssize_t)sizeof err) {
    /* exec failed: the child has exited with 127. Reap it and fail. */
    int status;
    while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {
    }
    cli_reaped = 1;
    fail("guard", "exec", err);
    return -1;
  }
  reportf("{\"op\":\"guard\",\"event\":\"started\",\"pid\":%d}", (int)pid);
  return 0;
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

  reportf("{\"op\":\"guard\",\"event\":\"ready\",\"pid\":%d}", (int)getpid());

  char buf[256];
  size_t used = 0;
  int started = 0;
  for (;;) {
    struct pollfd fds[2] = {{.fd = sigfd, .events = POLLIN}, {.fd = report_fd, .events = POLLIN}};
    if (poll(fds, 2, -1) < 0) {
      if (errno == EINTR) continue;
      fail("guard", "poll", errno);
      { kill_tree(sigfd); return 1; }
    }
    if (fds[0].revents & POLLIN) {
      struct signalfd_siginfo info;
      int end = 0;
      while (read(sigfd, &info, sizeof info) == (ssize_t)sizeof info) {
        if (info.ssi_signo != SIGCHLD) end = 1;
      }
      reap_ready(0, NULL);
      if (end) return kill_tree(sigfd);
    }
    if (fds[1].revents & (POLLIN | POLLHUP | POLLERR)) {
      ssize_t n = read(report_fd, buf + used, sizeof buf - used);
      if (n < 0 && errno == EINTR) continue;
      if (n <= 0) return kill_tree(sigfd); /* the post office is gone */
      used += (size_t)n;
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
        /* A line longer than any command: refuse it and drop it. */
        report("{\"op\":\"guard\",\"event\":\"refused\",\"reason\":\"unknown command\"}\n");
        used = 0;
      }
    }
  }
}

int main(int argc, char **argv) {
  /* Fd 3 must be open; without it there is no one to report to. */
  if (fcntl(report_fd, F_SETFD, FD_CLOEXEC) != 0) return 2;
  if (argc >= 2 && strcmp(argv[1], "check") == 0 && argc == 2) return op_check();
  if (argc >= 2 && strcmp(argv[1], "guard") == 0) return op_guard(argc, argv);
  report("{\"ok\":false,\"reason\":\"unknown operation\"}\n");
  return 2;
}
