// S7: does each CLI exit when its input ends, and (Windows) does it need to break away from M1a's job?
// No credentials exist on the runner, so no model is called. Run from the repository root after `npm run build`.
import { spawn, execFileSync } from "node:child_process";
const win = process.platform === "win32";
const CLIS = {
  claude: ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"],
  codex: ["exec", "--json", "--skip-git-repo-check", "--ephemeral", "-"],
};
const clip = (s) => s.replace(/\s+/g, " ").trim().slice(0, 300);
const log = (o) => console.log(`S7 ${JSON.stringify(o)}`);

function plain(cli, args) {
  return new Promise((done) => {
    const t0 = Date.now(); let out = "";
    const child = spawn(cli, args, { shell: win, detached: !win, stdio: "pipe" });
    child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { out += d; });
    child.on("error", (e) => done({ error: e.message }));
    child.stdin.end();
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      let left = "";
      if (!win) {
        left = execFileSync("ps", ["-eo", "pid=,sess=,comm="]).toString().split("\n")
          .filter((l) => l.trim().split(/\s+/)[1] === String(child.pid)).join(";");
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* group already gone */ }
      }
      done({ code, signal, ms: Date.now() - t0, timedOut: Date.now() - t0 >= 60_000, leftInSession: left, out: clip(out) });
    });
  });
}

async function contained(file, args) {
  const { spawnManagedProcess } = await import(new URL("../../dist/v2/processTree.js", import.meta.url));
  const t0 = Date.now(); let out = "";
  try {
    const p = await spawnManagedProcess({ file, args, cwd: process.cwd() });
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
    p.stdin.end();
    const exit = await Promise.race([p.exited, new Promise((r) => setTimeout(() => r("timeout"), 60_000))]);
    const ms = Date.now() - t0;
    let close = "ok"; try { await p.close(); } catch (e) { close = e.message; }
    return { exit, ms, close, out: clip(out) };
  } catch (e) { return { error: clip(e.message), ms: Date.now() - t0 }; }
}

if (process.argv[2] === "m1a") {
  console.log(JSON.stringify(await contained("cmd.exe", ["/c", "echo", "s7-contained"])));
} else {
  for (const [cli, args] of Object.entries(CLIS)) {
    log({ cli, case: "version", plain: await plain(cli, ["--version"]) });
    log({ cli, case: "eof", plain: await plain(cli, args) });
    if (win) {
      log({ cli, case: "version", contained: await contained(cli, ["--version"]) });
      log({ cli, case: "eof", contained: await contained(cli, args) });
    }
  }
}
