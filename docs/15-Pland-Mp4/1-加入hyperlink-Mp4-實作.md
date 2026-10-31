# 加入多媒體（影片超連結 → 音訊）實作計畫

> 需求：`1-加入hyperlink-Mp4.md`。日期：2026-11-01。狀態：**§2 已決定（2026-11-01），可以開始步驟 1**。
> 順序：先做「影片超連結」（V 階段），再做「音訊」（A 階段）。一次做一步，每步可以單獨驗證與 commit。

---

## 0. 現況（已經有、可以重用的）

| 已經有 | 位置 | 這次怎麼用 |
|---|---|---|
| 素材庫有 `audio` 類別：可匯入 mp3 / wav / ogg / m4a（看檔頭、≤ 50 MB），**只能分類，不能放到頁面** | `lib/library/types.ts`、Rust `project/assets.rs` | A 階段直接接上，不另做匯入 |
| 圖片資產（SHA-256 檔名、縮圖、開檔清理、範本複製） | `project/assets.rs`、`referenced_assets` | 影片封面當成一般圖片資產存，不另做一套 |
| `reqwest` 0.13（Schannel） | 「下載免費字型」、上傳 | Rust 下載 YouTube 縮圖 |
| `tauri-plugin-opener` 的 `openUrl` | `font-catalog-picker.tsx` | 畫布上「在瀏覽器開啟影片」 |
| 翻頁書的「放大檢視」：書以外的另一層 | `export/flipbook/viewer.js` | 影片播放層照同樣做法（不放進翻頁的頁面裡） |
| 匯出管線：Typst（PDF / PPTX / `render_page`）、`markup.rs`（EPUB / 翻頁書共用） | `export/` | 影片在匯出時先「當成封面圖片」畫，再加連結 |

畫布（Konva）**不能放 iframe / video**，所以編輯器裡的影片一律是「封面圖 + 播放圖示」，播放交給瀏覽器。

---

## 1. 設計建議

### 1.1 Audio 與 MP4 是一種還是兩種素材？

**建議：素材庫裡兩種，頁面上一種物件。**

- **素材庫：兩種**（`audio` 已經有，新增 `video`）。理由：
  - 來源不同：音訊是**本機檔案**（也可以是連結），影片**只有連結**（不存檔案）。
  - 卡片長相不同：影片有封面縮圖，音訊是圖示 + 時間長度。
  - 篩選時使用者會想「只看影片」或「只看音訊」。
- **頁面物件：一種 `media`**，用 `source` 區分來源（YouTube / 檔案 / 網址）。理由：
  - 兩者在頁面上的行為一樣：一個外框、一張封面（或圖示）、點了就播放。
  - 新增物件類型要改十幾個地方（`editor-model.md`「新增物件類型」：types、geometry、畫布、Transformer、圖層、屬性面板、Rust format / render、`template.typ`、`markup.rs`……）；做一次就好，A 階段只是多一種 `source`，**不用再改一輪**。

### 1.2 素材庫要和圖片分開還是放一起？

**建議：放在同一個素材庫、同一棵資料夾樹，用「類別篩選」區分，不另開一個庫。**

- 現在素材庫本來就是「圖片 + 文字 + 音訊」混放（`kind`），使用者用資料夾分類（例如「第 3 期 / 訪談」裡同時有照片、逐字稿、影片）。分開會讓同一篇文章的素材散在兩個地方。
- 補一個**類別篩選**（全部 / 圖片 / 文字 / 影片 / 音訊）就能解決「太雜」的問題，比分成兩個庫簡單。
- 影片素材不佔檔案空間：`library.json` 只記網址 + 封面（封面是 `assets/images/` 的圖片）。

### 1.3 影片在各種輸出的樣子（建議）

| 輸出 | 影片 | 理由 |
|---|---|---|
| 編輯畫布 | 封面 + 播放圖示；屬性面板「在瀏覽器開啟」 | Konva 不能播放 |
| PDF | 封面 + **可點的連結**（Typst `link`，開瀏覽器） | PDF 不能嵌 YouTube |
| 翻頁書 V1 | 封面 + 播放圖示，點了**開新分頁**到 YouTube | 最穩：`file://` 與網站都能用 |
| 翻頁書 V2（**本次需求的主要功能，必做**） | 點了在**書上方的播放層**用 YouTube 官方播放器播放；`file://` 開啟時退回開新分頁 | 見 §3 的檢核 1、2 |
| EPUB | 封面 + `<a href>` | 閱讀器多半不允許遠端 iframe；EPUB 還沒接 UI |
| PowerPoint / `render_page` | 只有封面（點陣圖） | 之後要的話再加 PPTX 超連結 |

### 1.4 封面從哪來

- 貼上 YouTube 網址時，**Rust 下載縮圖**（固定主機 `i.ytimg.com/vi/<id>/hqdefault.jpg`，id 先驗證 11 個 `[A-Za-z0-9_-]`），存成一般圖片資產。
  - 不能讓前端直接顯示遠端圖片：App 的 CSP `img-src` 不允許，而且翻頁書要離線可看、`render_page` 要畫得出來。
- 沒有網路 / 下載失敗：物件照樣建立，畫成灰底 + 播放圖示；之後可以「重新抓封面」或**換成自己的圖片**（從素材庫拖一張上去，和圖片框一樣）。

### 1.5 資料模型草案（步驟 2 定案）

```ts
interface MediaElement extends BaseElement {
  type: "media";
  width: number; height: number;
  source:
    | { kind: "youtube"; videoId: string; start: number }   // V 階段
    | { kind: "file"; src: string }                          // A 階段：assets/audio/…
    | { kind: "url"; url: string };                         // A 階段：網址音訊（不收 .mp4 網址，§2 問題 2）
  poster: string | null;   // assets/images/…；null = 畫預設圖示
  title: string;           // 圖層面板、無障礙文字、PDF 連結的說明
}
```

- 檔案裡存 `videoId` 而不是原始網址：網址有很多寫法（`watch?v=`、`youtu.be/`、`shorts/`、`&t=1m30s`…），**解析只在一個純函式**做，存進檔案的是解析結果；匯出時由 id 組出標準網址。Rust 驗證 id 的格式與 `start` 範圍（不信任前端）。
- `poster` 要算進開檔清理（`referenced_assets`）與範本的 `imageSources`，和圖片框的照片一樣。

---

### 1.6 操作方式（2026-11-01 決定：先 A 再 B）

**A：直接放到頁面（步驟 4，主要方式）**

```
元素面板「影片」／選單「插入 → 影片連結」
   → 對話框貼上 YouTube 網址 → 顯示封面預覽與標題
   → 「加入」→ 影片放在目前頁面中央（16:9），並選取
```

- 捷徑（也在步驟 4）：畫布上 **Ctrl+V 貼上 YouTube 網址**、從瀏覽器**拖曳連結到畫布** → 直接變成影片物件（放在游標 / 放開的位置）。不是 YouTube 網址時照原本的貼上 / 拖放行為。
- 加入時**不自動存進素材庫**；屬性面板有「加入素材庫」按鈕（步驟 8 才出現）。

**B：素材庫（步驟 8）**

```
素材管理「新增影片連結」→ 貼網址 → 影片卡片（封面縮圖）
   → 拖到編輯畫面／「放到目前頁面」
```

- 和圖片素材同一條放置路徑（`usePlaceLibraryItem`）。

放到頁面後：選取影片，在屬性面板改開始時間、標題、換封面、重新抓封面、在瀏覽器開啟。

---

## 2. 需要使用者決定的問題（2026-11-01 已決定，結果見 §6）

1. **影片來源先只做 YouTube 嗎？**（建議：是。Vimeo 等之後再加一種 `source`。）
2. **直接的 `.mp4` 網址**（例如 `https://example.com/a.mp4`）要支援嗎？
   - 可以用 `<video src>` 播放，但**沒辦法自動產生封面**（要解碼影片），使用者要自己指定封面圖。
   - 建議：V 階段先不做，A 階段做「網址音訊」時一起做（同一種 `source: url`）。
3. **翻頁書要做到 V2（書內播放）嗎？** 還是 V1「開新分頁」就夠？（建議：先做 V1，驗證過再決定 V2。）
4. **要不要順便做「任何物件都可以加超連結」？**（文字、圖片、圖形點了開網址；PDF / 翻頁書都能點。）
   - 和影片無關，但實作路徑幾乎相同（PDF `link`、翻頁書 `<a>`），之後做會重走一次。
   - 建議：**另開一份計畫**，不放進這次；影片的連結輸出寫成可以共用的函式，之後直接接上。
5. **影片要不要在素材庫裡？**（建議：要，但放在步驟 8；先讓「貼網址 → 頁面上有影片」整條路跑通。）
6. **抓影片標題（YouTube oEmbed）** 當作預設名稱嗎？多一次網路請求；不抓就用「YouTube 影片」+ id。（建議：抓，失敗就用預設。）

---

## 3. 規劃檢核（發現的問題與對策）

1. **YouTube 內嵌在 `file://` 會失敗**：YouTube 要求內嵌頁面送出 Referer，本機開啟的 `index.html` 沒有來源，播放器會顯示錯誤。→ 翻頁書 V1 用「開新分頁」；V2 只在 `https:` 時內嵌，`file://` 退回開新分頁，iframe 加 `referrerpolicy="strict-origin-when-cross-origin"`。
2. **page-flip 翻頁時會暫時複製頁面**（`export.md`）：iframe 放在頁面裡會被複製、重新載入，翻頁動畫也會卡。→ 播放層放在 `#book` **之外**（同放大檢視），頁面裡只有封面圖。
3. **翻頁書的 CSP 是 `default-src 'none'`、沒有 inline script**：V1 的 `<a target="_blank" rel="noopener noreferrer">` 不受 CSP 影響；V2 要加 `frame-src https://www.youtube-nocookie.com`（用無 cookie 網域），點擊由 `viewer.js` 處理。
4. **翻頁區的 `mousedown` 被 page-flip `preventDefault`**：點封面可能被當成翻頁。→ 步驟 6 用瀏覽器實測；必要時封面連結 `stopPropagation`（放大檢視層有相同處理可以參考）。
5. **web-magazine 網站可能另外送 CSP 標頭**，會蓋過書裡的 meta。→ V2 之前在 web-magazine 工作階段確認（不在本 repo 改）。
6. **上傳白名單**（`upload::package::ALLOWED_EXTENSIONS`）沒有 mp3 / m4a / ogg / wav：A 階段的音訊檔會被網站略過。→ A 階段要另開 web-magazine 工作階段加白名單（同 gif / txt 的做法），並注意上傳上限 100 MB。
7. **App CSP 不允許遠端圖片**：封面一定要由 Rust 下載成本機資產（§1.4），不要改 CSP 讓前端載入 `i.ytimg.com`。
8. **使用者輸入的網址進 PDF**：只走 `data.json`（不拼進 Typst 程式碼，`export.md` 的規則）；Rust 只接受 `https:`、長度上限。V 階段由 `videoId` 組網址，根本不收任意網址。
9. **檔案格式**：新物件類型要提升 `SCHEMA_VERSION` 17 → 18（skill `bump-file-format`）；素材庫加 `video` 要提升 `libraryVersion` 1 → 2（Rust 是權威）。舊版 App 開新檔會說「檔案比較新」，這是預期行為。
10. **新增物件類型漏改 `template.typ` 會靜默不畫**（`editor-model.md`）：步驟 5 用 `render_page` / 疊圖確認 PDF 真的有封面。
11. **Rust 不認識的物件**：線條是「匯出前由前端換成路徑圖形」。影片**不採用這種做法**（前端換成圖片），因為 PDF 需要知道它是連結；Rust 認得 `media`，render 成「圖片 + 連結」。

---

## 4. 步驟

### V 階段：影片超連結（YouTube）

| # | 步驟 | 內容 | 驗證 |
|---|---|---|---|
| 1 | 網址解析（純函式） | `lib/media/youtube-url.ts`：`parseYouTubeUrl(text) → { videoId, start } \| null`，支援 `watch?v=`、`youtu.be/`、`shorts/`、`embed/`、`m.` / `music.` 網域、`t=90` / `t=1m30s` / `start=`；`youTubeWatchUrl(id, start)`。拒絕播放清單以外的奇怪輸入 | vitest |
| 2 | 文件模型 `media`（v18） | 照 skill `bump-file-format`：`types.ts`、`validation.ts`、Rust `format/elements.rs` + `validate.rs`（id 格式、`start` 0–86 400、`poster` 在 `assets/images/`）、`referenced_assets`、範本 `imageSources`、fixture（主頁放一個例子）、`types.html`。**還沒有 UI** | vitest + `cargo test` |
| 3 | 下載封面（Rust command） | `media_fetch_youtube_poster(videoId)`：驗證 id → `reqwest` 下載 `hqdefault.jpg`（逾時、≤ 2 MB、檢查檔頭）→ 走現有圖片資產寫入 → 回傳 `{ src, width, height }`；可選 oEmbed 標題（§2 問題 6）。只接受固定主機，不收前端網址 | `cargo test`（id 驗證、組網址）；實際下載手動試 |
| 4 | 畫布與插入（操作方式 A，§1.6） | 「插入影片連結」對話框（元素面板 + 選單）：貼網址 → 解析 → 抓封面 → 加到頁面中央（16:9）；捷徑 Ctrl+V 貼網址、拖曳連結到畫布。畫布 renderer（封面 + 播放圖示 / 沒封面的預設圖），`localBounds`、Transformer、圖層圖示、`describeElement`、屬性面板（網址、開始時間、標題、重新抓封面、換封面、在瀏覽器開啟） | skill `ui-verify`（瀏覽器模式不能抓封面 → 測預設圖） |
| 5 | PDF / PPTX / `render_page` | Rust `build_render`：`media` → 封面圖片（沒封面畫預設圖示）；PDF 外面包 `link(url)`；`template.typ` 的 `draw` | `cargo test` + `export_preview` 疊圖 + 用 PDF 閱讀器點連結 |
| 6 | 翻頁書 / EPUB V1 | `markup.rs`：封面 + 播放圖示 + `<a target="_blank" rel="noopener noreferrer">`（EPUB 不加 target）。確認 page-flip 點擊不被當翻頁 | `flipbook_preview` + 瀏覽器實測（`file://`） |
| 7 | 翻頁書 V2（**主要功能**） | `viewer.js` 播放層（書之外、`youtube-nocookie.com/embed/<id>?start=`），CSP `frame-src`；`file://` 退回開新分頁；關閉時移除 iframe（停止播放） | 本機 https 伺服器 + `file://` 各測一次；web-magazine 上傳後實測 |
| 8 | 素材庫 `video`（操作方式 B，libraryVersion 2） | Rust `library.rs` + TS types + fixture；「新增影片連結」按鈕；屬性面板「加入素材庫」；影片卡片（封面縮圖）；拖到頁面 / 「放到目前頁面」；**類別篩選**（全部 / 圖片 / 文字 / 影片 / 音訊） | vitest + `cargo test` + `ui-verify` |
| 9 | MCP（可選） | `add_media`（skill `add-mcp-tool`）；`list_elements` / `get_element` 顯示影片 | `npx vitest run mcp-tools` |

### A 階段：音訊

| # | 步驟 | 內容 | 驗證 |
|---|---|---|---|
| A1 | 本機音訊放到頁面 | `source: { kind: "file", src: "assets/audio/…" }`（模型在步驟 2 已預留，只需開放驗證）；素材庫移除「不能放到頁面」；畫布是喇叭圖示按鈕（可換封面）；屬性面板試聽（`<audio>` 用 asset URL，要加 CSP `media-src asset:`） | vitest + `ui-verify` |
| A2 | 匯出音訊 | 翻頁書：音訊檔複製到書的 `media/`，`viewer.js` 點擊播放 / 暫停，CSP `media-src 'self'`；EPUB：`<audio>` + manifest；PDF / PPTX：只有圖示（本機音訊無法在 PDF 播放，匯出完提示數量，同 `skippedImages`）。**另開 web-magazine 工作階段加上傳白名單**（§3 檢核 6）+ 檢查 100 MB 上限 | `flipbook_preview` + 瀏覽器；`epub_preview` + epubcheck |
| A3 | 網址音訊 | `source: { kind: "url" }`：只收 `https:`；PDF 是連結，翻頁書用 `<audio>` 播放（CSP `media-src https:`） | 同上 |

每一步做完：更新本文件的「進度紀錄」，問使用者要不要 commit（不自動 commit）。

---

## 5. 不做（這次）

- 本機 mp4 檔（需求明確排除：檔案太大）；直接的 `.mp4` 網址（無法自動產生封面，§2 問題 2）。
- YouTube 以外的影片網站（之後要再加一種 `source`）。
- 在編輯器畫布裡播放影片。
- 影片自動播放、循環、字幕、播放清單。
- PowerPoint 裡的可點連結 / 內嵌影片。
- 任意物件的超連結（§2 問題 4：另開計畫；影片的連結輸出寫成可共用的函式）。

---

## 6. 進度紀錄

| 日期 | 步驟 | 結果 |
|---|---|---|
| 2026-11-01 | 計畫草案 | 待使用者回答 §2 |
| 2026-11-01 | §2 決定 | 1 只做 YouTube；2 不支援 .mp4 網址；3 先開新分頁（步驟 6），書內播放（步驟 7）是主要功能、必做；4 任意物件超連結另開計畫；5 影片進素材庫（步驟 8）；6 抓 oEmbed 標題，失敗用預設 |
| 2026-11-01 | 操作方式 | 先 A（直接放到頁面，步驟 4）再 B（素材庫，步驟 8）；加入時不自動存素材庫，屬性面板「加入素材庫」；做 Ctrl+V 貼網址、拖曳連結兩個捷徑（§1.6） |
| 2026-11-01 | 步驟 1 完成 | `src/lib/media/youtube-url.ts`：`parseYouTubeUrl`（watch / youtu.be / shorts / embed / live / v、m. / music. / nocookie 網域、可省略 scheme；`t` / `start` / `#t`，讀不懂當 0、超過 `YOUTUBE_START_MAX_SECONDS` 夾住；其他網站、頻道、純播放清單、id 不是 11 碼都回 `null`）、`youTubeWatchUrl`、`isYouTubeVideoId`、`parseDuration`。測試 `__tests__/youtube-url.test.ts` 10 項通過，`tsc` 通過。`YOUTUBE_ID_PATTERN` / `YOUTUBE_START_MAX_SECONDS` 在步驟 2 寫 Rust 對應時加進 `cross-language.md` |
