import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDiagnosticsBridge, encodeMessage, LspFramer, MAX_BODY_BYTES, MAX_HEADER_BYTES } from './diagnostics-bridge.mjs';

function decode(frames) {
  const messages = [];
  const parser = new LspFramer(message => messages.push(message));
  for (const frame of frames) parser.push(frame);
  parser.end();
  return messages;
}

function harness() {
  const native = [], client = [], errors = [];
  const bridge = createDiagnosticsBridge({ toServer: frame => native.push(frame), toClient: frame => client.push(frame),
    reportError: error => errors.push(error), delayMs: 30, idPrefix: 'test-private:' });
  return { ...bridge, native, clientFrames: client, errors,
    send: message => bridge.client.push(encodeMessage(message)),
    reply: message => bridge.server.push(encodeMessage(message)),
    pulls: () => decode(native).filter(message => message.method === 'textDocument/diagnostic'),
    pushes: () => decode(client).filter(message => message.method === 'textDocument/publishDiagnostics'),
  };
}

const uri = 'file:///workspace/a.ts';
const open = (file = uri, version = 1) => ({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: file, languageId: 'typescript', version, text: '' } } });
const change = (file = uri, version = 2) => ({ jsonrpc: '2.0', method: 'textDocument/didChange', params: { textDocument: { uri: file, version }, contentChanges: [{ text: 'fixed' }] } });
const result = (id, items) => ({ jsonrpc: '2.0', id, result: { kind: 'full', items } });
const error = { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, code: 2322, message: 'wrong type' };

describe('LSP framing', () => {
  test('preserves split, combined and UTF-8 frames byte for byte', () => {
    const first = encodeMessage({ jsonrpc: '2.0', id: 1, result: 'snowman ☃' });
    const second = encodeMessage({ jsonrpc: '2.0', method: 'exit' });
    const seen = [];
    const parser = new LspFramer((_message, frame) => seen.push(frame));
    const bytes = Buffer.concat([first, second]);
    for (let index = 0; index < bytes.length; index += 3) parser.push(bytes.subarray(index, index + 3));
    parser.end();
    expect(seen).toEqual([first, second]);
  });
  test('rejects malformed lengths, UTF-8, truncated streams and oversized frames', () => {
    expect(() => new LspFramer(() => {}).push(Buffer.from('Content-Length: -1\r\n\r\n'))).toThrow(/Content-Length/);
    expect(() => new LspFramer(() => {}).push(Buffer.from('Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}'))).toThrow(/Content-Length/);
    expect(() => new LspFramer(() => {}).push(Buffer.alloc(MAX_HEADER_BYTES + 1, 'a'))).toThrow(/64 KiB/);
    expect(() => new LspFramer(() => {}).push(Buffer.from(`Content-Length: ${MAX_BODY_BYTES + 1}\r\n\r\n`))).toThrow(/32 MiB/);
    expect(() => new LspFramer(() => {}).push(Buffer.concat([Buffer.from('Content-Length: 1\r\n\r\n'), Buffer.from([0xff])]))).toThrow(/UTF-8/);
    const parser = new LspFramer(() => {});
    parser.push(Buffer.from('Content-Length: 8\r\n\r\n{}'));
    expect(() => parser.end()).toThrow(/middle of a frame/);
  });
});

describe('pull diagnostics for a push client', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('advertises pull support and preserves unrelated frames and native config pushes', () => {
    const h = harness();
    h.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } } } });
    const initialize = decode(h.native)[0];
    expect(initialize.params.capabilities.textDocument.publishDiagnostics.versionSupport).toBe(true);
    expect(initialize.params.capabilities.textDocument.diagnostic.relatedDocumentSupport).toBe(false);
    expect(initialize.params.capabilities.workspace.diagnostics.refreshSupport).toBe(true);
    const bytes = encodeMessage({ jsonrpc: '2.0', id: 19, method: 'textDocument/definition', params: { textDocument: { uri } } });
    h.client.push(bytes);
    expect(h.native.at(-1)).toEqual(bytes);
    const config = encodeMessage({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: 'file:///workspace/tsconfig.json', diagnostics: [] } });
    h.server.push(config);
    expect(h.clientFrames.at(-1)).toEqual(config);
    h.stop();
  });

  test('coalesces edits and pushes errors, then clears after a fix with the latest version', () => {
    const h = harness();
    h.send(open());
    h.send(change(uri, 2));
    h.send(change(uri, 3));
    vi.advanceTimersByTime(30);
    expect(h.pulls()).toHaveLength(1);
    h.reply(result(h.pulls()[0].id, [error]));
    expect(h.pushes().at(-1).params).toEqual({ uri, version: 3, diagnostics: [error] });
    h.send(change(uri, 4));
    vi.advanceTimersByTime(30);
    h.reply(result(h.pulls().at(-1).id, []));
    expect(h.pushes().at(-1).params).toEqual({ uri, version: 4, diagnostics: [] });
    h.stop();
  });

  test('cancels old pulls and suppresses stale reports after a newer edit or close', () => {
    const h = harness();
    h.send(open());
    vi.advanceTimersByTime(30);
    const oldId = h.pulls()[0].id;
    h.send(change());
    expect(decode(h.native).at(-1)).toMatchObject({ method: '$/cancelRequest', params: { id: oldId } });
    h.reply(result(oldId, [error]));
    expect(h.pushes()).toHaveLength(0);
    vi.advanceTimersByTime(30);
    const currentId = h.pulls().at(-1).id;
    h.send({ jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri } } });
    h.reply(result(currentId, [error]));
    expect(h.pushes()).toHaveLength(1);
    expect(h.pushes()[0].params.diagnostics).toEqual([]);
    h.stop();
  });

  test('rechecks an open importer and discards its old result when a dependency changes', () => {
    const h = harness(), importer = 'file:///workspace/importer.ts';
    h.send(open(uri));
    h.send(open(importer));
    vi.advanceTimersByTime(30);
    const oldImporter = h.pulls().find(message => message.params.textDocument.uri === importer);
    h.send(change(uri));
    h.reply(result(oldImporter.id, [error]));
    expect(h.pushes()).toHaveLength(0);
    vi.advanceTimersByTime(30);
    const newImporter = h.pulls().filter(message => message.params.textDocument.uri === importer).at(-1);
    expect(newImporter.id).not.toBe(oldImporter.id);
    h.reply(result(newImporter.id, []));
    expect(h.pushes().at(-1).params).toEqual({ uri: importer, version: 1, diagnostics: [] });
    h.stop();
  });

  test('handles native refresh requests without forwarding them to the passive client', () => {
    const h = harness();
    h.send(open());
    vi.advanceTimersByTime(30);
    h.reply({ jsonrpc: '2.0', id: 'native-refresh', method: 'workspace/diagnostic/refresh' });
    expect(decode(h.native).find(message => message.id === 'native-refresh')).toEqual({ jsonrpc: '2.0', id: 'native-refresh', result: null });
    expect(h.clientFrames).toHaveLength(0);
    vi.advanceTimersByTime(30);
    expect(h.pulls()).toHaveLength(2);
    h.stop();
  });

  test('remaps a colliding client request and its cancellation, then restores its result id', () => {
    const h = harness(), id = 'test-private:pull:1';
    h.send({ jsonrpc: '2.0', id, method: 'textDocument/definition', params: {} });
    const forwarded = decode(h.native)[0];
    expect(forwarded.id).not.toBe(id);
    h.send({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id } });
    expect(decode(h.native).at(-1).params.id).toBe(forwarded.id);
    h.reply({ jsonrpc: '2.0', id: forwarded.id, result: [{ uri }] });
    expect(decode(h.clientFrames)[0]).toEqual({ jsonrpc: '2.0', id, result: [{ uri }] });
    h.stop();
  });

  test('keeps previous diagnostics on a failed pull and stops polling at shutdown', () => {
    const h = harness();
    h.send(open());
    vi.advanceTimersByTime(30);
    h.reply({ jsonrpc: '2.0', id: h.pulls()[0].id, error: { code: -32603, message: 'compiler failure' } });
    expect(h.pushes()).toHaveLength(0);
    expect(h.errors[0]).toMatch(/compiler failure/);
    h.send(change());
    h.send({ jsonrpc: '2.0', id: 9, method: 'shutdown' });
    vi.advanceTimersByTime(100);
    expect(h.pulls()).toHaveLength(1);
    expect(decode(h.native).at(-1)).toEqual({ jsonrpc: '2.0', id: 9, method: 'shutdown' });
  });
});
