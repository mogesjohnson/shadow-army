# Two loopback listeners for probe P-16. A answers "A". B is a recording proxy:
# it tunnels CONNECT to the real host (so Claude Code keeps working) and answers
# any plain request itself with "B". Every request line and header goes to the log.
# usage: python listen.py <portA> <portB> <log.jsonl> [unix-socket-path]
import json, os, socket, sys, threading, time

port_a, port_b, log_path = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
sock_path = sys.argv[4] if len(sys.argv) > 4 else None
lock = threading.Lock()


def record(**kw):
    kw["t"] = int(time.time() * 1000)
    with lock, open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(kw) + "\n")


def read_head(conn):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(65536)
        if not chunk:
            break
        data += chunk
    head, _, rest = data.partition(b"\r\n\r\n")
    lines = head.decode("latin-1").split("\r\n")
    return lines[0] if lines else "", lines[1:], rest


def pipe(src, dst):
    try:
        while True:
            b = src.recv(65536)
            if not b:
                break
            dst.sendall(b)
    except OSError:
        pass
    finally:
        for s in (src, dst):
            try:
                s.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


def handle(conn, name):
    try:
        line, headers, rest = read_head(conn)
        if not line:
            return
        record(listener=name, line=line, headers=headers)
        if name == "B" and line.upper().startswith("CONNECT "):
            target = line.split()[1]
            host, _, port = target.rpartition(":")
            try:
                up = socket.create_connection((host, int(port)), timeout=15)
            except OSError as e:
                record(listener=name, tunnel_error=str(e), target=target)
                conn.sendall(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
                return
            conn.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            if rest:
                up.sendall(rest)
            threading.Thread(target=pipe, args=(up, conn), daemon=True).start()
            pipe(conn, up)
            return
        body = name.encode()
        conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" % (len(body), body))
    except OSError as e:
        record(listener=name, error=str(e))
    finally:
        try:
            conn.close()
        except OSError:
            pass


def serve(srv, name):
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle, args=(conn, name), daemon=True).start()


for port, name in ((port_a, "A"), (port_b, "B")):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", port))
    s.listen(64)
    threading.Thread(target=serve, args=(s, name), daemon=True).start()
if sock_path:
    if os.path.exists(sock_path):
        os.unlink(sock_path)
    u = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    u.bind(sock_path)
    u.listen(16)
    threading.Thread(target=serve, args=(u, "SOCK"), daemon=True).start()
record(listener="-", ready=True, a=port_a, b=port_b, sock=sock_path)
print("ready", flush=True)
while True:
    time.sleep(3600)
