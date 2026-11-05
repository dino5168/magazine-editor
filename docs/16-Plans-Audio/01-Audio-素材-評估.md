# 音訊素材：評估與規劃

> 需求：`1-Audio-素材.md`（仿照「工具面板 → 素材」加入音訊素材，編修書籍時可以加入音訊）。日期：2026-11-05。
> 狀態：**已回覆（2026-11-05），實作計畫見 `02-Audio-素材-實作.md`**（本文件的 §5 步驟已被取代）。
> 前身：`docs/15-Pland-Mp4/1-加入hyperlink-Mp4-實作.md` 的「A 階段：音訊」（A1–A3）。本文件把那三步拆細、補上檢核出來的問題；定案後以本文件為準，影片計畫的 A 階段改成指向這裡。

---

## 0. 結論先講

- **可行，而且大部分輪子已經有了**：素材庫早就能匯入音訊（mp3 / wav / ogg / m4a，看檔頭、≤ 50 MB、存在 `assets/audio/`），只是「不能放到頁面」；頁面上也已經有「多媒體物件」`media`（影片）。音訊 = **`media` 多一種來源**，不新增物件類型。
- 要新做的只有四塊：① 文件模型 `source: file`（v19）② 畫布 / 屬性面板的音訊外觀與試聽 ③ 各種匯出怎麼放音訊 ④ 翻頁書裡的播放器。
- 和影片最大的不同是**好消息**：音訊是書裡自己的檔案，**雙擊 `index.html` 也能播**（沒有 YouTube 的 `file://` 限制）。
- 最大的風險：**上傳到網站**（web-magazine 白名單沒有音訊副檔名、上限 100 MB）與 **EPUB 只接受部分音訊格式**（wav 不是核心媒體類型）。

---

## 1. 現況（已經有、可以重用的）

| 已經有 | 位置 | 這次怎麼用 |
|---|---|---|
| 素材庫 `audio`：匯入、檔頭檢查、50 MB 上限、分類、垃圾桶、類別篩選 | `lib/library/*`、Rust `project/assets.rs`、`library.rs` | **不改匯入**；只把「不能放到頁面」拿掉 |
| 「素材」工具面板：點一下放到中央、拖到畫布放在游標處 | `panels/library-panel.tsx`（`placeable = kind !== "audio"`）、`use-place-library-item.ts` | 音訊走**同一條**放置路徑，多一個分支 |
| 素材管理視窗的「放到目前頁面」 | `library-info.tsx`（`canPlace`） | 同上 |
| 頁面物件 `media`（外框、`poster`、`title`、Transformer、圖層、屬性面板分頁） | `types.ts`、`video-fields.tsx`、畫布 renderer | 加 `source.kind: "file"`，畫法換成喇叭圖示 |
| 封面 = `ShapeImage`（重用圖片框欄位、`photoPlacement`） | `PhotoFields` | 音訊也可以換封面（例如專輯封面），不另做 |
| Rust 把 `media` 拆成「深色底 + 封面 + 圖示」，PDF / PPTX / `render_page` / 翻頁書都不用新的繪製程式 | `export/render.rs` 的 `media_elements` | 圖示換成喇叭；連結改成「音訊」 |
| 翻頁書：頁面上最上層的透明 `<a class="el link">` + `viewer.js` 在**書以外**的一層播放 | `markup.rs`、`viewer.js` 的影片段 | 音訊播放器照同一個模式（避開 page-flip 複製頁面） |
| 匯出完提示略過幾張圖片（`skippedImages`） | 匯出結果 | PDF / PPTX 提示「音訊不能播放」 |
| MCP `list_library_items`（已有 `audio`）、`place_library_item`（現在拒絕音訊） | `lib/automation/edits.ts` | 拿掉拒絕 |

---

## 2. 設計建議

### 2.1 頁面上的樣子：小按鈕，不是播放列

- **建議：預設是 48 × 48 pt 的圓形喇叭按鈕**（可以拉大、換封面變成「封面 + 喇叭」的卡片）。理由：雜誌裡的音訊多半是「旁白 / 訪談片段 / 配樂」，按鈕放在標題或照片旁邊就好；播放列（進度條、時間）在 PDF / PPTX 畫不出來，而且 Konva 上要做假的。
- 播放控制（進度、時間、暫停）交給**翻頁書的播放器**（§2.3），頁面上只有按鈕。
- 畫布上不播放（同影片）；屬性面板有**試聽**（`<audio controls>`）。

### 2.2 資料模型（v19）

```ts
type MediaOrigin =
  | { kind: "youtube"; videoId: string; start: number }
  | { kind: "file"; src: string };   // assets/audio/<hash>.<ext>
```

- **不加 `start`、音量、循環、自動播放**（§4 問題 3 決定要不要）：不先預留沒有 UI、沒辦法測的欄位。
- `src` 驗證：在 `assets/audio/` 底下、副檔名是那四種（Rust `validate_asset_path_in`，已經有）。
- `referenced_assets`：`media` 現在是 `filter_map` 回傳**一個**（封面）；音訊有封面 + 音訊檔**兩個**，要改成 `flat_map`。範本複製（`copy_assets` + `referenced_assets`）因此自動帶上音訊，不用改範本程式（步驟 2 用測試確認）。
- `title` 預設 = 素材名稱（去掉副檔名）。

### 2.3 翻頁書：書外一條「迷你播放列」

```
┌──────────────── 翻頁書 ────────────────┐
│   [頁面 ……  (🔊) ……]                    │
│                                         │
├─────────────────────────────────────────┤
│ ⏸  訪談：王小明      01:12 / 03:40  ✕   │  ← #audio 播放列（書之外，固定在下方）
└─────────────────────────────────────────┘
```

- 點頁面上的喇叭 → 下方出現播放列並開始播放；再點同一個 = 暫停。點另一個音訊 = 換曲。
- `<audio>` 只有**一個**，放在 `#book` 之外（同影片播放層、放大檢視；page-flip 翻頁時會複製頁面，`<audio>` 放在頁面裡會被複製、重新載入）。
- **翻頁時要不要停？** 見 §4 問題 2（建議：不停，讓讀者邊聽邊翻；按 ✕ 才停）。
- 音訊檔複製到書的 `media/audio-<n>.<ext>`（同圖片改名的做法），CSP 加 `media-src 'self'`（只在有音訊的書加，同影片的 `frame-src`）。
- 不做自動播放：瀏覽器規定要使用者先點過才能出聲，做了也不可靠。

### 2.4 各種輸出

| 輸出 | 音訊 | 理由 |
|---|---|---|
| 編輯畫布 | 喇叭按鈕（或封面 + 喇叭） | Konva 不能播放 |
| 屬性面板 | 試聽、標題、換封面、「換成別的音訊」（從素材庫選） | — |
| 翻頁書 | 迷你播放列（§2.3），`file://` 也能播 | 主要功能 |
| EPUB | `<audio controls>` + manifest | 只收 mp3 / m4a（§3 檢核 4） |
| PDF | 只有按鈕圖示，**不能播放**；匯出完提示「N 個音訊在 PDF 裡不能播放」 | Typst 不支援嵌入音訊；PDF 的多媒體標註閱讀器支援度很差 |
| PowerPoint / `render_page` | 只有圖示 | PPTX 內嵌音訊之後要的話另做 |

---

## 3. 規劃檢核（發現的問題與對策）

1. **App 的 CSP 沒有 `media-src`**（`tauri.conf.json`：`default-src 'self'`），屬性面板試聽的 `<audio src="asset://…">` 會被**靜默擋掉**。→ 加 `media-src 'self' asset: http://asset.localhost blob:`（瀏覽器模式用 blob URL）。照 `ipc.md` 的規則，CSP 改動列在步驟裡、桌面版實測。
2. **WebView2 透過 asset protocol 播音訊、拖進度條**：要伺服器支援 Range 請求，否則可能不能跳轉或一開始就失敗。→ **步驟 1 先做技術驗證**（素材管理裡試聽），不行再改成 Rust 讀檔給 blob（50 MB 以內可以接受）。
3. **`referenced_assets` 一個 `media` 只回傳一個檔案**：沒改的話開檔清理會**刪掉頁面上用到的音訊檔**（只放在頁面、已從素材庫永久刪除時）。→ 步驟 2 改成兩個，加測試。
4. **EPUB 的核心媒體類型只有 `audio/mpeg`（mp3）、`audio/mp4`（m4a）、`audio/ogg`（Opus）**：wav 不是，epubcheck 會報錯；ogg 若是 Vorbis 也不是。→ EPUB 裡 wav / ogg 只畫圖示、不放 `<audio>`，匯出完提示；或在匯入時建議用 mp3（§4 問題 5）。
5. **上傳白名單**（`upload::package::ALLOWED_EXTENSIONS`）沒有 `mp3 / m4a / ogg / wav`，網站會**靜默略過**，書裡按鈕按了沒聲音。→ 另開 web-magazine 工作階段加白名單（同 gif / txt 的做法）；本 repo 的白名單常數同步加。
6. **上傳上限 100 MB**：一個音訊最大 50 MB，兩個 wav 就可能超過。→ 匯出 / 上傳前算總大小，超過時錯誤訊息要說是音訊太大（現在的訊息只說套件太大）。
7. **網站的 sandbox**（不透明來源）會不會擋 `<audio>`：同源檔案的 `<audio>` 不走 CORS，理論上可以播，但要在 web-magazine 上傳後實測（列進步驟 6 的驗證）。
8. **page-flip 吃掉 `mousedown`**：影片步驟 6 已經驗證透明 `<a>` 放在每頁最上層可以點、不會被當成翻頁；音訊用同一種連結（`data-audio`），不另外處理。
9. **縮圖列的頁面複本**：步驟 7 已經拿掉縮圖裡的 `<a>`，音訊連結自然也拿掉（確認一次）。
10. **復原 / 重做**：音訊檔名是 SHA-256，寫入後不改，復原歷史可以安全引用（同圖片）。
11. **文件範本**：範本只說會複製 `assets/fonts|images`；`copy_assets` 依路徑複製，應該會建 `assets/audio/`，步驟 2 寫測試確認，**不確定的話這是 bug**。
12. **新增 `source` 種類，`switch` 漏改**：TS 的 `MediaOrigin` 是 union，`switch` 加 `never` 檢查就會編譯失敗；Rust 的 `match` 也會。不靠記憶，靠編譯器。
13. **瀏覽器模式（`npm run dev`）**：素材是 blob URL，試聽可以，但匯出不能測；翻頁書用 `flipbook_preview` 測。

---

## 4. 需要使用者決定的問題

1. **頁面上的外觀**：小喇叭按鈕（建議，§2.1），還是一條有進度的播放列？
2. **翻頁時音訊要不要停？**
   - A（建議）：不停，按 ✕ 或暫停才停。適合旁白、配樂。
   - B：翻到別頁就停。適合「這一頁的訪談片段」。
   - C：每個音訊物件自己設定（多一個欄位，v19 一起加）。
3. **要不要「播放範圍 / 循環 / 自動播放」？**（建議：這次都不做。自動播放瀏覽器會擋。）
4. **網址音訊（舊計畫 A3：`https://…mp3`、Podcast 連結）這次要做嗎？**（建議：不做，先把本機檔案整條路走通；之後再加 `source: url`。）
5. **wav / ogg 怎麼處理？**
   - A（建議）：照收；EPUB 裡只畫圖示並提示，翻頁書照常播放。
   - B：匯入時提醒「建議用 mp3，檔案較小、到處都能播」。
   - C：App 內轉檔成 mp3（要加編碼器，不建議）。
6. **素材卡片要顯示時間長度嗎？** 要的話：
   - A（建議）：顯示時才用 `<audio preload="metadata">` 讀，不存檔（不提升 `libraryVersion`）。
   - B：匯入時算好存進 `library.json`（v3，Rust 要加解碼套件）。
7. **入口**：除了素材面板，要不要「插入 → 音訊...」選單（選檔 → 自動加進素材庫「未分類」→ 放到頁面）？或把音訊檔**直接拖到畫布**？（建議：選單要；拖到畫布等使用者用過再說。）

---

## 5. 步驟（一次一步，每步可以單獨驗證與 commit）

| # | 步驟 | 內容 | 驗證 |
|---|---|---|---|
| 1 | 試聽（技術驗證，**不改檔案格式**） | CSP 加 `media-src`；素材管理資訊欄的音訊加 `<audio controls>`；（§4-6 選 A 時）卡片顯示時間長度。確認 WebView2 + asset protocol 能播、能拖進度條（§3 檢核 1、2） | 桌面版實測（使用者）+ 瀏覽器模式 `ui-verify` |
| 2 | 文件模型 `source: file`（v19，**沒有 UI**） | skill `bump-file-format`：`types.ts`、`validation.ts`、Rust `format/elements.rs` + `validate.rs`、`referenced_assets` 改成兩個檔案（§3-3）、範本複製測試（§3-11）、fixture 加一個音訊、`types.html`、`cross-language.md` | vitest + `cargo test` |
| 3 | 放到頁面 + 畫布 + 屬性面板 | `usePlaceLibraryItem` 加音訊分支（`audioFromItem`，48 × 48、標題 = 名稱）；素材面板與管理視窗拿掉「不能放到頁面」；畫布喇叭按鈕（有封面時封面 + 喇叭）；圖層圖示、`describeElement`；屬性面板「音訊」分頁（試聽、標題、封面、換音訊）；`switch` 加 `never` 檢查（§3-12）；（§4-7）選單「插入 → 音訊...」 | vitest + `ui-verify` |
| 4 | PDF / PPTX / `render_page` | Rust `media_elements`：音訊畫喇叭圖示（不包 `link`）；匯出結果多一個略過的音訊數量，前端提示 | `cargo test` + `export_preview` 疊圖 |
| 5 | 翻頁書播放列 | `markup.rs`：音訊連結 `data-audio`（書裡的 `media/` 檔）、複製音訊檔、有音訊才加 CSP `media-src 'self'`；`viewer.js` 的 `#audio` 播放列（播放 / 暫停 / 換曲 / 進度 / ✕、§4-2 的翻頁行為、Esc、鍵盤焦點）；縮圖裡沒有連結（§3-9） | `cargo test` + `flipbook_preview` + 無頭 Edge（`file://` 與 `http://` 各一次） |
| 6 | 上傳 | 本 repo `ALLOWED_EXTENSIONS` 加音訊、總大小提示（§3-6）；**另開 web-magazine 工作階段加白名單**（§3-5）；上傳後在網站實測（§3-7） | `cargo test` + 使用者實測 |
| 7 | EPUB | `<audio controls>` + manifest（mp3 / m4a），其他格式只畫圖示並提示（§3-4） | `epub_preview` + epubcheck |
| 8 | MCP（可選） | `place_library_item` 收音訊、`list_elements` / `get_element` 顯示音訊、`update_element` 改標題（skill `add-mcp-tool`） | `npx vitest run mcp-tools` |

**順序理由**：步驟 1 先處理唯一的技術未知數（WebView2 能不能播）；不行的話後面全部要換做法，越早知道越好。步驟 2 只有資料、沒有 UI，可以單獨測完。步驟 3 之後使用者就能在編輯器裡放音訊，匯出（4–7）再一種一種接。

每一步做完：更新本文件的「進度紀錄」，問使用者要不要 commit（不自動 commit）。

---

## 6. 不做（這次）

- 錄音、剪輯、音量調整、淡入淡出。
- 轉檔（wav → mp3）。
- 自動播放、循環、播放範圍（§4-3 若改變決定再加）。
- PPTX 內嵌音訊、PDF 內嵌音訊。
- 網址音訊（§4-4 若改變決定，做成步驟 9）。

---

## 7. 進度紀錄

| 日期 | 步驟 | 結果 |
|---|---|---|
| 2026-11-05 | 評估草案 | 待使用者回答 §4 |
| 2026-11-05 | 使用者回覆（`01-使用者回復.md`） | 1 小喇叭按鈕；2 翻頁就停；3 不做自動播放與循環；4 網址音訊列入擴充；5 先只做 mp3，wav / ogg 列入擴充；6 顯示時間長度；7 要選單。→ 實作計畫 `02-Audio-素材-實作.md` |
