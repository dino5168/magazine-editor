// CPU-profile the app's WebView while a workload command runs, then print the hottest functions.
//
// The app must be started with remote debugging (dev build; the release build ignores it):
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'; npm run tauri dev
// Usage (from tools/):
//   node profiling/profile_webview.mjs out.cpuprofile -- uv run python -m stress.fill_pages --count 10 --exe ../src-tauri/target/debug/magazine-mcp.exe
// Env CDP_PORT overrides 9222. Open the .cpuprofile in DevTools → Performance for the full picture.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const separator = process.argv.indexOf("--");
const outFile = process.argv[2];
if (!outFile || separator < 0 || separator === process.argv.length - 1) {
  console.error("usage: node profile_webview.mjs <out.cpuprofile> -- <command> [args...]");
  process.exit(2);
}
const [command, ...commandArgs] = process.argv.slice(separator + 1);
const port = process.env.CDP_PORT ?? "9222";

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("localhost:1420"));
if (!page) throw new Error(`no app page on port ${port}: ${targets.map((t) => t.url).join(", ")}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message);
  pending.delete(message.id);
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    pending.set(++nextId, resolve);
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });
const heapMb = async () => {
  const { result } = await send("Runtime.evaluate", { expression: "performance.memory.usedJSHeapSize", returnByValue: true });
  return Math.round(result.result.value / 2 ** 20);
};

console.log("heap before (MB):", await heapMb());
await send("Profiler.enable");
await send("Profiler.setSamplingInterval", { interval: 250 });
await send("Profiler.start");
// spawnSync blocks this process, which is fine: the browser keeps sampling on its own
const run = spawnSync(command, commandArgs, { encoding: "utf-8", shell: process.platform === "win32" });
const { result } = await send("Profiler.stop");
console.log("workload:", run.stdout.trim(), run.stderr.trim());
console.log("heap after (MB):", await heapMb());
writeFileSync(outFile, JSON.stringify(result.profile));
ws.close();

// self and inclusive time per function; inclusive counts a function once per sample (recursion)
const { nodes, samples, timeDeltas } = result.profile;
const byId = new Map(nodes.map((node) => [node.id, node]));
const parentOf = new Map();
for (const node of nodes) for (const child of node.children ?? []) parentOf.set(child, node.id);
const label = (node) => {
  const frame = node.callFrame;
  const file = frame.url.replace(/^.*localhost:1420\//, "").replace(/\?.*$/, "");
  return `${frame.functionName || "(anon)"}  ${file}:${frame.lineNumber + 1}`;
};
const self = new Map();
const inclusive = new Map();
let total = 0;
samples.forEach((sampleId, i) => {
  const ms = (timeDeltas[i + 1] ?? timeDeltas[i]) / 1000;
  total += ms;
  const own = label(byId.get(sampleId));
  self.set(own, (self.get(own) ?? 0) + ms);
  const seen = new Set();
  for (let id = sampleId; id !== undefined; id = parentOf.get(id)) {
    const key = label(byId.get(id));
    if (seen.has(key)) continue;
    seen.add(key);
    inclusive.set(key, (inclusive.get(key) ?? 0) + ms);
  }
});
const top = (map, n) =>
  [...map]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, ms]) => `${ms.toFixed(0).padStart(7)} ms  ${((100 * ms) / total).toFixed(1).padStart(5)}%  ${key}`)
    .join("\n");
console.log(`\ntotal sampled ${total.toFixed(0)} ms\n\n== self ==\n${top(self, 30)}\n\n== inclusive ==\n${top(inclusive, 60)}`);
