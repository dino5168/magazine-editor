# 1 批次操作與 Python SDK — 實作計畫

需求：[1-python-scripts.md](1-python-scripts.md)；評估與使用者的決定：[1-python-scripts-評估計畫.md](1-python-scripts-評估計畫.md)（§9）。

## 0. 範圍（照評估 §9）

- **階段 1：MCP `batch` 工具**：一次呼叫帶多個現有工具的操作，可用 `$ref` 引用前面操作的結果；**全部成功才套用、任何一個失敗整批退回**；成功 = **一筆復原**。
- **階段 2：Python SDK**，放在 `sdk/python/`（套件名 `magazine`），使用者是 LLM 和開發者自己。函式由 `src-tauri/mcp-tools.json` 產生，`with doc.batch():` 對應階段 1。
- 不做：App 內的腳本視窗（階段 3，用過再決定）、`atomic: false`、發布到 PyPI。

## 1. 設計

### 1.1 `batch` 工具

```jsonc
// 參數
{ "ops": [ { "tool": "add_page", "args": {} },
           { "tool": "add_text", "args": { "pageId": { "$ref": "0.pages.0.id" }, "text": "標題", "x": 40, "y": 40 } } ] }
// 成功
{ "results": [ { "pages": [ { "id": "…", "name": "Page-2" } ], "activePageId": "…" }, { "id": "…" } ] }
// 失敗（文件不變）：error = "ops[1]（add_text）：參數 x：…"（編號和 $ref 一樣 0 起算）
```

- `ops`：1–200 個（`BATCH_OPS_MAX`）；`tool` 是工具名稱，`args` 是那個工具的參數，驗證、錯誤訊息都由那個工具自己做（`runTool`）。
- **`$ref`**：值是 `{ "$ref": "<第幾個>.<路徑>" }`（物件只有這一個 key）時，換成前面第 N 個操作（0 起算）回傳值的那個欄位；路徑用 `.` 分隔，陣列用數字（`"3.ids.0"`）。可以出現在 `args` 的任何深度。只能引用**前面**的操作；不存在 → 這個操作失敗（整批退回），訊息指出哪個 `$ref`。
- **不能放進批次**：`batch`（巢狀）、`undo` / `redo`（和「整批一筆復原」衝突）、`run_command`（開對話框、副作用不在文件裡）。查詢工具可以（讀批次進行到一半的狀態）。
- 回傳：每個操作的原始結果（現有工具的回傳都很小，多半是 id）。之後若佔太多上下文再加選項。

### 1.2 執行方式（重用現有的 apply 模式）

`use-mcp-bridge.ts` 已經是「先用純 reducer 算、再 dispatch 同一個 action」。批次照這樣做：

1. `runBatch(args, context)`：在**暫存的 state** 上逐一執行；每個操作的 `ToolContext` 是 `{ state: 暫存, library, commands, apply: 記錄用 }`，記錄用的 apply = 對暫存 state 跑 reducer 並記下 action（不 dispatch）。
2. 任何一個失敗 → 回傳錯誤，什麼都沒 dispatch（**整批退回**）。
3. 全部成功 → 只呼叫一次真正的 `context.apply({ type: "history/batch", actions })`。
4. 新 id 在步驟 1 就由各工具產生並寫進 action，reducer 重播得到**同一個**結果（reducer 是純函式；測試比對兩者相同）。

### 1.3 reducer：`history/batch { actions }`

- 依序把 `actions` 交給 `editorReducer`，最後把歷史收成**一筆**：`past = [...原 past, 原 present].slice(-HISTORY_LIMIT)`、`future = []`；文件沒變時歷史維持原樣（只保留頁面 / 選取等 UI 狀態的變化），全部沒變化時回傳同一個 state。
- `actions` 裡不可有 `history/*`（含巢狀 batch）、`document/load`、`document/markSaved`、`page/add`（reducer 裡唯一自己產生 id 的 action，重播結果會不同；MCP 用的是 `page/addMany`）→ 整個 no-op（`BatchableAction` / `isBatchableAction`）。
- 每個 action 仍走各自的 handler 與驗證；中途某個 action 沒有變化（no-op）不影響其他的（runBatch 已經先確認每個操作都成功）。

### 1.4 Python SDK（`sdk/python/`）

```
sdk/python/
  pyproject.toml        # uv 專案（magazine-sdk，build backend uv_build），套件 magazine，Python ≥ 3.13，沒有第三方相依（測試用 pytest）
  README.md
  magazine/
    __init__.py         # connect()
    client.py           # MCP stdio 用戶端（由 tools/mcp_client.py 搬過來）
    document.py         # Document：call()、batch()、產生的工具方法
    _tools.py           # 由 mcp-tools.json 產生（不要手改）
  scripts/generate.py   # 產生 _tools.py
  tests/
```

- `tools/` 改成依賴 `sdk/python`（uv path dependency），`tools/mcp_client.py` 只留轉接或移除，**用戶端程式只有一份**。
- 產生的方法：每個工具一個方法，參數 = 工具的參數（keyword-only）、docstring = 工具說明與參數說明；必填 / 選填照 JSON Schema 的 `required`。測試檢查 `_tools.py` 和 `mcp-tools.json` 一致（同 `mcp-tools.test.ts` 的快照做法），改了工具忘記重新產生會失敗。
- **參數名稱照 MCP 原樣（camelCase，例如 `pageId`）**：和 Claude Code 看到的工具 schema 一致，LLM 不用換算（見 §3 待確認）。
- `with doc.batch() as b:` 裡呼叫工具方法時不送出，回傳 `Pending`；`pending["id"]` 是 `{"$ref": "n.id"}`，可以直接當別的參數；離開 `with` 時送出一次 `batch`，成功後 `pending.result` 有值；失敗丟 `BatchError`（含第幾個操作），文件不變。`with` 裡發生例外 → 不送出。
- 連線沿用橋接程式 `magazine-mcp.exe`（stdio）；路徑預設 release，可指定。

## 2. 步驟（每步做完停下來，等使用者說「繼續」）

### 階段 1：`batch` 工具

| # | 內容 | 檔案 | 驗證 |
|---|---|---|---|
| 1 | `$ref` 解析（純函式）：找出所有 `$ref`、換成前面結果的值、錯誤訊息 | `lib/automation/batch-refs.ts` | vitest：各種深度、陣列路徑、引用自己 / 之後 / 不存在的操作、不是 `$ref` 的物件原樣保留 |
| 2 | reducer `history/batch`：依序套用、收成一筆歷史、沒變化回傳同一個 state、禁止的 action no-op | `editor-reducer.ts` | vitest：一次 undo 回到批次前、redo、HISTORY_LIMIT、只改 UI 狀態的批次不進歷史 |
| 3 | `runBatch` 與 `batch` 工具定義：暫存 state 執行、失敗整批退回、成功一次 apply、禁止的工具、上限 | `lib/automation/batch.ts`、`tool-definitions.ts`、`run-tool.ts` | vitest（`tool-session.ts`）：新增頁面＋文字＋修改的批次、中途失敗文件不變、重播結果和暫存結果相同、一次 undo |
| 4 | 工具清單與文件：`mcp-tools.json`、重編橋接程式、`MCP-工具清單.md`、`CLAUDE.md` 的 MCP 章節 | — | `npm test`、`npm run build`、`cargo build --bin magazine-mcp` |
| 5 | 桌面版實測：`tools/mcp_client.py` 送 200 個操作的批次（時間、一次復原）；Claude Code `/mcp` 重連後用 `batch` 做一頁版面 | — | 記錄在本文件 |

### 階段 2：Python SDK

| # | 內容 | 檔案 | 驗證 |
|---|---|---|---|
| 6 | SDK 骨架：uv 專案、`client.py`（從 `tools/mcp_client.py` 搬來）、`connect()` / `call()`、`tools/` 改成依賴它 | `sdk/python/`、`tools/pyproject.toml` | `uv run pytest`（sdk 與 tools 都過） |
| 7 | 由 `mcp-tools.json` 產生 `_tools.py` ＋一致性測試 | `scripts/generate.py`、`magazine/_tools.py` | pytest：產生結果和檔案相同、每個工具都有方法、必填參數 |
| 8 | `doc.batch()`、`Pending`、`BatchError` | `magazine/document.py` | pytest（假的傳輸層）：組出的 ops 與 `$ref`、失敗與例外不送出 |
| 9 | 實測與文件：用 SDK 寫一支範例腳本（例如一頁版面用一次 batch），桌面版執行；`sdk/python/README.md`、`tools/README.md`、`CLAUDE.md`、`docs/progress.md` | — | 記錄在本文件 |

## 3. 待確認

- ~~SDK 參數名稱~~：使用者決定照 MCP 原樣（`pageId`）。
- 其餘照 §1 的預設：批次上限 200、`run_command` 不能放進批次、回傳完整結果。

## 進度紀錄

- 2026-10-21：建立實作計畫。使用者確認 §3：SDK 參數名稱用 MCP 原樣（`pageId`）。
- 2026-10-21：**步驟 1 完成**：`lib/automation/batch-refs.ts` 的 `resolveRefs(args, results)`（沒有要換的部分保留原物件；`$ref` 和其他 key 並存的物件不算引用；只認自己的屬性，`1.toString` 這類路徑視為不存在）。錯誤訊息一律以 0 起算的 `ops[N]` 稱呼操作，和 `$ref` 編號一致。vitest 7 項。
- 2026-10-21：**步驟 2 完成**：`editor-reducer.ts` 的 `history/batch { actions }`、`BatchableAction` / `isBatchableAction`。依序套用後從**原本的歷史**重建（中途每個 action 各自 commit、可能已經把最舊的擠掉），文件沒變時只留 UI 狀態的變化。檢查 reducer 裡的 action：只有 `page/add` 自己產生 id（`createPage`），也排除；MCP 工具送出的 action 都是確定的。vitest 6 項（全部 1095 通過）、`tsc` 通過。
- 2026-10-21：**步驟 3 完成**：`lib/automation/batch.ts` 的 `runBatch`（`runTool` 由參數傳入，避免 import 循環；暫存 state 上逐一執行、記下 action，全部成功才一次 `history/batch`）、`TOOL_DEFINITIONS.batch`（`ops` 1–200，`args` 是任意物件、由各工具自己驗證）、`run-tool.ts` 的 handler。錯誤訊息 `ops[N]（工具）：…` 後面加「整批沒有套用，文件沒有改變。」。實作時發現 `add_page` 回傳 `{ pages: [{ id, name }], activePageId }`，沒有 `pageId`，工具說明與計畫的例子改成 `0.pages.0.id`。`mcp-tools.json` 快照在這一步就更新（否則全部測試會失敗），步驟 4 只剩橋接程式與文件。vitest 7 項（全部 1102 通過，含 200 個操作一筆復原）、`tsc` 通過。
- 2026-10-21：**步驟 4 完成**：橋接程式重編（`target/debug/magazine-mcp.exe`，舊檔被這個 Claude Code session 鎖住，先改名成 `magazine-mcp.old-<時間>.exe`，之後可以刪）；`MCP-工具清單.md`（33 個工具、新增 §9 批次與範例 6）、`CLAUDE.md`（MCP 章節的「批次」、reducer 的 `history/batch`、目錄結構）。`npm run build` 通過。Claude Code 要 `/mcp` 重新連線才看得到 `batch`。
- 2026-10-21：**步驟 5 完成**（桌面版 `npm run tauri dev` 開發版、新的 A4 文件；Claude Code `/mcp` 重連後直接呼叫）：
  - **一頁版面一次呼叫**：`batch` 7 個操作（`add_page` → 標題（樣式「標題」）→ 分隔線 → `update_element` 連「文字」色票 → 帶字的圓角色塊 → 內文 → `list_elements`），`$ref` 用 `0.pages.0.id` / `2.id`，一次成功；逐個呼叫要 7 輪 LLM 來回。之後**一次 `undo`** 頁面與 4 個物件全部消失、`canUndo: false`。
  - **失敗整批退回**：第 3 個操作 `fill: "red"` → `ops[3]（update_element）：參數 fill：…整批沒有套用，文件沒有改變。`，`list_pages` 確認沒有多出頁面。
  - **時間**（`tools/mcp_client.py` 經橋接程式，開發版）：單獨呼叫 `add_text` 100 次 4526 ms（45 ms / 次）；`batch` 100 個 79 ms、200 個 25 ms（第一次較慢應是暖機），都是一次 `undo` 回到 0 個物件。批次在 App 端只重畫一次，比逐個呼叫快約 100 倍；對 LLM 來說省下的主要是來回次數。
  - 測試內容都已復原，文件回到一頁空白頁。
- 2026-10-21：步驟 1–5 commit `d646f18`（階段 1）。
- 2026-10-21：**步驟 6 完成**：`sdk/python/`（`pyproject.toml`（`magazine-sdk`、`uv_build`）、`magazine/client.py`（由 `tools/mcp_client.py` 搬來，測試用 `git mv`；多了環境變數 `MAGAZINE_MCP_EXE` 覆寫橋接程式路徑）、`magazine/__init__.py`、README、`.gitignore`、`uv.lock`）；`tools/mcp_client.py` 刪除，`tools/` 以 `[tool.uv.sources]` editable 依賴 SDK，5 支腳本改成 `from magazine.client import …`。**Python 改成 ≥ 3.13**：editable 安裝的 `.pth` 記著含中文的 repo 路徑，Python 3.12 用 cp950 讀 `.pth`，啟動時 `UnicodeDecodeError`；3.13 起先用 UTF-8（本機有 3.14.3，tools 的 venv 也換成 3.14）。pytest：SDK 4 項、tools 17 項；桌面版 `get_document` 13 ms。
- 2026-10-21：**步驟 7 完成**：`scripts/generate.py` 由 `src-tauri/mcp-tools.json` 產生 `magazine/_tools.py`：`ToolMethods` 每個工具一個 keyword-only 方法（必填在前、選填預設 `UNSET` 不送出、`None` 送 `null`），型別由 JSON Schema 粗略對應（`enum` → `Literal`、`anyOf` → 聯集、物件 / 陣列 → `dict` / `list`；tuple 的 `prefixItems` → `list[Any]`），docstring = 工具標題、說明與參數說明（中文不自動換行）。`batch` 不產生（留給 `Document.batch()`）。`tests/test_tools.py` 5 項：產生結果和檔案相同、每個工具都有方法、參數和 schema 一致、呼叫只送有給的參數、型別對應；SDK pytest 共 9 項。`CLAUDE.md` 的「新增工具」流程與 Commands 加上重新產生這一步。
- 2026-10-21：**步驟 8 完成**：`magazine/document.py`：`Document(ToolMethods)`（一般呼叫直接送；`batch()` 裡回傳 `Pending`，`pending["欄位"]` 是 `Ref`，收集時換成 `{"$ref": "N.路徑"}`，`Pending` 本身 = `"N"`；離開時一次 `batch`，結果填回 `pending.result`；失敗丟 `BatchError(index, tool)`（從 `ops[N]（工具）` 解析）；區塊例外或沒有呼叫 → 不送；不能巢狀；超過上限在收集時就丟 `ValueError`）、`magazine.connect(bridge=None, profile=…)` 回傳 `Document`。前一批的 `Ref` 之後再用時送實際的值。上限 `BATCH_OPS_MAX` 由產生器從 `batch` 的 `maxItems` 寫進 `_tools.py`（不手寫第二份）。`run_command` 等不能放進批次的工具不在 SDK 另列，交給 App 拒絕（避免重複清單）。`tests/test_document.py` 6 項，SDK pytest 共 15 項；桌面版：一批 4 個操作（新增頁面 → 標題 → 修改 → 查詢）16 ms、`x = 60`，錯誤批次 `BatchError 1 add_text`，一次 `undo` 回到原本的頁數。
- 2026-10-21：**步驟 9 完成，全部完成**：範例 `sdk/python/examples/one_page.py`（`get_document` 取紙張寬度 → 一個 batch 5 個操作：新增頁面、標題、連「文字」色票的分隔線、帶字的圓角色塊、內文），桌面版 batch 11 ms、新頁面 4 個物件，一次 `undo` 回到原本的頁數；`tests/test_document.py` 加範例的測試（假的 session），SDK pytest 共 16 項。第一次執行遇到「App 沒有在 30 秒內回應」：`tauri dev` 下在 repo 裡新增檔案讓視窗重新載入，重跑即可（README 註明）。文件：SDK README（用法、範例）、`tools/README.md`、`MCP-工具清單.md`、`CLAUDE.md`（MCP 章節的 Python SDK、目前階段）。
- 2026-10-21：步驟 6–9 commit `4d18261`；和 `d646f18` 一起推送。
- 2026-10-21：**追加**：使用者問 LLM 會不會自動用批次 → 不會強制，由 LLM 判斷。使用者選擇在橋接程式的伺服器說明（`src-tauri/src/bin/magazine-mcp.rs` 的 `INSTRUCTIONS`，MCP `initialize` 回給 Claude Code，所有專案都看得到）加一段：兩個以上的修改（多個物件、多頁版面、新增後立刻修改）用 `batch`、`$ref` 取前面的 id、只做一個修改直接呼叫。重編橋接程式，以 `initialize` 確認說明送出。Claude Code 要 `/mcp` 重連才會讀到。
