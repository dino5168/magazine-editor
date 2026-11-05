# 給 web-magazine：讓有音訊的翻頁書能上傳並在網站上播放（建議實作）

> 來源：雜誌編輯軟體（magazine-editor）音訊計畫 `02-Audio-素材-實作.md` 步驟 7。日期：2026-11-05。
> 這份文件可以整份交給 web-magazine 的工作階段。**做完並回報後**，magazine-editor 這邊才在上傳白名單加 `mp3`（順序不能反：網站還不收時，桌面版先送會讓檔案被略過、書裡的按鈕按了沒聲音）。

---

## 1. 背景

雜誌編輯軟體的頁面現在可以放**音訊按鈕**（只有 mp3）。匯出的翻頁書：

```text
index.html                 頁面上有 <a class="el link audio" href="media/audio-1.mp3" data-audio="media/audio-1.mp3" …>
media/audio-<n>.mp3        書裡的音訊檔（改名過；內容看檔頭確認是 mp3）
viewer/viewer.js           點按鈕時用一個 <audio> 播放 data-audio 的檔案（同一本書裡的相對路徑）
```

- 有音訊的書，`index.html` 的 CSP meta 多一個 `media-src 'self'`（只允許書裡的檔案）。
- 播放列可以拖進度條：瀏覽器會對 mp3 送 **`Range` 請求**。
- 單一音訊檔上限 50 MB（素材庫匯入時就擋）；整本書照現在的上傳上限（100 MB）。

**現在的狀況**：桌面版的上傳先檢查「網站會不會略過」，`mp3` 不在白名單，所以**有音訊的書上傳會被桌面版拒絕**（錯誤訊息：翻頁書裡有網站不接受的檔案）。

## 2. 要改的地方（請在 web-magazine 確認實際位置）

| # | 項目 | 建議 |
|---|---|---|
| 1 | 上傳白名單 `src/service/package.rs` 的 `ALLOWED_EXTENSIONS` | 加 `mp3`（只加這一個；wav / ogg / m4a 桌面版還不會產生） |
| 2 | 內容檢查（如果解壓時有看檔頭） | mp3 的檔頭：`ID3`，或 MPEG 音框同步碼（第 1 個位元組 `0xFF`、第 2 個位元組前 3 個位元 `111`，layer 欄位不是 `00`）。桌面版用同一個規則（`project/assets.rs` 的 `detect_audio_extension`） |
| 3 | 書檔伺服器的 `Content-Type` | `.mp3` → `audio/mpeg`（Firefox 對錯誤的型別比較嚴格） |
| 4 | **`Range` 請求** | 書檔伺服器要回 `206 Partial Content` + `Accept-Ranges: bytes`。沒有的話多數瀏覽器能從頭播，但**拖進度條沒反應**（Chrome 尤其如此） |
| 5 | 書檔伺服器的 CSP / sandbox（`sandbox allow-scripts`） | 不用改：`<audio>` 載入同一個伺服器上的檔案不走 CORS，在不透明來源（origin `"null"`）裡也能播。**請實測確認**（見 §3） |
| 6 | 閱讀頁 iframe 的 `allow` | 不用加 `autoplay`：音訊一定是讀者點了才播（使用者手勢） |
| 7 | 契約文件 `docs/桌面上傳API.md` 與 `tests/desktop_upload_test.rs` | 白名單加 `mp3`；測試加一本含 `media/audio-1.mp3` 的書：上傳後檔案存在、`Content-Type: audio/mpeg`、`Range: bytes=0-99` 回 206 |
| 8 | 尚未完成的步驟 0（`gif`、`txt`） | 如果還沒做，可以一起加（見 `docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md` 步驟 0） |

## 3. 驗收（網站上）

1. 桌面版加好白名單後，上傳一本有音訊的書（2 頁以上、至少兩個不同的音訊）。
2. 在網站的閱讀頁開書：
   - 點喇叭 → 書上方出現播放列、有聲音、時間會走。
   - 拖進度條到中間 → 從那裡繼續播（測 `Range`）。
   - 翻頁 → 停止並收起播放列。
   - 瀏覽器開發者工具的 Console 沒有 CSP 錯誤；Network 裡 mp3 是 `206`、`audio/mpeg`。
3. 用 Chrome / Edge 與 Firefox 各試一次。

## 4. 回報給 magazine-editor

做完請告訴 magazine-editor 的工作階段：白名單已加 `mp3`、`Range` 是否支援、驗收結果。之後 magazine-editor 會：

- `upload::package::ALLOWED_EXTENSIONS` 加 `mp3`（和網站一致）。
- 上傳的「檔案太大」訊息：書裡的音訊佔多少，讓使用者知道是音訊讓書變大。
