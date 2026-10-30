# P-17 (and an interactive P-16 check) on WSL. Plain cases use pipes; i-* cases
# run Claude Code on a real pseudo-terminal. Model API pointed at a dead port.
import fcntl, json, os, pty, re, shutil, signal, subprocess, sys, termios, threading, time, uuid

W = os.path.expanduser("~/sa-p1617")
OUT = os.path.join(W, "p17-wsl")
only = sys.argv[1] if len(sys.argv) > 1 else None


def jl(path):
    try:
        return [json.loads(l) for l in open(path) if l.strip()]
    except FileNotFoundError:
        return []


def dead(pid):
    try:
        st = open(f"/proc/{pid}/stat").read().split(") ")[1].split()[0]
        return st == "Z"
    except FileNotFoundError:
        return True


def env_for(d, extra):
    env = {k: v for k, v in os.environ.items() if not re.match(r"(?i)^(CLAUDE|AI_AGENT)|.*_proxy$", k)}
    env.update(ANTHROPIC_BASE_URL="http://127.0.0.1:9", P1617_MODLOG=f"{d}/mod.jsonl", P1617_MODE="p17",
               P17_CHILD=json.dumps(["python3", f"{W}/child.py", f"{d}/child.jsonl"]))
    env.update(extra)
    return env


def wait_until(fn, timeout):
    end = time.time() + timeout
    while time.time() < end:
        if fn():
            return True
        time.sleep(0.1)
    return False


def child_started(d):
    return any(e["ev"] == "start" for e in jl(f"{d}/child.jsonl"))


class Pty:
    def __init__(self, argv, cwd, env):
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, b"\x28\x00\x78\x00\x00\x00\x00\x00")  # 40x120

        def pre():
            os.setsid()
            fcntl.ioctl(0, termios.TIOCSCTTY, 0)

        self.p = subprocess.Popen(argv, cwd=cwd, env=env, stdin=slave, stdout=slave, stderr=slave, preexec_fn=pre, close_fds=True)
        os.close(slave)
        self.buf = b""
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        try:
            while True:
                b = os.read(self.master, 65536)
                if not b:
                    break
                self.buf += b
        except OSError:
            pass

    def send(self, s):
        os.write(self.master, s.encode())

    def text(self):
        return re.sub(rb"\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07", b"", self.buf).decode("utf-8", "replace")


def interactive_start(d, extra):
    tt = Pty(["claude", "--plugin-dir", f"{d}/mod", "--debug-file", f"{d}/debug.log"], f"{d}/ws", env_for(d, extra))
    trusted = False
    end = time.time() + 40
    while time.time() < end:
        t = tt.text()
        if not trusted and re.search(r"Yes,\s*I\s*trust", t):
            # The dialog's default is "No, exit": move down, then confirm.
            time.sleep(0.5)
            tt.send("\x1b[B")
            time.sleep(0.4)
            tt.send("\r")
            trusted = True
        if child_started(d) or (extra.get("P1617_MODE") == "p16" and os.path.exists(f"{d}/listen.jsonl") and "x-probe" in open(f"{d}/listen.jsonl").read()):
            break
        time.sleep(0.2)
    time.sleep(2)
    open(f"{d}/screen-start.txt", "w").write(tt.text())
    return tt, trusted


def typed(cmd):
    def f(tt, d, log):
        tt.send(cmd)
        time.sleep(0.4)
        tt.send("\r")
    return f


def ctrlc(tt, d, log):
    tt.send("\x03")
    time.sleep(0.4)
    tt.send("\x03")


def hangup(tt, d, log):
    os.close(tt.master)


def reload_then_exit(tt, d, log):
    typed("/reload-plugins")(tt, d, log)
    time.sleep(6)
    typed("/exit")(tt, d, log)


def save_then_exit(tt, d, log):
    with open(f"{d}/mod/hooks/register.js", "a") as f:
        f.write("\n// saved\n")
    time.sleep(6)
    typed("/exit")(tt, d, log)


def kill_with(sig):
    def f(p, d, log):
        os.kill(p.pid, sig)
    return f


def stream_close(p, d, log):
    p.stdin.close()


def stream_save(p, d, log):
    with open(f"{d}/mod/hooks/register.js", "a") as f:
        f.write("\n// saved\n")
    time.sleep(8)
    p.stdin.close()


CASES = [
    ("p-exit", "p", None, {}),
    ("stream-close", "stream", stream_close, {}),
    ("stream-save", "stream", stream_save, {"CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"}),
    ("kill-TERM", "stream", kill_with(signal.SIGTERM), {}),
    ("kill-HUP", "stream", kill_with(signal.SIGHUP), {}),
    ("kill-KILL", "stream", kill_with(signal.SIGKILL), {}),
    ("i-exit", "pty", typed("/exit"), {}),
    ("i-ctrlc-twice", "pty", ctrlc, {}),
    ("i-hangup", "pty", hangup, {}),
    ("i-reload-plugins", "pty", reload_then_exit, {}),
    ("i-save", "pty", save_then_exit, {}),
    ("i-kill-TERM", "pty", lambda tt, d, log: os.kill(tt.p.pid, signal.SIGTERM), {}),
    ("i-p16-HTTP_PROXY", "pty16", typed("/exit"), {}),
]

results = []
port = 47810
for name, kind, act, extra in CASES:
    if only and only != name:
        continue
    d = f"{OUT}/{name}"
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(f"{d}/ws/.claude")
    shutil.copytree(f"{W}/mod", f"{d}/mod")
    log = {"case": name}
    lis = None
    if kind == "pty16":
        a, b = port, port + 1
        port += 2
        pid16 = str(uuid.uuid4())
        lis = subprocess.Popen(["python3", f"{W}/listen.py", str(a), str(b), f"{d}/listen.jsonl"], stdout=subprocess.PIPE)
        lis.stdout.readline()
        extra = {"P1617_MODE": "p16", "P16_A": str(a), "P16_ID": pid16, "HTTP_PROXY": f"http://127.0.0.1:{b}"}
    t0 = time.time()
    if kind == "p":
        p = subprocess.Popen(["claude", "-p", "/p1617", "--plugin-dir", f"{d}/mod", "--debug-file", f"{d}/debug.log"], cwd=f"{d}/ws", env=env_for(d, extra), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    elif kind == "stream":
        p = subprocess.Popen(["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--plugin-dir", f"{d}/mod", "--debug-file", f"{d}/debug.log"], cwd=f"{d}/ws", env=env_for(d, extra), stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        wait_until(lambda: child_started(d), 30)
        time.sleep(2)
        act(p, d, log)
    else:
        tt, log["trustDialog"] = interactive_start(d, extra)
        p = tt.p
        log["claudePgid"], log["claudeSid"] = os.getpgid(p.pid), os.getsid(p.pid)
        act(tt, d, log)
    try:
        rc = p.wait(timeout=45)
    except subprocess.TimeoutExpired:
        log["hung"] = True
        if kind.startswith("pty"):
            log["screenTail"] = tt.text()[-600:]
        p.kill()
        rc = p.wait()
    t_exit = time.time()
    if kind.startswith("pty"):
        open(f"{d}/screen-end.txt", "w").write(tt.text())
    time.sleep(4)
    ch = jl(f"{d}/child.jsonl")
    mod = jl(f"{d}/mod.jsonl")
    starts = [e for e in ch if e["ev"] == "start"]
    ends = [e for e in mod if e["ev"] == "session.end"]
    end_t = ends[-1]["t"] if ends else None
    per = []
    for s in starts:
        own = []
        cur = None
        for e in ch:
            if e["ev"] == "start":
                cur = e["pid"]
            elif cur == s["pid"]:
                own.append(e)
        hbs = [e for e in own if e["ev"] == "hb"]
        alive = not dead(s["pid"])
        if alive:
            os.kill(s["pid"], signal.SIGKILL)
        per.append({
            "pid": s["pid"], "ppid": s["ppid"], "pgid": s["pgid"], "sid": s["sid"], "aliveAfter4s": alive,
            "events": [(e["ev"], e.get("name") or e.get("err"), e["t"] - int(t_exit * 1000), (e["t"] - end_t) if end_t else None) for e in own if e["ev"] != "hb"],
            "lastHbVsExit": (hbs[-1]["t"] - int(t_exit * 1000)) if hbs else None,
            "lastHbVsSessionEnd": (hbs[-1]["t"] - end_t) if hbs and end_t else None,
            "ppids": sorted({h["ppid"] for h in hbs}),
        })
    log.update(claudePid=p.pid, rc=rc, msToExit=int((t_exit - t0) * 1000), sessionEnds=[e.get("reason") for e in ends],
               sessionStarts=sum(1 for e in mod if e["ev"] == "session.start"), children=per,
               modErrors=[e for e in mod if "error" in e["ev"]][:3])
    if lis:
        lis.kill()
        hits = [(x["listener"], x["line"]) for x in jl(f"{d}/listen.jsonl") if any(h.lower() == f"x-probe: {pid16}" for h in x.get("headers", []))]
        log["p16hits"] = hits
    results.append(log)
    print(json.dumps(log), flush=True)
json.dump(results, open(f"{OUT}/summary{'-' + only if only else ''}.json", "w"), indent=1)
