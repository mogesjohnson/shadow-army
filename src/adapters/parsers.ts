import type { ModelInfo } from "./Adapter.js";

/** `codex debug models` prints {"models":[{"slug","display_name",...}]}. */
export function parseCodexModels(json: string): ModelInfo[] {
  const data = JSON.parse(json) as { models?: { slug?: string; display_name?: string }[] };
  return (data.models ?? [])
    .filter((m): m is { slug: string; display_name?: string } => typeof m.slug === "string")
    .map((m) => ({ id: m.slug, label: m.display_name }));
}

/** `grok models` prints bullet lines such as "  * grok-4.7 (default)" or "  - grok-4.6". */
export function parseGrokModels(text: string): ModelInfo[] {
  const out: ModelInfo[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[*-]\s+(\S+)/);
    if (m) out.push({ id: m[1]! });
  }
  return out;
}

/** `agy models` prints "<id>\t<label>" per line on stdout. */
export function parseAgyModels(text: string): ModelInfo[] {
  const out: ModelInfo[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("\t")) continue;
    const [id, label] = line.split("\t");
    if (id?.trim()) out.push({ id: id.trim(), label: label?.trim() });
  }
  return out;
}
