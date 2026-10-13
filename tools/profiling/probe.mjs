// Evaluate one expression in the app's WebView over the DevTools protocol and print the result.
// Needs the app started with --remote-debugging-port (see profile_webview.mjs). Promises are awaited.
// Usage (from tools/):
//   node profiling/probe.mjs "({ heapMB: Math.round(performance.memory.usedJSHeapSize / 2**20), tiles: document.querySelectorAll('[data-sheet-id]').length })"
const expression = process.argv[2];
if (!expression) {
  console.error('usage: node probe.mjs "<expression>"');
  process.exit(2);
}
const port = process.env.CDP_PORT ?? "9222";
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error(`no page target on port ${port}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const { result, exceptionDetails } = message.result ?? {};
  console.log(exceptionDetails ? `error: ${exceptionDetails.exception?.description ?? exceptionDetails.text}` : JSON.stringify(result?.value));
  ws.close();
});
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
