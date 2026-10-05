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
