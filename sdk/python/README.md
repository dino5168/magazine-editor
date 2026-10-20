# magazine-sdk

用 Python 操作正在執行的「雜誌編輯軟體」（magazine-editor）。走的是 Claude Code 同一條路：啟動 MCP 橋接程式 `magazine-mcp.exe`，經 named pipe 把工具呼叫交給 App。

> 計畫：`docs/09-Plans-Scripts/1-python-scripts-實作.md`。使用者是 LLM（Claude Code 寫腳本）與開發者自己。

## 前置條件

- App 開著，「設定 → 偏好設定 → Claude Code 連線（MCP）」打開。
- 橋接程式已經編好：預設用 `src-tauri/target/release/magazine-mcp.exe`；也可以設環境變數 `MAGAZINE_MCP_EXE`，或傳 `connect([路徑])`。

## 用法

```python
import magazine

with magazine.connect(profile="debug") as doc:      # 或 connect("路徑/magazine-mcp.exe")
    print(doc.get_document())                       # 一般呼叫：一次 MCP 呼叫 = 一筆復原

    with doc.batch():                               # 收集呼叫，離開時送出一次 batch = 一筆復原
        page = doc.add_page()
        page_id = page["pages"][0]["id"]            # 還沒有值：送出時變成 {"$ref": "0.pages.0.id"}
        title = doc.add_text(pageId=page_id, text="本期焦點", x=40, y=40, style="標題")
        doc.update_element(id=title["id"], x=60)
    print(title.result)                             # 送出後才有結果
```

- 每個 MCP 工具都是 `doc` 的方法，參數名稱照 MCP 原樣（`pageId`），一律用關鍵字傳；說明見各方法的 docstring 或 `docs/01-Plans-2026-10/MCP-工具清單.md`。`doc.call("工具", {...})` 用名稱呼叫。
- **`batch()`**：裡面的呼叫回傳 `Pending`；用 `pending["欄位"]` 把結果的欄位交給同一批後面的呼叫。整批成功才套用（一筆復原），任何一個失敗就整批退回，丟 `BatchError`（`index` = 第幾個操作，0 起算；`tool`）。區塊裡發生例外或沒有呼叫時什麼都不送。一批最多 200 個操作；不能巢狀；`undo` / `redo` / `run_command` 不能放進批次（App 會拒絕）。
- 前一批的 `pending["id"]` 之後可以照樣當參數，送出的是實際的值。
- App 回錯誤時丟 `ToolError`（訊息是 App 的中文說明）。
- 底層用戶端：`magazine.client.connect([橋接程式])` → `session.call(tool, args)`（`tools/` 的腳本用它）。

## 範例

`examples/one_page.py`：用一個 batch 做好一頁（新增頁面、標題、連色票的分隔線、帶字的色塊、內文），在 App 按一次 Ctrl+Z 整頁撤銷。

```powershell
cd sdk/python
uv run python examples/one_page.py --profile debug
```

> 用 `npm run tauri dev` 時，在 repo 裡新增或修改檔案可能讓視窗重新載入，這時的第一個呼叫會「App 沒有在 30 秒內回應」，再執行一次即可。

## 開發

```powershell
cd sdk/python
uv sync
uv run pytest
uv run python scripts/generate.py   # App 的工具清單（src-tauri/mcp-tools.json）改了之後
```

`magazine/_tools.py` 由 `scripts/generate.py` 產生（每個 MCP 工具一個方法，參數名稱照 MCP 原樣，例如 `pageId`；省略的選填參數不送出，`None` 送成 JSON `null`），不要手改；`tests/test_tools.py` 檢查它和 `mcp-tools.json` 一致。`batch` 不產生方法（由 `Document.batch()` 提供）。
