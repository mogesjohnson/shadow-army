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

