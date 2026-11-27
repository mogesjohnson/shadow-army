// Synthetic Claude stream-json frames, based on the vendor's published Agent SDK schema.
// Provenance: hand-written fake, not a recorded/live Claude session. Never calls a provider.
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Fault switches arrive as arguments after the adapter's own, since the channel passes no environment:
//   --fake-version <text>       what `--version` prints (default 2.1.295)
//   --fake-version-hang         `--version` never answers or exits
//   --fake-refuse-managed       exit before any event with a managed-settings refusal on stderr
//   --fake-mode <mode>          the permissionMode that system/init reports instead of the one passed
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined;
if (flag("--version")) {
  if (flag("--fake-version-hang")) { process.stdin.resume(); setInterval(() => {}, 1000); await new Promise(() => {}); }
  process.stdout.write(`${option("--fake-version") ?? "2.1.295"} (Claude Code)\n`);
  process.exit(0);
}
if (flag("--fake-refuse-managed")) {
  process.stderr.write("Error: --permission-mode bypassPermissions is disabled by your organization's managed settings (permissions.disableBypassPermissionsMode)\n");
  process.exit(1);
}
const session = randomUUID();
let lastUuid;
const history = [];
let current;
let cost = 0;
let approval;
let auxiliary;
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
      emit({ type: "system", subtype: "init", model: "fake-claude", version: "synthetic-2.1.295", permissionMode: option("--fake-mode") ?? option("--permission-mode") });
    } else if (frame.request.subtype === "interrupt") {
      if (["ignore-interrupt", "malformed-ignore-interrupt", "malformed-rate-ignore-interrupt"].includes(current?.message.content)) continue;
      clearInterval(auxiliary);
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
  // CH-2: every message the adapter sends queues behind Claude's earlier work.
  if (frame.priority !== "later") throw new Error(`user frame without priority "later": ${frame.priority}`);
  const previous = lastUuid;
  current = frame;
  lastUuid = frame.uuid;
  const text = frame.message.content;
  history.push(text);
  if (text === "malformed") { process.stdout.write("{broken JSON}\n"); continue; }
  if (text === "malformed-once") { process.stdout.write("{broken JSON sk-ant-abcdefghijklmnop}\n"); result("after bad line"); continue; }
  // The turn's own result arrives broken; the CLI is then idle and an interrupt ends nothing.
  if (text === "malformed-idle") { process.stdout.write("{\"type\":\"result\",broken}\n"); current = undefined; continue; }
  // The result line is garbled but the turn's cost still advances: the CLI is idle, so an interrupt ends nothing.
  if (text === "malformed-idle-cost") { cost += 0.03; process.stdout.write("{\"type\":\"result\",broken}\n"); current = undefined; continue; }
  // A bad line, then valid frames that belong to no turn, and no result: only the interrupt ends the turn.
  if (text === "malformed-unrelated") {
    process.stdout.write("{broken JSON}\n");
    for (let i = 0; i < 20; i++) { emit({ type: "system", subtype: "status", status: null }); await new Promise((resolve) => setTimeout(resolve, 20)); }
    continue;
  }
  // A typed provider error, then the turn's result line arrives broken: recovery must keep the typed error.
  if (text === "malformed-rate") {
    emit({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1900000000 } });
    process.stdout.write("{broken JSON}\n");
    continue;
  }
  // The same, but the interrupt is never answered: the containment close must keep the typed error.
  if (text === "malformed-rate-ignore-interrupt") {
    emit({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1900000000 } });
    process.stdout.write("{broken JSON}\n");
    continue;
  }
  if (text === "malformed-login-idle") {
    assistant("Please login to Claude Code", undefined, { error: "authentication_failed" });
    process.stdout.write("{\"type\":\"result\",broken}\n"); current = undefined; continue;
  }
  // A bad line, then only a subagent's output until the interrupt: auxiliary output is not the turn's progress.
  if (text === "malformed-auxiliary") {
    process.stdout.write("{broken JSON}\n");
    let ticks = 0;
    auxiliary = setInterval(() => {
      if (++ticks > 150) { clearInterval(auxiliary); return; }
      emit({ type: "stream_event", parent_tool_use_id: "agent-tool", event: { type: "content_block_delta", delta: { type: "text_delta", text: "sub " } } });
      assistant("subagent working", undefined, { parent_tool_use_id: "agent-tool" });
      emit({ type: "user", parent_tool_use_id: "agent-tool", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "sub-tool", content: "ok" }] } });
    }, 20);
    continue;
  }
  // A bad line, then the turn's own progress, then its result: the quiet window restarts at each step.
  if (text === "malformed-then-progress") {
    process.stdout.write("{broken JSON}\n");
    for (let i = 0; i < 8; i++) { await new Promise((resolve) => setTimeout(resolve, 30)); assistant(`working ${i}`); }
    result("progress finished"); continue;
  }
  // A bad line while a tool runs, and an interrupt that is never answered: the turn may still be running.
  if (text === "malformed-ignore-interrupt") {
    await writeFile(join(process.cwd(), "partial.txt"), "partial edit\n");
    process.stdout.write("{broken JSON}\n");
    continue;
  }
  if (text === "malformed-long") { process.stdout.write(`{broken ${"x".repeat(185)} sk-ant-abcdefghijklmnop ${"y".repeat(40)}}\n`); result("after long bad line"); continue; }
  if (text === "malformed-ten") { for (let i = 0; i < 10; i++) process.stdout.write("{broken JSON}\n"); continue; }
  if (text === "malformed-nine-then-ok") { for (let i = 0; i < 9; i++) process.stdout.write("{broken JSON}\n"); assistant("ok"); for (let i = 0; i < 9; i++) process.stdout.write("{broken JSON}\n"); result("survived"); continue; }
  if (text === "login-exit") {
    assistant("Please login to Claude Code", undefined, { error: "authentication_failed" });
    result("Please login to Claude Code", { is_error: true, terminal_reason: "api_error", api_error_status: 401 });
    await new Promise((resolve) => setTimeout(resolve, 15)); process.exit(1);
  }
  if (text === "model-change") {
    const model = (name) => ({ type: "assistant", parent_tool_use_id: null, message: { id: randomUUID(), model: name, role: "assistant", content: [{ type: "text", text: `from ${name}` }], usage: { input_tokens: 10, output_tokens: 2 }, stop_reason: "end_turn" } });
    emit(model("fake-claude")); emit(model("fake-fallback")); result("changed"); continue;
  }
  if (text === "background-start") {
    emit({ type: "system", subtype: "task_started", task_id: "bg-1" });
    result("started a task"); continue;
  }
  if (text === "background-next") {
    // The earlier message's task finishes while this message runs: its follow-up result names the earlier message.
    emit({ type: "system", subtype: "task_notification", task_id: "bg-1", status: "completed" });
    emit({ type: "result", subtype: "success", is_error: false, result: "task done", user_message_uuid: previous, origin: { kind: "task-notification" }, total_cost_usd: 99, usage: { input_tokens: 1, output_tokens: 1 } });
    emit({ type: "result", subtype: "success", is_error: false, result: "late", user_message_uuid: previous, total_cost_usd: 98, usage: { input_tokens: 1, output_tokens: 1 } });
    assistant("own work"); result("own result"); continue;
  }
  if (text === "unknown-frames") {
    emit({ type: "hologram", payload: { anything: true } });
    emit({ type: "system", subtype: "from_the_future", detail: 1 });
    emit({ type: "assistant", parent_tool_use_id: null, novel_field: { nested: 1 }, message: { id: randomUUID(), role: "assistant", content: [{ type: "text", text: "known frame" }, { type: "hologram_block", x: 1 }], usage: { input_tokens: 10, output_tokens: 2 }, stop_reason: "end_turn", new_message_field: true } });
    result("known result", { new_result_field: [1, 2] }); continue;
  }
  if (text === "cutoff") { process.stdout.write('{"type":"assistant","message":{"content":[{"type":"te'); process.exit(0); }
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
  if (text === "unknown-usage") { emit({ type: "result", subtype: "success", is_error: false, result: "No usage available", terminal_reason: "completed", user_message_uuid: current?.uuid }); current = undefined; continue; }
  if (text === "retry") {
    emit({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 10, retry_delay_ms: 500, error_status: 529, error: "overloaded" });
    assistant("after retry"); result("after retry"); continue;
  }
  if (text === "inspect") {
    const args = process.argv.slice(2);
    const appendPath = args[args.indexOf("--append-system-prompt-file") + 1];
    result(JSON.stringify({ pid: process.pid, args, history, autoMemoryOff: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, ...(args.includes("--append-system-prompt-file") ? { appendText: await readFile(appendPath, "utf8") } : {}) })); continue;
  }
  if (text === "partial-events") {
    emit({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "first " } } });
    emit({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "second" } } });
    assistant("first second"); result("first second"); continue;
  }
  assistant(`turn ${history.length}: ${text}`);
  result(`turn ${history.length}: ${text}; earlier=${history.slice(0, -1).join("|")}`);
}
