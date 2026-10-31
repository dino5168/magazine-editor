# magazine-editor App 開發建議事項：讓 MCP 能「看到」頁面

> 來源：web-magazine 工作區用 MCP 編「翻頁書系統架構」文件時發現的需求（2026-10-31）。
> 本檔給 magazine-editor 的開發環境（Claude Code）執行用。**先讀懂現有 MCP 工具的實作方式，再照同樣的架構加新工具。**

## 背景與問題

- Claude Code 透過 MCP（`C:\Program Files\magazine-editor\magazine-mcp.exe`，stdio）操作使用者開著的 App：新增頁面、圖形、文字、線條等。
- 目前的工具都只回傳文字或 JSON，**Claude 看不到排出來的樣子**。位置只能用座標推算，常出這幾種問題：
  - 文字超出圖形外框，例如表格儲存格裡較長的字
  - 改了文字以後，下方物件被壓到。實例：目錄頁增加 4 行後，可能蓋到下面的說明框，只能靠估算行距來修
  - 線條標籤和其他物件重疊
- 結果就是每頁都要使用者自己翻頁檢查。

## 目標

新增兩個 MCP 工具，讓 Claude 做完一頁後能自己檢查：

1. `check_layout`：用程式檢查版面問題，回傳文字結果。準確、省 token，**優先做這個**
2. `render_page`：把頁面畫成 PNG 回傳，讓 Claude 看到實際畫面

Claude 的用法：做完一頁先跑 `check_layout`，有問題或需要確認視覺效果時，再用 `render_page`。

---

## 工具 1：`check_layout`

**用途**：找出一頁裡的版面問題。

**參數**
| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `pageId` | string，選填 | 省略時用使用者正在看的頁面 |

**回傳**（JSON，沒有問題時 `issues` 是空陣列）
```json
{
  "pageId": "...",
  "issues": [
    { "type": "textOverflow", "id": "<物件 id>", "summary": "圖形內文字「…」", "overflowPt": 6.5 },
    { "type": "overlap", "ids": ["<id A>", "<id B>"], "areaPt2": 120 },
    { "type": "outOfPage", "id": "<物件 id>" },
    { "type": "outOfMargin", "id": "<物件 id>" }
  ]
}
```

**要檢查的項目**
- `textOverflow`：
  - 圖形內文字排版後的高度超過圖形高度
  - 文字被截斷，或單行文字的寬度超過可用寬度
  - `overflowPt` 寫超出多少 pt
- `overlap`：兩個物件的外框重疊
  - 要排除刻意的疊放：
    - 圖形內的文字本身
    - 完全包住另一個物件的底框，例如透明或淺色的群組框
    - 線條和它連接的圖形
  - 排除規則先從簡單做起，可以只回報「文字物件」和「其他物件」的重疊
- `outOfPage`：物件超出頁面範圍
- `outOfMargin`：物件超出邊界，但仍在頁面內。只算「警告」等級

**實作提示**：App 要畫文字，本來就得算文字的換行和高度，直接重用那段排版結果就好，不要另外估算，否則會和畫面不一致。

---

## 工具 2：`render_page`

**用途**：把頁面畫成圖片回傳。

**參數**
| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `pageId` | string，選填 | 省略時用使用者正在看的頁面 |
| `maxWidth` | number，選填 | 輸出寬度（px），預設約 1200（A4 595 pt × 2 左右），上限建議 2000 |
| `region` | `{x, y, width, height}`，選填 | 單位 pt；只截這一塊，用同樣的 `maxWidth` 放大，方便看小字細節 |

**回傳**：MCP 的 image content
```json
{ "content": [
  { "type": "image", "data": "<PNG base64>", "mimeType": "image/png" },
  { "type": "text", "text": "page 3-3 書，595.28×841.89 pt，輸出 1200×1697 px" }
] }
```

**渲染要求**
- 和匯出、列印的結果一樣：要有主頁內容、頁碼、背景
- **不要畫**選取框、控制點、參考線、格線、邊界線這些編輯用的東西
- 在背景渲染：不切換使用者正在看的頁面，也不改變縮放和捲動位置
- 圖片大小要控制，太大會占用很多 context

**實作提示**
- 如果 App 匯出翻頁書時本來就會把頁面畫成圖，直接重用那段程式
- 如果畫布是 Konva：可以用離屏 stage 載入該頁，再呼叫 `stage.toDataURL({ pixelRatio })`。或是隱藏編輯用的圖層後，對頁面節點呼叫 `toDataURL`
- 走和現有工具一樣的路徑：`magazine-mcp.exe` 收到呼叫 → 透過現有 IPC 轉給 App → App 回傳 base64 → mcp 包成 image content

---

## 驗收標準

1. 在一頁放一個 30 pt 高的圖形，裡面塞三行 9 pt 文字：`check_layout` 要回報 `textOverflow`
2. 兩個文字框重疊：`check_layout` 要回報 `overlap`；正常的表格（每格一個相鄰的 rect）不能誤報
3. `render_page` 回傳的 PNG 在 Claude Code 裡看得到，內容和 App 畫面一致，而且沒有選取框
4. `render_page` 加 `region` 時，只回傳那一塊，而且是放大後的畫面
5. 呼叫兩個工具都不會切換使用者正在看的頁面，也不會產生復原紀錄
6. 兩個工具都可以放進 `batch`，看到的是批次進行到那一步的文件；和現有查詢工具一樣
7. 更新 MCP 的工具說明與 server instructions，寫清楚建議用法：做完一頁先跑 `check_layout`，需要時再用 `render_page`
