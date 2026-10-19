# MCP 工具清單（Claude Code 能呼叫的指令）

> 整理於 2026-10-15（commit `62d02d6` 之後）。單一資料來源是 `src/lib/automation/tool-definitions.ts`（工具名稱、說明、參數 schema），`src-tauri/mcp-tools.json` 由它產生。**工具有增減或參數改了，要同步更新這份文件。**
> 架構與決定見 `07-軟體增加McpServer-實作.md`、流程圖 `Claude-McpServer-System.html`；素材庫工具見 `11-mcpserver-addimage-實作.md`；圖形庫工具見 `../06-Plans-繪圖/01-繪圖-實作.md` 步驟 8。

---

## 1. 怎麼連上

1. 開啟桌面版 App（`npm run tauri dev` 或安裝版）。
2. App 裡「設定 → 偏好設定 → Claude Code 連線（MCP）...」打開「允許連線」（預設關）。開啟後 TopBar 會出現連線狀態圖示。
3. Claude Code 讀專案的 `.mcp.json`（server `magazine-editor` → `src-tauri/target/debug/magazine-mcp.exe`）。第一次要在 `/mcp` 核准；**工具清單改過、橋接程式重編之後，要在 `/mcp` 重新連線**才看得到新的工具與參數。

App 沒開或沒允許連線時，每個工具都回「連不到雜誌編輯軟體：請先開啟 App，並在…允許連線」。

---

## 2. 總覽

共 **32 個工具**：14 個唯讀（只查詢）、18 個會改文件或執行指令。

| 分類 | 工具 |
|---|---|
| 查詢 | `get_document`、`list_pages`、`list_elements`、`get_element`、`list_text_styles`、`list_shapes`、`list_fonts`、`list_swatches`、`list_library_items`、`list_commands` |
| 物件 | `add_text`、`add_shape`、`add_line`、`update_element`、`delete_elements`、`place_library_item` |
| 頁面與主頁 | `add_page`、`add_master`、`set_page_master`、`rename_page`、`set_page_background`、`rename_document` |
| 文字樣式 | `add_text_style`、`update_text_style`、`delete_text_style`、`apply_text_style` |
| 色票 | `add_swatch`、`update_swatch`、`delete_swatch` |
| 復原 | `undo`、`redo` |
| 選單 | `run_command` |

---

## 3. 共通規則

- **單位**：長度一律 pt（1/72 inch）。座標原點是頁面左上角，`x` / `y` 是物件外框（旋轉前）的左上角；`rotation` 是度數，順時針，繞外框左上角。
- **一次呼叫 = 一筆復原紀錄**：使用者可以 Ctrl+Z，或呼叫 `undo`。
- **頁面**：省略 `pageId` = 使用者正在看的頁面；指定別頁（或主頁）時**不切換**使用者的畫面。例外：`add_page`、`add_master` 和在 App 裡操作一樣，會切到新頁 / 新主頁。
- **顏色參數**（`textColor`、`shadow.color`、`fill`、`stroke.color`）：hex `#rrggbb` / `#rrggbbaa`（`aa` = 不透明度），或 `{ swatch: 色票名稱或 id, opacity?: 0–1 }` 連到文件色票（改色票時跟著變）。頁面 / 主頁背景只能是 `#rrggbb` 或 `{ swatch }`。
- **文字樣式欄位**（`add_text`、`add_shape` 的圖形內文字、`update_element`、文字樣式工具共用，都可省略）：`fontSize`、`font`（內建「黑體 / 明體 / 楷體 / 圓體」或專案字型的名稱 / id）、`bold`、`italic`、`underline`、`strikethrough`、`align`（`left` / `center` / `right` / `distributed` 首尾置中）、`textColor`、`shadow`（`{ color, offsetX, offsetY }` 或 `null`）、`lineHeight`（行距倍數 0.5–3）、`letterSpacing`（字距 ‰，−200–1000）、`indentLeft` / `indentRight`（左 / 右縮排，單位「字」= 字級的倍數，0–20）、`indentFirstLine`（首行縮排，字；負值 = 首行突排，不可小於 −indentLeft）。
- **參數驗證**：參數不合（型別、範圍、未知欄位）時回中文錯誤（「參數 xxx：…」），文件不會被改。
- **安全**：只接受本機、目前 Windows 帳號的連線；**沒有工具接受檔案路徑**。匯入字型、存檔、匯出、開檔都要使用者在 App 的對話框確認。

---

## 4. 查詢（唯讀）

| 工具                   | 回傳                                                                        | 參數（`*` = 必填）                                                                        |
| -------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `get_document`       | 文件名稱、頁數、主頁數、紙張尺寸（含各尺寸幾頁）、邊界、頁碼規則數、文字樣式數、色票數、有沒有未存檔、使用者正在看的頁面或主頁           | —                                                                                   |
| `list_pages`         | 頁面：第幾頁、id、名稱、寬高、背景（連到的色票名）、套用的主頁、物件數；主頁：id、名稱、以哪個主頁為基礎、寬高、背景、物件數、幾頁使用     | —                                                                                   |
| `list_elements`      | 一頁（或主頁）的物件：id、類型、圖層位置（0 = 最底層）、位置、尺寸、旋轉、摘要（文字開頭 / 圖形種類與填色 / 圖片路徑）、連到的文字樣式 | `pageId`（省略 = 正在看的頁）                                                                |
| `get_element`        | 單一物件的完整欄位、所在頁、圖層位置（頁面與主頁上的都找得到）                                           | `id*`                                                                               |
| `list_text_styles`   | 文字樣式：id、名稱、各欄位、連到的色票名、使用數                                                 | —                                                                                   |
| `list_shapes`        | 所有圖形：id、名稱、分類、預設大小；圖形庫圖形的參數（名稱、說明、`ratio` 0–1 比例或 `pt` 固定長度、範圍、預設）        | —                                                                                   |
| `list_fonts`         | 內建 4 套 + 專案字型：id、名稱、缺字時用的內建字型、有沒有粗體檔、授權、使用數                               | —                                                                                   |
| `list_swatches`      | 色票：id、名稱、`#rrggbb`、連到它的顏色數                                                | —                                                                                   |
| `list_library_items` | 素材庫：資料夾清單（id 給 `folderId` 用）與素材（id、名稱、種類、所在資料夾、檔案大小、是否在垃圾桶、圖片寬高、文字檔摘錄）    | `kind`（`image` / `text` / `audio`）、`query`（名稱包含）、`folderId`（含子資料夾）、`includeTrashed` |
| `list_commands`      | `run_command` 能用的選單指令（選單順序）：id、名稱、選單位置、快捷鍵、勾選狀態（勾選項目才有）、能不能執行（不能時附原因）     | —                                                                                   |

---

## 5. 物件

| 工具 | 用途 | 參數 |
|---|---|---|
| `add_text` | 新增文字（最上層），回傳 id | `text*`、`x*`、`y*`、`width`（換行寬，預設 280）、`rotation`、`style`（文字樣式名稱或 id：先取樣式的值再套這次的欄位）、文字樣式欄位、`pageId` |
| `add_shape` | 新增圖形（最上層），回傳 id；圖形撐滿 `x / y / width / height` 的外框 | `shape*`、`x*`、`y*`、`width*`、`height*`、`params`、`rotation`、`fill`（預設 `#64748b`）、`stroke`（`{ color, width, dash: solid / dashed / dotted / dashDot }` 或 `null`；`dashDot` = 點劃線）、`text`（圖形內文字）、`style`、`verticalAlign`（`top` / `middle` / `bottom`）、文字樣式欄位、`pageId` |
| `add_line` | 新增線條或箭頭（最上層），回傳 id（2026-10-15，`../06-Plans-繪圖/03-自由繪圖-實作.md` 步驟 13） | `points*`（**頁面座標**，2–500 個 `{ x, y }`）、`path`（`straight` 直線 / 折線（預設）、`smooth` 穿過每點的曲線）、`compound`（`single` / `double` 雙線，只給 straight）、`color`（預設 `#171717` 連「文字」色票）、`width`（預設 1）、`dash`（`solid` / `dashed` / `dotted` / `dashDot`）、`start` / `end`（`{ arrowhead: none / open / triangle, scale? 0.5–5 }`，預設沒有箭頭）、`pageId` |
| `update_element` | 修改一個物件，只改有給的欄位，回傳是否有變更 | `id*`；見下表 |
| `delete_elements` | 刪除同一頁（或同一主頁）的物件，回傳數量 | `ids*`（1–500 個） |
| `place_library_item` | 把素材庫的**圖片**放到頁面（最上層），回傳 id 與尺寸 | `item*`（素材 id 或完全相符的名稱）、`x`、`y`（省略的那一軸置中）、`width`（省略 = 和素材面板相同的大小；給了時高度依原圖比例）、`pageId` |

**`add_shape` 的 `shape`**（完整清單與參數用 `list_shapes` 查）：

- 基本：`rect`、`roundedRect`、`ellipse`、`triangle`、`star`（沒有 `params`；矩形圓角用 `update_element` 的 `cornerRadius`）。
- 圖形庫（28 個）：`arrowSplit`（分叉箭頭）、`rhombus`、`parallelogram`、`trapezoid`、`hexagon`、`octagon`、`cross`、`heart`、`cloud`、`process`、`document`、`card`、`note`、`cylinder`、`cube`、`internalStorage`、`tape`、`delay`、`dataStorage`、`step`、`pentagonArrow`、`arrowRight`、`arrowDouble`、`callout`、`calloutRound`、`ribbon`、`tag`、`banner`。
- `params`：`{ 參數名稱: 值 }`；`ratio` 參數給 0–1 的比例、`pt` 參數給 pt；省略的用預設值，超出範圍夾回；名稱不是那個圖形的參數時回錯誤並列出可用的名稱。

**`update_element` 依物件類型能改的欄位**（給了不屬於該類型的欄位會回錯誤、不做修改）：

| 物件 | 可以改 |
|---|---|
| 全部 | `x`、`y`、`rotation`、`width`（線條沒有 `width`） |
| 文字 | `text`、文字樣式欄位（文字顏色用 `textColor`，不是 `fill`；文字沒有 `height`） |
| 圖形 | `height`、`fill`、`stroke`、`cornerRadius`（只有矩形：一個數字，或 `[左上, 右上, 右下, 左下]`）、`shape`（換成另一個圖形，位置 / 大小 / 樣式 / 文字不變，參數用新圖形的預設）、`params`（圖形庫圖形，只改有給的）、`text`（圖形內文字，空字串 = 移除）、`verticalAlign`、文字樣式欄位（套用在圖形內文字） |
| 圖片 | `height` |
| 線條 | `points`（換掉所有點，頁面座標；不能和 `x` / `y` 同時給）、`path`、`compound`、`stroke`（不能是 `null`）、`start`、`end`（箭頭；只給 `arrowhead` 時保留原本的大小） |

`get_element` 對線條另外回 `pagePoints`（頁面座標，和 `add_line` / `update_element` 的 `points` 同一套）；`element.points` 是相對於 `x / y` 的座標。

一次呼叫可以同時換圖形並給參數，例如 `{ id, shape: "roundedRect", cornerRadius: 8 }`、`{ id, shape: "cylinder", params: { size: 30 } }`。

---

## 6. 頁面與主頁

| 工具 | 用途 | 參數 |
|---|---|---|
| `add_page` | 新增空白頁，回傳新頁 id，切到第一個新頁 | `count`（1–100，預設 1）、`pageNumber`（插在第幾頁旁邊，預設最後一頁）、`side`（`before` / `after`，預設 `after`）、`masterId`（套用的主頁；`null` = 不套用；預設沿用最後一頁的主頁） |
| `add_master` | 新增空白主頁，回傳 id 與名稱，切到編輯它 | `name`（預設 Master A、B…）、`parentId`（以哪個主頁為基礎；`null` = 無）、`background`（`#rrggbb` 或 `{ swatch }`） |
| `set_page_master` | 頁面套用主頁 | `pageIds*`、`masterId*`（`null` = 不套用） |
| `rename_page` | 頁面或主頁改名 | `pageId*`、`name*` |
| `set_page_background` | 頁面或主頁的背景色 | `pageId*`、`color*`（`#rrggbb` 或 `{ swatch }`） |
| `rename_document` | 文件改名 | `name*` |

主頁的內容用 `add_text` / `add_shape` 指定 `pageId` = 主頁 id 來加。主頁鏈最多 8 層、不能循環。

---

## 7. 文字樣式

| 工具 | 用途 | 參數 |
|---|---|---|
| `add_text_style` | 新增文字樣式 | `name*`、文字樣式欄位（省略的用內建「內文」的值） |
| `update_text_style` | 修改樣式；連到它的文字只改沒覆寫的欄位 | `style*`（名稱或 id）、`name`、文字樣式欄位 |
| `delete_text_style` | 刪除樣式；文字外觀不變、取消連結 | `style*` |
| `apply_text_style` | 讓物件（文字或圖形內文字）連到樣式並取樣式的值 | `ids*`、`style*`（`null` = 只取消連結） |

---

## 8. 色票

| 工具 | 用途 | 參數 |
|---|---|---|
| `add_swatch` | 新增色票（不透明） | `name*`、`color*`（`#rrggbb`） |
| `update_swatch` | 改名或改色；連到它的顏色一起變（各自的不透明度保留） | `swatch*`（名稱或 id）、`name`、`color` |
| `delete_swatch` | 刪除色票 | `swatch*`、`replaceWith`（改連到另一個色票；省略或 `null` = 保留顏色、取消連結） |

---

## 9. 復原與選單指令

| 工具 | 用途 |
|---|---|
| `undo` / `redo` | 和 Ctrl+Z / Ctrl+Y 相同：復原的是文件最近的一個變更，不論是 AI 還是使用者做的；沒有可復原的步驟時回錯誤 |
| `run_command` | 執行選單指令（`id*`），和點選單是同一個動作。會開對話框的指令只負責打開，不等使用者操作完 |

**`run_command` 的指令 id**（`list_commands` 可查目前是否可用）：

| 類別 | 指令 |
|---|---|
| 檔案 | `file.new` 新增、`file.open` 開啟、`file.save` 儲存、`file.saveAs` 另存新檔、`file.importImage` 匯入圖片、`file.exportPdf` 匯出 PDF、`file.exportFlipbook` 匯出翻頁電子書 |
| 專案管理 | `project.library` 素材管理、`project.templates` 文件範本（桌面版） |
| 設定對話框 | `settings.pageSetup` 頁面設定、`settings.pageNumbers` 頁碼管理、`settings.swatches` 色票、`settings.fonts` 字型、`settings.grid` 格線與參考線、`settings.mcp` Claude Code 連線 |
| 視圖開關 | `view.rulers` 尺規、`view.grid` 格線、`view.contentGuides` 內容區對齊線、`view.margins` 邊界參考線、`view.snap` 吸附格線 |
| 工具面板（打開 / 關閉） | `panel.templates` 範本、`panel.text` 文字、`panel.elements` 元素、`panel.upload` 素材、`panel.background` 背景、`panel.draw` 繪圖、`panel.properties` 屬性、`panel.styles` 樣式、`panel.pages` 頁面、`panel.layers` 圖層、`panel.resetLayout` 重設版面 |
| 還沒實作（回「尚未實作」，不執行） | `file.importPages`、`file.exportPng`、`file.exportJpeg`、`file.exportEpub`、`settings.themeLight`、`settings.themeDark`、`settings.themeSystem` |

---

## 10. 範例

```jsonc
// 1. 了解文件、取得頁面 id
get_document {}
list_pages {}

// 2. 在第 1 頁放一個帶字的雲（圖形庫）與一支粗箭頭（調整頭部長度）
add_shape { "shape": "cloud", "x": 60, "y": 80, "width": 200, "height": 120,
            "fill": "#e0f2fe", "stroke": { "color": "#0284c7", "width": 2, "dash": "dashed" },
            "text": "今日重點", "fontSize": 18, "bold": true }
add_shape { "shape": "arrowRight", "x": 280, "y": 120, "width": 120, "height": 50,
            "params": { "head": 0.4 } }

// 3. 把雲換成圓角對話框，尾巴放右邊
update_element { "id": "<雲的 id>", "shape": "calloutRound", "params": { "position": 0.8 } }

// 4. 連到色票：填色用「品牌紅」50% 不透明
update_element { "id": "<id>", "fill": { "swatch": "品牌紅", "opacity": 0.5 } }

// 5. 不滿意就復原
undo {}
```
