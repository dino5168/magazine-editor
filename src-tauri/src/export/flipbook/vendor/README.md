# 第三方套件：StPageFlip（`page-flip`）

翻頁書匯出時原樣複製到輸出資料夾的 `viewer/`（`include_str!`，不從網路下載）。

| 項目 | 內容 |
|---|---|
| 套件 | npm `page-flip` **2.0.7**（https://github.com/Nodlik/StPageFlip） |
| 授權 | MIT（`page-flip.LICENSE`，匯出時一起附上） |
| 檔案 | `page-flip.browser.js` = 套件的 `dist/js/page-flip.browser.js`，未修改 |
| SHA-256 | `BBACA0BBEF57A22BB66A3FC69D67BAF9A17FB9A9C89EC9ED35E2B91ABE4BD1E7` |
| 取得方式 | `npm pack page-flip@2.0.7`（npm 驗證 integrity）後解壓 |

升級：換掉兩個檔案、更新上表，重跑 `cargo test flipbook` 與翻頁書的瀏覽器驗證（見 `docs/03-Plans-匯出檔案/01-匯出HTML5-翻頁電子書-實作.md`）。