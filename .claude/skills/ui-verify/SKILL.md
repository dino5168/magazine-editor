---
name: ui-verify
description: 用無頭 Edge + CDP 在瀏覽器模式（或 tauri dev 的 WebView2）實際操作雜誌編輯軟體，驗證 UI 變更：點擊、輸入、讀 / 送 editor action、截圖。改了畫布、面板、對話框、快捷鍵後要「實際跑一次」時使用。
---

# UI 驗證（無頭 Edge + CDP）

Chrome 擴充通常沒連上，所以用自己的 CDP 驅動程式：同資料夾的 `cdp.mjs`（Node 22 內建 `fetch` / `WebSocket`，沒有相依套件）。

## 步驟

1. **開 Vite**（PowerShell；Bash 的 PATH 上沒有 npm）。1420 常常是使用者自己的 dev server，**不要關它**，改用 1430：
   ```powershell
   Start-Process cmd -ArgumentList '/c','npx vite --port 1430 --strictPort > "<scratchpad>\vite.log" 2>&1' -WorkingDirectory "C:\2-軟體產品\magazine" -WindowStyle Hidden
   ```
   不要用 `npm run dev -- --port …`（參數會被當成 Vite 的 root，回 404）。
2. **寫驗證腳本放 scratchpad**（不進 repo），import 驅動程式：
   ```js
   import { launch, profileIn, EDITOR_HOOKS, CTRL, SHIFT } from "file:///C:/2-軟體產品/magazine/.claude/skills/ui-verify/cdp.mjs"
   const page = await launch({ url: "http://localhost:1430/", profileDir: profileIn("<scratchpad>") })
   try {
     await page.waitFor(`!!document.querySelector(".konvajs-content")`, 30000)
     await page.eval(EDITOR_HOOKS)          // 之後頁面裡有 window.__mag
     const s = await page.eval(`(() => { const s = __mag.state(); return s.history.present.pages.length })()`)
     await page.clickSelector('[role="tab"]')   // 或 page.click(x, y)、page.drag(from, to)
     await page.type("中文也可以"); await page.key("Enter"); await page.key("z", { modifiers: CTRL })
     await page.screenshot("<scratchpad>/a.png")   // 用 Read 看圖
     console.log(page.logs)                         // console 與例外
   } finally { await page.close() }
   ```
   用 `node <腳本>` 執行（Bash 或 PowerShell 都有 node）。
3. **收尾**：關掉 Vite（依 port 找 PID，整棵關）：
   ```powershell
   $p = (Get-NetTCPConnection -LocalPort 1430 -State Listen).OwningProcess; taskkill /T /F /PID $p
   ```
   `page.close()` 已用 `taskkill /T` 關瀏覽器；確認 `msedge.exe` 沒有殘留（命令列含 `9333`）。

## `cdp.mjs` 提供的

- `launch({ url, profileDir, port=9333, browser=EDGE|CHROME, width, height, scale })`：**每次先刪 profile**（localStorage 的工具面板配置、偏好會留到下一次，上一次開的面板會擋住屬性面板）。
- `attach({ port=9222, urlPart })`：接上已開的 WebView2（見下面「桌面版」）。
- `page.eval(expr)`（可 await，回 JSON）、`waitFor(expr)`、`click` / `clickSelector`（先 `scrollIntoView({ block: "center" })`）/ `drag` / `type`（`Input.insertText`）/ `key`（Enter 帶 `"\r"`，表單才會送出）/ `screenshot(path, clip?)` / `logs` / `send(method, params)`（原始 CDP）。
- `EDITOR_HOOKS`：`__mag.state()`（editor state）、`__mag.dispatch(action)`、`__mag.stage()`（主畫布）、`__mag.Konva`。

## 陷阱

- 點擊用 pointer 事件（`Input.dispatchMouseEvent`）：Radix 的 tabs / select 不理 `.click()`。
- `__mag.dispatch` 之後要等 React render（約 300 ms）才讀 `__mag.state()`，否則拿到舊文件（同一個 `eval` 裡連續 dispatch 沒問題，讀的時候才要等）。
- 要截畫布的像素：不要用 `stage.toDataURL()`（在不在 DOM 的 canvas 重畫，全形標點會被擠）；`launch({ scale: 2 })` 後讀頁面上圖層的 `layer.getNativeCanvasElement().toDataURL()`。
- Konva 把同一點兩次快速點擊當 dblclick：重複點同一點時中間等一下。
- 第一個 `.konvajs-content` 是「頁面」面板的縮圖；主畫布取最大的（`__mag.stage()` 已處理）。
- `window.Konva` 不存在：`EDITOR_HOOKS` 從 performance entries 找 `/deps/konva.js` 再 `import()`。
- editor state 從 `root[__reactContainer$…].stateNode.current` 走 fiber（只用 container key 會拿到舊的樹）；dispatch 是 state provider **祖先**中 value 是函式的那個。**不要找「名字含 dispatch 的函式」**：偏好 provider 也有，送錯整個 App 變空白。
- Vite 啟動後第一次載入會重新最佳化相依並 reload：注入的東西可能不見，`waitFor` 後再注入；第一次跑失敗就重跑。
- 文字編輯框：Esc 是取消，結束用 blur 或 Ctrl+Enter。
- 屬性面板和「圖層」共用右側 dock；左側面板的頁籤也是 `role="tab"`，選屬性子頁籤要排除 `x.closest("[data-dock-tab]")`。
- `node_modules` 不能讀（專案權限）：程式庫的行為在瀏覽器裡實測。

## 桌面版（檔案系統、範本等瀏覽器模式沒有的功能）

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Start-Process cmd -ArgumentList '/c','npm run tauri dev > "<scratchpad>\tauri.log" 2>&1' -WorkingDirectory "C:\2-軟體產品\magazine" -WindowStyle Hidden
```

然後 `attach({ port: 9222, urlPart: "localhost:1420" })`，command 用 `window.__TAURI_INTERNALS__.invoke(cmd, args)`。**App 會開使用者上次的專案、寫真的 `%APPDATA%`**：只動丟棄用的資料，結束後刪掉。

## 匯出疊圖比對

在瀏覽器 import `/src/lib/export/export-request.ts` + `text-layout.ts` 組 `ExportRequest`，同一批節點用 Konva 畫成 2 px/pt 的 PNG；再 `EXPORT_REQUEST_JSON` + `export_preview`（PDF）/ `epub_preview`（解壓後用 Edge、`scale: 2` 開 `OEBPS/pages/page-1.xhtml`）。測試文字不要超出頁高；每個字的比對範圍限制在間距的一半，否則鄰字會混進來。指令見根 `CLAUDE.md` 的 Commands。
