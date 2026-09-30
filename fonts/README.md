# fonts/

編輯器畫面、PDF 匯出（未來還有 EPUB 匯出）**共用同一批字型檔**。這是刻意的：三邊只要有一邊用到不同的字型檔，文字換行的位置就會不一樣，「所見即所得」就不成立。

| 檔案 | 用途 | 來源 | 授權 |
|---|---|---|---|
| `Geist-Regular.ttf`、`Geist-Bold.ttf` | 西文 | [Geist](https://github.com/vercel/geist-font) | SIL OFL 1.1（`Geist-OFL.txt`） |
| `NotoSansTC-Regular.otf`、`NotoSansTC-Bold.otf` | 中文 | [noto-cjk `Sans2.004`](https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004) 的 `19_NotoSansTC.zip` | SIL OFL 1.1（`NotoSansTC-OFL.txt`） |

兩套字型的 `OS/2.fsType` 都允許嵌入與再散布（Noto Sans TC 是 `0x0000` Installable Embedding），所以可以放進要交給讀者的 PDF 與 EPUB。

## 誰在用

- **前端**：`src/index.css` 的 `@font-face` 以相對路徑 `../fonts/…` 引用，Vite 會打包進 `dist/assets/`。
- **Rust**：`src-tauri/src/export/fonts.rs` 的 `BUNDLED_FONTS` 以 `include_bytes!("../../../fonts/…")` 內嵌進執行檔（連同字族名稱、字重、檔名）。PDF 由 `world.rs` 交給 Typst 排版；EPUB 把文件用到的字族原檔放進 `OEBPS/fonts/`。

## 規則

- **只放靜態字重（Regular / Bold）**，不要放可變字型。文件模型的 `fontStyle` 只有 `normal` / `bold`，而可變字型與靜態實例的度量可能有細微差異，混用會讓畫面與輸出對不上。
- 換字型或升級版本時，**兩個引用點要一起改**，並重新確認既有專案的版面（字寬改變會讓文字位移）。
- 換字型時也要跑 `cargo test baseline_matches_css_line_box`：它檢查字型的 `hhea` 與 Windows 引擎實際採用的 `OS/2` 度量（有 USE_TYPO_METRICS 用 typo，否則用 win）一致；不一致時，macOS 與 Windows 的閱讀器會把 EPUB 的文字基線放在不同高度。
- 檔名中的字族名稱必須和 `element-factory.ts` 的 `DEFAULT_FONT_FAMILY`、以及 `@font-face` 的 `font-family` 一致：目前是 `Geist` 與 `Noto Sans TC`。
