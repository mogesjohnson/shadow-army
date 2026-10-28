// Exercises the real native server through the repository's Claude LSP launcher.
// It uses temporary projects and a passive diagnostics client; no model is called.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const launcher = path.join(repository, "plugins/typescript7-lsp/scripts/start-server.mjs");
const dependencies = path.join(repository, "node_modules");
const timeoutMs = 15_000;

function uriKey(uri) {
  const filename = realpathSync.native(path.resolve(fileURLToPath(uri)));
  return process.platform === "win32" ? filename.toLowerCase() : filename;
}

class Client {
  constructor(root) {
    this.root = root;
    this.pending = new Map();
    this.notifications = [];
    this.waiters = new Set();
    this.buffer = Buffer.alloc(0);
    this.nextId = 0;
    this.stderr = "";
    this.failure = undefined;
    this.closed = false;
    this.child = spawn(process.execPath, [launcher], {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });
    this.exit = new Promise((resolve) => {
      this.child.on("close", (code, signal) => {
        this.closed = true;
        this.fail(new Error(`LSP closed (${code ?? signal})${this.stderr ? `: ${this.stderr.trim()}` : ""}`));
        resolve({ code, signal });
      });
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", (error) => this.fail(error));
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk.toString(); });
    this.child.stdout.on("data", (chunk) => {
      try {
        this.receive(chunk);
      } catch (error) {
        this.fail(error);
        this.child.stdin.end();
      }
    });
  }

  fail(error) {
    this.failure ??= error;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    for (const waiter of this.waiters) waiter.reject(error);
    this.waiters.clear();
  }

  send(message) {
    if (this.failure) throw this.failure;
    const body = Buffer.from(JSON.stringify(message));
    this.child.stdin.write(Buffer.concat([
      Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body,
    ]));
  }

  notify(method, params) {
    this.send(params === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params });
  }

  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}${this.stderr ? `: ${this.stderr.trim()}` : ""}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send(params === undefined
          ? { jsonrpc: "2.0", id, method }
          : { jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const boundary = this.buffer.indexOf("\r\n\r\n");
      if (boundary < 0) {
        assert(this.buffer.length < 64 * 1024, "Invalid or oversized LSP header");
        return;
      }
      const header = this.buffer.subarray(0, boundary).toString("ascii");
      const lengthMatch = /(?:^|\r\n)Content-Length:\s*(\d+)(?:\r\n|$)/i.exec(header);
      assert(lengthMatch, `Non-protocol output from launcher: ${header.slice(0, 200)}`);
      const length = Number(lengthMatch[1]);
      assert(length <= 32 * 1024 * 1024, "Oversized LSP message");
      if (this.buffer.length < boundary + 4 + length) return;
      const message = JSON.parse(this.buffer.subarray(boundary + 4, boundary + 4 + length));
      this.buffer = this.buffer.subarray(boundary + 4 + length);
      if (message.method && message.id !== undefined) {
        this.answerServerRequest(message);
      } else if (message.method) {
        this.notifications.push(message);
        for (const waiter of this.waiters) waiter.check();
      } else {
        const request = this.pending.get(message.id);
        if (!request) continue;
        this.pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      }
    }
  }

  answerServerRequest(message) {
    let result;
    if (message.method === "workspace/configuration") {
      result = message.params.items.map(() => null);
    } else if ([
      "client/registerCapability", "client/unregisterCapability",
      "workspace/diagnostic/refresh", "window/workDoneProgress/create",
    ].includes(message.method)) {
      result = null;
    } else {
      this.send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Unsupported smoke-client request" } });
      throw new Error(`Unexpected server request: ${message.method}`);
    }
    this.send({ jsonrpc: "2.0", id: message.id, result });
  }

  async initialize() {
    const result = await this.request("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(this.root + path.sep).href,
      capabilities: {
        workspace: { configuration: false },
        textDocument: { publishDiagnostics: { relatedInformation: true, versionSupport: true } },
      },
      initializationOptions: { disablePushDiagnostics: false },
    });
    assert.match(result.serverInfo?.version ?? "", /^7\./, "Launcher must use the worktree's native TypeScript 7");
    assert(result.capabilities.definitionProvider, "Native definitions unavailable");
    assert(result.capabilities.referencesProvider, "Native references unavailable");
    this.notify("initialized", {});
    return result.serverInfo.version;
  }

  waitForDiagnostics(uri, predicate, after, version) {
    const expected = uriKey(uri);
    return new Promise((resolve, reject) => {
      let timer;
      const finish = (error, value) => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        error ? reject(error) : resolve(value);
      };
      const waiter = {
        reject: (error) => finish(error),
        check: () => {
          const match = this.notifications.slice(after).find((message) =>
            message.method === "textDocument/publishDiagnostics"
            && uriKey(message.params.uri) === expected
            && (message.params.version === undefined || message.params.version === version)
            && predicate(message.params.diagnostics));
          if (match) finish(undefined, match.params);
        },
      };
      timer = setTimeout(() => {
        const observed = this.notifications.slice(after)
          .filter((message) => message.method === "textDocument/publishDiagnostics")
          .slice(-5).map((message) => ({ uri: message.params.uri, version: message.params.version, diagnostics: message.params.diagnostics }));
        finish(new Error(
          `No matching document push diagnostics for version ${version}. `
          + "Native TypeScript serves document errors through pull diagnostics; the Claude compatibility bridge must publish them. "
          + `Observed: ${JSON.stringify(observed)}${this.stderr ? `; stderr: ${this.stderr.trim()}` : ""}`,
        ));
      }, timeoutMs);
      this.waiters.add(waiter);
      waiter.check();
      if (this.failure) finish(this.failure);
    });
  }

  async waitForExit() {
    let timer;
    try {
      return await Promise.race([
        this.exit,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("LSP process failed to exit")), timeoutMs); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async stop() {
    if (this.closed) return;
    this.child.stdin.end();
    try {
      await this.waitForExit();
    } catch {
      this.child.kill();
      await this.waitForExit();
    }
  }
}

function source(type, value) {
  return `export const marker: ${type} = ${value};\nexport const view = <div>{marker}</div>;\nexport const result = marker;\n`;
}

async function fixture(base, name, type, value) {
  const root = path.join(base, name);
  await mkdir(root, { recursive: true });
  await symlink(dependencies, path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, "package.json"), JSON.stringify({ private: true, type: "module", devDependencies: { typescript: "^7.0.2" } }));
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", jsx: "react-jsx", strict: true, skipLibCheck: true, noEmit: true },
    include: ["*.ts", "*.tsx"],
  }));
  const filename = path.join(root, "probe.tsx");
  const text = source(type, value);
  await writeFile(filename, text);
  return { root, filename, uri: pathToFileURL(filename).href, text, version: 1 };
}

async function edit(client, project, text) {
  const after = client.notifications.length;
  await writeFile(project.filename, text);
  project.text = text;
  project.version++;
  client.notify("textDocument/didChange", { textDocument: { uri: project.uri, version: project.version }, contentChanges: [{ text }] });
  client.notify("textDocument/didSave", { textDocument: { uri: project.uri } });
  return after;
}

const base = await mkdtemp(path.join(tmpdir(), "shadow army native lsp "));
const clients = [];
try {
  await readFile(path.join(dependencies, "typescript/package.json"));
  const projects = await Promise.all([
    fixture(base, "first worktree", "number", "7"),
    fixture(base, "second worktree", "string", '"separate"'),
  ]);
  for (const project of projects) clients.push(new Client(project.root));
  const versions = await Promise.all(clients.map((client) => client.initialize()));
  assert.notEqual(clients[0].child.pid, clients[1].child.pid, "Each session needs its own server process");
  await Promise.all(projects.map(async (project, index) => {
    const client = clients[index];
    const after = client.notifications.length;
    client.notify("textDocument/didOpen", { textDocument: { uri: project.uri, languageId: "typescriptreact", version: project.version, text: project.text } });
    const definition = await client.request("textDocument/definition", { textDocument: { uri: project.uri }, position: { line: 2, character: 25 } });
    assert(definition?.length, "Definition lookup returned nothing");
    for (const location of definition) assert.equal(uriKey(location.uri ?? location.targetUri), uriKey(project.uri), "Definition crossed worktrees");
    const references = await client.request("textDocument/references", { textDocument: { uri: project.uri }, position: { line: 2, character: 25 }, context: { includeDeclaration: true } });
    assert.equal(references?.length, 3, "Expected declaration and both references");
    for (const location of references) assert.equal(uriKey(location.uri), uriKey(project.uri), "References crossed worktrees");
    await client.waitForDiagnostics(project.uri, (items) => items.length === 0, after, project.version);
  }));

  const [first, second] = projects;
  let after = await edit(clients[0], first, source("number", '"wrong"'));
  await clients[0].waitForDiagnostics(first.uri, (items) => items.some((item) => item.code === 2322), after, first.version);
  const secondDiagnostics = await clients[1].request("textDocument/diagnostic", { textDocument: { uri: second.uri } });
  assert.equal(secondDiagnostics.items.length, 0, "An edit in the first session affected the second session");

  after = await edit(clients[0], first, source("number", "8"));
  await clients[0].waitForDiagnostics(first.uri, (items) => items.length === 0, after, first.version);

  // A superseded failing edit must not overwrite the newest clean result.
  after = await edit(clients[0], first, source("number", '"superseded"'));
  await edit(clients[0], first, source("number", "9"));
  await clients[0].waitForDiagnostics(first.uri, (items) => items.length === 0, after, first.version);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const latest = clients[0].notifications.filter((message) =>
    message.method === "textDocument/publishDiagnostics" && uriKey(message.params.uri) === uriKey(first.uri)).at(-1);
  assert.equal(latest.params.diagnostics.length, 0, "Stale diagnostics replaced the final clean edit");
  if (latest.params.version !== undefined) assert.equal(latest.params.version, first.version, "Stale document version published");

  // Native diagnostics depend on other files too. An unchanged open importer
  // must be checked again when its dependency's exported type changes.
  const importer = path.join(first.root, "consumer.ts");
  const importerUri = pathToFileURL(importer).href;
  const importerText = 'import { marker } from "./probe.js";\nexport const copied: number = marker;\n';
  await writeFile(importer, importerText);
  after = clients[0].notifications.length;
  clients[0].notify("textDocument/didOpen", { textDocument: { uri: importerUri, languageId: "typescript", version: 1, text: importerText } });
  await clients[0].waitForDiagnostics(importerUri, (items) => items.length === 0, after, 1);
  after = await edit(clients[0], first, source("string", '"changed export"'));
  await clients[0].waitForDiagnostics(importerUri, (items) => items.some((item) => item.code === 2322), after, 1);
  after = await edit(clients[0], first, source("number", "10"));
  await clients[0].waitForDiagnostics(importerUri, (items) => items.length === 0, after, 1);

  clients[0].notify("textDocument/didClose", { textDocument: { uri: importerUri } });
  clients[0].notify("textDocument/didClose", { textDocument: { uri: first.uri } });
  await clients[0].request("shutdown");
  clients[0].notify("exit");
  clients[0].child.stdin.end();
  const shutdown = await clients[0].waitForExit();
  assert(shutdown.code === 0 || (shutdown.code === 1 && /context canceled/.test(clients[0].stderr)),
    `Unexpected shutdown (${shutdown.code ?? shutdown.signal}): ${clients[0].stderr}`);

  // Closing the transport must also stop the other server with a document open.
  clients[1].child.stdin.end();
  await clients[1].waitForExit();
  console.log(`Native TypeScript ${versions.join(" / ")} LSP smoke passed: isolated NodeNext/TSX projects, document push diagnostics, navigation, stale edits, dependency edits, shutdown and EOF cleanup.`);
} catch (error) {
  console.error(`Native TypeScript LSP smoke failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map((client) => client.stop()));
  // Remove the dependency links explicitly so cleanup never traverses them.
  for (const name of ["first worktree", "second worktree"]) {
    await rm(path.join(base, name, "node_modules"), { force: true });
  }
  assert(path.dirname(base) === path.resolve(tmpdir()), "Unexpected fixture cleanup location");
  await rm(base, { recursive: true, force: true });
}
