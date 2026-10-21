# fonts/

編輯器畫面、PDF 匯出、EPUB 匯出**共用同一批字型檔**。這是刻意的：三邊只要有一邊用到不同的字型檔，文字換行的位置就會不一樣，「所見即所得」就不成立。

屬性面板的「字體」選單有四套（`src/lib/editor/fonts.ts` 的 `FONT_OPTIONS`）：

| 選單 | 字族（CSS / `BUNDLED_FONTS`） | 檔案 | 來源 | 授權 | 修改 |
|---|---|---|---|---|---|
| 黑體 | `Geist`（西文） | `Geist-Regular.ttf`、`Geist-Bold.ttf` | [Geist](https://github.com/vercel/geist-font) | SIL OFL 1.1（`Geist-OFL.txt`） | 無 |
| 黑體 | `Noto Sans TC`（中文） | `NotoSansTC-Regular.otf`、`NotoSansTC-Bold.otf` | [noto-cjk `Sans2.004`](https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004) 的 `19_NotoSansTC.zip` | SIL OFL 1.1（`NotoSansTC-OFL.txt`） | 無 |
| 明體 | `Noto Serif TC` | `NotoSerifTC-Regular.otf`、`NotoSerifTC-Bold.otf` | [noto-cjk `Serif2.003`](https://github.com/notofonts/noto-cjk/releases/tag/Serif2.003) 的 `15_NotoSerifTC.zip`（`SubsetOTF/TC/`） | SIL OFL 1.1（`NotoSerifTC-OFL.txt`） | 無 |
| 楷體 | `LXGW WenKai TC` | `LXGWWenKaiTC-Regular.ttf`、`LXGWWenKaiTC-Medium.ttf` | [霞鶩文楷 TC `v1.522`](https://github.com/lxgw/LxgwWenkaiTC/releases/tag/v1.522) | SIL OFL 1.1（`LXGWWenKaiTC-OFL.txt`） | `hhea` |
| 圓體 | `GenSenRounded2 TW` | `GenSenRounded2TW-R.otf`、`GenSenRounded2TW-B.otf` | [源泉圓體 `v2.100`](https://github.com/ButTaiwan/gensen-font/releases/tag/v2.100) 的 `GenSenRounded2TW-otf.zip`（TW = 台灣教育部標準字形，和思源黑體 TC 一致） | SIL OFL 1.1（`GenSenRounded2TW-OFL.txt`，保留字型名稱只有「Source」） | `hhea`、`name` |

所有字型的 `OS/2.fsType` 都是 `0x0000`（Installable Embedding），可以放進要交給讀者的 PDF 與 EPUB。四套合計約 86 MB，全部以 `include_bytes!` 內嵌進執行檔。

## 特別處理

- **霞鶩文楷沒有 Bold**（官方只有 Light / Regular / Medium）：粗體用 **Medium**。`src/index.css` 把它宣告成 `font-weight: 700`，`BUNDLED_FONTS` 標成 `bold: true`；Typst 要粗體時會挑最接近的字重（500），所以畫面、PDF、EPUB 都是同一個檔案。粗細只比一般字重稍粗。
- **霞鶩文楷在 Typst 裡叫「霞鶩文楷 TC」**：Typst 讀的是字型檔裡的中文家族名稱。`BUNDLED_FONTS` 的 `typst_family` 記錄這個名稱，`pdf.rs` 產生 `data.json` 時用 `typst_family()` 轉換；文件與 CSS 仍然用 `LXGW WenKai TC`。
- **修改過的字型**（表格的「修改」欄）由 `patch_font.py` 產生，只改寫列出的表（外加 `head` 的檢查碼），字形與其他表逐位元組不變：
  - `hhea`：兩套字型的 `hhea` 與 Windows 用的 `OS/2` win 度量不同（macOS 與 Windows 的 EPUB 閱讀器基線會差一點），改成 win 度量（和 Noto Sans TC 出廠時相同）。
  - `name`（只有源泉圓體）：原檔每個字重各自是一個家族（`GenSenRounded2 TW R` / `… B`），Typst 依 name ID 1 分組，會找不到粗體；改成 ID 1 = `GenSenRounded2 TW`、ID 2 / 17 = `Regular` / `Bold`。

```powershell
python fonts/patch_font.py <原始>/LXGWWenKaiTC-Regular.ttf fonts/LXGWWenKaiTC-Regular.ttf
python fonts/patch_font.py <原始>/LXGWWenKaiTC-Medium.ttf  fonts/LXGWWenKaiTC-Medium.ttf
python fonts/patch_font.py <原始>/GenSenRounded2TW-R.otf   fonts/GenSenRounded2TW-R.otf --style Regular
python fonts/patch_font.py <原始>/GenSenRounded2TW-B.otf   fonts/GenSenRounded2TW-B.otf --style Bold
```

## 誰在用

- **前端**：`src/index.css` 的 `@font-face` 以相對路徑 `../fonts/…` 引用，Vite 會打包進 `dist/assets/`。`src/lib/editor/fonts.ts` 的 `FONT_OPTIONS` 是字體選單，字型**用到才載入**（`use-fonts-ready.ts`）。
- **Rust**：`src-tauri/src/export/fonts.rs` 的 `BUNDLED_FONTS` 以 `include_bytes!("../../../fonts/…")` 內嵌進執行檔（字族名稱、泛用字族、Typst 名稱、是否粗體、檔名）。PDF 由 `world.rs` 交給 Typst 排版；EPUB 把文件用到的字族原檔放進 `OEBPS/fonts/`，`font-family` 最後接該字族的泛用字族（明體 / 楷體是 `serif`）。

## 新增一套字型

1. 字型檔放進 `fonts/`（Regular + Bold 兩個**靜態**字重，授權要允許嵌入與再散布），更新上面的表格。
2. `src/index.css` 加兩個 `@font-face`（400 / 700）。
3. Rust `BUNDLED_FONTS` 加兩筆。
4. `src/lib/editor/fonts.ts` 的 `FONT_OPTIONS` 加一筆。
5. 跑 `cargo test`：下面三個測試會抓出常見問題，失敗時用 `patch_font.py` 修正字型檔，或修正 `typst_family`：
   - `baseline_matches_css_line_box`：`hhea` 與 Windows 的度量一致。
   - `typst_sees_the_declared_family_and_weight`：Typst 讀到的家族名稱等於 `typst_family`，字重和 `bold` 一致。
   - `every_bundled_family_has_regular_and_bold`。
6. 疊圖比對畫布與 PDF（`CLAUDE.md`「匯出 PDF → 調校方式」）。

## 規則

- **只放靜態字重**，不要放可變字型。文件模型的 `fontStyle` 只有 `normal` / `bold`，而可變字型與靜態實例的度量可能有細微差異，混用會讓畫面與輸出對不上。
- **不放斜體字型**：文字的「斜體」是模擬的（瀏覽器以基線為軸斜切 1/4，PDF / EPUB 照同樣斜率斜切，見 `CLAUDE.md`「文字裝飾」）。加了真的斜體檔，畫面會改用它，輸出就對不上。
- 換字型或升級版本時，**所有引用點要一起改**（`index.css`、`BUNDLED_FONTS`、`FONT_OPTIONS`），並重新確認既有專案的版面（字寬改變會讓文字位移）。
- 字族名稱必須和 `FONT_OPTIONS`（`family` 與 `faces`）、`@font-face` 的 `font-family`、Rust `BUNDLED_FONTS` 的 `family` 一致。
- **`FONT_OPTIONS` 的 `family` 字串一旦發布就不要改**：它會存進專案檔，改了之後舊專案的文字會變成「其他字型」。

## 專案字型（使用者匯入）

這裡的字型是**內建字型**：跟著程式發行，每個專案都能用，要改程式才能增減（上面的「新增一套字型」）。2026-10-14 起另有**專案字型**：使用者在「設定 → 文件 → 字型...」把字型加入專案，存在專案資料夾的 `assets/fonts/`，只有那個專案能用（計畫 `docs/05-Plans-字型/01-專案字型-實作.md`、`02-字型管理問題-實作.md`，CLAUDE.md「專案字型」）。2026-10-21 起有三種來源：匯入字型檔（`.ttf` / `.otf` / `.ttc`，可多選、可拖放）、從系統字型加入、下載精選清單的免費字型（下面的「精選清單」）。

| | 內建字型（`fonts/`） | 專案字型（`assets/fonts/`） |
|---|---|---|
| 加入方式 | 改程式（`index.css`、`FONT_OPTIONS`、`BUNDLED_FONTS`） | 使用者在 App 裡加入（匯入檔案 / 系統字型 / 下載清單的字型） |
| 字族名稱 | 檔案裡的名稱（Typst 讀不同時用 `typst_family` 對應） | 程式決定：`project-font-<id>`，不管檔案叫什麼 |
| 粗體 | 一定有（霞鶩文楷用 Medium） | 可選；沒有時粗體也用一般檔（不模擬加粗） |
| 基線一致 | 用 `patch_font.py` 把 `hhea` 改成和 Windows 度量相同 | **不改檔**：`@font-face` 寫 `ascent-override` / `descent-override`；Safari / Apple Books 不支援 override，`hhea` 不同的字型在 Apple 裝置的 EPUB / 翻頁書會偏（已知限制，匯入後在對話框提示） |
| 授權 | 都是 SIL OFL，`fsType` 0 | 匯入時讀 `fsType`：禁止嵌入 / 只能嵌入點陣圖拒絕，其他提醒；責任在使用者 |
| 可變字型 | 不放（見「規則」） | 加入時拒絕 |
| 字型集合（`.ttc`） | 不放 | 選其中一個，拆成單一字型存進專案（字形不變；簡單字形旗標的保留位元 bit 7 會清掉，否則 Chrome 拒絕新細明體） |

## 精選清單（「下載免費字型」）

`src-tauri/fonts-catalog.json` 是 App 內建的免費字型清單（Rust `include_str!`，前端 `lib/editor/font-catalog.ts` 讀同一份）。使用者按下載時 Rust 才連網路，只連清單裡的網址；下載檔與字型檔都要符合清單的 SHA-256 與大小，存在本機快取 `%LOCALAPPDATA%\com.mycompany.magazineeditor\font-cache\` 再複製進專案。翻頁書匯出時，用到**不是**這份清單的專案字型會先提醒授權（清單的字型由存進專案的檔名＝內容雜湊認出來）。

目前 11 套（2026-10-21 調查並逐一下載、匯入檢查與瀏覽器載入通過，使用者確認；授權都是 SIL OFL 1.1）：

| 分類 | 字型 | 版本 | 檔案 | 下載 | 存進專案 |
|---|---|---|---|---|---|
| 黑體 | [源樣黑體](https://github.com/ButTaiwan/genyog-font) | 2.100 | 一般 + 粗體 | 59.6 MB（zip） | 21.7 MB |
| 黑體 | [昭源黑體 Chiron Hei HK](https://github.com/chiron-fonts/chiron-hei-hk) | 2.609 | 一般 + 粗體 | 33.2 MB | 33.2 MB |
| 黑體 | [朱古力黑體](https://github.com/MoonlitOwen/ChocolateSans) | 2025-08-29 | 只有一般 | 12.2 MB | 12.2 MB |
| 明體 | [源流明體](https://github.com/ButTaiwan/genryu-font) | 2.100 | 一般 + 粗體 | 71.3 MB（zip） | 32.7 MB |
| 明體 | [昭源宋體 Chiron Sung HK](https://github.com/chiron-fonts/chiron-sung-hk) | 1.024 | 一般 + 粗體 | 50.8 MB | 50.8 MB |
| 圓體 | [jf open 粉圓](https://github.com/justfont/open-huninn-font) | 2.1 | 只有一般 | 4.9 MB | 4.9 MB |
| 楷體・手寫 | [芫荽](https://github.com/ButTaiwan/iansui) | 1.020 | 只有一般 | 4.8 MB（zip） | 9.4 MB |
| 楷體・手寫 | [內海字體](https://github.com/max32002/naikaifont) | 1.89 | 一般 + 粗體 | 64.9 MB | 64.9 MB |
| 楷體・手寫 | [清松手寫體 1](https://github.com/jasonhandwriting/JasonHandwriting) | 2025-12-28 | 只有一般 | 8.9 MB | 8.9 MB |
| 楷體・手寫 | [辰宇落雁體](https://github.com/Chenyu-otf/chenyuluoyan_thin) | 2.0 | 只有一般 | 9.5 MB | 9.5 MB |
| 像素 | [俐方體 11 號](https://github.com/ACh-K/Cubic-11) | 1.500 | 只有一般 | 2.8 MB | 2.8 MB |

沒收：台北黑體（只在 Google 雲端硬碟發布，沒有固定版本的網址，不能驗證）、源雲明體（zip 88 MB）、霞鶩新晰黑 / 新致宋（IPA 授權，不是 OFL）、已經內建的字型。

### 新增或更新一套

1. 找官方發布處：**網址要固定版本**（GitHub release 附檔，或 `raw.githubusercontent.com/<repo>/<完整 commit>/<路徑>`），內容不會再變，雜湊才有意義。授權要允許嵌入與再散布（SIL OFL）。只收靜態字型；可以有一般 + 粗體。
2. 下載，算下載檔與字型檔各自的 SHA-256 與大小（zip 的話 `archivePath` 是 zip 裡的路徑，`sha256` / `bytes` 是 zip 的，`fileSha256` / `fileBytes` 是解出來的字型檔）。
3. 用 App 的匯入流程檢查：`FONT_FILES=<a.ttf>;<b.otf> cargo test --manifest-path src-tauri/Cargo.toml analyze_font_files -- --ignored --nocapture`（印出家族、字重、授權、度量、存進專案的檔名）。存進專案的檔名前 32 碼必須等於 `fileSha256` 的前 32 碼（檔案原樣保存；若匯入時改了位元組，例如清 bit 7，授權判斷就認不出來）；再用瀏覽器 `FontFace` 載入確認。
4. 寫進 `fonts-catalog.json`（`id` 發布後不改：只用小寫英數與 `-`）。`cargo test font_catalog` 檢查格式；`cargo test catalog_download_over_the_network -- --ignored --nocapture` 實際下載最小的一套。
