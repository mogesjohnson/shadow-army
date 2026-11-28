/* d3hb: heartbeat writers, daemonizers and the survivor check for experiment D-3. Written from scratch.
 *
 *   d3hb beat <file>               write "<pid> <counter>" into <file> every 200 ms until killed
 *   d3hb daemon <file>             double fork; the grandchild calls setsid() and beats; this call returns at once
 *   d3hb loop <prefix> <ms> <us>   for <ms> ms call "daemon" on <prefix>-<n>.hb, <us> microseconds apart
 *   d3hb check <dir> <wait_ms>     print "RESULT <kind> <total> <alive>" (kinds a b c d) from the *.hb files in <dir>
 *
 * A writer counts as alive when its counter moved while check waited. Zombies and stopped processes cannot move it.
 */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define MAX_FILES 8192
#define MAX_DAEMONS 3000 /* safety cap on the fast loop */

static void sleep_ms(long ms) {
  struct timespec t = { ms / 1000, (ms % 1000) * 1000000L };
  while (nanosleep(&t, &t) < 0 && errno == EINTR) {}
}

static long now_ms(void) {
  struct timespec t;
  clock_gettime(CLOCK_MONOTONIC, &t);
  return t.tv_sec * 1000L + t.tv_nsec / 1000000L;
}

__attribute__((noreturn)) static void beat(const char *path) {
  int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (fd < 0) _exit(2);
  for (long n = 1;; n++) {
    char line[64];
    int len = snprintf(line, sizeof line, "%d %012ld\n", (int)getpid(), n);
    if (pwrite(fd, line, (size_t)len, 0) < 0) _exit(3);
    sleep_ms(200);
  }
}

/* Double fork: the grandchild calls setsid() and becomes the daemon; its parent exits at once. */
static void daemonize(const char *path) {
  pid_t first = fork();
  if (first < 0) return;
  if (first == 0) {
    if (fork() == 0) {
      setsid();
      int null = open("/dev/null", O_RDWR);
      if (null >= 0) {
        dup2(null, 0); dup2(null, 1); dup2(null, 2);
        if (null > 2) close(null);
      }
      beat(path);
    }
    _exit(0);
  }
  waitpid(first, NULL, 0);
}

static void loop(const char *prefix, long duration_ms, long interval_us) {
  long end = now_ms() + duration_ms;
  int n = 0;
  while (now_ms() < end && n < MAX_DAEMONS) {
    char path[512];
    snprintf(path, sizeof path, "%s-%d.hb", prefix, ++n);
    daemonize(path);
    if (interval_us > 0) usleep((useconds_t)interval_us);
  }
  char done[512];
  snprintf(done, sizeof done, "%s.done", prefix);
  FILE *f = fopen(done, "w");
  if (f) { fprintf(f, "%d\n", n); fclose(f); }
}

struct entry { char name[64]; long count; };

static long read_count(const char *dir, const char *name) {
  char path[1024];
  snprintf(path, sizeof path, "%s/%s", dir, name);
  FILE *f = fopen(path, "r");
  if (!f) return 0;
  int pid = 0;
  long n = 0;
  if (fscanf(f, "%d %ld", &pid, &n) != 2) n = 0;
  fclose(f);
  return n;
}

static int list(const char *dir, struct entry *out) {
  DIR *d = opendir(dir);
  if (!d) return 0;
  int count = 0;
  struct dirent *de;
  while ((de = readdir(d)) && count < MAX_FILES) {
    size_t len = strlen(de->d_name);
    if (len < 4 || len >= sizeof out[0].name || strcmp(de->d_name + len - 3, ".hb") != 0) continue;
    memcpy(out[count].name, de->d_name, len + 1);
    out[count].count = read_count(dir, de->d_name);
    count++;
  }
  closedir(d);
  return count;
}

static int check(const char *dir, long wait_ms) {
  static struct entry first[MAX_FILES], second[MAX_FILES];
  int n1 = list(dir, first);
  sleep_ms(wait_ms);
  int n2 = list(dir, second);
  const char kinds[] = "abcd"; /* file names: a.hb b.hb c.hb d-<n>.hb */
  for (int k = 0; kinds[k]; k++) {
    int total = 0, alive = 0;
    for (int i = 0; i < n2; i++) {
      if (second[i].name[0] != kinds[k]) continue;
      total++;
      int seen = 0;
      for (int j = 0; j < n1; j++) {
        if (strcmp(first[j].name, second[i].name) != 0) continue;
        seen = 1;
        if (second[i].count > first[j].count) alive++;
        break;
      }
      if (!seen) alive++; /* a heartbeat file that appeared while waiting: its writer is still running */
    }
    printf("RESULT %c %d %d\n", kinds[k], total, alive);
  }
  return 0;
}

int main(int argc, char **argv) {
  if (argc == 3 && !strcmp(argv[1], "beat")) beat(argv[2]);
  if (argc == 3 && !strcmp(argv[1], "daemon")) { daemonize(argv[2]); return 0; }
  if (argc == 5 && !strcmp(argv[1], "loop")) { loop(argv[2], atol(argv[3]), atol(argv[4])); return 0; }
  if (argc == 4 && !strcmp(argv[1], "check")) return check(argv[2], atol(argv[3]));
  fprintf(stderr, "usage: d3hb beat <file> | daemon <file> | loop <prefix> <ms> <us> | check <dir> <wait_ms>\n");
  return 2;
}
