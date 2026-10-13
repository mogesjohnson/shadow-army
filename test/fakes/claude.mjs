// Synthetic Claude stream-json frames, based on the vendor's published Agent SDK schema.
// Provenance: hand-written fake, not a recorded/live Claude session. Never calls a provider.
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const session = randomUUID();
const history = [];
let current;
let cost = 0;
let approval;
const emit = (frame) => process.stdout.write(`${JSON.stringify({ session_id: session, ...frame })}\n`);
const assistant = (text, usage = { input_tokens: 10, output_tokens: 2, cache_creation_input_tokens: 5, cache_read_input_tokens: 7 }, extra = {}) => emit({
  type: "assistant", parent_tool_use_id: null,
  message: { id: randomUUID(), role: "assistant", content: [{ type: "text", text }], usage, stop_reason: "end_turn" }, ...extra,
});
const result = (text, extra = {}) => {
  cost += 0.03;
  emit({ type: "result", subtype: "success", is_error: false, result: text, user_message_uuid: current?.uuid,
    terminal_reason: "completed", stop_reason: "end_turn", total_cost_usd: Number(cost.toFixed(6)),
    usage: { input_tokens: 70, output_tokens: 8, cache_creation_input_tokens: 20, cache_read_input_tokens: 40, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 20 } },
    modelUsage: { "fake-claude": { inputTokens: history.length * 70, outputTokens: history.length * 8, costUSD: cost } }, ...extra });
  current = undefined;
};

for await (const line of createInterface({ input: process.stdin })) {
  const frame = JSON.parse(line);
  if (frame.type === "control_request") {
    if (frame.request.subtype === "initialize") {
      emit({ type: "control_response", response: { subtype: "success", request_id: frame.request_id, response: {} } });
      emit({ type: "system", subtype: "init", model: "fake-claude", version: "synthetic-2.1.295" });
    } else if (frame.request.subtype === "interrupt") {
      if (current?.message.content === "ignore-interrupt") continue;
      emit({ type: "control_response", response: { subtype: "success", request_id: frame.request_id, response: {} } });
      if (approval) emit({ type: "control_cancel_request", request_id: approval });
      approval = undefined;
      if (current) result("Stopped after partial edit", { terminal_reason: "aborted_tools", stop_reason: null });
    }
    continue;
  }
  if (frame.type === "control_response") {
    if (!approval || frame.response.request_id !== approval) throw new Error("stale approval reached fake CLI");
    await writeFile(join(process.cwd(), "approval-response.json"), JSON.stringify(frame.response.response));
    result(frame.response.response.behavior === "allow" ? "Explicit owner approved" : "Explicit owner denied");
    approval = undefined;
    continue;
  }
  if (frame.type !== "user") throw new Error("unexpected fake input");
  current = frame;
  const text = frame.message.content;
  history.push(text);
  if (text === "malformed") { process.stdout.write("{broken JSON}\n"); continue; }
  if (text === "split") {
    const bytes = Buffer.from(`${JSON.stringify({ type: "assistant", parent_tool_use_id: null, session_id: session, message: { content: [{ type: "text", text: "split 🌙" }], usage: { input_tokens: 12 }, stop_reason: "end_turn" } })}\n`);
    const moon = bytes.indexOf(Buffer.from("🌙"));
    process.stdout.write(bytes.subarray(0, moon + 1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    process.stdout.write(bytes.subarray(moon + 1, moon + 3));
    await new Promise((resolve) => setTimeout(resolve, 5));
    process.stdout.write(bytes.subarray(moon + 3));
    result("split 🌙"); continue;
  }
  if (text === "partial" || text === "die" || text === "ignore-interrupt") {
    await writeFile(join(process.cwd(), "partial.txt"), "partial edit\n");
    emit({ type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "edit-1", name: "Edit", input: { file_path: "partial.txt" } }], usage: { input_tokens: 18 } } });
    if (text === "die") { await new Promise((resolve) => setTimeout(resolve, 15)); process.exit(42); }
    continue;
  }
  if (text === "partial-success-fail") {
    emit({ type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "edit-success", name: "Edit", input: { file_path: "partial.txt" } }], usage: { input_tokens: 18 } } });
    await writeFile(join(process.cwd(), "partial.txt"), "successful first edit\n");
    emit({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "edit-success", is_error: false, content: "Edit completed" }] } });
    assistant("API Error after successful Edit: rate limit", undefined, { error: "rate_limit" });
    result("API Error after successful Edit: rate limit", { is_error: true, terminal_reason: "api_error", api_error_status: 429 });
    continue;
  }
  if (text === "approval") {
    approval = `permission-${history.length}`;
    emit({ type: "control_request", request_id: approval, request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "echo owner" }, permission_suggestions: [] } });
    continue;
  }
  if (text === "rate" || text === "context" || text === "login") {
    const messages = { rate: "API Error: rate limit; try after reset", context: "API Error: prompt is too long", login: "Please login to Claude Code" };
    const codes = { rate: "rate_limit", context: "invalid_request", login: "authentication_failed" };
    assistant(messages[text], undefined, { error: codes[text] });
    result(messages[text], { is_error: true, terminal_reason: text === "context" ? "prompt_too_long" : "api_error", api_error_status: text === "rate" ? 429 : text === "login" ? 401 : 400 });
    continue;
  }
  if (text === "refusal") {
    emit({ type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: "I cannot help with that request." }], usage: { input_tokens: 10 }, stop_reason: "refusal" } });
    result("I cannot help with that request.", { stop_reason: "refusal" }); continue;
  }
  if (text === "meters") {
    assistant("subagent text", { input_tokens: 99999, cache_read_input_tokens: 99999 }, { parent_tool_use_id: "agent-tool" });
    assistant("main text"); result("main text"); continue;
  }
  if (text === "unknown-usage") { emit({ type: "result", subtype: "success", is_error: false, result: "No usage available", terminal_reason: "completed" }); current = undefined; continue; }
  if (text === "inspect") {
    const args = process.argv.slice(2);
    const appendPath = args[args.indexOf("--append-system-prompt-file") + 1];
    result(JSON.stringify({ pid: process.pid, args, history, ...(args.includes("--append-system-prompt-file") ? { appendText: await readFile(appendPath, "utf8") } : {}) })); continue;
  }
  if (text === "partial-events") {
    emit({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "first " } } });
    emit({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "second" } } });
    assistant("first second"); result("first second"); continue;
  }
  assistant(`turn ${history.length}: ${text}`);
  result(`turn ${history.length}: ${text}; earlier=${history.slice(0, -1).join("|")}`);
}
