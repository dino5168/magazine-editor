# 音訊素材：實作計畫

> 需求：`1-Audio-素材.md`。評估：`01-Audio-素材-評估.md`。使用者回覆：`01-使用者回復.md`。日期：2026-11-05。
> 狀態：**步驟 1–6、8、9 完成（2026-11-05，`e25387f`…`ce91f23`）；步驟 7 的本機部分等 web-magazine 回報**（`03-web-magazine-音訊上傳-建議.md`）。一次做一步，每步可以單獨驗證與 commit（不自動 commit）。
> 取代 `docs/15-Pland-Mp4/1-加入hyperlink-Mp4-實作.md` 的「A 階段：音訊」（A1–A3）。

---

## 0. 決定（2026-11-05，使用者回覆）

| # | 問題 | 決定 | 對計畫的影響 |
|---|---|---|---|
| 1 | 頁面上的外觀 | **小喇叭按鈕** | 預設 48 × 48 pt 圓形按鈕；可以換封面（封面 + 喇叭） |
| 2 | 翻頁時要不要停 | **翻頁就停** | 翻頁書 `flip` 事件 → 暫停並收起播放列；不需要新欄位 |
| 3 | 自動播放 / 循環 | **不做** | 播放範圍也不做（沒有要求），列入 §6 擴充 |
| 4 | 網址音訊 | **先不做，列入擴充** | `source` 只加 `file` |
| 5 | wav / ogg | **不處理，先只做 mp3，列入擴充** | 見下方「mp3 only 的做法」 |
| 6 | 素材卡片顯示時間長度 | **要** | 顯示時才讀（`<audio preload="metadata">`），不存檔、不提升 `libraryVersion` |
| 7 | 選單「插入音訊」 | **要** | 實際位置是「檔案 → 匯入 → 音訊...」（和「圖片...」「YouTube 影片連結...」放一起） |

### mp3 only 的做法（由決定 5 推出，**請確認**）

- **匯入不改**：素材庫照樣可以匯入 wav / ogg / m4a（已經能匯入的不拿掉，舊專案裡已有的素材不受影響），但**只有 mp3 能放到頁面**；其他格式的卡片維持「不能放到頁面」，提示改成「目前只支援 mp3」。
- **m4a 也算在「先不做」裡**：使用者只說 wav / ogg，但 m4a 和它們一樣要另外驗證（EPUB 型別、上傳白名單），一起列入擴充比較一致。
- 「檔案 → 匯入 → 音訊...」的選檔只收 `.mp3`。
- 檔案格式（v19）驗證：音訊物件的 `src` 必須是 `assets/audio/*.mp3`。之後加格式時放寬驗證（要再提升版本，舊版 App 才會說「檔案比較新」）。
- 好處：EPUB（`audio/mpeg` 是核心媒體類型）、上傳白名單（只加 `mp3`）、瀏覽器相容性都不用分格式處理。

---

## 1. 資料模型（步驟 2，v19）

```ts
type MediaOrigin =
  | { kind: "youtube"; videoId: string; start: number }
  | { kind: "file"; src: string };   // assets/audio/<sha256 前 32 碼>.mp3

// MediaElement 不變：width / height / source / poster / title
```

- **不新增物件類型**：音訊是 `media` 的另一種 `source`（影片計畫 §1.1 的決定）。
- 預設尺寸 48 × 48 pt、「限制寬高比」預設開；`title` 預設 = 素材名稱去掉副檔名（上限 `MEDIA_TITLE_MAX_CHARS`）。
- `referenced_assets`：`media` 現在回傳一個檔案（封面），改成 **封面 + 音訊檔兩個**（`flat_map`）。沒改的話，開檔清理會刪掉只用在頁面上的音訊檔。
- 範本：`copy_assets` 依 `referenced_assets` 複製，音訊應該自動帶上；步驟 2 用測試確認 `assets/audio/` 會被建立。
- 所有 `switch (source.kind)` / Rust `match` 不寫 `default` / `_`：漏改的地方由編譯器抓（Rust `media_elements` 現在是 `let MediaOrigin::Youtube {..} = …`，加了變體會編譯失敗，這是預期的）。

---

## 2. 各處的樣子

### 2.1 編輯器

- **畫布**：沒有封面 = 深色圓形 + 白色喇叭（喇叭本體多邊形 + 兩段聲波弧線）；有封面 = 封面（`photoPlacement`，同圖片框）+ 中央的半透明圓形喇叭（同影片的播放圖示比例）。
- **圖層面板**圖示：lucide `Music`（和素材卡片同一個）；`describeElement`：「音訊：標題」。
- **屬性面板**新分頁「音訊」（`audio-fields.tsx`，影片是 `video-fields.tsx`）：試聽（`<audio controls>`）、時間長度、標題、檔名 / 大小、「換成別的音訊」（從素材庫選 mp3）、「在素材管理中顯示」；「封面」區塊重用 `PhotoFields`。
- **素材卡片**：音訊卡片多顯示時間長度（例：`3:40`）。讀取方式見 §3 檢核 3。

### 2.2 翻頁書播放列（步驟 6）

```
┌──────────────── 翻頁書 ────────────────┐
│   [頁面 ……  (🔊) ……]                    │
├─────────────────────────────────────────┤
│ ⏸  訪談：王小明   ━━━●──── 01:12 / 03:40  ✕ │  ← #audio（書之外，固定在下方）
└─────────────────────────────────────────┘
```

- 點頁面上的喇叭 → 出現播放列並播放；再點同一個 = 暫停 / 繼續；點另一個 = 換曲。
- **翻頁就停**：`flip.on("flip")` → 暫停、收起播放列（從縮圖跳頁、方向鍵、拖曳翻頁都會觸發同一個事件）。
- 只有一個 `<audio>`，放在 `#book` 之外（page-flip 翻頁時會複製頁面）。
- 鍵盤：播放列的按鈕可以 Tab 到；Esc 停止並收起；空白鍵在按鈕上 = 播放 / 暫停。開著時方向鍵**照常翻頁**（翻頁就停，不用擋）。
- 播放中按喇叭的樣子：喇叭連結加 `aria-pressed`，CSS 讓它有外框提示「正在播放」。

### 2.3 輸出

| 輸出 | 音訊 |
|---|---|
| 翻頁書 | 播放列；`file://` 也能播（檔案在書裡） |
| EPUB | **只有喇叭圖示**（2026-11-05 決定，見進度紀錄步驟 8；可以點的做法列入 §6 擴充） |
| PDF / PPTX / `render_page` | 只有按鈕圖示；匯出完提示「N 個音訊在 PDF（PowerPoint）裡不能播放」 |
| 上傳到網站 | 書裡的 mp3 一起上傳（白名單要先加，步驟 7） |

---

## 3. 規劃檢核

1. **App 的 CSP 沒有 `media-src`**（`tauri.conf.json` 只有 `default-src 'self'`）：試聽會被靜默擋掉。→ 步驟 1 加 `media-src 'self' asset: http://asset.localhost blob:`。
2. **WebView2 + asset protocol 能不能播、能不能拖進度條**（需要 Range 請求）：唯一的技術未知數，放在步驟 1 驗證。不行的話改成 Rust 讀檔、前端用 blob URL（50 MB 以內），後面的步驟不受影響。
3. **讀時間長度的成本**：素材面板一次可能有很多音訊卡片。→ `audio-duration.ts`：依 `src` 快取在記憶體、最多同時 2 個（同縮圖）、卡片進入畫面才讀；讀不到顯示「—」。VBR 沒有 Xing 標頭的 mp3 瀏覽器會用估的，可以接受。
4. **`referenced_assets` 只回傳一個檔案** → §1，步驟 2 加測試（音訊只用在頁面、已從素材庫永久刪除，開檔清理後檔案仍在）。
5. **翻頁書要複製音訊檔**：現在只有 `images/`。→ 新增 `media/audio-<n>.mp3`（同圖片改名）；同一個檔案用在多處只複製一次。
6. **翻頁書 CSP**：`default-src 'none'`，要加 `media-src 'self'`，**只在有音訊的書加**（同影片的 `frame-src`）。
7. **縮圖列的頁面複本**已經拿掉 `<a>`（影片步驟 7），音訊連結自然也不在縮圖裡；測試確認一次。
8. **page-flip 吃掉 `mousedown`**：影片步驟 6 已驗證「每頁最上層的透明 `<a>`」可以點、不會被當成翻頁；音訊用同一種連結（`data-audio`），不另外處理。
9. **上傳**：`ALLOWED_EXTENSIONS` 沒有 `mp3`，網站會靜默略過。→ 本 repo 加 `mp3`；**另開 web-magazine 工作階段**加白名單（同 gif / txt）。上限 100 MB：音訊佔大部分時，錯誤訊息要說是音訊太大。
10. **網站 sandbox**（不透明來源）：同源 `<audio>` 不走 CORS，理論上能播；上傳後實測。
11. **瀏覽器模式**：素材是 blob URL，試聽、時間長度、放到頁面都能測；匯出用 `flipbook_preview` / `epub_preview` 測。
12. **新增指令**（`file.insertAudio`）：`menu-structure.test.ts` 會檢查有沒有放進選單；MCP `run_command` 讀同一份指令表，`list_commands` 自動出現（要不要重產 `mcp-tools.json` 看工具說明有沒有列舉指令，步驟 4 確認）。

---

## 4. 步驟

| # | 步驟 | 內容 | 驗證 |
|---|---|---|---|
| 1 | 試聽與時間長度（技術驗證，**不改檔案格式**） | CSP 加 `media-src`（§3-1）；`lib/media/audio-duration.ts`（快取、同時 2 個、`formatVideoTime` 改名或共用成 `formatMediaTime`）；素材卡片顯示時間長度；素材管理資訊欄加 `<audio controls>` 與時間長度。wav / ogg / m4a 照樣能試聽（只是不能放到頁面） | vitest（時間格式、快取）+ 瀏覽器模式 `ui-verify` + **桌面版使用者實測**：能播、能拖進度條、卡片時間正確 |
| 2 | 文件模型 `source: file`（v19，沒有 UI） | skill `bump-file-format`：`types.ts`、`validation.ts`（`isMediaOrigin` 收 `file`、只收 `assets/audio/*.mp3`）、Rust `format/elements.rs` + `validate.rs`、`referenced_assets` 兩個檔案（§3-4）、範本複製測試、fixture 加一個音訊（有封面 / 沒封面各一）、`types.html`、`cross-language.md`、`project-files.md`。Rust `build_render` 先略過音訊（步驟 5 才畫） | vitest + `cargo test` |
| 3 | 放到頁面、畫布、屬性面板 | `lib/library/audio-item.ts`（`isPlaceableAudio`：mp3；`mediaFromAudioItem`：48 × 48、標題）；`usePlaceLibraryItem`、素材面板、素材管理「放到目前頁面」接上（非 mp3 提示「目前只支援 mp3」）；畫布 renderer（§2.1）、`localBounds`、圖層圖示、`describeElement`、版面檢查；屬性面板「音訊」分頁 | vitest + `ui-verify`（點一下放中央、拖到畫布、試聽、換封面、換音訊、復原一筆） |
| 4 | 選單「檔案 → 匯入 → 音訊...」 | 指令 `file.insertAudio`：選 `.mp3` → `importFiles(files, null, ["audio"])`（加到未分類）→ 放到目前頁面中央（同 `importImage`）；底部工具列在影片按鈕旁加音訊按鈕（**請確認要不要**） | `menu-structure.test.ts` + `ui-verify` |
| 5 | PDF / PPTX / `render_page` | Rust `media_elements` 依 `source` 分支：音訊 = 圓形底（或封面）+ 喇叭（`RenderPolygon` + 兩段 `RenderPath` 弧線），**不包 `link`**；匯出結果多 `skippedAudio`，前端提示 | `cargo test` + `export_preview` 疊圖（畫布 vs PDF） |
| 6 | 翻頁書播放列 | `markup.rs`：音訊連結 `data-audio`（書裡的 `media/` 檔）+ `data-title`；複製音訊檔（§3-5）；有音訊才加 CSP（§3-6）。`viewer.js` / `viewer.css` 的 `#audio` 播放列（§2.2：播放 / 暫停 / 換曲 / 進度 / ✕ / 翻頁就停 / Esc） | `cargo test` + `flipbook_preview` + 無頭 Edge（`file://` 與 `http://` 各一次：播放、暫停、換曲、翻頁就停、拖進度、縮圖沒有連結、console 沒有錯誤） |
| 7 | 上傳 | 本 repo `ALLOWED_EXTENSIONS` 加 `mp3`、大小錯誤訊息（§3-9）；**另開 web-magazine 工作階段**加白名單；上傳後網站實測（§3-10） | `cargo test` + 使用者實測 |
| 8 | EPUB | `<audio controls src="…">` + manifest `audio/mpeg`，按鈕圖示當作後備 | `epub_preview` + epubcheck |
| 9 | MCP | `place_library_item` 收 mp3 音訊（其他格式回「目前只支援 mp3」）；`list_elements` / `get_element` 顯示音訊與 `src`；`update_element` 改 `title`；說明文字更新（skill `add-mcp-tool`）；新增 `add_audio`？→ 不做，用 `import_library_item` + `place_library_item` 就夠 | `npx vitest run mcp-tools` + Python SDK pytest |

**順序理由**：步驟 1 先排除唯一的技術未知數，而且不動檔案格式，做壞了容易回頭。步驟 2 只有資料，測完再接 UI。步驟 3、4 完成後使用者就能在編輯器裡放音訊並存檔；匯出（5–8）再一種一種接，每一步都能單獨驗證。

每一步做完：更新本文件的「進度紀錄」、問使用者要不要 commit。

---

## 5. 不做（這次）

錄音、剪輯、音量、淡入淡出；轉檔；自動播放、循環、播放範圍；PDF / PPTX 內嵌音訊；在畫布上播放；把音訊檔直接拖到畫布。

## 6. 擴充選項（之後再做）

| 擴充 | 要做的事 |
|---|---|
| 網址音訊（Podcast、`https://…mp3`） | `source: { kind: "url" }`、只收 `https:`、PDF 是連結、翻頁書 CSP `media-src https:`、提升版本 |
| wav / ogg / m4a 放到頁面 | 放寬驗證（提升版本）；EPUB：m4a 是 `audio/mp4`、ogg 只有 Opus 是核心型別、wav 不是（只畫圖示並提示）；上傳白名單加副檔名；或匯入時轉成 mp3 |
| 每個音訊自己設定「翻頁要不要停」 | 新欄位（提升版本）+ 屬性面板 + `viewer.js` |
| 播放範圍（開始 / 結束時間）、循環 | 新欄位 + 試聽 + 翻頁書 / EPUB（EPUB 用 media fragment `#t=`） |
| 把音訊檔直接拖到畫布 | 畫布的檔案拖放加音訊分支（匯入素材庫 → 放到放開的位置） |
| EPUB 裡可以播放 | 實測閱讀器的 `<audio controls>` 縮到按鈕大小時不能用（步驟 8）。候選：scripted EPUB（點喇叭播放 / 暫停，`properties="scripted"`，Apple Books / Thorium 可用）或按鈕旁放加寬的播放列。和 EPUB 改版（`0-Task/plan-epubv2.md`）一起設計 |
| PowerPoint 內嵌音訊 | PPTX `p:audioFile` + 媒體關聯 |

---

## 7. 進度紀錄

| 日期 | 步驟 | 結果 |
|---|---|---|
| 2026-11-05 | 計畫定案 | 依使用者回覆（§0）建立 |
| 2026-11-05 | 確認 | 使用者同意 §0 的「mp3 only 的做法」（匯入不改、只有 mp3 能放到頁面、m4a 一起列入擴充）；步驟 4 **底部工具列也加音訊按鈕** |
| 2026-11-05 | 步驟 1 完成（桌面版待使用者驗證） | App CSP 加 `media-src 'self' asset: http://asset.localhost blob:`（`ipc.md` 已更新）。**共用**：`lib/concurrency.ts` 的 `createLimiter`（從 `thumbnails.ts` 抽出，縮圖與音訊共用）。`lib/media/audio-duration.ts`：`loadAudioDuration`（不掛到 DOM 的 `<audio preload="metadata">`，15 秒逾時，`Infinity` / 錯誤回 null，讀完放掉連線）、`createDurationCache`（依 `src` 快取：`src` 是內容的 hash，換專案不用清）、`requestAudioDuration`（同時 2 個）。`components/library/use-audio-duration.ts`。**素材卡片**：`library-card.tsx` 把「接近畫面才開始」抽成 `useNearScreen`（縮圖與音訊共用），音訊卡片檔名右邊顯示長度（讀不到不顯示）。**素材管理資訊欄**：`<audio controls>` 試聽（換選取的素材時停止；按鍵不往外傳，Esc 除外）+「長度」列（讀取中… / 無法讀取）。時間格式沿用 `formatVideoTime`（不改名）。wav / ogg / m4a 照樣能試聽。測試：`audio-duration.test.ts` 2 項（limiter 依序、失敗也釋放；快取同 key 一次、同時 2 個），全部 1244 項通過、`tsc` 通過。**瀏覽器實測**（無頭 Edge，丟一個 3.5 秒的 WAV 進素材面板）：卡片顯示 `0:03`、資訊欄長度 `0:03`、`<audio>` duration 3.5、可以播放、跳到 3 秒成功、沒有 console 錯誤。**桌面版待使用者驗證**：asset protocol 能播 mp3、能拖進度條（§3 檢核 2） |
| 2026-11-05 | 步驟 1 commit | `e25387f` |
| 2026-11-05 | 步驟 2 完成 | **v19**（沒有升級步驟：v18 檔案照樣讀）。Rust：`MediaOrigin::File { src }`、`MEDIA_AUDIO_EXTENSIONS = ["mp3"]`（`mod.rs`）、`validate_media_origin` 的 `File`（`assets/audio/` 單純檔名 + 小寫副檔名）、`referenced_assets` 一個 media 回傳封面 + 音訊兩個檔、`build_render` **先略過音訊**（步驟 5 才畫；`media_elements` 對非影片回空）。TS：`MediaOrigin` 變 union，加 `YouTubeOrigin` / `AudioOrigin` / `VideoElement` / `AudioElement`；`validation.ts` 的 `MEDIA_AUDIO_EXTENSIONS`、`isMediaAudioSrc`（專案路徑同 Rust；瀏覽器模式的 blob URL 只看非空）；`lib/media/media-kind.ts`（`isVideoElement` / `isAudioElement` / `mediaKindName`）；`createMediaElement` 改成泛型（回傳的 `source` 型別跟著參數）。**編譯器抓到的地方**：屬性面板（音訊先只有「調整」分頁，名稱「音訊」；「影片」分頁只給影片）、`VideoTab` / `videoItemFromElement` 收 `VideoElement`、MCP 物件摘要（「音訊 assets/audio/…」）。**編譯器抓不到的**（patch 型別寬）：MCP `update_element` 的 `startSeconds` 對音訊回錯誤（否則會寫出 `{ kind: "file", src, start }`）、`describeElement`（沒標題時「音訊」）、版面檢查的名稱。畫布目前把音訊畫成影片的樣子（步驟 3 換成喇叭）。Fixture：主頁 B 加兩個音訊（沒封面 / 有封面）。範本複製：既有測試本來就檢查「所有引用的檔案都複製」，加一行確認有音訊。測試：Rust 3 項（讀音訊與引用、拒絕 11 種壞 source（wav / ogg / m4a / 大寫 / 沒副檔名 / 別的資料夾 / 路徑穿越 / 子資料夾 / 空 / 缺欄位 / url）、v18 檔照樣開）；vitest 3 項（`isMediaOrigin` 音訊、reducer 收 mp3 拒 wav / ogg、MCP 拒絕音訊的 startSeconds 但能改標題）。全部：vitest 1247、cargo 336 通過，clippy 仍是原本 5 個警告。文件：`types.html`、`project-files.md`（目前 19）、`cross-language.md`、`editor-model.md` |
| 2026-11-05 | 步驟 2 commit | `5c264e6` |
| 2026-11-05 | 步驟 3 完成 | **喇叭圖示的數字**在 `lib/media/speaker-mark.ts`（單位方塊裡的喇叭本體 6 點 + 兩段聲波（Konva `Arc`，90°）、按鈕底色 `#4338ca`、圖示 / 徽章比例；步驟 5 的 Rust 照抄同一組數字）。**畫布** `MediaNode`：音訊沒有封面 = 填滿外框的橢圓（48 × 48 時是圓）+ 喇叭；有封面 = 封面（同影片）+ 中央半透明圓形徽章裡的喇叭。**建立**：`element-factory.ts` 的 `createAudioElement`（`AUDIO_BUTTON_SIZE_PT` 48，置中）；`lib/library/audio-item.ts`（`isPlaceableAudio`：mp3、不在垃圾桶，桌面看路徑、瀏覽器看名稱；`audioTitleOf`：名稱去掉副檔名；`mediaFromAudioItem`；`AUDIO_FORMAT_NOTICE`）。**放到頁面**：`usePlaceLibraryItem` 加音訊（點一下放中央、拖到畫布放在放開處、素材管理「放到目前頁面」三條路都經過它）；非 mp3 提示「目前只有 mp3 能放到頁面」，卡片角標改成「只能用 mp3」，資訊欄說明依格式。**屬性面板**新分頁「音訊」（`audio-fields.tsx`）：試聽 `<audio controls>`（按鍵不外傳，Esc 除外）、長度、標題、「檔案」下拉選單換成素材庫裡的其他 mp3（標題是舊素材的預設名稱或空時跟著換，自己改過的保留，一筆復原）、封面（`PhotoFields`）；`Section` / `CommitField` 從 `video-fields.tsx` 匯出共用。**圖層**圖示 `Music`。**和計畫不同**：「在素材管理中顯示」沒有做（素材管理視窗目前不能指定選取哪一筆，要另外加入口；需要時再做）。測試：`audio-item.test.ts` 5 項（mp3 判斷四種情況、標題、48 pt 置中、喇叭圖示縮放與範圍）；全部 1252 項通過。**瀏覽器實測**（無頭 Edge，兩個「mp3」+ 一個 wav）：卡片時間 `0:03` / `1:05` / `0:02`、wav 角標「只能用 mp3」、點 wav 不新增並提示；點 mp3 → 48 × 48 置中、選取、標題「訪談」、分頁「音訊」開著、試聽 duration 3.5；換成「配樂」→ 換檔案與標題、只多一筆復原；拖到畫布 → 放在放開處；有封面、扁的、旋轉 20° 的樣子截圖確認；console 沒有錯誤 |
| 2026-11-05 | 步驟 3 commit | `68986ad` |
| 2026-11-05 | 步驟 4 完成 | 指令 **`file.importAudio`**「音訊（mp3）...」（計畫寫 `file.insertAudio`，改成和 `file.importImage` 同一種命名：這是匯入檔案，`insert` 是貼連結的影片），放在「檔案 → 匯入」的影片之後；底部工具列影片按鈕旁加音訊按鈕（`Music` 圖示）。`home-page.tsx` 的 `importAudio`（選單與工具列共用）：選檔只給 `.mp3`（`audio-item.ts` 的 `AUDIO_PICK_ACCEPT`，由 `MEDIA_AUDIO_EXTENSIONS` 產生）→ `importFiles(…, null, ["audio"])` 加到未分類 → 每個都走 `usePlaceLibraryItem` 放到目前頁面中央（副檔名是 mp3 但 Rust 看檔頭認出別的格式時，那一筆存成 wav 等，放置時提示只能用 mp3）。選多個檔案時疊在同一個位置（和匯入多張圖片相同）。MCP：`run_command` 的指令清單多一個 → `mcp-tools.json` 重新產生、Python SDK 重新產生（pytest 17 項）、橋接程式重編（舊檔改名 `.old` 後才編得過）、`MCP-工具清單.md`。**瀏覽器實測**（無頭 Edge，攔下選檔直接給檔案）：工具列按鈕 → 選檔 accept `.mp3`、放一個、一筆復原；「檔案 → 匯入」子選單是「圖片... / YouTube 影片連結... / 音訊（mp3）... / 其他專案的頁面...」，選兩個 → 兩個都放上；console 沒有錯誤。全部 1252 項通過。**使用者要 `/mcp` 重新連線**才看得到新的指令清單 |
| 2026-11-05 | 步驟 4 commit | `799872c` |
| 2026-11-05 | 步驟 5 完成 | Rust `render.rs`：`media_elements` 對音訊改走 `audio_elements`（不再略過），拆成既有的畫法，所以 PDF、PowerPoint、`render_page`、EPUB / 翻頁書的頁面**都不用新的繪製程式**：沒有封面（或封面檔不見，算進略過的圖片）= 填滿外框的 `Ellipse`（`#4338ca`）+ 喇叭；有封面 = 深色 `Rect`（封面是 `photo`）+ 徽章 `Ellipse` + 喇叭。喇叭 = 本體 `RenderPolygon` + 兩段聲波（扇環，Move / 外弧 / Line / 內弧 / Close）合成一個 `RenderPath`（外框座標，跟著旋轉），弧用新的 `arc_segment`（≤ 90° 一段三次曲線）。數字照抄 `speaker-mark.ts`（`cross-language.md` 已記）。**沒有連結**。前端 `export-request.ts` 的 `audioElementCount`（含主頁複本）：匯出 PDF / PowerPoint 後提示「有 N 個音訊：PDF 裡只有喇叭圖示，不能播放（翻頁電子書可以播放）」。測試：render 2 項（沒封面三個部件的位置 / 大小 / 聲波路徑在外框內與 45° 終點、沒有連結；有封面四個部件、旋轉 90° 的徽章位置、封面檔不見退回圓形並計數）、PDF 1 項（點陣化後按鈕色、喇叭本體、內外聲波白、兩圈之間與 ±45° 以外是按鈕色、沒有連結）、vitest 1 項（計數含主頁、不算影片）。**疊圖比對**（無頭 Edge 2× 截畫布 vs `export_preview` 的 2 px/pt PNG，兩個按鈕：80 × 80、96 × 64 轉 30°；各自以按鈕色外框對齊，取 41 × 41 點分類）：不同的點 41 / 1681、63 / 1681，全在反鋸齒的邊緣，形狀一致。全部：vitest 1253、cargo 339 通過，clippy 仍是原本 5 個 |
| 2026-11-05 | 步驟 5 commit | `05bae98` |
| 2026-11-05 | 步驟 6 完成（上傳要等步驟 7） | **Rust**：`RenderElement.audio`（`RenderAudio { src, title }`，放在按鈕的第一個部件；PDF / PPTX 不讀）。`html::collect_audio`（重用 `PageImages`：看檔頭只收 mp3（`assets::detect_audio_extension` 改成 `pub(crate)`）、`media/audio-<n>.mp3`、同一檔一次；不見 / 不是 mp3 時每個按鈕算進 `skipped_images`，按鈕照畫但不能播）。`page_div` 多一個 `audio` 參數（EPUB 傳空的，步驟 8 再接）；`audio_markup` 在頁面最上層寫透明的 `<a class="el link audio" href="media/…" data-audio role="button" aria-pressed="false" aria-label="播放音訊：標題">`（標題經 escape；圓形按鈕加 `border-radius:50%`；沒有 viewer 時點了直接開 mp3）。CSP：有音訊的書才加 `media-src 'self'`；Zip 裡 mp3 不壓縮。`PAGE_RULES` 加播放中的外圈。**viewer.js**「音訊」段：一個不放進頁面的 `<audio>` + 書上方置中的 `#audio` 播放列（播放 / 暫停鍵、標題、進度條、時間、✕；z-index 在放大檢視之上、影片層之下）；點同一個 = 暫停 / 繼續、點別的 = 換曲；**翻頁就停並收起**（`flip` 事件）、Esc 停止、✕ 停止；空白鍵在按鈕上也能按；Ctrl / Shift / ⌘ + 點擊照瀏覽器開檔。`aria-pressed` 依檔案標記：同一個檔案放在兩個按鈕時一起亮，同一跨頁上點另一個同檔的按鈕 = 暫停（同一段音訊）。**前端**：略過提示改成「圖片或音訊」（匯出與上傳對話框）。測試：翻頁書 3 項（檔案收進 `media/`、連結屬性與 escape、圓形外框、CSP、Zip 不壓縮；同一檔只收一次、檔案不見時沒有連結與 media-src 並計數；wav 內容被略過）；全部 vitest 1253、cargo 342 通過，clippy 仍是原本 5 個。**瀏覽器實測**（ffmpeg 產生兩個真的 mp3，4 頁的書，無頭 Edge，`file://` 與 `http://` 各一次）：CSP 有 `media-src 'self'`；點封面的按鈕 → 播放列出現、標題、時間走、按鈕外圈；再點 → 暫停、時間不動；翻到 2–3 頁 → 播放列收起；點 B 播放、點 A 換曲；Esc 收起；進度拉到 5 秒 → `0:05 / 0:06`；縮圖裡沒有連結；console 沒有錯誤。**還沒測**：放大檢視裡點音訊、手機寬度的版面。**上傳**：目前有音訊的書上傳會被拒絕（「網站不接受的檔案」），步驟 7 兩邊加 `mp3` 後才能上傳 |
| 2026-11-05 | 步驟 6 commit | `03f8d39` |
| 2026-11-05 | 步驟 7 交接（本機部分等網站） | 寫好 `03-web-magazine-音訊上傳-建議.md`（白名單加 `mp3`、檔頭規則、`Content-Type: audio/mpeg`、**`Range` / 206**（拖進度條需要）、sandbox 不用改但要實測、契約文件與測試、驗收清單、回報內容）。**順序**：網站先做並回報，本機才在 `ALLOWED_EXTENSIONS` 加 `mp3`（反過來會讓檔案被網站略過、按鈕沒聲音；現在是上傳前就拒絕，比較好）。本機剩下：加 `mp3`、檔案太大時說明音訊佔多少 |
| 2026-11-05 | 步驟 8 決定：EPUB 只畫圖示 | 試做 `<audio controls>`（manifest `audio/mpeg`、放在按鈕外框上）：epubcheck 0 錯誤，但 **Edge 把 64 px 的控制項縮成「⋮」選單、蓋住喇叭、點了不播**。使用者決定**先只畫圖示**（同 PDF），可以點的做法列入 §6 擴充、和 EPUB 改版一起設計；試做的程式已還原。EPUB 本來就沒收音訊（`page_div` 的 `audio` 傳空的）。加測試 `audio_is_only_its_speaker_icon`（畫了喇叭、沒有 `<audio>` / 連結 / `media/` 檔、manifest 沒有 `audio/mpeg`、合法 XHTML）；`epub_preview`（4 頁、3 個音訊）+ epubcheck：0 / 0 / 0。EPUB 的匯出選單還是佔位，所以沒有「不能播放」的提示要加 |
| 2026-11-05 | 步驟 7 交接、8 commit | `27389cc`（已 push） |
| 2026-11-05 | 步驟 9 完成 | MCP（skill `add-mcp-tool`）：`place_library_item` 可以放 mp3（`mediaFromAudioItem`：48 pt 圓形按鈕、標題 = 名稱去掉副檔名；給 `width` 時是正方形；非 mp3 回「目前只有 mp3 能放到頁面；「…」不是 mp3」）；`list_library_items` 的音訊多 `placeable`；`get_element` 的音訊多 `audioItem`（同 `photoItem`：素材庫的哪一筆，已沒有時 null）；`update_element` 對音訊給了不屬於它的欄位時錯誤訊息說「音訊不能修改」（原本會說「影片」）。沒有新工具（`import_library_item` 只收圖片，音訊由使用者在 App 匯入；計畫原本就決定不做 `add_audio`）。工具說明：`update_element`（音訊可改位置、尺寸、title，沒有 startSeconds）、`startSeconds` / `title` 參數說明、`list_library_items`、`place_library_item`、`get_element`。測試：新檔 `audio-tools.test.ts` 6 項（列出 placeable、放到中央 48 pt 一筆復原、給寬度是正方形與位置、拒絕 wav 不改文件、batch 裡 `$ref` 改標題一筆復原、`audioItem` 與錯誤訊息、素材庫沒有時 null）；`edits.test.ts` 的拒絕測試改用 wav。`mcp-tools.json`、Python SDK（pytest 17）、橋接程式重編、`MCP-工具清單.md` 已更新。全部 vitest 1259、cargo 343 通過。**使用者要 `/mcp` 重新連線** |
| 2026-11-05 | 步驟 9 commit、收尾 | `ce91f23`。剩：步驟 7 本機部分（網站回報後加 `mp3`、檔案太大的說明）；使用者的桌面版驗證清單在 `docs/progress.md` 待辦 |
