import { randomUUID } from 'node:crypto';

export const MAX_HEADER_BYTES = 64 * 1024;
export const MAX_BODY_BYTES = 32 * 1024 * 1024;

export function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

export class LspFramer {
  #buffer = Buffer.alloc(0);
  #onFrame;

  constructor(onFrame) {
    this.#onFrame = onFrame;
  }

  push(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      const headerEnd = this.#buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        if (this.#buffer.length > MAX_HEADER_BYTES) throw new Error('LSP header exceeds 64 KiB');
        return;
      }
      if (headerEnd > MAX_HEADER_BYTES) throw new Error('LSP header exceeds 64 KiB');
      const header = this.#buffer.subarray(0, headerEnd).toString('ascii');
      const lengths = header.split('\r\n').filter(line => /^content-length\s*:/i.test(line));
      if (lengths.length !== 1 || !/^content-length\s*:\s*\d+\s*$/i.test(lengths[0])) {
        throw new Error('LSP frame needs exactly one valid Content-Length header');
      }
      const length = Number(lengths[0].slice(lengths[0].indexOf(':') + 1).trim());
      if (!Number.isSafeInteger(length) || length > MAX_BODY_BYTES) throw new Error('LSP body exceeds 32 MiB');
      const frameEnd = headerEnd + 4 + length;
      if (this.#buffer.length < frameEnd) return;
      const frame = this.#buffer.subarray(0, frameEnd);
      const body = frame.subarray(headerEnd + 4);
      let message;
      try {
        message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      } catch {
        throw new Error('LSP frame contains invalid UTF-8 or JSON');
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        throw new Error('LSP frame must contain a JSON-RPC object');
      }
      this.#buffer = this.#buffer.subarray(frameEnd);
      this.#onFrame(message, frame);
    }
  }

  end() {
    if (this.#buffer.length !== 0) throw new Error('LSP stream ended in the middle of a frame');
  }
}

export function createDiagnosticsBridge({ toServer, toClient, reportError, delayMs = 30, idPrefix = `shadow-typescript7:${randomUUID()}:` }) {
  const documents = new Map();
  const pulls = new Map();
  const clientRemaps = new Map();
  const originalClientIds = new Map();
  let serial = 0;
  let epoch = 0;
  let stopped = false;

  function cancelPull(document) {
    if (document.timer) clearTimeout(document.timer);
    document.timer = undefined;
    if (document.pending) {
      toServer(encodeMessage({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id: document.pending } }));
      pulls.delete(document.pending);
      document.pending = undefined;
    }
  }

  function stop(cancel = false) {
    if (stopped) return;
    stopped = true;
    for (const document of documents.values()) {
      if (cancel) cancelPull(document);
      else if (document.timer) clearTimeout(document.timer);
    }
    pulls.clear();
  }

  function schedule(uri, version) {
    if (stopped) return;
    let document = documents.get(uri);
    if (!document) {
      document = { generation: 0, version };
      documents.set(uri, document);
    }
    document.generation += 1;
    if (Number.isInteger(version)) document.version = version;
    cancelPull(document);
    document.timer = setTimeout(() => {
      document.timer = undefined;
      if (stopped || documents.get(uri) !== document) return;
      const id = `${idPrefix}pull:${++serial}`;
      document.pending = id;
      pulls.set(id, { uri, document, generation: document.generation, epoch });
      toServer(encodeMessage({ jsonrpc: '2.0', id, method: 'textDocument/diagnostic', params: { textDocument: { uri } } }));
    }, delayMs);
  }

  function refreshAll() {
    epoch += 1;
    for (const [uri, document] of documents) schedule(uri, document.version);
  }

  const client = new LspFramer((message, frame) => {
    let outgoing = message;
    if (message.method === 'initialize' && message.params && typeof message.params === 'object') {
      const capabilities = message.params.capabilities ?? {};
      outgoing = { ...message, params: { ...message.params, capabilities: {
        ...capabilities,
        textDocument: { ...capabilities.textDocument, diagnostic: { dynamicRegistration: false, relatedDocumentSupport: false } },
        workspace: { ...capabilities.workspace, diagnostics: { ...capabilities.workspace?.diagnostics, refreshSupport: true } },
      } } };
    }
    if (message.method && Object.hasOwn(message, 'id') && typeof message.id === 'string' && message.id.startsWith(idPrefix)) {
      const id = `${idPrefix}client:${++serial}`;
      clientRemaps.set(id, message.id);
      originalClientIds.set(message.id, id);
      outgoing = { ...outgoing, id };
    } else if (message.method === '$/cancelRequest' && typeof message.params?.id === 'string' && message.params.id.startsWith(idPrefix)) {
      const remapped = originalClientIds.get(message.params.id);
      if (!remapped) return;
      outgoing = { ...message, params: { ...message.params, id: remapped } };
    }
    if (message.method === 'shutdown' || message.method === 'exit') stop(true);
    toServer(outgoing === message ? frame : encodeMessage(outgoing));
    const uri = message.params?.textDocument?.uri;
    if (typeof uri !== 'string') return;
    if (['textDocument/didOpen', 'textDocument/didChange', 'textDocument/didSave'].includes(message.method)) {
      let document = documents.get(uri);
      if (!document) {
        document = { generation: 0 };
        documents.set(uri, document);
      }
      if (Number.isInteger(message.params.textDocument.version)) document.version = message.params.textDocument.version;
      refreshAll();
    } else if (message.method === 'textDocument/didClose') {
      const document = documents.get(uri);
      if (document) {
        cancelPull(document);
        documents.delete(uri);
        toClient(encodeMessage({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: [] } }));
        refreshAll();
      }
    }
  });

  const server = new LspFramer((message, frame) => {
    if (message.method === 'workspace/diagnostic/refresh' && Object.hasOwn(message, 'id')) {
      toServer(encodeMessage({ jsonrpc: '2.0', id: message.id, result: null }));
      refreshAll();
      return;
    }
    if (!message.method && clientRemaps.has(message.id)) {
      const id = clientRemaps.get(message.id);
      clientRemaps.delete(message.id);
      originalClientIds.delete(id);
      toClient(encodeMessage({ ...message, id }));
      return;
    }
    if (!message.method && typeof message.id === 'string' && message.id.startsWith(`${idPrefix}pull:`)) {
      const pull = pulls.get(message.id);
      pulls.delete(message.id);
      if (!pull || stopped || pull.epoch !== epoch || documents.get(pull.uri) !== pull.document || pull.generation !== pull.document.generation) return;
      pull.document.pending = undefined;
      if (message.error) {
        reportError(`Cannot read TypeScript diagnostics for ${pull.uri}: ${message.error.message ?? 'language server error'}`);
        return;
      }
      if (message.result?.kind !== 'full' || !Array.isArray(message.result.items)) {
        reportError(`Invalid TypeScript diagnostic response for ${pull.uri}; existing diagnostics were kept`);
        return;
      }
      toClient(encodeMessage({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: {
        uri: pull.uri,
        ...(Number.isInteger(pull.document.version) ? { version: pull.document.version } : {}),
        diagnostics: message.result.items,
      } }));
      return;
    }
    toClient(frame);
  });

  return { client, server, stop };
}
