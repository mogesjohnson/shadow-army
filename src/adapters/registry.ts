import type { Adapter } from "./Adapter.js";
import { agyAdapter } from "./agy.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { grokAdapter } from "./grok.js";

const adapters = new Map<string, Adapter>();

export function registerAdapter(adapter: Adapter): void {
  adapters.set(adapter.id, adapter);
}

export function getAdapter(id: string): Adapter | undefined {
  return adapters.get(id);
}

export function allAdapters(): Adapter[] {
  return [...adapters.values()];
}

for (const a of [claudeAdapter, codexAdapter, grokAdapter, agyAdapter]) registerAdapter(a);
