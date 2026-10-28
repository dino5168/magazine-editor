---
paths:
  - "src/lib/project/**"
  - "src/lib/editor/types.ts"
  - "src/lib/library/**"
  - "src/lib/templates/**"
  - "src/components/library/**"
  - "src/components/templates/**"
  - "src/components/app/new-document-dialog.tsx"
  - "src/components/app/unsaved-changes-dialog.tsx"
  - "src/components/app/recovery-dialog.tsx"
  - "src/components/app/use-pending-choice.ts"
  - "src/components/editor/panels/library-panel.tsx"
  - "src/lib/editor/image.ts"
  - "src-tauri/src/project/**"
  - "src-tauri/src/commands/project.rs"
  - "src-tauri/src/commands/library.rs"
  - "src-tauri/src/commands/recovery.rs"
  - "src-tauri/src/commands/templates.rs"
---

# 專案檔案（素材管理、文件範本、檔案系統）

## 素材管理（`lib/library` + `components/library` + `src-tauri/src/project/library.rs`）

需求與可行性：`docs/00-需求分析/01-素材管理*.md`（操作畫面草圖 `Html/material.html`）；實作計畫與每一步的決定：`docs/01-Plans-2026-10/04-素材管理-實作.md`。參考 Eagle。

- **範圍**：每個專案各自一個素材庫，跟著專案資料夾走（不是跨專案的系統素材庫）。素材：圖片、文字檔（`.txt` / `.md`）、音訊（MP3 / WAV / M4A / OGG，**只能匯入與分類，不能放到頁面**、不顯示長度）。
- **`library.json`**（Rust `project/library.rs` 是權威定義，TS `lib/library/types.ts` 手寫對應，共用 fixture `tests/fixtures/sample-library.json`）：`libraryVersion` 1、`folders`（陣列順序 = 同層順序）、`items`（`kind` tag；`folderId: null` = 未分類；`trashed` 記住刪除時間與原資料夾，可指向已刪除的資料夾）。規則：id 不重複、名稱存去頭尾空白、同層不同名、不循環、最多 8 層、`src` 在對應種類的資料夾（`assets/images` / `texts` / `audio`）、**同一個 `src` 只能一筆**（同檔只留一筆）。比 App 新的 `libraryVersion` 拒絕開啟專案（重建會丟資料）；主檔與 `.bak` 都壞時改名 `library.json.damaged`、由專案圖片重建並提示。
- **立即寫入、不進復原、不算未存檔**：`LibraryProvider`（`home-page.tsx`：`EditorProvider` → `LibraryProvider` → `ProjectProvider`）每次變更就 `library_write`；一次一個寫入，寫入中的變更合併成下一次。`library_write` 帶 `projectId`，不是目前專案就拒絕；**換專案（開啟 / 新增）、另存（Rust 從磁碟複製素材庫）、關閉視窗前都要 `flush()`**（`use-project-commands.ts`、`use-close-guard.ts`）。代價：選「不儲存」關閉時頁面回到上次存檔，素材庫的整理保留。瀏覽器模式（`npm run dev`）只存在記憶體，src 是 blob URL（同檔不去重）。
- **和專案檔的關係**：`EditorState.assets` 已移除；`project.magproj` 的 `assets` 在存檔 / 備份時由素材庫算出（`projectAssets`：**所有圖片，含垃圾桶**——舊版 App 的開檔清理只看這份清單）。舊專案第一次開啟時由 `assets` 建立素材庫（全部未分類）。
- **匯入**（`use-library-import.ts` → `library_import`，raw body，種類放在 header `x-asset-kind` / `x-asset-extension`）：依副檔名分流，前端先擋明顯不合格的檔案，內容由 Rust 檢查（圖片與音訊看檔頭，SVG 見下面；文字必須 UTF-8、去 BOM、不含 NUL、≤ 200 KB；音訊 ≤ 50 MB）。在某個資料夾裡匯入就放進該資料夾，其他情況進未分類；同檔已在素材庫 → 不新增（在垃圾桶就還原到這次的資料夾）並提示。
- **內建範例**（2026-10-14 取代「相片」面板，使用者決定）：素材面板的下拉多一個固定項目「內建範例（6）」（面板自己的 `PanelView = LibraryView | { type: "samples" }`，**`LibraryView` 與管理視窗不動**），列出 `BUNDLED_PHOTOS`，不顯示匯入區。**不寫進 `library.json`**：點一下 / 拖到畫布時才 `importBundled`（複製進專案、加入未分類、同檔不重複），再從素材庫找到那筆交給 `usePlaceLibraryItem`，和一般素材同一條路。舊的停靠版面裡的 `photos` 由 `parseDockLayout` 丟掉。
- **管理視窗**（「專案管理 → 素材管理...」或面板的按鈕，`LibraryDialogProvider` / `useLibraryDialog().openLibrary(view?)`）：左欄全部 / 未分類 / 垃圾桶＋資料夾樹（數量含子資料夾），中欄 `masonryLayout` 瀑布流（左到右、新的在前、名稱搜尋），右欄資訊。Delete = 移到垃圾桶（垃圾桶裡 = 永久刪除，先確認）；在輸入框按 Esc 不關閉視窗。
  - **視窗處理的按鍵要 `stopPropagation`**：卡片在處理中就被移除時，編輯器快捷鍵的 `closest('[role="dialog"]')` 判斷不出它在視窗裡，會刪掉畫布上選取的物件。確認框關閉時焦點放回視窗（`onCloseAutoFocus`），否則焦點落在 `<body>`。
- **拖曳**（`use-library-drag.ts`，`startPointerDrag` + `DragGhost`，規則在純函式 `libraryDropResult`）：素材 → 資料夾（列的哪一段都算放進去）/ 未分類 / 垃圾桶；從垃圾桶拖出來 = 還原到那裡；資料夾 → 前 / 中 / 後 / 「資料夾」標題（最上層最後），不能進自己的子孫。拖已選取的卡片 = 整組，**開始拖曳時才改選取**（Ctrl+點選不受影響）。視窗有 `transform`（置中），拖曳標籤要 portal 到 `document.body`。
- **垃圾桶**：還原回原資料夾（不在了 → 未分類並提示）、永久刪除、清空。**永久刪除只移除清單**，檔案在下次開檔清理時才刪（頁面還在用就保留）。刪除資料夾 = 含子資料夾，素材進垃圾桶。
- **放到頁面**（`usePlaceLibraryItem`）：圖片 → 圖片物件；文字檔 → 一個靠左的內文文字物件（`createTextFromFile`，內容原樣、`.md` 符號保留、`\r\n` → `\n`；全文由 `library_read_text` 讀，因為 CSP 不讓前端 fetch asset URL）。一次 = 一筆復原。
- **「素材」面板**（`panels/library-panel.tsx`，**面板 id 仍是 `upload`**，舊的停靠版面紀錄不失效）：資料夾選單、匯入、點一下放到頁面中央、**拖到畫布放在放下的位置**（`CanvasDropProvider`：畫布登記「視窗座標 → 那一頁與頁面座標」，沿用建立工具的 `pageAt`，雙頁時放在哪頁建在哪頁；放在畫布外或工具列上 = 取消）。放下的位置不吸附格線。
- **縮圖**（`project/thumbnails.rs` + `lib/library/thumbnails.ts`）：卡片用原圖時，24 MP 照片捲動會卡（量測見計畫步驟 12）。`assets/thumbs/<原圖 hash>.jpg`（有透明像素時 `.png`），長邊 480 px、套用 EXIF 方向；路徑由原圖推導，**不寫進 `library.json`**。卡片接近畫面才 `library_thumbnail`（`spawn_blocking`），前端最多同時 2 個、同一張只要一次，換專案清快取；等待時只顯示底色、不先載原圖；做不出來或讀不到就用原圖。原圖 ≤ 480 px 與 SVG 直接用原圖；瀏覽器模式不用縮圖。畫布上的物件仍用原圖。開發版有最佳化圖片解碼套件（`Cargo.toml` 的 `[profile.dev.package.*]`），否則一張 24 MP 要約 8 秒。
- **SVG**（計畫與實測：`docs/01-Plans-2026-10/16-素材可以支援 SVG-實作.md`）：和其他圖片一樣是 `kind: "image"`、存在 `assets/images/<hash>.svg`，檔案格式不用改（內建相片本來就是 SVG）。
  - **原檔照存**（使用者決定，不清除 script）：App 與 EPUB 都只用 `<img>` 顯示，`<img>` 裡的 SVG 不執行 script、不載入外部資源；Typst 讀連結的圖片也受 `ExportWorld` 沙箱限制。Rust `assets.rs` 的 `is_svg` 用 roxmltree 解析（允許 DTD），根元素必須是 SVG namespace 的 `<svg>`（沒有 namespace 的瀏覽器不顯示）。
  - **大小**：寬、高都不是絕對長度（沒寫、`%`、`auto`）時，瀏覽器的 natural size 高度固定 150 px，所以匯入時改用 viewBox 的寬高（`image.ts` 的 `svgViewBoxSize` / `svgIntrinsicSize`）；其他情況照瀏覽器（mm 等單位以 96 dpi 換成 px，App 把 px 當 pt）。
  - 縮圖不做（直接用原圖）；畫布 `drawImage` 依畫出的大小重新繪製，縮放時仍是向量；素材卡片顯示「SVG」標籤（`kindBadge`）。
  - 不支援 `.svgz`。SVG 裡的文字：畫布用系統字型，PDF 只有內嵌字型（退回預設黑體，見「匯出 PDF」），**字可能不同**（已知限制，建議在繪圖軟體先把文字轉外框）。
- `editor-canvas.tsx` 裡的 `document` 是編輯中的文件；在那裡用 DOM API 要寫 `window.document`。
- 不做（之後另排）：跨專案的系統素材庫、標籤 / 智慧型資料夾 / 依顏色搜尋、一個素材在多個資料夾、音訊試聽與放到頁面、Markdown 格式保留。

## 文件範本（`lib/templates` + `components/templates` + `src-tauri/src/project/templates.rs`）

需求、評估與使用者的決定：`docs/08-Plans-系統全域/02-樣式管理-樣式範本-評估計畫.md`；實作計畫與每一步的結果：`02-樣式管理-樣式範本-實作.md`。需求原名「樣式範本」，使用者決定叫「**文件範本**」（內容含紙張、主頁與範例頁）。

- **範圍**（使用者決定）：把目前專案的設計存成範本，「檔案 → 新增」時選範本開新專案。範本內容 = 目前文件的文字樣式、色票、專案字型（含檔案）、紙張與邊界、主頁（含物件與圖片）、頁碼規則 + 建立時**勾選的範例頁**（都不勾 → 一頁空白頁，第一頁的尺寸與主頁、背景照主頁）。範本**存在這台電腦、所有專案共用**，不屬於任何專案。不做：套用到現有專案（同名衝突）、資料夾、匯出 / 匯入範本檔（換電腦）、MCP 工具（`run_command project.templates` 只開視窗）。「範本」工具面板（佔位）不動。
- **範本 = 精簡的專案資料夾**：`app_data_dir()/templates/<UUID>/`（`%APPDATA%` 底下的 App 資料夾，同 DB）裡有 `template.json`（`TemplateMeta`：`templateVersion` 1、名稱、說明、建立 / 更新時間）、`project.magproj`（**就是專案格式**）、`assets/fonts`、`assets/images`。所以驗證、舊版升級、`.bak`、複製檔案都重用專案檔的程式（`validate_content`、`read_project`、`write_project_atomic`、`copy_assets` + `referenced_assets`），**之後新增的文件欄位不用改範本程式就會被收進去**。前端只用 id，路徑只有 Rust 知道（縮圖的 asset URL 除外：`template_list` 時開放 asset scope）。
- **寫入**：建立 / 更新先寫 `.<id>.<uuid>.tmp` 再 rename；更新時舊的先改名 `.old`、新的放好才刪，失敗搬回來。啟動時 `clean_up`（`lib.rs` setup）刪暫存、把當機留下的 `.old` 搬回來。名稱 1–50 字、範本之間不重複；說明 ≤ 200 字（`TEMPLATE_NAME_MAX_LENGTH` / `TEMPLATE_DESCRIPTION_MAX_LENGTH`，TS `lib/templates/types.ts` / Rust `templates.rs` 同值）。**比 App 新**（`templateVersion` 或 `schemaVersion`）或**壞掉**的範本照樣列出（`problem`），只能刪除；較新的不能被「更新」蓋掉，專案檔壞掉的可以（等於修好）。
- **立即寫入、不進復原、不算未存檔**（同素材庫）。建立範本用**編輯中的內容**（`getSnapshot()`，含未存檔的修改；圖片與字型匯入時就已寫進專案資料夾），`templateContent` 篩出範例頁、名稱重設成「未命名文件」（`UNTITLED_DOCUMENT_NAME`）、`assets` = 保留的頁面與主頁上、素材庫認得的圖片；來源少的檔案略過並回報數量。
- **commands**（`commands/templates.rs`）：`template_list` / `template_create(name, description, content)` / `template_replace(id, content)` / `template_update_info` / `template_delete` / `project_new_from_template(id)`（`create_untitled` → 複製範本的檔案 → `library::load_or_create` 由 `assets` 建素材庫（未分類）→ `activate`，回傳 `OpenedProject`）。前端 `templateApi`（`project-api.ts` 匯出的 `callCommand`）。
- **UI**：
  - 「專案管理 → 文件範本...」（`project.templates`，桌面版限定；`home-page.tsx` 的 `templatesOpen`）：`TemplatesDialog` 兩欄——卡片（`TemplateCard`：第一個主頁、沒有就第一頁的 `SheetThumbnail`、名稱、紙張・主頁數；搜尋）｜資訊（`TemplateInfo`：名稱 / 說明失焦或 Enter 寫入、重複名稱提示並還原、紙張 / 樣式 / 色票 / 字型 / 主頁 / 頁碼 / 頁面 / 日期；用這個範本新增專案、以目前專案更新、刪除（確認））。打開時聚焦視窗本身；只有說明欄或有內容的輸入框擋 Esc。
  - 「以目前專案建立範本...」/「以目前專案更新」：`SaveTemplateDialog`（`SettingsDialog` 外框；名稱預設文件名稱、說明、範例頁縮圖勾選、受限授權字型提醒 `restrictedFonts`；更新沒有名稱欄）。
  - 「檔案 → 新增」對話框左上「空白 / 文件範本」：範本模式列出可用的範本（雙擊直接建立），右邊 `PageSetupFields sizeLocked`（**紙張照範本、邊界可改**）。`ChooseNewSetup(templateId?)` 回傳 `NewDocumentChoice`（`blank` / `template`），`ProjectProvider.createFromTemplate(id, margins)`。範本視窗的「用這個範本新增專案」= 關視窗 → `project.newProject(id)`（對話框直接選好那個範本，未存檔提示照舊）。
- **縮圖讀範本資料夾的圖片**：`components/editor/asset-src.tsx` 的 `AssetSrcProvider` 覆寫圖片節點的 `resolveSrc`（`useResolveSrc`，沒有 provider 時用目前專案）。範本的專案字型不另外登記，縮圖用後備字型（已知限制）。
- **字型授權**：「預覽與列印」「可編輯」的專案字型照樣存進範本，建立時提醒（使用者決定只提醒、不阻擋）。
- 之後另排：套用到現有專案、範本資料夾與排序、匯出 / 匯入範本檔、MCP、「範本」面板列出範本的主頁 / 範例頁。

## 檔案系統（`lib/project` + `src-tauri/src/project`）

- **專案 = 使用者自選位置的資料夾**：`project.magproj`（UTF-8 JSON，`schemaVersion` 17；v2 起物件顏色可為 `#rrggbbaa`，頁面背景仍只能是 `#rrggbb`；v3 起四種圖形合併成 `shape`，v1 / v2 開檔時自動升級；v4 加 `document.margins`，舊檔與備份缺這個欄位時 serde 預設全 0，不需要升級步驟；v5 加 `document.pageNumberRules`，缺少時預設空陣列；v6 的文字樣式加 `italic` / `underline` / `strikethrough` / `shadow`，Rust 以 `#[serde(flatten)] decoration: TextDecoration` 放進三個結構，缺少時全部關閉；v7 加 `document.masters` 與 `Page.masterId`，缺少時沒有主頁，驗證引用、循環與深度；v8 加 `document.textStyles` 與文字 / 圖形內文字的 `styleId`，缺少時讀成內建三個樣式（`default_text_styles`）、都不連結，v8 的空樣式表照樣保留；驗證名稱、不重複與引用；v9 的文字、圖形內文字與文字樣式加 `lineHeight` / `letterSpacing`，Rust 以 `#[serde(flatten)] spacing: TextSpacing` 放進三個結構，缺少時 1.2 / 0、不需要升級步驟，驗證範圍；v10 的 `align` 可以是 `distributed`（首尾置中），沒有新欄位，提升版本是讓舊版 App 明確說「檔案比較新」而不是解析失敗；v11 的矩形 `cornerRadius` 可以是四個數字（Rust `CornerRadius` untagged enum），四角一樣仍存數字；v12 加 `document.swatches` 與各顏色的連結欄位 `fillSwatchId` / `swatchId` / `backgroundSwatchId`，缺少時沒有色票、都不連結（serde 預設，不需要升級步驟，備份檔也一樣），驗證色票格式與引用存在；v13 加 `document.fonts`（專案字型：`id` 只能英數 `-` `_`、`name`、`generic`、`regular` / `bold`（可為 null）的 `FontFile`：`src` 在 `assets/fonts/` 的 `.ttf` / `.otf`、檔內名稱、字重、`embedding`（`installable` / `editable` / `previewAndPrint`）、`ascent` / `descent` / `appleBaselineShift`（em）），CSS / Typst 家族名稱是 `project-font-<id>`（Rust `project_font_family`），缺少時沒有專案字型；計畫 `docs/05-Plans-字型/01-專案字型-實作.md`；v14 的圖形 geometry 可以是 `{ kind: "preset", preset, params }`（圖形庫，Rust `ShapeGeometry::Preset`，`params` 缺少時讀成空的），沒有新的文件欄位，提升版本是讓舊版 App 明確說「檔案比較新」；計畫 `docs/06-Plans-繪圖/01-繪圖-實作.md`；v15 的邊框 `dash` 可以是 `dashDot`（點劃線，Rust `StrokeDash` 改成 `camelCase`），之後的線條物件也在 v15；計畫 `docs/06-Plans-繪圖/03-自由繪圖-實作.md`；v16 的文字、圖形內文字與文字樣式加段落縮排 `indentLeft` / `indentRight` / `indentFirstLine`，Rust 以 `#[serde(flatten)] indent: TextIndent` 放進三個結構，缺少時 0、不需要升級步驟，驗證範圍與「首行 ≥ −左縮排」；計畫 `docs/07-Plans-物件屬性與事件/01-新增文字框屬性-實作.md`；v17 的圖形加 `image`（圖片框的照片，Rust `#[serde(default)] image: Option<ShapeImage>`），缺少時沒有照片、不需要升級步驟，驗證路徑 / 像素尺寸 / 對焦 / 縮放，`referenced_assets` 算進照片；計畫 `docs/07-Plans-物件屬性與事件/03-圖形照片-實作.md`）、`project.magproj.bak`（上一次存檔）、`assets/images/<SHA-256 前 32 碼>.<ext>`；素材庫另有 `library.json`（＋`.bak`，立即寫入）、`assets/texts/`、`assets/audio/`、`assets/thumbs/`（縮圖，見「素材管理」）、`assets/fonts/`（專案字型，`ASSET_DIRS` 之一：開檔清理與另存都包含）。一個專案 = 一份多頁文件。
- **專案資料夾自給自足**：頁面上的每張圖片（上傳、內建相片）都先複製進 `assets/images/`。`ImageElement.src` / `AssetInfo.src` 存**專案相對路徑**，顯示時由 `resolveSrc`（`resolveAssetUrl` + `convertFileSrc`）轉成 asset protocol URL。圖片檔寫入後不再修改，復原歷史可以放心引用。
- **Rust 是檔案格式的權威定義**：`project/format.rs` 的 serde 型別對應 `types.ts`，讀取與存檔時都會驗證（顏色、頁面尺寸、`src` 只能是 `assets/images/<檔名>`）。**修改 `types.ts` 的文件模型時必須同步修改 `format.rs` 和 `tests/fixtures/sample.magproj`**；兩邊的測試都會讀這份 fixture，欄位不一致時會失敗。格式變更要提升 `SCHEMA_VERSION`；需要改寫舊版內容時，在 `parse_project` 的版本判斷處把舊版 JSON（`serde_json::Value`）升級後再轉換（v1 → v2 只放寬顏色格式，沒有升級步驟；v1 / v2 → v3 由 `upgrade_shapes_to_v3` 改寫圖形，備份檔也要套用）；比 App 新的版本拒絕開啟。只有最上層的未知欄位會在存檔時保留。
- **前端不傳路徑給 Rust**：開啟 / 另存對話框由 Rust 呼叫 `tauri-plugin-dialog`，其他 commands 只操作 `ProjectState` 中目前開啟的專案。前端不需要 dialog 的 JS 套件或 capability。
- 寫入：`.tmp` → flush → 舊檔 copy 成 `.bak` → rename 取代。開啟時主檔損壞會自動改用 `.bak`，並標記為未存檔。開啟時會刪除 `assets/images/`、`assets/texts/`、`assets/audio/` 裡沒被引用的檔案（此時復原歷史是空的；頁面、主頁上的圖片與素材庫（含垃圾桶）都算引用），以及原圖不在了的縮圖；素材庫是損壞後重建的那一次不清理。
- 未命名專案放在 `%LOCALAPPDATA%\com.mycompany.magazineeditor\untitled\<id>\`，「儲存」會改走「另存新檔」，另存成功後刪除暫存資料夾；下次啟動時清除殘留的暫存資料夾（single-instance 保證沒有其他實例在用），但**還有備份檔的暫存資料夾會保留**。
- 另存對話框：使用者輸入的名稱（去掉 `.magproj`）就是新的專案資料夾名稱，檔案固定叫 `project.magproj`；目標資料夾已存在而且不是空的會拒絕。對話框預設位置是「文件\雜誌編輯軟體」。
- asset protocol 的 scope 在 `tauri.conf.json` 是空的，開啟專案時由 Rust `asset_protocol_scope().allow_directory()` 動態開放。
- **dirty 判斷**：reducer 的 `selectIsDirty`＝`history.present !== savedDocument`（比較參考）。`document/load`（清空復原歷史，`saved: false` 時 `savedDocument` 設為 null）與 `document/markSaved` 負責設定 `savedDocument`；`ProjectProvider` 只在有開啟專案時才回報 dirty。
- 視窗標題：`● 文件名稱 — 雜誌編輯軟體`（`●` 表示未存檔），由 `ProjectProvider` 呼叫 `setTitle`。
- 新增 / 開啟 / 關閉視窗前，有未存檔的變更時會詢問「儲存 / 不儲存 / 取消」；三者共用 `useProjectCommands` 的同一段流程（關閉視窗走 `confirmClose`）。`busyRef` 防止同時執行兩個檔案操作（包括對話框開著時關閉視窗）。
- **新增專案**（「檔案 → 新增」，計畫：`docs/01-Plans-2026-10/01-修改新增專案流程-實作.md`）：未存檔提示 → 「新增文件」對話框（`new-document-dialog.tsx`，`useProjectCommands` 的第二個參數 `chooseNewSetup` 注入）→ `createNew(setup)` → `createBlankDocument(setup)`。選了文件範本時 → `createFromTemplate(id, margins)`（見「文件範本」）。
  - 對話框：左邊紙張卡片（`PaperPresetGrid`，同頁面設定的 18 種紙張與分組，每張卡片畫「點了會得到的尺寸」：方向照 `selectPresetSize`），右邊 `PageSetupFields`（和頁面設定共用：直橫、寬高、邊界）；底部「取消 / 建立」。每次開啟都從 `DEFAULT_NEW_PAGE_SETUP`（A4 直式、邊界 15 mm）開始，**不記憶**上次的選擇。
  - 取消、Esc、點外面一律 resolve `null`（不能讓 Promise 懸著，否則 `busyRef` 一直是 busy）→ 留在目前的文件。先問未存檔再選紙張，所以選了「儲存」再取消也只是存了檔。
  - **啟動時沒有上次的專案仍直接建立 A4**（`createNew()` 不帶參數），不顯示對話框。瀏覽器模式的「新增」照舊只顯示「僅在桌面版可用」。
  - 只改前端，Rust `project_new` 只建立資料夾、檔案格式不變。
- 選檔對話框統一用 `lib/editor/image.ts` 的 `pickFiles(accept)`：「匯入圖片」與底部工具列用 `pickImageFiles()`，素材面板與管理視窗用 `LIBRARY_ACCEPT`（圖片、文字、音訊）。
- **自動備份**（`%LOCALAPPDATA%\com.mycompany.magazineeditor\recovery\<專案 id>.json`）：
  - 有未存檔變更時每 60 秒寫入一次（`useAutosave`，內容沒變就不寫）；變更被存檔或復原掉之後，下一次 tick 會刪除備份。
  - Rust 端在這些時候刪除備份：`project_save` 成功、`activate()` 換成另一個專案（使用者已處理過未存檔提示）、視窗 `WindowEvent::Destroyed`（只有正常關閉才會觸發，當機不會）。
  - 啟動時有備份檔 → 先問「復原 / 捨棄」（只處理最新一份），選復原就載入備份內容並標記為未存檔，**不**清理沒引用的圖片（備份可能用到上次存檔沒用到的圖片）；選捨棄會刪除備份和未命名專案的暫存資料夾。
  - 備份 id 只接受 UUID 字元（組成檔名）；`recovery_discard` 只刪除位於 `untitled\` 底下的暫存資料夾。
- **尚未實作**（見 `0-Task/plan-filesystem.md`）：第三階段系統素材庫與範本、匯入其他專案的頁面、「最近開啟」選單；備份間隔目前固定 60 秒（`AUTOSAVE_INTERVAL_MS`）。App 偏好決定存 localStorage（見「偏好設定」），SQLite 的 `settings` 資料表目前不做。

## 檔案（原 CLAUDE.md「目錄結構」）

```
    app/unsaved-changes-dialog.tsx  # 「要儲存變更嗎？」對話框（Promise 形式的 confirm）
    app/recovery-dialog.tsx       # 啟動時「要復原上次未儲存的內容嗎？」（只能選復原 / 捨棄，Esc 不會關閉）
    app/new-document-dialog.tsx   # 「檔案 → 新增」的「新增文件」對話框（useNewDocumentDialog：左上「空白 / 文件範本」、左紙張卡片或範本卡片、右 PageSetupFields（範本時 sizeLocked），回傳 NewDocumentChoice | null；可以帶範本 id 直接選好）
    app/use-pending-choice.ts     # 以 Promise 等待使用者選擇的對話框狀態（未存檔、復原、新增文件三個對話框共用）
    templates/                    # 文件範本的 UI（見「文件範本」）：templates-dialog.tsx（TemplatesDialog 兩欄、搜尋、刪除確認）、template-card.tsx（TemplateCard / TemplateThumbnail / paperLabel）、template-info.tsx（名稱 / 說明、摘要、按鈕）、save-template-dialog.tsx（以目前專案建立 / 更新：範例頁勾選、授權提醒）
    library/                      # 素材管理的 UI（見「素材管理」）
      library-dialog.tsx          # LibraryDialogProvider / useLibraryDialog().openLibrary(view?)；三欄管理視窗（樹｜瀑布流｜資訊）、刪除資料夾 / 永久刪除的確認
      library-tree.tsx            # 左欄：全部 / 未分類 / 垃圾桶＋資料夾樹（展開、改名、新增、刪除、data-drop 拖曳提示）
      library-grid.tsx            # 中欄：masonryLayout 排的卡片、點選 / Ctrl / Shift、從檔案總管拖檔案匯入
      library-info.tsx            # 右欄：預覽、名稱、資訊、放到目前頁面 / 移到垃圾桶 / 還原 / 永久刪除
      library-card.tsx            # LibraryThumb（圖片走縮圖、文字摘錄、音訊卡、格式標籤、檔案遺失）、cardAspect、kindBadge；面板也用
      use-library-drag.ts         # 管理視窗的拖曳（素材 → 資料夾 / 未分類 / 垃圾桶，資料夾前 / 中 / 後 / 最上層）
      use-place-library-item.ts   # place(item, center?, pageId?)：圖片 / 文字檔放到頁面（文字經 library_read_text）
    project/                      # 專案檔案存取（不含 UI）
      project-types.ts            # ProjectInfo / ProjectContent / OpenedProject / CommandError（對應 Rust）
      project-api.ts              # invoke 包裝（回傳 Result）、isDesktop、describeCommandError
      asset-url.ts                # resolveAssetUrl：專案相對路徑 → asset protocol URL
      project-context.tsx         # ProjectProvider：啟動載入、createNew / loadOpened / markSaved、視窗標題、resolveSrc
      use-project-commands.ts     # 新增 / 開啟 / 儲存 / 另存 / 匯出 PDF 與翻頁電子書（共用 runExport(format)；未存檔提示與新增文件對話框由 UI 注入）
      use-close-guard.ts          # 關閉視窗前提示未存檔
      use-autosave.ts             # 每 60 秒把未存檔內容寫入備份（decideAutosave 是純函式）
      __tests__/
    templates/                    # 文件範本（不含 UI，見「文件範本」）：types.ts（TemplateMeta / TemplateEntry / 上限常數，對應 Rust）、template-api.ts（templateApi）、template-content.ts（templateContent / templateSummary / templatePreviewSheet / restrictedFonts / 名稱與說明檢查）、__tests__/
    library/                      # 專案素材庫（library.json，見「素材管理」；不含 UI 的部分）
      types.ts                    # Library / LibraryFolder / LibraryItem（image / text / audio）/ Trashed、上限常數（對應 Rust library.rs、assets.rs）
      library-reducer.ts          # 純 reducer（item/* / folder/* / trash/empty / library/load；不合法回傳同一個參考）
      library-selectors.ts        # LibraryView、libraryCounts、visibleItems、importFolderOf、importOutcome、projectAssets、restoredToUnsorted
      library-tree.ts             # 資料夾樹：descendants / folderPath / folderMoveError / treeDropZone / treeRows / nextFolderName / canAddSubfolder
      library-validation.ts       # folderNameError / itemNameError（中文）、libraryProblem（整份檢查，同 Rust 規則）
      library-drop.ts             # libraryDropResult：放下的結果（action / 拒絕原因 / 沒有動作）
      library-files.ts            # kindOfFile、LIBRARY_ACCEPT、normalizeText、textExcerpt、libraryItemName
      masonry.ts                  # masonryLayout：放進最矮的欄（已知長寬比，不量測）
      thumbnails.ts               # requestThumbnail（最多同時 2 個、同一張一次）、resetThumbnailCache、usesThumbnail
      library-context.tsx         # LibraryProvider：狀態、立即寫入佇列、load / flush / getLibrary / hasPendingWrites
      use-library-import.ts       # importFiles(files, folderId, accept?)、importBundled（內建相片也進未分類）
      bundled-photos.ts           # BUNDLED_PHOTOS：內建範例相片（src/assets/photos/ 的 6 張 SVG），素材面板「內建範例」用；不在 library.json，放到頁面時才 importBundled
      __tests__/
      image.ts                    # loadImageSize()
  assets/photos/*.svg             # 素材面板「內建範例」的佔位範例圖（換成真實照片時同時改 lib/library/bundled-photos.ts）
  src/project/                    # 專案資料夾：format.rs（serde 型別、驗證、schemaVersion、舊版升級）、shape.rs（多邊形 / 星形頂點）、io.rs（原子寫入、.bak、清理）、assets.rs（圖片 / 文字 / 音訊匯入、讀文字）、library.rs（library.json：型別、驗證、讀寫、由舊的專案圖片建立）、thumbnails.rs（素材縮圖）、recovery.rs（自動備份檔）、templates.rs（文件範本：列出、建立 / 更新 / 改名 / 刪除、從範本建立未命名專案、啟動清理）、fonts.rs（專案字型：prepare（拆集合、清 bit 7）/ analyze / import_font / collection_faces）、font_collection.rs（.ttc → 單一 sfnt、清簡單字形旗標的 bit 7）、system_fonts.rs（掃系統與使用者字型資料夾、只讀需要的表格、快取 system-fonts.json）、font_catalog.rs（精選清單、驗證下載、本機快取 font-cache/；不碰網路）
```
