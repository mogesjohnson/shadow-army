# P-17 child (Python, for WSL where Node isn't installed). Same log as child.mjs,
# plus process group and session id.
import json, os, signal, sys, threading, time

log = sys.argv[1]
lock = threading.Lock()
deadline = [time.time() + 90]


def w(**o):
    o["t"] = int(time.time() * 1000)
    with lock, open(log, "a") as f:
        f.write(json.dumps(o) + "\n")


def extend():
    deadline[0] = max(deadline[0], time.time() + 60)


w(ev="start", pid=os.getpid(), ppid=os.getppid(), pgid=os.getpgid(0), sid=os.getsid(0), platform=sys.platform)
for name in ("SIGTERM", "SIGHUP", "SIGINT"):
    signal.signal(getattr(signal, name), lambda n, f, name=name: (w(ev="signal", name=name), extend()))
signal.signal(signal.SIGPIPE, signal.SIG_IGN)


def read_stdin():
    try:
        while os.read(0, 4096):
            pass
        w(ev="stdin-end")
    except OSError as e:
        w(ev="stdin-error", err=str(e))
    extend()


threading.Thread(target=read_stdin, daemon=True).start()
n = 0
while True:
    time.sleep(0.25)
    n += 1
    w(ev="hb", ppid=os.getppid())
    if n % 4 == 0:
        try:
            os.write(1, b"tick\n")
        except OSError as e:
            w(ev="stdout-error", err=str(e))
            extend()
    if time.time() > deadline[0]:
        w(ev="exit-self")
        sys.exit(0)
