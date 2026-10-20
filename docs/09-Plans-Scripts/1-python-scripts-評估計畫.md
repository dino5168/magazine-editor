# Python 腳本與批次操作：評估計畫

> 任務檔：`1-python-scripts.md`（同目錄）。日期：2026-10-21。
> 狀態：**評估，等使用者確認**。確認後才寫實作計畫，這份文件不改程式。

---

## 1. 結論（先講）

| 需求 | 可行嗎 | 建議 |
|---|---|---|
| 批次溝通（MCP 太慢） | **可行，成本低** | 新增一個 MCP 工具 `batch`：一次呼叫帶多個操作、可以引用前面操作的結果、全部成功才套用、**整批一筆復原**。只重用現有工具，不寫第二套邏輯。 |
| Python 腳本 | **可行** | 先做**外部 Python SDK**（腳本在 App 外面執行，經現有的 named pipe 操作 App）；這條路其實已經有雛形（`tools/mcp_client.py`、`tools/school_template/build.py`）。 |
| 照 Blender 把 Python 內嵌進 App | 技術上可行，**現在不建議** | Blender 能內嵌是因為資料就在 C 程式裡；我們的文件狀態在前端（React reducer），內嵌 Python 每個操作還是要跨 IPC 回到前端，換來 30–50 MB 的執行環境和打包、安全問題，沒有解決「慢」。之後若真的要「App 裡面的腳本視窗」，再評估第 6 節的兩個做法。 |

建議順序：**階段 1 `batch` 工具 → 階段 2 Python SDK → 階段 3（另外決定）App 內的腳本視窗**。每個階段都能單獨交付、單獨使用。

---

## 2. 「慢」到底慢在哪裡（現況量測）

`docs/00-需求分析/06-系統極限測試-報告.md`（2026-10-13，release build）：

- App 端處理一次 MCP 呼叫約 **8 ms**（`runTool` + reducer 只要 0.03–0.08 ms，其餘是 IPC 與重畫）；Python 腳本連續送 672 次只花 **7.9 秒**。
- 所以 **App 不慢**。慢的是 **Claude Code 每呼叫一次工具，就要 LLM 生成一次工具呼叫、等結果、再思考下一步**——每次是「秒」等級，而且每次都佔用上下文（token）。做一頁 10 個物件 = 10 輪對話。

推論：

1. 要解決的是「**LLM 的來回次數**」，不是 App 的執行速度。只要讓 LLM **一次送出很多操作**，就解決了。
2. 內嵌 Python 不會讓 App 變快（已經 8 ms）；它能解決來回次數，只是因為「一段腳本 = 一次送出」——`batch` 工具用 JSON 就能做到同一件事，成本低得多。

另外，**今天就已經能批次**：Claude Code 可以用 Bash 寫一支 Python 腳本、經 `tools/mcp_client.py` 連續呼叫（學校雜誌範本就是這樣做的，`07-抓網頁產生範本-報告.md`）。它的缺點：

- 要有 uv / Python 與 Bash 權限；腳本不是 App 的功能，一般使用者用不到。
- **每個呼叫一筆復原，上限 100 筆**：大腳本做完沒辦法一路復原回去（`tools/README.md` 已經警告）。
- 中途失敗會留下做一半的文件。

`batch` 工具與 Python SDK 就是把這條路「產品化」並補上這三個缺點。

---

## 3. 方案比較

| 方案 | 解決 LLM 來回 | 給使用者寫腳本 | 新增的執行環境 | 成本 | 風險 |
|---|---|---|---|---|---|
| A. MCP `batch` 工具（JSON 操作清單） | ✅ | ❌（給 LLM 用） | 無 | 低：重用 `runTool` 全部 handler | 低 |
| B. 外部 Python SDK（經 named pipe） | ✅（LLM 寫腳本） | ✅（會 Python 的人） | 使用者自己的 Python | 低：`mcp_client.py` 改成套件、由 `mcp-tools.json` 產生函式 | 低；腳本有使用者的完整權限（跟一般 Python 程式一樣） |
| C. App 啟動外部 Python（「執行腳本...」選單＋輸出視窗） | ✅ | ✅ | 使用者自己的 Python（App 找不到就提示） | 中 | 中：要處理找不到 Python、「信任這支腳本嗎」 |
| D. Pyodide（WebAssembly 版 CPython）跑在 WebView 的 Worker 裡 | ✅ | ✅ | 內附約 10–25 MB wasm | 高 | 中高：CSP 要加 `'wasm-unsafe-eval'`、`worker-src`；Worker 同步呼叫主執行緒要 SharedArrayBuffer（需要 cross-origin isolation，Tauri 的自訂 protocol 要另外驗證），否則 API 全是 async |
| E. 內嵌 CPython（Rust PyO3 + 內附 Python，Blender 式） | ✅ | ✅ | 內附 30–50 MB | 很高 | 高：文件狀態在前端，Python 每個操作都要 Rust → 前端 → Rust；打包、升級 Python、第三方套件、執行緒都要自己處理 |
| F. JavaScript 腳本（Worker / QuickJS-wasm） | ✅ | ✅（會 JS 的人） | 無 / 小 | 中 | 中；但使用者要的是 Python |

**不重複造輪子**：A 重用現有的工具定義、zod 驗證與 handler；B 重用現有的 pipe、橋接程式與 `mcp_client.py`；兩者都不新增文件邏輯，也不需要第二份 API 文件（API = MCP 工具清單）。

---

## 4. 階段 1：MCP `batch` 工具（建議先做）

### 4.1 外觀（草案）

```jsonc
batch({
  "ops": [
    { "tool": "add_page",  "args": {} },
    { "tool": "add_text",  "args": { "pageId": { "$ref": "0.pages.0.id" }, "text": "標題", "x": 40, "y": 40, "style": "標題" } },
    { "tool": "add_shape", "args": { "pageId": { "$ref": "0.pages.0.id" }, "shape": "rect", "x": 40, "y": 100, "width": 200, "height": 120 } },
    { "tool": "update_element", "args": { "id": { "$ref": "2.id" }, "fill": { "swatch": "靛藍" } } }
  ]
})
// → { "results": [ {...}, {...}, {...}, {...} ] }   或   { "error": "第 3 個操作（update_element）：…" }
```

- `ops` 裡的每一項就是現有的一個工具呼叫，參數、驗證、錯誤訊息完全相同（LLM 不用學新東西）。
- `{ "$ref": "<第幾個>.<欄位路徑>" }`：換成前面某個操作回傳值的欄位（新物件 / 新頁面的 id）。只能引用**前面**的操作；找不到 → 該操作失敗。
- 上限：例如 200 個操作（之後依實測調整）。

### 4.2 規則

- **全部成功才套用**：在暫存的 state 上依序執行（純 reducer，本來就是這樣算結果的，見 `use-mcp-bridge.ts` 的 `apply`），任何一個失敗就整批放棄、文件不變，回報第幾個、什麼錯。
- **整批一筆復原**：成功後只 dispatch 一次。需要 reducer 新增一個 action（例如 `history/batch { actions }`：依序套用、只留一筆歷史），保持「reducer 是純函式」「一次工具呼叫 = 一筆復原」的既有原則。
- 批次裡**可以查詢**（`list_elements` 等，讀暫存的 state），**不能**：`undo` / `redo`、`run_command`（會開對話框、副作用不在文件裡）、巢狀 `batch`。
- 批次裡的 `add_page` 會切頁，照現有行為（最後停在哪一頁就顯示哪一頁）。

### 4.3 要確認的技術點

| 項目 | 現況 | 處理 |
|---|---|---|
| pipe 單行上限 | `MAX_LINE_BYTES` 1 MB | 200 個操作通常遠小於 1 MB；長文字可能超過 → 錯誤訊息要說清楚，或放寬上限 |
| 逾時 | Rust 等前端 30 秒 | 批次在前端同步執行、只重畫一次，200 個操作預估 < 1 秒，實測確認 |
| 回傳太大佔 LLM 上下文 | 每個操作都回傳結果 | 參數 `results: "all" | "ids" | "none"`（預設只回傳 id 與錯誤），待討論 |
| JSON Schema | `ops[].args` 只能寫成任意物件 | 說明文字指向各工具的 schema；驗證照樣由各工具的 zod 做 |
| 復原上限 | 100 筆 | 一批 = 一筆，反而解決腳本無法復原的問題 |

### 4.4 一步一步（草案，確認後細化成實作計畫）

1. 純邏輯：`$ref` 解析（`lib/automation/batch.ts`）＋測試。
2. reducer：`history/batch` action（依序套用、只留一筆歷史、沒變化回傳同一個 state）＋測試。
3. `runBatch`：暫存 state 上逐一 `runTool`、失敗整批放棄、成功一次 apply；禁止的工具；測試（`__tests__/tool-session.ts`）。
4. 工具定義：`TOOL_DEFINITIONS` 加 `batch`、更新 `mcp-tools.json`、重編橋接程式、更新 `MCP-工具清單.md`。
5. 實測：用 `tools/mcp_client.py` 送 200 個操作量時間；Claude Code 實際做一頁版面，比較呼叫次數與時間。

---

## 5. 階段 2：外部 Python SDK

把 `tools/mcp_client.py` 整理成給人用的套件（暫名 `magazine`）：

```python
import magazine

doc = magazine.connect()                 # App 要開著、MCP 連線要打開
page = doc.add_page()
with doc.batch():                        # 收集操作 → 結束時一次 batch 呼叫 = 一筆復原
    t = doc.add_text(page_id=page.id, text="標題", x=40, y=40, style="標題")
    doc.add_shape(page_id=page.id, shape="rect", x=40, y=100, width=200, height=120)
```

- **函式由 `src-tauri/mcp-tools.json` 產生**（名稱、參數、說明 docstring），工具清單是唯一資料來源，新增工具時 SDK 自動跟上，不手寫第二套 API。
- 連線：沿用橋接程式（stdio，最省事）；或 Python 直接開 named pipe（少一個程序）——第一版建議沿用橋接程式。
- `with doc.batch()` 依賴階段 1：裡面的呼叫先記下來、回傳「之後才知道 id」的參照，結束時轉成 `$ref`。
- 放在哪裡、要不要發布到 PyPI：待討論（見第 8 節）。

---

## 6. 階段 3（另外決定）：App 裡面的腳本視窗

只有在「**一般使用者要在 App 裡寫 / 執行腳本**」時才需要。兩個候選：

- **C. App 啟動外部 Python**：「工具 → 執行腳本...」選 `.py`，App 用使用者的 Python 執行、自動帶入 SDK，輸出顯示在面板。成本中等，但要使用者自己裝 Python；要有「這支腳本可以控制 App、也能讀寫你的檔案，確定執行？」的確認（同 Blender 的「自動執行 Python 腳本」信任設定）。
- **D. Pyodide**：免安裝，腳本跑在沙箱裡（不能碰檔案系統，比 C 安全），但 App 要多 10–25 MB、改 CSP，同步 API 要先做技術驗證。

兩者都是在階段 1、2 之上加一層 UI，API 不變。建議等階段 2 用過一段時間再決定。

---

## 7. 檢核（規劃有沒有問題）

- **有沒有重複造輪子**：沒有新的文件操作邏輯；`batch` 只呼叫現有 handler，SDK 由工具清單產生。✔
- **不破壞既有原則**：reducer 仍是純函式；「一次工具呼叫 = 一筆復原」仍成立（一次 batch 呼叫 = 一筆）；前端不傳路徑給 Rust、沒有工具接受檔案路徑。✔
- **安全**：`batch` 沒有增加任何能力（同一組工具）；pipe 本來就只接受本機、同一個 Windows 帳號。外部 Python 腳本本來就有使用者的完整權限，不是 App 新開的洞。階段 3 才需要「信任腳本」的設計。✔
- **風險 1**：LLM 寫 `$ref` 寫錯 → 錯誤訊息要指出第幾個操作、哪個 `$ref`。
- **風險 2**：全有全無對 LLM 不一定最好（失敗要整批重送）。可加 `atomic: false`（成功的照樣套用、仍是一筆復原），待討論。
- **風險 3**：`batch` 的 JSON Schema 無法描述每個操作的參數，LLM 靠其他工具的 schema 與說明；實測時觀察 LLM 寫錯的比例。
- **沒評估到的**：Claude Code 端本身的批次機制（例如同一輪平行呼叫多個工具）只對**互不相依**的操作有用，新增物件後要用它的 id 就不行，所以仍需要 `batch`。

---

## 8. 需要使用者決定的問題

1. **Python 腳本是給誰用的？**
   (a) 主要給 LLM / 開發者（你自己）→ 階段 1＋2 就夠；
   (b) 一般使用者也要在 App 裡寫腳本 → 之後要做階段 3。
2. **批次失敗時**：全有全無（建議預設）／成功的照樣套用／兩者都給（參數）？
3. **批次的復原**：整批一筆（建議）／每個操作一筆？
4. **Python SDK 放哪裡**：留在 repo 的 `tools/`（開發用）／獨立成 `sdk/python/` 之後可發布到 PyPI？
5. **階段 3 如果要做**，偏好哪一種：要求安裝 Python（C）還是內附 Pyodide（D）？（可以等階段 2 之後再決定）

---

## 9. 使用者的決定（2026-10-21）

1. 腳本只給 **LLM 和使用者自己**用 → 做階段 1＋2，不做 App 內的腳本視窗。
2. 批次失敗：**整批退回**（全有全無，不做 `atomic: false`）。
3. 批次成功：**整批一筆復原**。
4. Python SDK 獨立放在 **`sdk/python/`**（回覆寫成 `sdd/python/`，視為 `sdk` 的筆誤）。
5. 階段 3（App 內腳本視窗、外部 Python 或 Pyodide）：**用過一段時間再決定**。

實作計畫：[1-python-scripts-實作.md](1-python-scripts-實作.md)。

## 進度紀錄

- 2026-10-21：建立評估計畫，等使用者回覆第 8 節。
- 2026-10-21：使用者回覆（§9），建立實作計畫。
- 2026-10-21：階段 1（MCP `batch`）與階段 2（Python SDK `sdk/python/`）完成，見實作計畫的進度紀錄。階段 3 等使用一段時間再決定。
