// 無頭 Edge / Chrome（或 Tauri 的 WebView2）的 CDP 驅動程式，給 UI 驗證腳本 import。
// 只用 Node 22 內建的 fetch / WebSocket，沒有相依套件。用法見同資料夾的 SKILL.md。
import { spawn, execFileSync } from "node:child_process"
import { rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
export const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForJson(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`)
      if (response.ok) return await response.json()
    } catch {
      // 瀏覽器還沒開好
    }
    if (Date.now() > deadline) throw new Error(`port ${port} 的 CDP 沒有回應`)
    await sleep(200)
  }
}

/** 啟動無頭瀏覽器並開啟 url。profileDir 每次都先刪掉（localStorage 會留到下一次）。 */
export async function launch({ url, profileDir, port = 9333, browser = EDGE, width = 1600, height = 1000, scale = 1 }) {
  rmSync(profileDir, { recursive: true, force: true })
  const child = spawn(
    browser,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      `--window-size=${width},${height}`,
      "--no-first-run",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore" },
  )
  const targets = await waitForJson(port, 15000)
  const target = targets.find((t) => t.type === "page")
  const page = await connectTarget(target.webSocketDebuggerUrl)
  page.browserPid = child.pid
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false })
  if (url) await page.goto(url)
  return page
}

/** 接上已經開著的 CDP（例如 `tauri dev` 的 WebView2，port 9222），選網址含 urlPart 的頁面。 */
export async function attach({ port = 9222, urlPart = "localhost:1420" } = {}) {
  const targets = await waitForJson(port, 60000)
  const target = targets.find((t) => t.type === "page" && t.url.includes(urlPart))
  if (!target) throw new Error(`找不到網址含 ${urlPart} 的頁面：${targets.map((t) => t.url).join(", ")}`)
  return connectTarget(target.webSocketDebuggerUrl)
}

async function connectTarget(wsUrl) {
  const socket = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true })
    socket.addEventListener("error", reject, { once: true })
  })
  let nextId = 1
  const pending = new Map()
  const listeners = new Map()
  const logs = []
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(`${message.error.message}${message.error.data ? `：${message.error.data}` : ""}`))
      else resolve(message.result)
    } else if (message.method) {
      if (message.method === "Runtime.consoleAPICalled") {
        logs.push(`[${message.params.type}] ${message.params.args.map((a) => a.value ?? a.description).join(" ")}`)
      } else if (message.method === "Runtime.exceptionThrown") {
        logs.push(`[exception] ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`)
      }
      for (const listener of listeners.get(message.method) ?? []) listener(message.params)
    }
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  const once = (method) =>
    new Promise((resolve) => {
      const list = listeners.get(method) ?? []
      const listener = (params) => {
        list.splice(list.indexOf(listener), 1)
        resolve(params)
      }
      list.push(listener)
      listeners.set(method, list)
    })

  await send("Page.enable")
  await send("Runtime.enable")

  const page = {
    send,
    logs,
    browserPid: undefined,

    async goto(url) {
      const loaded = once("Page.loadEventFired")
      await send("Page.navigate", { url })
      await loaded
    },

    /** 在頁面裡執行運算式（可以 await），回傳 JSON 值；丟例外時連同訊息一起 throw。 */
    async eval(expression) {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
      }
      return result.result.value
    },

    /** 等到運算式為 truthy（例如等元素出現、等 Vite 重新最佳化之後的 reload）。 */
    async waitFor(expression, timeoutMs = 15000) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        try {
          const value = await page.eval(expression)
          if (value) return value
        } catch {
          // 頁面可能正在 reload
        }
        if (Date.now() > deadline) throw new Error(`等不到：${expression}`)
        await sleep(200)
      }
    },

    /** 用 pointer 事件點擊（Radix 的 tabs / select 只認 pointer，不認 `.click()`）。 */
    async click(x, y, { button = "left", clickCount = 1, modifiers = 0 } = {}) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, modifiers })
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, clickCount, modifiers })
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, clickCount, modifiers })
      await sleep(80)
    },

    /** 點元素的中心：先 scrollIntoView（屬性面板下半部可能被「圖層」頁籤擋住）。 */
    async clickSelector(selector) {
      const box = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return null
        el.scrollIntoView({ block: "center" })
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })()`)
      if (!box) throw new Error(`找不到元素：${selector}`)
      await page.click(box.x, box.y)
    },

    /** 拖曳：按下、分 steps 步移動、放開。 */
    async drag(from, to, { steps = 8 } = {}) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y })
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", clickCount: 1 })
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps
        const y = from.y + ((to.y - from.y) * i) / steps
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 })
      }
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", clickCount: 1 })
      await sleep(80)
    },

    /** 輸入文字（IME 以外的一般輸入，含中文）。 */
    async type(text) {
      await send("Input.insertText", { text })
    },

    /**
     * 按鍵，例如 key("Delete")、key("z", { modifiers: CTRL })、key("Enter")。
     * Enter 會帶 text "\r"（否則表單不會送出）。
     */
    async key(key, { modifiers = 0, code } = {}) {
      const named = { Enter: [13, "\r"], Escape: [27], Tab: [9], Backspace: [8], Delete: [46],
        ArrowLeft: [37], ArrowUp: [38], ArrowRight: [39], ArrowDown: [40], PageUp: [33], PageDown: [34] }
      const [keyCode, text] = named[key] ?? [key.toUpperCase().charCodeAt(0), modifiers ? undefined : key]
      const base = { key, code: code ?? (named[key] ? key : `Key${key.toUpperCase()}`), windowsVirtualKeyCode: keyCode, modifiers }
      await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, text })
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base })
      await sleep(50)
    },

    async screenshot(path, clip) {
      const { data } = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { scale: 1, ...clip } } : {}) })
      writeFileSync(path, Buffer.from(data, "base64"))
      return path
    },

    /** 關閉連線；launch() 開的瀏覽器用 taskkill /T 整棵關掉（`kill()` 會留下鎖住 profile 的子程序）。 */
    async close() {
      socket.close()
      if (page.browserPid) {
        try {
          execFileSync("taskkill", ["/T", "/F", "/PID", String(page.browserPid)], { stdio: "ignore" })
        } catch {
          // 已經結束
        }
      }
    },
  }
  return page
}

export const ALT = 1
export const CTRL = 2
export const META = 4
export const SHIFT = 8

/** 讀取編輯器狀態、送 action、拿 Konva stage 的頁面輔助程式（`await page.eval(EDITOR_HOOKS)` 之後用 `window.__mag`）。 */
export const EDITOR_HOOKS = `(async () => {
  const root = document.getElementById("root")
  const containerKey = Object.keys(root).find((k) => k.startsWith("__reactContainer$"))
  // container 指向的樹可能是舊的那一份：從 stateNode.current 走
  const current = () => root[containerKey].stateNode.current
  function find(match) {
    const stack = [current()]
    while (stack.length) {
      const fiber = stack.pop()
      if (match(fiber)) return fiber
      if (fiber.sibling) stack.push(fiber.sibling)
      if (fiber.child) stack.push(fiber.child)
    }
    return null
  }
  const isStateProvider = (f) => {
    const v = f.memoizedProps?.value
    return v && typeof v === "object" && "history" in v && "activePageId" in v
  }
  const konvaUrl = performance.getEntriesByType("resource").map((e) => e.name).find((n) => /\\/deps\\/konva\\.js/.test(n))
  const Konva = konvaUrl ? (await import(konvaUrl)).default : null
  window.__mag = {
    state() {
      return find(isStateProvider)?.memoizedProps.value ?? null
    },
    // editor 的 dispatch 是 state provider 最近的「祖先」裡 value 是函式的那一個
    // （偏好設定 provider 也有 dispatch，送錯地方整個 App 會變空白）
    dispatch(action) {
      let fiber = find(isStateProvider)?.return
      while (fiber && typeof fiber.memoizedProps?.value !== "function") fiber = fiber.return
      if (!fiber) throw new Error("找不到 editor dispatch")
      fiber.memoizedProps.value(action)
    },
    Konva,
    // 第一個 .konvajs-content 是「頁面」面板的縮圖：主畫布取最大的那一個
    stage() {
      if (!Konva) return null
      return [...Konva.stages].sort((a, b) => b.width() * b.height() - a.width() * a.height())[0] ?? null
    },
  }
  return { konva: !!Konva, state: !!window.__mag.state() }
})()`

export const profileIn = (dir) => join(dir, "edge-profile")
