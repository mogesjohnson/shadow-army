import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseTreeFile, parseTreeLine, readTrees, TreeRecord, treesDir } from "./trees.js";

describe("tree records (PO-16, M1-AC16)", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "sa-trees-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  const file = (id: string) => join(treesDir(root), `${id}.jsonl`);

  it("writes the post office, guardian and CLI lines and no secret, then removes the entry", async () => {
    const record = await TreeRecord.create(root, "iron-1", { pid: 10, startTime: 100 }, { pid: 11, startTime: 110 });
    await record.add({ kind: "cli", pid: 12, startTime: 120 });
    await record.add({ kind: "job", label: "sa.job.1", coalition: "77" });
    expect(readFileSync(file("iron-1"), "utf8")).toBe([
      '{"kind":"post-office","pid":10,"startTime":100}', '{"kind":"guardian","pid":11,"startTime":110}',
      '{"kind":"cli","pid":12,"startTime":120}', '{"kind":"job","label":"sa.job.1","coalition":"77"}', "",
    ].join("\n"));
    expect(await readTrees(root)).toEqual([{ id: "iron-1", lines: parseTreeFile(readFileSync(file("iron-1"), "utf8")) }]);
    await record.remove();
    await record.remove(); // Removing twice is fine.
    expect(await readTrees(root)).toEqual([]);
  });

  it("skips a line that doesn't parse, and a record of the wrong shape", () => {
    const text = ['{"kind":"cli","pid":4,"startTime":9}', "not json", '{"kind":"cli","pid":-1,"startTime":9}', '{"kind":"cli","pid":"4","startTime":9}',
      '{"kind":"job","label":1,"coalition":"2"}', '{"kind":"other","pid":4,"startTime":9}', "null", '{"kind":"git","pid":5,"startTime":0}', ""].join("\n");
    expect(parseTreeFile(text)).toEqual([{ kind: "cli", pid: 4, startTime: 9 }, { kind: "git", pid: 5, startTime: 0 }]);
    expect(parseTreeLine("[]")).toBeUndefined();
  });

  it("reads no trees from a folder that has none, and skips files that are not tree files", async () => {
    expect(await readTrees(root)).toEqual([]);
    mkdirSync(treesDir(root), { recursive: true });
    writeFileSync(join(treesDir(root), "note.txt"), "x");
    mkdirSync(join(treesDir(root), "dir.jsonl")); // Unreadable as a file.
    expect(await readTrees(root)).toEqual([]);
  });

  it("refuses an id that is not a plain name, and a second entry under the same id", async () => {
    await expect(TreeRecord.create(root, "../escape", { pid: 1, startTime: 1 })).rejects.toThrow("invalid tree id");
    await TreeRecord.create(root, "same", { pid: 1, startTime: 1 });
    await expect(TreeRecord.create(root, "same", { pid: 2, startTime: 2 })).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("fails when the entry can't be written, so the CLI doesn't start", async () => {
    mkdirSync(join(root, ".shadow", "v2"), { recursive: true });
    writeFileSync(treesDir(root), "a file where the folder should be");
    await expect(TreeRecord.create(root, "iron", { pid: 1, startTime: 1 })).rejects.toThrow();
  });

  it("records each listed process once, and reports a listing line that can't be added once", async () => {
    const errors: unknown[] = [];
    const record = await TreeRecord.create(root, "t", { pid: 1, startTime: 1 }, undefined, (error) => errors.push(error));
    await record.listing([{ pid: 5, startTime: 50 }, { pid: 6, startTime: 60 }]);
    await record.listing([{ pid: 5, startTime: 50 }, { pid: 5, startTime: 51 }]); // Same pid, new start time: a new process.
    expect(parseTreeFile(readFileSync(file("t"), "utf8")).filter((line) => line.kind === "process")).toHaveLength(3);
    rmSync(file("t"));
    mkdirSync(file("t")); // The file can no longer be opened for appending.
    await record.listing([{ pid: 7, startTime: 70 }]);
    await record.listing([{ pid: 8, startTime: 80 }]);
    expect(errors).toHaveLength(1);
  });
});
