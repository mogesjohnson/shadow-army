import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCli, withPromptFile } from "./exec.js";

// A real child process that echoes its stdin back, so stdin delivery is tested end to end.
const echoStdin = ["-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.stringify(s)))"];

describe("runCli", () => {
  it("delivers a multi-line brief on stdin, intact", async () => {
    const brief = 'line one\nline two with "quotes" & 100% ^ |\n';
    const r = await runCli(process.execPath, echoStdin, { cwd: process.cwd(), timeoutMs: 20_000, input: brief });
    expect(r.spawnFailed).toBe(false);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toBe(brief);
  });

  it("closes stdin when there is no input, so the CLI never waits for it", async () => {
    const r = await runCli(process.execPath, echoStdin, { cwd: process.cwd(), timeoutMs: 20_000 });
    expect(r.timedOut).toBe(false);
    expect(JSON.parse(r.stdout)).toBe("");
  });
});

describe("withPromptFile", () => {
  it("holds the text in a file while the callback runs, then deletes it", async () => {
    let seen = "";
    const path = await withPromptFile("a\nb", async (p) => {
      seen = readFileSync(p, "utf8");
      return p;
    });
    expect(seen).toBe("a\nb");
    expect(existsSync(path)).toBe(false);
  });

  it("deletes the file even when the callback throws", async () => {
    let path = "";
    await expect(
      withPromptFile("x", async (p) => {
        path = p;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(path).not.toBe("");
    expect(existsSync(path)).toBe(false);
  });
});
